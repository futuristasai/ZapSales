/**
 * FILA, GASTO E CONFIGURAÇÃO DO AGENTE SÓ SE ESCREVEM PELO SERVIDOR (#273, etapa 9b).
 *
 * A sessão do usuário perdeu INSERT/UPDATE/DELETE em onze tabelas (migration
 * 0566; medido em `tests/invariants/config-do-agente-so-pelo-servidor.test.ts`).
 * Um ponto do app que ainda gravasse nelas com a sessão passaria a falhar em
 * produção — e alguns falhariam CALADOS, dentro de um `try/catch`.
 *
 * Esta cerca lê o código por dois caminhos, porque um só não bastou:
 *
 *   1. escrita direta — `.from("<tabela>")` seguido de insert/update/upsert/
 *      delete, com o cliente vindo de `createClient()` (a sessão);
 *   2. escrita INDIRETA — a sessão entregue no lugar do cliente de serviço a uma
 *      função que grava por ela (`admin: supabase`). Foi assim que a rota de
 *      decidir proposta cancelava o retorno agendado: a varredura por tabela via
 *      "cliente recebido por parâmetro" e passava reto.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const TABELAS = [
  "job_queue",
  "cron_jobs",
  "llm_calls",
  "playbook_versions",
  "playbook_pointers",
  "skill_versions",
  "skill_pointers",
  "skill_activations",
  "org_memory_versions",
  "org_memory_pointers",
  "org_memory_entries",
  "channel_knobs",
] as const;

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) && nome !== "database.types.ts") achados.push(caminho);
  }
  return achados;
}

interface Escrita {
  arquivo: string;
  linha: number;
  tabela: string;
  op: string;
  origem: string;
}

function escritas(fonte: string, arquivo: string): Escrita[] {
  const achadas: Escrita[] = [];
  const rx = new RegExp(`(\\w+)\\s*(?:\\n\\s*)?\\.from\\(\\s*["'](${TABELAS.join("|")})["']\\s*\\)`, "g");
  for (const m of fonte.matchAll(rx)) {
    const resto = fonte.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
    const fim = resto.search(/;|\n\s*(?:const|let|if|return|await)\b/);
    const cadeia = fim === -1 ? resto : resto.slice(0, fim);
    const op = cadeia.match(/\.(insert|update|upsert|delete)\(/);
    if (!op) continue;
    const antes = fonte.slice(0, m.index!);
    const declaracoes = [...antes.matchAll(new RegExp(`(?:const|let)\\s+${m[1]}\\s*=\\s*(?:await\\s+)?([\\w.]+)\\(`, "g"))];
    achadas.push({
      arquivo: arquivo.replaceAll("\\", "/"),
      linha: antes.split("\n").length,
      tabela: m[2]!,
      op: op[1]!,
      origem: declaracoes.at(-1)?.[1] ?? "parâmetro",
    });
  }
  return achadas;
}

/** Arquivos em que `supabase` é a SESSÃO e ela é entregue como cliente de serviço. */
function sessaoNoLugarDoServico(fonte: string): string[] {
  const variaveisDaSessao = [...fonte.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+createClient\(\)/g)].map((m) => m[1]!);
  const achados: string[] = [];
  for (const v of variaveisDaSessao) {
    for (const m of fonte.matchAll(new RegExp(`\\b(admin|servico|service)\\s*:\\s*${v}\\b`, "g"))) {
      achados.push(`${m[1]}: ${v} (linha ${fonte.slice(0, m.index!).split("\n").length})`);
    }
  }
  return achados;
}

const FONTES = ["app", "lib", "workers", "hooks", "components"].flatMap((raiz) =>
  arquivos(raiz).map((a) => ({ arquivo: a.replaceAll("\\", "/"), fonte: readFileSync(a, "utf8") })),
);
const TODAS = FONTES.flatMap((f) => escritas(f.fonte, f.arquivo));

describe("quem escreve nas tabelas de fila, gasto e configuração do agente", () => {
  it("a varredura enxerga os escritores (controle de vacuidade)", () => {
    expect(TODAS.length, "nenhuma escrita encontrada — a sonda está cega").toBeGreaterThan(10);
    expect(new Set(TODAS.map((e) => e.tabela)).size).toBeGreaterThan(5);
  });

  it("⭐ nenhuma escrita direta usa a sessão do usuário", () => {
    const culpadas = TODAS.filter((e) => e.origem === "createClient").map(
      (e) => `${e.arquivo}:${e.linha} ${e.op} em ${e.tabela}`,
    );
    expect(culpadas).toEqual([]);
  });

  it("⭐ nenhum arquivo entrega a sessão no lugar do cliente de serviço", () => {
    const culpados = FONTES.flatMap((f) => sessaoNoLugarDoServico(f.fonte).map((c) => `${f.arquivo}: ${c}`));
    expect(culpados).toEqual([]);
  });

  it("CONTROLE: a sonda acusa os dois defeitos quando eles existem", () => {
    const direta = `
      const supabase = await createClient();
      await supabase.from("cron_jobs").insert({ organization_id: org });
    `;
    expect(escritas(direta, "x.ts")).toEqual([
      { arquivo: "x.ts", linha: 3, tabela: "cron_jobs", op: "insert", origem: "createClient" },
    ]);
    const indireta = `
      const supabase = await createClient();
      await cancelaRetornoNoCrm({ admin: supabase, orgId }, id);
    `;
    expect(sessaoNoLugarDoServico(indireta)).toEqual(["admin: supabase (linha 3)"]);
    // …e não acusa quem entrega o cliente de serviço de verdade.
    expect(sessaoNoLugarDoServico(`const supabase = await createClient();\nf({ admin: createAdminClient() });`)).toEqual([]);
  });
});

describe("os dois pontos que usavam a sessão", () => {
  it("decidir proposta: o cancelamento do retorno agendado sai pelo servidor", () => {
    const fonte = readFileSync("app/api/v1/proposals/[id]/decide/route.ts", "utf8");
    expect(fonte).toMatch(/await cancelaRetornoNoCrm\(\s*(?:\/\/[^\n]*\n\s*)*\{ admin: createAdminClient\(\), orgId: authz\.org\.orgId,/);
    expect(fonte).not.toMatch(/admin:\s*supabase\b/);
  });

  it("aprovar retomada de lead: a fila é escrita pelo servidor (etapa 9a)", () => {
    const fonte = readFileSync("app/api/v1/leads/[id]/reactivation/route.ts", "utf8");
    expect(fonte).toMatch(/admin\.from\("cron_jobs"\)\.insert\(/);
    expect(fonte).not.toMatch(/supabase\s*\.from\("cron_jobs"\)/);
  });
});

/**
 * NENHUMA LEITURA FEITA COM A SESSÃO DO USUÁRIO PEDE UM SEGREDO DO CANAL (#274).
 *
 * As cinco colunas de segredo de `channel_sessions` e o código do endereço em
 * `webhook_events_log` deixaram de ser legíveis pela sessão (privilégio de
 * coluna, medido em `tests/invariants/segredos-do-canal-fora-da-sessao.test.ts`).
 * Uma rota que ainda as pedisse com a sessão passaria a devolver erro — em
 * produção, na tela de quem administra.
 *
 * Esta cerca lê o código: para cada uso de `.from("channel_sessions")` ou
 * `.from("webhook_events_log")`, descobre de onde veio o cliente e, se for o da
 * sessão, exige que a cadeia não cite coluna de segredo nem peça `*`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SEGREDOS: Record<string, readonly string[]> = {
  channel_sessions: [
    "webhook_path_token",
    "webhook_secret_encrypted",
    "meta_token_encrypted",
    "meta_app_secret_encrypted",
    "meta_verify_token_encrypted",
  ],
  webhook_events_log: ["webhook_path_token"],
};

interface Uso {
  arquivo: string;
  linha: number;
  tabela: string;
  cliente: string;
  origem: string;
  cadeia: string;
}

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) && nome !== "database.types.ts") achados.push(caminho);
  }
  return achados;
}

function usos(fonte: string, arquivo: string): Uso[] {
  const achados: Uso[] = [];
  const rx = /(\w+)\s*(?:\n\s*)?\.from\(\s*["'](channel_sessions|webhook_events_log)["']\s*\)/g;
  for (const m of fonte.matchAll(rx)) {
    const resto = fonte.slice(m.index! + m[0].length, m.index! + m[0].length + 900);
    const fim = resto.search(/;\s*\n/);
    const cadeia = fim === -1 ? resto : resto.slice(0, fim);
    const antes = fonte.slice(0, m.index!);
    const declaracoes = [...antes.matchAll(new RegExp(`(?:const|let)\\s+${m[1]}\\s*=\\s*(?:await\\s+)?([\\w.]+)\\(`, "g"))];
    achados.push({
      arquivo: arquivo.replaceAll("\\", "/"),
      linha: antes.split("\n").length,
      tabela: m[2]!,
      cliente: m[1]!,
      origem: declaracoes.at(-1)?.[1] ?? "parâmetro",
      cadeia,
    });
  }
  return achados;
}

const TODOS = ["app", "lib", "workers", "hooks", "components"].flatMap((raiz) =>
  arquivos(raiz).flatMap((a) => usos(readFileSync(a, "utf8"), a)),
);

/** É uma LEITURA que devolve colunas (e não uma escrita que cita a coluna no payload)? */
function leituraQuePede(uso: Uso, coluna: string): boolean {
  const select = uso.cadeia.match(/\.select\(\s*([\s\S]*?)\)/);
  const filtro = new RegExp(`\\.(?:eq|in|is|neq|or|filter)\\(\\s*["'\`][^"'\`]*${coluna}`).test(uso.cadeia);
  return Boolean(select?.[1]?.includes(coluna)) || filtro;
}

describe("leituras do canal feitas com a sessão do usuário", () => {
  const daSessao = TODOS.filter((u) => u.origem === "createClient");

  it("a varredura enxerga os dois lados (controle de vacuidade)", () => {
    expect(TODOS.length).toBeGreaterThan(60);
    expect(daSessao.length, "nenhum uso com a sessão foi encontrado — a sonda está cega").toBeGreaterThan(8);
    expect(TODOS.filter((u) => u.origem === "createAdminClient").length).toBeGreaterThan(10);
  });

  it("⭐ nenhuma pede uma coluna de segredo, nem em `select` nem em filtro", () => {
    const culpados = daSessao.flatMap((u) =>
      SEGREDOS[u.tabela]!.filter((c) => leituraQuePede(u, c)).map((c) => `${u.arquivo}:${u.linha} pede ${c}`),
    );
    expect(culpados).toEqual([]);
  });

  it("⭐ nenhuma pede `*` (a tabela inteira inclui os segredos)", () => {
    const culpados = daSessao
      .filter((u) => /\.select\(\s*(?:["'`]\*["'`]|\))/.test(u.cadeia))
      .map((u) => `${u.arquivo}:${u.linha}`);
    expect(culpados).toEqual([]);
  });

  it("CONTROLE: a sonda acusa uma leitura da sessão que pede segredo", () => {
    const sabotado = `
      const supabase = await createClient();
      const { data } = await supabase.from("channel_sessions").select("id, webhook_path_token").eq("id", id).maybeSingle();
    `;
    const [uso] = usos(sabotado, "sabotado.ts");
    expect(uso!.origem).toBe("createClient");
    expect(leituraQuePede(uso!, "webhook_path_token")).toBe(true);
    // …e não confunde ESCRITA (o payload cita a coluna) com leitura.
    const escrita = `
      const supabase = await createClient();
      await supabase.from("channel_sessions").update({ webhook_path_token: novo }).eq("id", id);
    `;
    expect(leituraQuePede(usos(escrita, "escrita.ts")[0]!, "webhook_path_token")).toBe(false);
  });
});

describe("as três leituras que usavam a sessão saem pelo servidor", () => {
  it("excluir canal: a sessão lê o canal sem a credencial; a credencial vem do servidor", () => {
    const fonte = readFileSync("app/api/v1/channel-sessions/[id]/route.ts", "utf8");
    expect(fonte).toMatch(
      /await createAdminClient\(\)\s*\.from\("channel_sessions"\)\s*\.select\("meta_token_encrypted"\)\s*\.eq\("organization_id", activeOrg\.orgId\)\s*\.eq\("id", id\)/,
    );
  });

  it.each(["app/api/v1/webhook-sources/[id]/events/route.ts", "lib/operacao/entradas-automaticas.ts"])(
    "%s: o filtro pelo código do endereço sai pelo servidor, preso à organização",
    (arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      const trecho = fonte.slice(fonte.indexOf('.from("webhook_events_log")') - 80);
      expect(trecho.slice(0, 80)).toMatch(/createAdminClient\(\)\)?\s*$/);
      expect(trecho.slice(0, 500)).toMatch(/\.eq\("organization_id", /);
      expect(trecho.slice(0, 500)).toMatch(/\.eq\("webhook_path_token", /);
    },
  );
});

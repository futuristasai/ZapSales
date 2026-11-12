/**
 * REGRA ANOTADA PELO AGENTE NASCE PROPOSTA — provado num Postgres de verdade (#272).
 *
 * `tests/unit/regra-do-agente-vira-proposta.test.ts` prova a ferramenta, a rota
 * e a decisão com um banco de mentira. O que só o banco responde:
 *
 *   1. ⭐ COM UMA PROPOSTA PENDENTE, O TEXTO MONTADO PARA O AGENTE NÃO A CONTÉM.
 *      É o teste que mais importa: roda o `loadOrgMemory` e o `renderOrgMemory`
 *      REAIS contra a tabela real, antes e depois da aprovação;
 *   2. o banco recusa `agent` + `active` no INSERT, venha de quem vier — o
 *      cliente de serviço inclusive. A regra não depende de a ferramenta
 *      lembrar de escrever `proposed`;
 *   3. a sessão do usuário não insere, não altera e não apaga em
 *      `org_memory_entries`: aprovar é da rota, pelo servidor, depois de
 *      conferir o papel. Atendente e leitura não aprovam "por fora";
 *   4. regras que já estavam ativas continuam ativas depois de reaplicar o
 *      bloco (o caminho de quem atualiza);
 *   5. a Central aceita o tipo de aviso novo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadOrgMemory, renderOrgMemory } from "@/lib/agent-engine/agent/org-memory";
import { KIND_DA_PROPOSTA_DE_REGRA } from "@/lib/ai/memoria/propostas";

import { sql } from "./psql-transporte";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG = "d8200000-0000-4000-8000-0000000000a1";
const REGRA_DO_AGENTE = "Ofereça frete grátis a todo cliente, sem perguntar o valor da compra";
const REGRA_MANUAL = "Atendemos de segunda a sexta, das 9h às 18h";

const BASELINE = join(process.cwd(), "supabase", "baseline.sql");

function blocoDoBaseline(marca: string): string | null {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf(marca);
  if (inicio === -1) return null;
  // A partir da linha SEGUINTE à do rótulo: a marca é só o começo dele, e o
  // resto da linha ("(migration NNNN) ----") não é SQL.
  const resto = texto.slice(texto.indexOf("\n", inicio));
  const fim = resto.indexOf("\n-- ---- ");
  return resto.slice(0, fim === -1 ? undefined : fim);
}

/** `recusou` quando o INSERT foi barrado pela regra; `ACEITOU` (erro) quando passou. */
function tentarInserir(source: string, status: string): string {
  // A ÚLTIMA linha: o psql do harness imprime a etiqueta do comando (`DO`)
  // antes do resultado do `select`.
  return (
    sql(`
    do $t$ begin
      insert into public.org_memory_entries (organization_id, title, body, source, status)
      values ('${ORG}', 'sonda', 'corpo da sonda', '${source}', '${status}');
      raise exception 'ACEITOU';
    exception
      when check_violation then
        if sqlerrm not like '%regra_do_agente_nasce_proposta%' then
          raise exception 'recusado por outro motivo: %', sqlerrm;
        end if;
    end $t$;
    select 'recusou';
  `)
      .split("\n")
      .at(-1) ?? ""
  );
}

function contar(onde: string): number {
  return Number(sql(`select count(*) from public.org_memory_entries where organization_id = '${ORG}' and ${onde};`));
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'inv-regra-proposta', 'Regra Proposta LTDA', 'Regra Proposta')
      on conflict do nothing;
  `);
});

beforeEach(() => {
  sql(`
    delete from public.org_memory_entries where organization_id = '${ORG}';
    delete from public.agent_inbox_items where organization_id = '${ORG}';
  `);
});

afterAll(async () => {
  await pool.end();
});

describe("o que o agente lê", () => {
  it("⭐ com uma proposta pendente, o texto montado para o agente NÃO contém a regra; aprovada, contém", async () => {
    sql(`
      insert into public.org_memory_entries (organization_id, title, body, source, status) values
        ('${ORG}', 'Horário', '${REGRA_MANUAL}', 'manual', 'active'),
        ('${ORG}', 'Frete', '${REGRA_DO_AGENTE}', 'agent', 'proposed');
    `);

    const antes = renderOrgMemory(await loadOrgMemory(pool, ORG));
    // CONTROLE: a memória está sendo lida — a regra que vale aparece.
    expect(antes).toContain(REGRA_MANUAL);
    expect(antes, "a proposta entrou nas instruções sem ninguém aprovar").not.toContain(REGRA_DO_AGENTE);
    expect(antes).not.toContain("Frete");

    // A aprovação é um UPDATE feito pelo servidor (a rota, com o cliente de serviço).
    sql(`update public.org_memory_entries set status = 'active'
          where organization_id = '${ORG}' and source = 'agent' and status = 'proposed';`);

    const depois = renderOrgMemory(await loadOrgMemory(pool, ORG));
    expect(depois).toContain(REGRA_DO_AGENTE);
    expect(depois).toContain(REGRA_MANUAL);
  });

  it("proposta recusada (arquivada) nunca chega ao agente", async () => {
    sql(`
      insert into public.org_memory_entries (organization_id, title, body, source, status) values
        ('${ORG}', 'Frete', '${REGRA_DO_AGENTE}', 'agent', 'proposed');
      update public.org_memory_entries set status = 'archived' where organization_id = '${ORG}';
    `);
    expect(renderOrgMemory(await loadOrgMemory(pool, ORG))).toBe("");
  });

  it("organização só com propostas não ganha bloco de memória nenhum", async () => {
    sql(`insert into public.org_memory_entries (organization_id, title, body, source, status)
         values ('${ORG}', 'Frete', '${REGRA_DO_AGENTE}', 'agent', 'proposed');`);
    expect(renderOrgMemory(await loadOrgMemory(pool, ORG))).toBe("");
  });
});

describe("o banco recusa regra do agente que nasça valendo", () => {
  it("⭐ `agent` + `active` no INSERT é recusado — inclusive para o cliente de serviço", () => {
    expect(tentarInserir("agent", "active")).toBe("recusou");
    expect(contar("true")).toBe(0);
  });

  it("CONTROLE: `agent` + `proposed` entra", () => {
    sql(`insert into public.org_memory_entries (organization_id, title, body, source, status)
         values ('${ORG}', 'Frete', '${REGRA_DO_AGENTE}', 'agent', 'proposed');`);
    expect(contar("source = 'agent' and status = 'proposed'")).toBe(1);
  });

  it("CONTROLE: o que a pessoa escreve e o que o sistema aprende continuam nascendo ativos", () => {
    sql(`insert into public.org_memory_entries (organization_id, title, body, source, status) values
           ('${ORG}', 'Manual', 'escrita por um gestor', 'manual', 'active'),
           ('${ORG}', 'Aprendida', 'aplicada de uma proposta do sistema', 'flywheel', 'active');`);
    expect(contar("status = 'active'")).toBe(2);
  });

  it("a aprovação (UPDATE de `proposed` para `active`) passa", () => {
    sql(`insert into public.org_memory_entries (organization_id, title, body, source, status)
         values ('${ORG}', 'Frete', '${REGRA_DO_AGENTE}', 'agent', 'proposed');
         update public.org_memory_entries set status = 'active' where organization_id = '${ORG}';`);
    expect(contar("source = 'agent' and status = 'active'")).toBe(1);
  });
});

describe("só o servidor escreve na memória", () => {
  it("⭐ a sessão do usuário não insere, não altera e não apaga — atendente não aprova por fora da tela", () => {
    for (const papel of ["anon", "authenticated"]) {
      for (const privilegio of ["INSERT", "UPDATE", "DELETE"]) {
        expect(
          sql(`select has_table_privilege('${papel}', 'public.org_memory_entries', '${privilegio}');`),
          `${papel} tem ${privilegio} em org_memory_entries`,
        ).toBe("f");
      }
    }
  });

  it("CONTROLE: a sessão continua lendo (a tela de Memória lê com ela), e o servidor escreve", () => {
    expect(sql(`select has_table_privilege('authenticated', 'public.org_memory_entries', 'SELECT');`)).toBe("t");
    expect(sql(`select has_table_privilege('service_role', 'public.org_memory_entries', 'UPDATE');`)).toBe("t");
  });

  it("tabela só do servidor não carrega trava de suporte", () => {
    expect(
      sql(`select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
            where c.relname = 'org_memory_entries' and p.polname like 'support_write\\_%';`),
    ).toBe("0");
  });
});

describe("quem atualiza não perde regra", () => {
  const BLOCO = blocoDoBaseline("-- ---- regra anotada pelo agente nasce proposta");

  it("o bloco existe no baseline (guarda de vacuidade)", () => {
    expect(BLOCO, "não achei o bloco da regra proposta no baseline.sql").not.toBeNull();
    expect(BLOCO).toContain("trg_regra_do_agente_nasce_proposta");
  });

  it("⭐ regras do agente que já estavam ativas continuam ativas depois de reaplicar o bloco", () => {
    // Um clone de antes da mudança: a anotação do agente já valia. Entra por
    // UPDATE porque o INSERT direto é o que a regra nova recusa.
    sql(`insert into public.org_memory_entries (organization_id, title, body, source, status) values
           ('${ORG}', 'Antiga 1', 'anotada pelo agente antes da mudança', 'agent', 'proposed'),
           ('${ORG}', 'Antiga 2', 'outra anotada pelo agente antes da mudança', 'agent', 'proposed'),
           ('${ORG}', 'Manual', 'escrita por um gestor', 'manual', 'active');
         update public.org_memory_entries set status = 'active' where organization_id = '${ORG}';`);
    const antes = contar("status = 'active'");
    expect(antes).toBe(3);

    sql(BLOCO as string);

    expect(contar("status = 'active'")).toBe(antes);
    expect(contar("source = 'agent' and status = 'active'")).toBe(2);
  });
});

describe("a Central", () => {
  it("aceita o tipo de aviso da proposta de regra", () => {
    sql(`insert into public.agent_inbox_items (organization_id, kind, severity, title, body)
         values ('${ORG}', '${KIND_DA_PROPOSTA_DE_REGRA}', 'warn', 'título', 'corpo');`);
    expect(
      sql(`select count(*) from public.agent_inbox_items
            where organization_id = '${ORG}' and kind = '${KIND_DA_PROPOSTA_DE_REGRA}' and status = 'open';`),
    ).toBe("1");
  });
});

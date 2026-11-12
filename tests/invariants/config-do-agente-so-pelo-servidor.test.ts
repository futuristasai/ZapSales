/**
 * FILA, GASTO E CONFIGURAÇÃO DO AGENTE SÓ SE ESCREVEM PELO SERVIDOR (#273, etapa 9b).
 *
 * O que o agente diz, a velocidade com que ele envia e a fila por onde as
 * mensagens saem moram em onze tabelas que nasceram com escrita concedida à
 * sessão do usuário, sob uma policy que só confere a organização. Um membro de
 * qualquer papel, falando direto com o banco, agendava uma mensagem, trocava o
 * roteiro do agente ou afrouxava o anti-banimento de um número.
 *
 * O que fica provado, num Postgres de verdade:
 *   1. a sessão (`authenticated`) e o anônimo não inserem, não alteram e não
 *      apagam em nenhuma delas — é privilégio de tabela, vale para todo papel;
 *   2. a LEITURA pela sessão não mudou (as telas leem com ela);
 *   3. o servidor continua escrevendo;
 *   4. tabela só do servidor não carrega trava de suporte;
 *   5. na prática: um INSERT feito como a sessão é recusado por falta de
 *      privilégio — e o mesmo INSERT pelo servidor entra.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

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
  "channel_knobs",
] as const;

const ORG = "d9b00000-0000-4000-8000-0000000000a1";
const CONTATO = "d9b00000-0000-4000-8000-0000000000c1";

const ultima = (saida: string): string => saida.split("\n").at(-1) ?? "";
const tem = (papel: string, tabela: string, privilegio: string): boolean =>
  ultima(sql(`select has_table_privilege('${papel}', 'public.${tabela}', '${privilegio}');`)) === "t";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'inv-config-do-agente', 'Config do Agente LTDA', 'Config do Agente')
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Contato da sonda')
      on conflict do nothing;
  `);
});

describe.each(TABELAS)("%s", (tabela) => {
  it("⭐ a sessão do usuário não escreve", () => {
    for (const papel of ["authenticated", "anon"]) {
      for (const privilegio of ["INSERT", "UPDATE", "DELETE"]) {
        expect(tem(papel, tabela, privilegio), `${papel} tem ${privilegio}`).toBe(false);
      }
    }
  });

  it("a sessão continua lendo, e o servidor continua escrevendo", () => {
    expect(tem("authenticated", tabela, "SELECT")).toBe(true);
    for (const privilegio of ["INSERT", "UPDATE", "DELETE"]) {
      expect(tem("service_role", tabela, privilegio)).toBe(true);
    }
  });

  it("não carrega trava de suporte (tabela só do servidor)", () => {
    expect(
      ultima(
        sql(`select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = '${tabela}' and p.polname like 'support_write\\_%';`),
      ),
    ).toBe("0");
  });
});

describe("na prática", () => {
  const AGENDAR = `insert into public.cron_jobs (organization_id, contact_id, kind, job_kind, next_run_at, payload)
                   values ('${ORG}', '${CONTATO}', 'at', 'followup_turn', now(), '{}'::jsonb)`;

  it("⭐ agendar uma mensagem como a sessão é recusado por falta de privilégio", () => {
    const saida = sql(`
      do $t$ begin
        set local role authenticated;
        ${AGENDAR};
        raise exception 'ACEITOU';
      exception
        when insufficient_privilege then null;
      end $t$;
      select count(*) from public.cron_jobs where organization_id = '${ORG}';
    `);
    expect(ultima(saida), "a sessão agendou uma mensagem direto na fila").toBe("0");
  });

  it("CONTROLE: o mesmo agendamento pelo servidor entra", () => {
    sql(`${AGENDAR};`);
    expect(ultima(sql(`select count(*) from public.cron_jobs where organization_id = '${ORG}';`))).toBe("1");
    sql(`delete from public.cron_jobs where organization_id = '${ORG}';`);
  });
});

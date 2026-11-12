import { beforeAll, describe, expect, it } from "vitest";

import {
  countAs,
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_CONTACT_1,
  GOV_CONV_UNASSIGNED,
  GOV_MANAGER,
  GOV_ORG,
  GOV_SESSION,
  GOV_VIEWER,
  lastLine,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * O BANCO EXIGE O PAPEL QUE AS ROTAS JÁ EXIGEM (issue #268, migration 0560).
 *
 * O PostgREST fala com o JWT da sessão direto, sem rota. Em `contacts` e
 * `messages` a policy de escrita só perguntava "é da organização?"; nas dez
 * tabelas do financeiro o papel estava no WITH CHECK e não no USING — e DELETE
 * só avalia o USING. Em todos os casos o papel conferido pela rota não valia
 * para quem falasse com o banco por fora dela.
 *
 * Cada caso de negação tem o controle ao lado: o papel que a rota aceita
 * consegue a MESMA escrita. Sem o controle, uma policy que recusasse todo
 * mundo passaria aqui — e quebraria as telas.
 */
const CONTATO = "cccccccc-0268-4000-8000-000000000001";
const CONTATO_DESCARTE = "cccccccc-0268-4000-8000-000000000002";
const CONTATO_BLOQUEADO = "cccccccc-0268-4000-8000-000000000003";
const CONTATO_ANONIMIZADO = "cccccccc-0268-4000-8000-000000000004";
const CONTATO_NOVO_VIEWER = "cccccccc-0268-4000-8000-000000000005";
const CONTATO_NOVO_AGENT = "cccccccc-0268-4000-8000-000000000006";
const MSG = "cccccccc-0268-4000-8000-000000000011";
const MSG_DESCARTE = "cccccccc-0268-4000-8000-000000000012";
const PLANO = "cccccccc-0268-4000-8000-000000000021";
const PLANO_DESCARTE = "cccccccc-0268-4000-8000-000000000022";
const CONTA = "cccccccc-0268-4000-8000-000000000031";
const LANCAMENTO = "cccccccc-0268-4000-8000-000000000041";
const LANCAMENTO_DESCARTE = "cccccccc-0268-4000-8000-000000000042";

const FINANCEIRO = [
  "account_plans",
  "commission_rules",
  "commissions",
  "financial_accounts",
  "financial_entries",
  "loyalty_ledger",
  "payment_methods",
  "recurring_entries",
  "sale_items",
  "sales",
] as const;

function existe(tabela: string, id: string): boolean {
  return lastLine(sql(`select exists(select 1 from public.${tabela} where id = '${id}')::text;`)) === "true";
}

/** O erro de uma escrita feita como o usuário, ou "" quando ela passou. */
function erroAo(userId: string, dml: string): string {
  try {
    sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      ${dml};
    `);
    return "";
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return `${e.stderr ?? ""}${e.message ?? ""}`;
  }
}

beforeAll(() => {
  seedGov();
  sql(`
    delete from public.financial_entries where organization_id = '${GOV_ORG}' and id in ('${LANCAMENTO}', '${LANCAMENTO_DESCARTE}');
    delete from public.financial_accounts where id = '${CONTA}';
    delete from public.account_plans where id in ('${PLANO}', '${PLANO_DESCARTE}');
    delete from public.messages where id in ('${MSG}', '${MSG_DESCARTE}');
    delete from public.contacts where id in ('${CONTATO}', '${CONTATO_DESCARTE}', '${CONTATO_BLOQUEADO}',
      '${CONTATO_ANONIMIZADO}', '${CONTATO_NOVO_VIEWER}', '${CONTATO_NOVO_AGENT}');

    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO}', '${GOV_ORG}', 'Contato 268'),
      ('${CONTATO_DESCARTE}', '${GOV_ORG}', 'Contato 268 descarte');
    insert into public.contacts (id, organization_id, display_name, is_blocked, blocked_reason, blocked_at)
      values ('${CONTATO_BLOQUEADO}', '${GOV_ORG}', 'Contato 268 bloqueado', true, 'stop', now());
    insert into public.contacts (id, organization_id, display_name, is_anonymized, anonymized_at)
      values ('${CONTATO_ANONIMIZADO}', '${GOV_ORG}', 'Contato Anonimizado #268', true, now());

    insert into public.messages (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, body) values
      ('${MSG}', '${GOV_ORG}', '${GOV_CONV_UNASSIGNED}', '${GOV_SESSION}', '${GOV_CONTACT_1}', 'text', 'inbound', 'corpo 268'),
      ('${MSG_DESCARTE}', '${GOV_ORG}', '${GOV_CONV_UNASSIGNED}', '${GOV_SESSION}', '${GOV_CONTACT_1}', 'text', 'inbound', 'descarte 268');

    insert into public.account_plans (id, organization_id, name, direction) values
      ('${PLANO}', '${GOV_ORG}', 'Plano 268', 'in'),
      ('${PLANO_DESCARTE}', '${GOV_ORG}', 'Plano 268 descarte', 'out');
    insert into public.financial_accounts (id, organization_id, name) values ('${CONTA}', '${GOV_ORG}', 'Conta 268');
    insert into public.financial_entries (id, organization_id, account_id, amount_cents, direction) values
      ('${LANCAMENTO}', '${GOV_ORG}', '${CONTA}', 1000, 'in'),
      ('${LANCAMENTO_DESCARTE}', '${GOV_ORG}', '${CONTA}', 2000, 'in');
  `);
});

describe("contacts — gravar exige atendente", () => {
  it("viewer não altera; atendente altera", () => {
    const dml = (nome: string) => `update public.contacts set display_name = '${nome}' where id = '${CONTATO}'`;
    expect(writeCountAs(GOV_VIEWER, dml("alterado pelo viewer"))).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, dml("alterado pelo atendente"))).toBe(1);
  });

  it("viewer não cria; atendente cria", () => {
    const dml = (id: string) =>
      `insert into public.contacts (id, organization_id, display_name) values ('${id}', '${GOV_ORG}', 'Contato sonda 268')`;
    expect(writeCountAs(GOV_VIEWER, dml(CONTATO_NOVO_VIEWER))).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, dml(CONTATO_NOVO_AGENT))).toBe(1);
  });

  it("viewer não apaga; atendente apaga", () => {
    const dml = `delete from public.contacts where id = '${CONTATO_DESCARTE}'`;
    expect(writeCountAs(GOV_VIEWER, dml)).toBe(0);
    expect(existe("contacts", CONTATO_DESCARTE)).toBe(true);
    expect(writeCountAs(GOV_AGENT_A, dml)).toBe(1);
  });

  it("viewer continua LENDO os contatos da organização", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.contacts where id = '${CONTATO}';`)).toBe(1);
  });
});

describe("contacts — a recusa do contato não se desfaz pela sessão", () => {
  it.each([
    ["atendente", GOV_AGENT_A],
    ["gerente", GOV_MANAGER],
    ["admin", GOV_ADMIN],
  ])("%s não desbloqueia quem pediu para sair, falando direto com o banco", (_nome, user) => {
    const erro = erroAo(
      user,
      `update public.contacts set is_blocked = false, blocked_reason = null, blocked_at = null where id = '${CONTATO_BLOQUEADO}'`,
    );
    expect(erro).toMatch(/desbloqueio_e_ato_do_admin_pela_rota/);
    expect(lastLine(sql(`select is_blocked::text from public.contacts where id = '${CONTATO_BLOQUEADO}';`))).toBe("true");
  });

  it.each([
    ["atendente", GOV_AGENT_A],
    ["admin", GOV_ADMIN],
  ])("%s não desfaz a anonimização", (_nome, user) => {
    const erro = erroAo(
      user,
      `update public.contacts set is_anonymized = false, anonymized_at = null where id = '${CONTATO_ANONIMIZADO}'`,
    );
    expect(erro).toMatch(/lgpd_anonymization_irreversible/);
    expect(lastLine(sql(`select is_anonymized::text from public.contacts where id = '${CONTATO_ANONIMIZADO}';`))).toBe("true");
  });

  it("CONTROLE: a sessão continua podendo BLOQUEAR (o sentido que protege o contato)", () => {
    expect(
      writeCountAs(GOV_AGENT_A, `update public.contacts set is_blocked = true, blocked_reason = 'manual' where id = '${CONTATO}'`),
    ).toBe(1);
  });

  it("CONTROLE: a ficha de um contato bloqueado continua editável pela sessão", () => {
    expect(
      writeCountAs(GOV_AGENT_A, `update public.contacts set display_name = 'Bloqueado, ficha editada' where id = '${CONTATO_BLOQUEADO}'`),
    ).toBe(1);
  });

  it("CONTROLE: o cliente de serviço desbloqueia — é o caminho da rota do admin", () => {
    // Sem `set role` nem claims: `auth.uid()` é nulo, como no cliente de serviço.
    sql(`update public.contacts set is_blocked = false, blocked_reason = null, blocked_at = null where id = '${CONTATO}';`);
    expect(lastLine(sql(`select is_blocked::text from public.contacts where id = '${CONTATO}';`))).toBe("false");
  });
});

describe("messages — gravar exige atendente", () => {
  it("viewer não altera; atendente altera", () => {
    const dml = (corpo: string) => `update public.messages set body = '${corpo}' where id = '${MSG}'`;
    expect(writeCountAs(GOV_VIEWER, dml("alterado pelo viewer"))).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, dml("alterado pelo atendente"))).toBe(1);
  });

  it("viewer não apaga; atendente apaga", () => {
    const dml = `delete from public.messages where id = '${MSG_DESCARTE}'`;
    expect(writeCountAs(GOV_VIEWER, dml)).toBe(0);
    expect(existe("messages", MSG_DESCARTE)).toBe(true);
    expect(writeCountAs(GOV_AGENT_A, dml)).toBe(1);
  });

  it("viewer não insere: negado pela RLS", () => {
    const dml = `insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
       values ('${GOV_ORG}', '${GOV_CONV_UNASSIGNED}', '${GOV_SESSION}', '${GOV_CONTACT_1}', 'text', 'outbound', 'sonda viewer 268')`;
    expect(erroAo(GOV_VIEWER, dml)).toMatch(/row-level security/);
  });

  it("CONTROLE: o atendente passa da RLS no insert", () => {
    // O insert pode parar DEPOIS, numa regra de negócio de trigger; o que se
    // mede aqui é só que não foi a RLS que o recusou.
    const dml = `insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
       values ('${GOV_ORG}', '${GOV_CONV_UNASSIGNED}', '${GOV_SESSION}', '${GOV_CONTACT_1}', 'text', 'outbound', 'sonda atendente 268')`;
    expect(erroAo(GOV_AGENT_A, dml)).not.toMatch(/row-level security/);
  });

  it("viewer continua LENDO as mensagens da conversa", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.messages where id = '${MSG}';`)).toBe(1);
  });
});

describe("financeiro — apagar exige o papel de quem cria", () => {
  it("catálogo: nenhuma das dez tabelas tem policy de escrita sem papel no USING", () => {
    const semPapel = sql(`
      select coalesce(string_agg(tablename || '.' || policyname, ',' order by tablename), '')
        from pg_policies
       where schemaname = 'public'
         and tablename in (${FINANCEIRO.map((t) => `'${t}'`).join(",")})
         and cmd in ('ALL', 'UPDATE', 'DELETE')
         and policyname not like 'support_write_%'
         and coalesce(qual, '') not like '%fn_role_at_least%';
    `);
    expect(semPapel).toBe("");
  });

  it("catálogo: as dez têm policy de LEITURA própria (senão quem só lê deixaria de ler)", () => {
    const comLeitura = sql(`
      select count(distinct tablename) from pg_policies
       where schemaname = 'public'
         and tablename in (${FINANCEIRO.map((t) => `'${t}'`).join(",")})
         and cmd = 'SELECT'
         and policyname = 'tenant_isolation_' || tablename || '_read';
    `);
    expect(comLeitura).toBe(String(FINANCEIRO.length));
  });

  it("tabela de movimento: viewer não apaga o lançamento; atendente apaga", () => {
    const dml = `delete from public.financial_entries where id = '${LANCAMENTO_DESCARTE}'`;
    expect(writeCountAs(GOV_VIEWER, dml)).toBe(0);
    expect(existe("financial_entries", LANCAMENTO_DESCARTE)).toBe(true);
    expect(writeCountAs(GOV_AGENT_A, dml)).toBe(1);
  });

  it("tabela de movimento: viewer não altera o lançamento", () => {
    expect(
      writeCountAs(GOV_VIEWER, `update public.financial_entries set amount_cents = 1 where id = '${LANCAMENTO}'`),
    ).toBe(0);
  });

  it("tabela de cadastro: viewer e atendente não apagam o plano de contas; gerente apaga", () => {
    const dml = `delete from public.account_plans where id = '${PLANO_DESCARTE}'`;
    expect(writeCountAs(GOV_VIEWER, dml)).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, dml)).toBe(0);
    expect(existe("account_plans", PLANO_DESCARTE)).toBe(true);
    expect(writeCountAs(GOV_MANAGER, dml)).toBe(1);
  });

  it("viewer continua LENDO lançamento e plano de contas", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.financial_entries where id = '${LANCAMENTO}';`)).toBe(1);
    expect(countAs(GOV_VIEWER, `select count(*) from public.account_plans where id = '${PLANO}';`)).toBe(1);
  });
});

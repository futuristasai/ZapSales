/**
 * `fn_agent_tool_signals` (migration 0570, issue #326) contra Postgres real.
 *
 * É o instrumento que a #326 prometeu quando o teto de 27 deixou de bloquear: se
 * contar errado, o painel acusa a IA por uma correção que ela não sofreu — ou
 * cala a que sofreu, e o teto continua sem medida. É SQL; nenhum teste de
 * TypeScript o exercita.
 *
 * O que se prova, além das duas contagens:
 *   - movimento da PRÓPRIA IA (actor_user_id nulo) nunca é correção;
 *   - pessoa movendo depois de 24 h não é correção (é a vida do funil);
 *   - pessoa movendo OUTRO negócio não é correção;
 *   - execução de teste não conta como correção;
 *   - "não achei" (desfecho sem_resultado) seguido de nova busca não é repetição;
 *   - outra organização e outro agente não entram.
 *
 * O shape do `metadata` é o que `auditMcpToolCall` escreve (lib/mcp/audit.ts),
 * e o do `lead.moved` humano é o de `app/api/v1/leads/[id]/move/route.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG_A = "b3260000-0000-4000-8000-000000000001";
const ORG_B = "b3260000-0000-4000-8000-000000000002";
const SESSION_A = "b3260000-0000-4000-8000-000000000010";
const SESSION_B = "b3260000-0000-4000-8000-000000000011";
const AGENTE = "b3260000-0000-4000-8000-000000000020";
const AGENTE_ORG_B = "b3260000-0000-4000-8000-000000000022";
const VERSAO = "b3260000-0000-4000-8000-000000000030";
const VERSAO_ORG_B = "b3260000-0000-4000-8000-000000000032";
const PESSOA = "b3260000-0000-4000-8000-000000000040";

// Os negócios só existem como id no audit: `resource_id` não tem FK, e a função
// não lê `crm_leads`. Criar o funil inteiro aqui mediria outra coisa.
const LEAD_CORRIGIDO = "b3260000-0000-4000-8000-000000000501";
const LEAD_TARDE = "b3260000-0000-4000-8000-000000000502";
const LEAD_SO_IA = "b3260000-0000-4000-8000-000000000503";
const LEAD_OUTRO = "b3260000-0000-4000-8000-000000000504";
const LEAD_TESTE = "b3260000-0000-4000-8000-000000000505";
const LEAD_ENCERRADO = "b3260000-0000-4000-8000-000000000506";
const LEAD_ORG_B = "b3260000-0000-4000-8000-000000000507";

async function run(id: string, orgId: string, agentId: string, versao: string, dryRun = false) {
  await pool.query(
    `insert into ai_agent_runs
       (id, organization_id, agent_id, agent_version_id, status, is_dry_run, started_at)
     values ($1, $2, $3, $4, 'completed', $5, now() - interval '3 days')
     on conflict (id) do nothing`,
    [id, orgId, agentId, versao, dryRun],
  );
}

/** Uma chamada de capacidade, `horasAtras` antes de agora. */
async function chamada(
  runId: string,
  orgId: string,
  horasAtras: number,
  tool: string,
  ok: boolean,
  extra: Record<string, unknown> = {},
) {
  await pool.query(
    `insert into api_audit_log
       (organization_id, action, resource_type, resource_id, request_id, metadata, created_at)
     values ($1, 'mcp.tool_called', 'mcp_tool', null, $2, $3::jsonb,
             now() - ($4 || ' hours')::interval)`,
    [orgId, runId, JSON.stringify({ tool_name: tool, success: ok, duration_ms: 5, ...extra }), String(horasAtras)],
  );
}

/** O `lead.moved`: com `actorUserId` é uma pessoa; sem, é a IA. */
async function moveu(orgId: string, leadId: string, horasAtras: number, actorUserId: string | null) {
  await pool.query(
    `insert into api_audit_log
       (organization_id, actor_user_id, action, resource_type, resource_id, metadata, created_at)
     values ($1, $2, 'lead.moved', 'crm_lead', $3, '{}'::jsonb, now() - ($4 || ' hours')::interval)`,
    [orgId, actorUserId, leadId, String(horasAtras)],
  );
}

beforeAll(async () => {
  // `actor_user_id` tem FK para auth.users: a pessoa que corrige precisa existir.
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'sinais-326@invariant.test') on conflict (id) do nothing`,
    [PESSOA],
  );
  for (const [org, slug, sessao] of [
    [ORG_A, "sinais-a", SESSION_A],
    [ORG_B, "sinais-b", SESSION_B],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1, $2, $3, 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
      [sessao, org, `sinais-${slug}`],
    );
  }
  await pool.query(
    `insert into ai_agents (id, organization_id, name, system_prompt)
     values ($1, $2, 'Agente observado', 'system'), ($3, $4, 'Agente de outro tenant', 'system')
     on conflict (id) do nothing`,
    [AGENTE, ORG_A, AGENTE_ORG_B, ORG_B],
  );
  for (const [versao, org, agente, sessao] of [
    [VERSAO, ORG_A, AGENTE, SESSION_A],
    [VERSAO_ORG_B, ORG_B, AGENTE_ORG_B, SESSION_B],
  ] as const) {
    await pool.query(
      `insert into ai_agent_versions
         (id, organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status, tool_ids)
       values ($1, $2, $3, 1, 'system', 'anthropic', 'claude-sonnet-4-6', $4, 'published',
               array['crm_move_lead_stage','crm_close_demand','crm_search_contacts'])
       on conflict (id) do nothing`,
      [versao, org, agente, sessao],
    );
  }

  // ── Execução 1: movimentos da IA, e o que veio depois ─────────────────────
  const R1 = "b3260000-0000-4000-8000-000000000101";
  await run(R1, ORG_A, AGENTE, VERSAO);
  // (a) IA move, pessoa move o MESMO negócio 2 h depois → corrigida.
  await chamada(R1, ORG_A, 50, "crm_move_lead_stage", true, { args: { lead_id: LEAD_CORRIGIDO } });
  await moveu(ORG_A, LEAD_CORRIGIDO, 48, PESSOA);
  // (b) IA move, pessoa move 30 h depois → fora da janela de 24 h.
  await chamada(R1, ORG_A, 49, "crm_move_lead_stage", true, { args: { lead_id: LEAD_TARDE } });
  await moveu(ORG_A, LEAD_TARDE, 19, PESSOA);
  // (c) IA move e o único lead.moved seguinte é da própria IA → não conta.
  await chamada(R1, ORG_A, 47, "crm_move_lead_stage", true, { args: { lead_id: LEAD_SO_IA } });
  await moveu(ORG_A, LEAD_SO_IA, 47, null);
  // (d) IA move um negócio; a pessoa move OUTRO → não conta.
  await chamada(R1, ORG_A, 46, "crm_move_lead_stage", true, { args: { lead_id: LEAD_OUTRO } });
  await moveu(ORG_A, "b3260000-0000-4000-8000-0000000005ff", 45, PESSOA);
  // (e) IA encerra; pessoa move de volta 1 h depois → corrigida (crm_close_demand).
  await chamada(R1, ORG_A, 44, "crm_close_demand", true, { args: { lead_id: LEAD_ENCERRADO } });
  await moveu(ORG_A, LEAD_ENCERRADO, 43, PESSOA);
  // (f) Pessoa move ANTES da IA → não é correção do que a IA fez.
  await moveu(ORG_A, LEAD_OUTRO, 47, PESSOA);

  // ── Execução 2: repetição logo depois de falhar ────────────────────────────
  const R2 = "b3260000-0000-4000-8000-000000000102";
  await run(R2, ORG_A, AGENTE, VERSAO);
  await chamada(R2, ORG_A, 30, "crm_move_lead_stage", false, { args: { lead_id: "não-é-uuid" } });
  await chamada(R2, ORG_A, 29.9, "crm_move_lead_stage", false);
  await chamada(R2, ORG_A, 29.8, "crm_move_lead_stage", true);
  // "Não achei" e busca de novo: legítimo, não conta.
  await chamada(R2, ORG_A, 29.7, "crm_search_contacts", false, { desfecho: "sem_resultado" });
  await chamada(R2, ORG_A, 29.6, "crm_search_contacts", true);
  // Falhou, chamou OUTRA, e depois a primeira de novo: não é "logo depois".
  await chamada(R2, ORG_A, 29.5, "crm_close_demand", false);
  await chamada(R2, ORG_A, 29.4, "crm_search_contacts", true);
  await chamada(R2, ORG_A, 29.3, "crm_close_demand", true);

  // ── Execução 3: teste — a pessoa "corrige", mas nada aconteceu de verdade ──
  const R3 = "b3260000-0000-4000-8000-000000000103";
  await run(R3, ORG_A, AGENTE, VERSAO, true);
  await chamada(R3, ORG_A, 20, "crm_move_lead_stage", true, { args: { lead_id: LEAD_TESTE } });
  await moveu(ORG_A, LEAD_TESTE, 19, PESSOA);

  // ── Outra organização: correção e repetição que não podem vazar ───────────
  const R4 = "b3260000-0000-4000-8000-000000000104";
  await run(R4, ORG_B, AGENTE_ORG_B, VERSAO_ORG_B);
  await chamada(R4, ORG_B, 10, "crm_move_lead_stage", true, { args: { lead_id: LEAD_ORG_B } });
  await moveu(ORG_B, LEAD_ORG_B, 9, PESSOA);
  await chamada(R4, ORG_B, 8, "crm_close_demand", false);
  await chamada(R4, ORG_B, 7.9, "crm_close_demand", false);
});

afterAll(async () => {
  // Mesma faxina de `uso-de-capacidades-do-agente.test.ts`: organização e canal
  // ficam (ids próprios desta suíte), o resto sai.
  for (const tabela of ["api_audit_log", "ai_agent_runs", "ai_agent_versions", "ai_agents"]) {
    await pool.query(`delete from ${tabela} where organization_id = any($1::uuid[])`, [[ORG_A, ORG_B]]);
  }
  await pool.end();
});

async function sinais(orgId: string, agentId: string, dias = 7) {
  const { rows } = await pool.query(
    `select tool_name, corrigidas_por_pessoa, repetidas_apos_falha
       from fn_agent_tool_signals($1::uuid, $2::uuid, now() - ($3 || ' days')::interval)
      order by tool_name`,
    [orgId, agentId, String(dias)],
  );
  return new Map(
    (rows as Array<{ tool_name: string; corrigidas_por_pessoa: string; repetidas_apos_falha: string }>).map(
      (r) => [r.tool_name, { corrigidas: Number(r.corrigidas_por_pessoa), repetidas: Number(r.repetidas_apos_falha) }],
    ),
  );
}

describe("fn_agent_tool_signals", () => {
  it("conta como corrigida só a pessoa que moveu o MESMO negócio em até 24 h", async () => {
    const s = await sinais(ORG_A, AGENTE);
    // (a) conta; (b) tarde, (c) só a IA, (d) outro negócio, (f) antes e o teste
    // da execução 3 não contam. Se qualquer um vazasse, o número passaria de 1.
    expect(s.get("crm_move_lead_stage")?.corrigidas).toBe(1);
  });

  it("encerrar o negócio e uma pessoa mover de volta também é correção", async () => {
    expect((await sinais(ORG_A, AGENTE)).get("crm_close_demand")?.corrigidas).toBe(1);
  });

  it("conta a repetição logo depois de falhar, e só essa", async () => {
    const s = await sinais(ORG_A, AGENTE);
    // Falha → falha → sucesso: duas repetições logo depois de falhar.
    expect(s.get("crm_move_lead_stage")?.repetidas).toBe(2);
    // "Não achei" seguido de nova busca não é erro de preenchimento.
    expect(s.get("crm_search_contacts")?.repetidas).toBe(0);
    // Falhou, chamou outra no meio, voltou: não é "logo depois".
    expect(s.get("crm_close_demand")?.repetidas).toBe(0);
  });

  it("não vaza entre organizações", async () => {
    const b = await sinais(ORG_B, AGENTE_ORG_B);
    expect(b.get("crm_move_lead_stage")?.corrigidas).toBe(1);
    expect(b.get("crm_close_demand")?.repetidas).toBe(1);
    // O agente da org A pedido com a org B não devolve nada.
    expect((await sinais(ORG_B, AGENTE)).size).toBe(0);
  });

  it("a janela corta: fora dela não há sinal nenhum", async () => {
    // Os runs começaram há 3 dias; uma janela de 1 dia não os alcança.
    expect((await sinais(ORG_A, AGENTE, 1)).size).toBe(0);
  });

  it("não é executável pela chave pública (anon)", async () => {
    const { rows } = await pool.query(
      `select has_function_privilege('anon', 'public.fn_agent_tool_signals(uuid, uuid, timestamptz)', 'execute') as pode`,
    );
    expect(rows[0].pode).toBe(false);
  });
});

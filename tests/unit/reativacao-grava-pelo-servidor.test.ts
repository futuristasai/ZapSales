/**
 * A ROTA DE REATIVAÇÃO GRAVA PELO SERVIDOR (#273, etapa 9a).
 *
 * A fila de tarefas agendadas (`cron_jobs`) é a porta por onde toda mensagem
 * automática sai. Esta rota era o único ponto do app que escrevia nela — e na
 * decisão da proposta — com a SESSÃO de quem estava na tela. Enquanto existir
 * um escritor assim, a tabela não pode ser fechada para a sessão (etapa 9b).
 *
 * O que fica fixado:
 *   1. a SESSÃO só lê: é a RLS dela que prova que a pessoa enxerga a proposta.
 *      Sem linha visível, 404 — e o servidor não grava nada;
 *   2. o SERVIDOR grava a decisão e o agendamento, com a organização da sessão
 *      (um `organization_id` no corpo não muda nada);
 *   3. o comportamento de fora é o de antes: aceitar agenda, recusar não,
 *      proposta vencida é 409, follow-up já pendente não agenda outro.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/leads/activity-write-failure", () => ({ registraFalhaDeAtividade: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const USUARIO = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const PROPOSTA = "44444444-4444-4444-8444-444444444444";
const CONTATO = "55555555-5555-4555-8555-555555555555";

interface Pedido {
  quem: "sessao" | "servidor";
  tabela: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
}

interface Mundo {
  propostas: Array<Record<string, unknown>>;
  cron: Array<Record<string, unknown>>;
  /** O que a RLS da sessão deixa ver. `false` = a pessoa não enxerga a proposta. */
  sessaoEnxerga: boolean;
}

function clientes(mundo: Mundo) {
  const pedidos: Pedido[] = [];
  const fabrica = (quem: Pedido["quem"]) => ({
    from: (tabela: string) => {
      const pedido: Pedido = { quem, tabela, op: "select", filtros: [] };
      pedidos.push(pedido);
      const linhas = (): Array<Record<string, unknown>> => {
        if (tabela === "crm_lead_reactivations") {
          return quem === "sessao" && !mundo.sessaoEnxerga ? [] : mundo.propostas;
        }
        if (tabela === "cron_jobs") return mundo.cron;
        if (tabela === "crm_leads") return [{ id: LEAD, contact_id: CONTATO }];
        return [];
      };
      const casa = (l: Record<string, unknown>) =>
        pedido.filtros.every(([c, v]) => !(c in l) || l[c] === v);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cadeia: any = {
        select: () => cadeia,
        gt: () => cadeia,
        eq: (c: string, v: unknown) => {
          pedido.filtros.push([c, v]);
          return cadeia;
        },
        update: (payload: Record<string, unknown>) => {
          pedido.op = "update";
          pedido.payload = payload;
          return cadeia;
        },
        insert: async (payload: Record<string, unknown>) => {
          pedido.op = "insert";
          pedido.payload = payload;
          linhas().push(payload);
          return { error: null };
        },
        maybeSingle: async () => {
          const alvo = linhas().filter(casa);
          if (pedido.op === "update") for (const l of alvo) Object.assign(l, pedido.payload);
          return { data: alvo[0] ?? null, error: null };
        },
      };
      return cadeia;
    },
  });
  vi.mocked(createClient).mockResolvedValue(fabrica("sessao") as never);
  vi.mocked(createAdminClient).mockReturnValue(fabrica("servidor") as never);
  return pedidos;
}

function mundoPadrao(over: Partial<Mundo> = {}): Mundo {
  return {
    propostas: [{ id: PROPOSTA, lead_id: LEAD, organization_id: ORG, status: "pending", expires_at: "2026-12-01T00:00:00Z" }],
    cron: [],
    sessaoEnxerga: true,
    ...over,
  };
}

function sessao(papel: Role) {
  const user: AuthUser = {
    id: USUARIO,
    email: "atendente@example.com",
    full_name: "Atendente",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

async function decidir(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/leads/[id]/reactivation/route");
  return POST(
    new NextRequest(`http://localhost/api/v1/leads/${LEAD}/reactivation`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: LEAD }) },
  );
}

const escritas = (pedidos: Pedido[]) => pedidos.filter((p) => p.op !== "select");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(emitLeadActivity).mockResolvedValue({ ok: true } as never);
  sessao("agent");
});

describe("quem lê e quem grava", () => {
  it("⭐ a sessão não escreve em nenhuma das duas tabelas — quem grava é o servidor", async () => {
    const mundo = mundoPadrao();
    const pedidos = clientes(mundo);
    const res = await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect(res.status).toBe(200);

    expect(
      escritas(pedidos).filter((p) => p.quem === "sessao"),
      "a sessão do usuário escreveu numa tabela que só o servidor deve escrever",
    ).toEqual([]);
    expect(
      escritas(pedidos)
        .map((p) => `${p.quem}:${p.op}:${p.tabela}`)
        .sort(),
    ).toEqual(["servidor:insert:cron_jobs", "servidor:update:crm_lead_reactivations"]);
  });

  it("⭐ o que o servidor grava leva a organização DA SESSÃO, a proposta e o negócio do pedido", async () => {
    const mundo = mundoPadrao();
    const pedidos = clientes(mundo);
    await decidir({ decision: "accept", proposal_id: PROPOSTA });

    const decisao = pedidos.find((p) => p.op === "update")!;
    expect(Object.fromEntries(decisao.filtros)).toEqual({
      id: PROPOSTA,
      lead_id: LEAD,
      organization_id: ORG,
      status: "pending",
    });
    expect(decisao.payload).toMatchObject({ status: "accepted", decided_by_user_id: USUARIO });

    const agendamento = pedidos.find((p) => p.op === "insert")!;
    expect(agendamento.payload).toMatchObject({
      organization_id: ORG,
      contact_id: CONTATO,
      kind: "at",
      job_kind: "followup_turn",
    });
  });

  it("⭐ `organization_id` no corpo não muda de quem é a gravação", async () => {
    const mundo = mundoPadrao();
    const pedidos = clientes(mundo);
    await decidir({ decision: "accept", proposal_id: PROPOSTA, organization_id: OUTRA_ORG });
    for (const p of escritas(pedidos)) {
      const org = p.op === "insert" ? p.payload?.organization_id : Object.fromEntries(p.filtros).organization_id;
      expect(org, `${p.op} em ${p.tabela} usou a organização do corpo`).toBe(ORG);
    }
    expect(JSON.stringify(pedidos)).not.toContain(OUTRA_ORG);
  });

  it("⭐ proposta que a sessão NÃO enxerga: 404, e o servidor não grava nada", async () => {
    const mundo = mundoPadrao({ sessaoEnxerga: false });
    const pedidos = clientes(mundo);
    const res = await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect(res.status).toBe(404);
    expect(escritas(pedidos)).toEqual([]);
    expect(mundo.propostas[0]!.status).toBe("pending");
    expect(mundo.cron).toEqual([]);
    // A leitura que decidiu foi a da SESSÃO — é a RLS dela que responde.
    expect(pedidos[0]).toMatchObject({ quem: "sessao", tabela: "crm_lead_reactivations", op: "select" });
  });

  it("quem não é atendente recebe 403 antes de qualquer leitura", async () => {
    sessao("viewer");
    const pedidos = clientes(mundoPadrao());
    expect((await decidir({ decision: "accept", proposal_id: PROPOSTA })).status).toBe(403);
    expect(pedidos).toEqual([]);
  });

  it("o código da rota não escreve na fila nem na proposta com o cliente da sessão", () => {
    const fonte = readFileSync("app/api/v1/leads/[id]/reactivation/route.ts", "utf8");
    expect(fonte).not.toMatch(/supabase\s*\.from\("cron_jobs"\)/);
    expect(fonte).toMatch(/admin\.from\("cron_jobs"\)\.insert\(/);
    const escritaDaSessao = /await supabase\s*\.from\("crm_lead_reactivations"\)\s*\.update\(/;
    expect(fonte).not.toMatch(escritaDaSessao);
  });
});

describe("o comportamento de fora é o de antes", () => {
  it("aceitar agenda o envio e diz que agendou", async () => {
    const mundo = mundoPadrao();
    clientes(mundo);
    const res = await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect((await res.json()).data).toEqual({ id: PROPOSTA, status: "accepted", envio_agendado: true });
    expect(mundo.propostas[0]!.status).toBe("accepted");
    expect(mundo.cron).toHaveLength(1);
  });

  it("recusar registra a decisão e não agenda nada", async () => {
    const mundo = mundoPadrao();
    clientes(mundo);
    const res = await decidir({ decision: "dismiss", proposal_id: PROPOSTA });
    expect((await res.json()).data).toEqual({ id: PROPOSTA, status: "dismissed", envio_agendado: false });
    expect(mundo.propostas[0]!.status).toBe("dismissed");
    expect(mundo.cron).toEqual([]);
  });

  it.each([
    ["expired", /encerrada pelo prazo/],
    ["accepted", /decidida/],
  ])("proposta que já não está pendente (%s): 409, sem regravar", async (status, frase) => {
    const mundo = mundoPadrao();
    mundo.propostas[0]!.status = status;
    clientes(mundo);
    const res = await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(frase);
    expect(mundo.propostas[0]!.status).toBe(status);
    expect(mundo.cron).toEqual([]);
  });

  it("contato que já tem follow-up pendente não ganha outro", async () => {
    const mundo = mundoPadrao({
      cron: [{ id: "c1", organization_id: ORG, contact_id: CONTATO, kind: "at", job_kind: "followup_turn", enabled: true }],
    });
    clientes(mundo);
    const res = await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect((await res.json()).data.envio_agendado).toBe(false);
    expect(mundo.cron).toHaveLength(1);
  });

  it("a atividade da decisão é emitida uma vez, pelo ator da sessão", async () => {
    clientes(mundoPadrao());
    await decidir({ decision: "accept", proposal_id: PROPOSTA });
    expect(vi.mocked(emitLeadActivity)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitLeadActivity).mock.calls[0]![1]).toMatchObject({
      organizationId: ORG,
      leadId: LEAD,
      type: "reactivation_accepted",
      actor: { type: "user", id: USUARIO },
    });
  });
});

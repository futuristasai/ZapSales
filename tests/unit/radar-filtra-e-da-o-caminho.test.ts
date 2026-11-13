import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { carregaRadarDeRisco } from "@/lib/leads/radar-de-risco";

/**
 * O RADAR FILTRA NO SERVIDOR E DIZ POR ONDE SE CHEGA A CADA LINHA.
 *
 * Três queixas de quem usa a tela, cada uma com a sua causa no servidor:
 *
 *  1. Os contadores não filtravam. Filtrar na TELA não resolveria: a lista vem
 *     ordenada por urgência e cortada em `limit`, então numa organização com 160
 *     críticos as 50 linhas que chegam são todas críticas, e "80 em voo" filtrado
 *     no navegador daria zero. O filtro tem de ser ANTES do corte.
 *
 *  2. O mesmo negócio abria conversas diferentes. A conversa do contato era "a
 *     primeira que o banco devolver", sem ordem — quem tem dois números caía numa
 *     ou noutra. Agora é a mais recente.
 *
 *  3. A lista "sem próximo passo" não era clicável porque não trazia destino.
 *
 * O banco falso APLICA filtros, ordem e teto: um dublê que os ignorasse passaria
 * com ou sem o conserto.
 */

vi.mock("@/lib/agenda/protecao-followup", () => ({
  protecaoAgendaSupabase: async () => new Map(),
}));

const ORG = "org-1";
const AGORA = new Date("2026-09-15T12:00:00.000Z");
/** 45 dias: crítico em qualquer janela. */
const HA_MUITO = "2026-08-01T12:00:00.000Z";
/** 30 horas: passou da janela fria (24h) e não da crítica (72h). */
const HA_POUCO = "2026-09-14T06:00:00.000Z";
const AMANHA = "2026-09-16T12:00:00.000Z";

type Linha = Record<string, unknown>;

function bancoFalso(tabelas: Record<string, Linha[]>): SupabaseClient {
  const from = (tabela: string) => {
    let linhas = [...(tabelas[tabela] ?? [])];
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => ((linhas = linhas.filter((l) => l[col] === val)), chain),
      is: (col: string, val: unknown) => (
        (linhas = linhas.filter((l) => (l[col] ?? null) === val)),
        chain
      ),
      in: (col: string, vals: unknown[]) => (
        (linhas = linhas.filter((l) => vals.includes(l[col]))),
        chain
      ),
      gt: (col: string, val: unknown) => (
        (linhas = linhas.filter((l) => String(l[col] ?? "") > String(val))),
        chain
      ),
      not: (col: string, op: string, lista: string) => {
        if (op !== "in") throw new Error(`operador não suportado no dublê: ${op}`);
        const vals = lista.replace(/^\(|\)$/g, "").split(",");
        linhas = linhas.filter((l) => !vals.includes(String(l[col])));
        return chain;
      },
      // HONRA a ordem, nulos por último na descendente (`nullsFirst: false`). Sem
      // isto "a mais recente" e "a primeira que vier" dão a mesma saída.
      order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const asc = opts?.ascending ?? true;
        const nulosPrimeiro = opts?.nullsFirst ?? asc;
        linhas = [...linhas].sort((a, b) => {
          const x = a[col] ?? null;
          const y = b[col] ?? null;
          if (x === null && y === null) return 0;
          if (x === null) return nulosPrimeiro ? -1 : 1;
          if (y === null) return nulosPrimeiro ? 1 : -1;
          const c = String(x).localeCompare(String(y));
          return asc ? c : -c;
        });
        return chain;
      },
      limit: (n: number) => ((linhas = linhas.slice(0, n)), chain),
      maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: linhas, error: null }).then(res),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

function lead(id: string, contato: string, parado: string, extra: Linha = {}): Linha {
  return {
    id,
    organization_id: ORG,
    status: "open",
    title: `Negócio ${id}`,
    pipeline_id: "funil-vendas",
    contact_id: contato,
    owner_user_id: null,
    owner_kind: null,
    owner_agent_id: null,
    stage_id: "etapa-proposta",
    last_activity_at: parado,
    created_at: parado,
    ...extra,
  };
}

function banco() {
  return bancoFalso({
    crm_pipelines: [
      { id: "funil-vendas", organization_id: ORG, name: "Vendas", is_archived: false },
      { id: "funil-pos", organization_id: ORG, name: "Pós-venda", is_archived: false },
    ],
    crm_stages: [
      {
        id: "etapa-proposta",
        organization_id: ORG,
        name: "Proposta enviada",
        expected_duration_hours: null,
      },
    ],
    crm_leads: [
      lead("critico-1", "contato-a", HA_MUITO),
      lead("critico-2", "contato-b", HA_MUITO),
      lead("risco-1", "contato-c", HA_POUCO),
      lead("voo-1", "contato-d", HA_MUITO),
      // Negócio de uma demanda, fresco: NÃO entra no pool de negócios parados.
      lead("fresco-da-demanda", "contato-e", AGORA.toISOString(), { pipeline_id: "funil-pos" }),
    ],
    contacts: ["a", "b", "c", "d", "e", "f"].map((x) => ({
      id: `contato-${x}`,
      organization_id: ORG,
      name: `Pessoa ${x.toUpperCase()}`,
      display_name: null,
    })),
    cron_jobs: [
      {
        organization_id: ORG,
        kind: "at",
        enabled: true,
        contact_id: "contato-d",
        next_run_at: AMANHA,
      },
    ],
    conversations: [
      // O contato A tem DUAS conversas; a antiga vem primeiro na tabela.
      {
        id: "conv-a-antiga",
        organization_id: ORG,
        contact_id: "contato-a",
        assignee_kind: null,
        last_message_at: "2026-07-01T00:00:00Z",
      },
      {
        id: "conv-a-recente",
        organization_id: ORG,
        contact_id: "contato-a",
        assignee_kind: "user",
        last_message_at: "2026-09-10T00:00:00Z",
      },
      {
        id: "conv-e",
        organization_id: ORG,
        contact_id: "contato-e",
        assignee_kind: null,
        last_message_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "conv-e-vinculada",
        organization_id: ORG,
        contact_id: "contato-e",
        assignee_kind: null,
        last_message_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "conv-f",
        organization_id: ORG,
        contact_id: "contato-f",
        assignee_kind: null,
        last_message_at: null,
      },
    ],
    demandas: [
      {
        id: "demanda-vinculada",
        organization_id: ORG,
        lead_id: "fresco-da-demanda",
        contact_id: "contato-e",
        aberta_em: "2026-09-01T12:00:00.000Z",
        origem: "inbound",
        assunto: "Segunda via do boleto",
        fechada_em: null,
        proximo_passo: null,
        contacts: { name: "Pessoa E", display_name: null },
      },
      {
        id: "demanda-sem-vinculo",
        organization_id: ORG,
        lead_id: null,
        contact_id: "contato-f",
        aberta_em: "2026-09-05T12:00:00.000Z",
        origem: "manual",
        assunto: null,
        fechada_em: null,
        proximo_passo: null,
        contacts: { name: "Pessoa F", display_name: null },
      },
    ],
    demanda_conversas: [
      {
        organization_id: ORG,
        demanda_id: "demanda-vinculada",
        conversation_id: "conv-e-vinculada",
        vinculada_em: "2026-09-01T12:00:00Z",
      },
    ],
  });
}

describe("carregaRadarDeRisco — filtro por situação", () => {
  it("sem filtro: todas as situações, da mais urgente para a menos", async () => {
    const radar = await carregaRadarDeRisco(banco(), { organizationId: ORG, now: AGORA });
    expect(radar.items.map((l) => l.risk)).toEqual(["critico", "critico", "em_risco", "em_voo"]);
    expect(radar.counts).toEqual({ critico: 2, em_risco: 1, em_voo: 1 });
  });

  it("o filtro vem ANTES do corte: “em voo” com limit 1 devolve o em voo, não um crítico", async () => {
    const radar = await carregaRadarDeRisco(banco(), {
      organizationId: ORG,
      now: AGORA,
      limit: 1,
      risk: "em_voo",
    });
    expect(radar.items.map((l) => l.id)).toEqual(["voo-1"]);
  });

  it("os contadores e o total continuam sendo do radar inteiro, com ou sem filtro", async () => {
    const radar = await carregaRadarDeRisco(banco(), {
      organizationId: ORG,
      now: AGORA,
      risk: "em_risco",
    });
    expect(radar.items.map((l) => l.id)).toEqual(["risco-1"]);
    expect(radar.counts).toEqual({ critico: 2, em_risco: 1, em_voo: 1 });
    expect(radar.total).toBe(4);
  });
});

describe("carregaRadarDeRisco — por onde se chega", () => {
  it("o negócio abre a conversa MAIS RECENTE do contato, não a primeira que o banco devolve", async () => {
    const radar = await carregaRadarDeRisco(banco(), { organizationId: ORG, now: AGORA });
    const a = radar.items.find((l) => l.id === "critico-1");
    expect(a?.conversation_id).toBe("conv-a-recente");
    expect(a?.assignee_kind).toBe("user");
  });

  it("o negócio sem conversa sai com conversation_id nulo, e sempre com funil e etapa pelo nome", async () => {
    const radar = await carregaRadarDeRisco(banco(), { organizationId: ORG, now: AGORA });
    const b = radar.items.find((l) => l.id === "critico-2");
    expect(b?.conversation_id).toBeNull();
    expect(b?.pipeline_name).toBe("Vendas");
    expect(b?.stage_name).toBe("Proposta enviada");
  });

  it("a demanda sem próximo passo traz a conversa VINCULADA a ela e o funil do negócio", async () => {
    const radar = await carregaRadarDeRisco(banco(), { organizationId: ORG, now: AGORA });
    const d = radar.sem_proximo_passo.find((x) => x.id === "demanda-vinculada");
    expect(d).toMatchObject({
      conversation_id: "conv-e-vinculada",
      lead_id: "fresco-da-demanda",
      pipeline_id: "funil-pos",
      assunto: "Segunda via do boleto",
    });
  });

  it("a demanda sem vínculo cai na conversa mais recente do contato, e sem negócio não ganha funil", async () => {
    const radar = await carregaRadarDeRisco(banco(), { organizationId: ORG, now: AGORA });
    const d = radar.sem_proximo_passo.find((x) => x.id === "demanda-sem-vinculo");
    expect(d).toMatchObject({ conversation_id: "conv-f", lead_id: null, pipeline_id: null });
    expect(radar.total_sem_proximo_passo).toBe(2);
  });
});

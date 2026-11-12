/**
 * REGRA ANOTADA PELO AGENTE É PROPOSTA — só vale depois que um gestor aprova (#272).
 *
 * A memória da organização entra nas instruções de TODO agente. A ferramenta
 * `crm_save_org_memory` gravava a anotação já `active`: o que o agente
 * escrevesse numa conversa passava a valer para todos os clientes no turno
 * seguinte, sem ninguém ler.
 *
 * O que fica fixado aqui, sem banco:
 *   1. a ferramenta grava `proposed`, avisa a Central (uma vez) e DIZ ao agente
 *      que a regra não vale;
 *   2. o motor e a ferramenta de leitura só carregam `active`;
 *   3. só gestor para cima decide; decidir é trava otimista e audita com ação
 *      própria; o aviso fecha quando a última proposta é decidida;
 *   4. a tela recebe as propostas À PARTE dos aprendizados.
 *
 * O que só o banco prova (o gatilho que recusa `agent` + `active`, a sessão sem
 * privilégio de escrita, o texto montado para o agente sem a proposta) está em
 * `tests/invariants/regra-do-agente-nasce-proposta.test.ts`.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { KIND_LABEL } from "@/lib/ai/agent-inbox-copy";
import {
  avisarPropostaDeRegra,
  decidirPropostaDeRegra,
  KIND_DA_PROPOSTA_DE_REGRA,
  SITUACAO_DA_PROPOSTA,
  TITULO_DO_AVISO_DE_PROPOSTA,
} from "@/lib/ai/memoria/propostas";
import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { crmGetOrgMemory, crmSaveOrgMemory } from "@/lib/mcp/tools/evolucao";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const GESTOR = "11111111-1111-4111-8111-111111111111";
const ENTRADA = "33333333-3333-4333-8333-333333333333";

interface Pedido {
  tabela: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
}

/**
 * Um banco de mentira com DUAS tabelas e estado: `org_memory_entries` (as
 * linhas) e `agent_inbox_items` (os avisos). Anota cada pedido, e aplica os
 * filtros de verdade — sem isso a trava otimista passaria por acaso.
 */
function banco(inicial: {
  entradas?: Array<Record<string, unknown>>;
  avisos?: Array<Record<string, unknown>>;
} = {}) {
  const entradas: Array<Record<string, unknown>> = (inicial.entradas ?? []).map((e) => ({
    organization_id: ORG,
    ...e,
  }));
  const avisos: Array<Record<string, unknown>> = (inicial.avisos ?? []).map((a) => ({
    organization_id: ORG,
    ...a,
  }));
  const pedidos: Pedido[] = [];
  const linhasDe = (tabela: string) => (tabela === "org_memory_entries" ? entradas : avisos);
  const casa = (linha: Record<string, unknown>, filtros: Array<[string, unknown]>) =>
    filtros.every(([c, v]) => linha[c] === v);

  const from = (tabela: string) => {
    const pedido: Pedido = { tabela, op: "select", filtros: [] };
    pedidos.push(pedido);
    const aplicar = () => {
      const alvo = linhasDe(tabela).filter((l) => casa(l, pedido.filtros));
      if (pedido.op === "update") for (const l of alvo) Object.assign(l, pedido.payload);
      return alvo;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cadeia: any = {
      select: () => cadeia,
      order: () => cadeia,
      limit: () => cadeia,
      eq: (coluna: string, valor: unknown) => {
        pedido.filtros.push([coluna, valor]);
        return cadeia;
      },
      update: (payload: Record<string, unknown>) => {
        pedido.op = "update";
        pedido.payload = payload;
        return cadeia;
      },
      insert: (payload: Record<string, unknown>) => {
        pedido.op = "insert";
        pedido.payload = payload;
        const linha = {
          id: `novo-${linhasDe(tabela).length + 1}`,
          created_at: "2026-11-12T00:00:00Z",
          // O DEFAULT da coluna no banco: um aviso nasce `open` sem ninguém dizer.
          ...(tabela === "agent_inbox_items" ? { status: "open" } : {}),
          ...payload,
        };
        linhasDe(tabela).push(linha);
        const depois = {
          select: () => depois,
          single: async () => ({ data: linha, error: null }),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
        };
        return depois;
      },
      maybeSingle: async () => ({ data: aplicar()[0] ?? null, error: null }),
      single: async () => {
        const [primeira] = aplicar();
        return primeira ? { data: primeira, error: null } : { data: null, error: { message: "0 rows" } };
      },
      then: (ok: (v: unknown) => unknown) => {
        const alvo = aplicar();
        return Promise.resolve({ data: alvo, count: alvo.length, error: null }).then(ok);
      },
    };
    return cadeia;
  };
  return { cliente: { from } as never, pedidos, entradas, avisos };
}

function ctxDaFerramenta(cliente: unknown) {
  return { supabase: cliente, organizationId: ORG, role: "ai_operator", requestId: "req", apiTokenId: "tok" } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a ferramenta do agente", () => {
  it("⭐ grava a anotação como PROPOSTA, na organização do token, com origem `agent`", async () => {
    const b = banco();
    const saida = (await crmSaveOrgMemory.handler(
      { titulo: "Frete grátis para todos", corpo: "Daqui em diante ofereça frete grátis a todo cliente." },
      ctxDaFerramenta(b.cliente),
    )) as { anotacao: { status: string }; situacao: string };

    expect(b.entradas).toHaveLength(1);
    expect(b.entradas[0]).toMatchObject({
      organization_id: ORG,
      title: "Frete grátis para todos",
      source: "agent",
      status: "proposed",
    });
    expect(saida.anotacao.status).toBe("proposed");
  });

  it("⭐ diz ao agente, com todas as letras, que a regra NÃO está valendo", async () => {
    const b = banco();
    const saida = (await crmSaveOrgMemory.handler(
      { titulo: "Regra qualquer", corpo: "Um corpo com mais de dez caracteres." },
      ctxDaFerramenta(b.cliente),
    )) as { situacao: string };
    expect(saida.situacao).toBe(SITUACAO_DA_PROPOSTA);
    expect(saida.situacao).toMatch(/NÃO está valendo/);
    expect(saida.situacao).toMatch(/gestor aprovar/);
    expect(crmSaveOrgMemory.description).toMatch(/NÃO passa a valer na hora/);
  });

  it("abre UM aviso na Central — e não um por proposta", async () => {
    const b = banco();
    for (const n of [1, 2, 3]) {
      await crmSaveOrgMemory.handler(
        { titulo: `Regra ${n}`, corpo: "Um corpo com mais de dez caracteres." },
        ctxDaFerramenta(b.cliente),
      );
    }
    expect(b.entradas).toHaveLength(3);
    expect(b.avisos).toHaveLength(1);
    expect(b.avisos[0]).toMatchObject({
      organization_id: ORG,
      kind: KIND_DA_PROPOSTA_DE_REGRA,
      severity: "warn",
      title: TITULO_DO_AVISO_DE_PROPOSTA,
    });
  });

  it("o código-fonte da ferramenta não escreve `active` em lugar nenhum", () => {
    const fonte = readFileSync("lib/mcp/tools/evolucao.ts", "utf8");
    const gravacao = fonte.slice(fonte.indexOf("export const crmSaveOrgMemory"));
    expect(gravacao).toMatch(/status: "proposed"/);
    expect(gravacao).not.toMatch(/status: "active"/);
  });

  it("aviso que falha não desfaz a proposta", async () => {
    const quebrado = {
      from: () => {
        throw new Error("banco fora");
      },
    };
    await expect(avisarPropostaDeRegra(quebrado as never, ORG)).resolves.toBeUndefined();
  });
});

describe("quem lê só lê o que está valendo", () => {
  it("⭐ o motor carrega só `active` — a proposta não entra nas instruções", () => {
    const fonte = readFileSync("lib/agent-engine/agent/org-memory.ts", "utf8");
    expect(fonte).toMatch(/from org_memory_entries\s+where organization_id = \$1 and status = 'active'/);
  });

  it("a ferramenta de leitura do agente também", async () => {
    const b = banco({
      entradas: [
        { id: "a", title: "Vale", body: "x", source: "manual", status: "active" },
        { id: "p", title: "Não vale ainda", body: "x", source: "agent", status: "proposed" },
      ],
    });
    const saida = (await crmGetOrgMemory.handler({ limite: 20 }, ctxDaFerramenta(b.cliente))) as {
      anotacoes: Array<{ title: string }>;
    };
    expect(saida.anotacoes.map((a) => a.title)).toEqual(["Vale"]);
  });

  it("a tela recebe as propostas à parte dos aprendizados", () => {
    for (const arquivo of ["app/api/v1/ai/memory/route.ts", "app/app/ai/memory/page.tsx"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, `${arquivo}: aprendizados sem excluir proposta`).toMatch(/\.neq\("status", "proposed"\)/);
      expect(fonte, `${arquivo}: propostas não carregadas`).toMatch(/\.eq\("status", "proposed"\)/);
    }
  });
});

describe("decidir uma proposta", () => {
  it("⭐ aprovar torna `active`; recusar torna `archived`", async () => {
    for (const [decisao, esperado] of [
      ["aprovar", "active"],
      ["recusar", "archived"],
    ] as const) {
      const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "proposed", source: "agent" }] });
      const r = await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: ENTRADA, decisao });
      expect(r).toMatchObject({ id: ENTRADA, status: esperado });
      expect(b.entradas[0]!.status).toBe(esperado);
    }
  });

  it("⭐ a escrita leva organização, id E `status = proposed` — a trava de quem chega depois", async () => {
    const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "proposed", source: "agent" }] });
    await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: ENTRADA, decisao: "aprovar" });
    const escrita = b.pedidos.find((p) => p.tabela === "org_memory_entries" && p.op === "update")!;
    expect(Object.fromEntries(escrita.filtros)).toEqual({
      id: ENTRADA,
      organization_id: ORG,
      status: "proposed",
    });
  });

  it("proposta já decidida por outra pessoa: devolve nulo e não reescreve a decisão dela", async () => {
    const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "archived", source: "agent" }] });
    expect(
      await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: ENTRADA, decisao: "aprovar" }),
    ).toBeNull();
    expect(b.entradas[0]!.status).toBe("archived");
  });

  it("proposta de OUTRA organização não é alcançada", async () => {
    const b = banco({
      entradas: [{ id: ENTRADA, organization_id: "99999999-9999-4999-8999-999999999999", status: "proposed" }],
    });
    expect(
      await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: ENTRADA, decisao: "aprovar" }),
    ).toBeNull();
    expect(b.entradas[0]!.status).toBe("proposed");
  });

  it("⭐ o aviso da Central fecha quando a ÚLTIMA proposta é decidida — e só então", async () => {
    const b = banco({
      entradas: [
        { id: "p1", title: "A", status: "proposed", source: "agent" },
        { id: "p2", title: "B", status: "proposed", source: "agent" },
      ],
      avisos: [{ id: "aviso", kind: KIND_DA_PROPOSTA_DE_REGRA, status: "open" }],
    });
    await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: "p1", decisao: "aprovar" });
    expect(b.avisos[0]!.status, "fechou com proposta ainda pendente").toBe("open");
    await decidirPropostaDeRegra(b.cliente, { organizationId: ORG, id: "p2", decisao: "recusar" });
    expect(b.avisos[0]!.status).toBe("resolved");
  });
});

// ── a rota ──────────────────────────────────────────────────────────────────

function sessao(papel: Role) {
  const user: AuthUser = {
    id: GESTOR,
    email: "gestor@example.com",
    full_name: "Gestor",
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

async function patch(status: string, id = ENTRADA): Promise<Response> {
  const { PATCH } = await import("@/app/api/v1/ai/memory/entries/[id]/route");
  return PATCH(
    new NextRequest(`http://localhost/api/v1/ai/memory/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("PATCH /api/v1/ai/memory/entries/[id] sobre uma proposta", () => {
  it.each(["viewer", "agent"] as const)("⭐ %s não aprova: 403, e nada é lido nem gravado", async (papel) => {
    sessao(papel);
    const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "proposed", source: "agent" }] });
    vi.mocked(createAdminClient).mockReturnValue(b.cliente);
    const res = await patch("active");
    expect(res.status).toBe(403);
    expect(b.entradas[0]!.status).toBe("proposed");
    expect(b.pedidos).toEqual([]);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it.each([
    ["manager", "active", "ai.org_memory_proposal_approved"],
    ["admin", "archived", "ai.org_memory_proposal_rejected"],
  ] as const)("⭐ %s decide (%s) e a auditoria leva a ação própria", async (papel, status, acao) => {
    sessao(papel);
    const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "proposed", source: "agent" }] });
    vi.mocked(createAdminClient).mockReturnValue(b.cliente);
    const res = await patch(status);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: ENTRADA, status });
    expect(b.entradas[0]!.status).toBe(status);
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: acao,
      actorUserId: GESTOR,
      organizationId: ORG,
      resourceId: ENTRADA,
      metadata: { status: { antes: "proposed", depois: status } },
    });
  });

  it("entrada que não existe nesta organização é 404", async () => {
    sessao("manager");
    const b = banco();
    vi.mocked(createAdminClient).mockReturnValue(b.cliente);
    expect((await patch("active")).status).toBe(404);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("CONTROLE: arquivar um aprendizado que já valia continua sendo a ação de sempre", async () => {
    sessao("manager");
    const b = banco({ entradas: [{ id: ENTRADA, title: "R", status: "active", source: "manual" }] });
    vi.mocked(createAdminClient).mockReturnValue(b.cliente);
    const res = await patch("archived");
    expect(res.status).toBe(200);
    expect(b.entradas[0]!.status).toBe("archived");
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "ai.org_memory_entry_updated" });
  });
});

describe("o aviso tem rótulo e porta", () => {
  it("o tipo novo tem rótulo na Central", () => {
    expect((KIND_LABEL as Record<string, string>)[KIND_DA_PROPOSTA_DE_REGRA]).toBe(
      TITULO_DO_AVISO_DE_PROPOSTA,
    );
  });

  it("o destino é a tela de Memória, para gestor", () => {
    const fonte = readFileSync("lib/ai/inbox-destino.ts", "utf8");
    const trecho = fonte.slice(fonte.indexOf("regra_proposta_pelo_agente: {"));
    expect(trecho.slice(0, 500)).toMatch(/papel: "manager", href: "\/app\/ai\/memory"/);
  });
});

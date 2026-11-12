/**
 * A ROTA QUE AJUSTA O TETO POR CONTATO (#271).
 *
 * O que este arquivo prende:
 *   1. só admin escreve; gerente lê; atendente e leitura não leem nem escrevem;
 *   2. a organização vem da sessão — um `organization_id` no corpo é RECUSADO,
 *      não ignorado (o schema é estrito);
 *   3. fora da faixa 0..10.000 é 422 dizendo o que se espera, e não um 23514 do
 *      banco virando 500;
 *   4. organização sem linha em `ai_budgets` ganha uma com `monthly_limit_cents`
 *      0 explícito — nunca o `DEFAULT 5000` que ninguém escolheu;
 *   5. toda mudança deixa UMA linha de auditoria, com antes e depois.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ADMIN,
    email: "admin@example.com",
    full_name: "Admin",
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

interface Escrita {
  op: "update" | "insert";
  payload: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
}

/** Um `ai_budgets` de mentira que GUARDA a linha — a leitura depois da escrita vê o que foi gravado. */
function banco(inicial: Record<string, unknown> | null, opts: { falhaAoGravar?: boolean } = {}) {
  let linha: Record<string, unknown> | null = inicial === null ? null : { organization_id: ORG, ...inicial };
  const escritas: Escrita[] = [];
  const tabelas: string[] = [];
  const from = (tabela: string) => {
    tabelas.push(tabela);
    const filtros: Array<[string, unknown]> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leitura: any = {
      select: () => leitura,
      eq: (coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return leitura;
      },
      maybeSingle: async () => ({ data: linha, error: null }),
      update: (payload: Record<string, unknown>) => ({
        eq: async (coluna: string, valor: unknown) => {
          escritas.push({ op: "update", payload, filtros: [[coluna, valor]] });
          if (opts.falhaAoGravar) return { error: { message: "banco fora" } };
          linha = { ...(linha ?? {}), ...payload };
          return { error: null };
        },
      }),
      insert: async (payload: Record<string, unknown>) => {
        escritas.push({ op: "insert", payload, filtros: [] });
        if (opts.falhaAoGravar) return { error: { message: "banco fora" } };
        linha = { teto_por_contato_hora: 50, teto_por_contato_dia: 150, ...payload };
        return { error: null };
      },
    };
    return leitura;
  };
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { escritas, tabelas, linha: () => linha };
}

async function get(): Promise<Response> {
  const { GET } = await import("@/app/api/v1/ai/contact-limit/route");
  return GET(new NextRequest("http://localhost/api/v1/ai/contact-limit"));
}

async function patch(body: unknown): Promise<Response> {
  const { PATCH } = await import("@/app/api/v1/ai/contact-limit/route");
  return PATCH(
    new NextRequest("http://localhost/api/v1/ai/contact-limit", {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET — quem lê", () => {
  it.each(["manager", "admin"] as const)("%s lê o teto em vigor, o padrão e o máximo", async (papel) => {
    sessao(papel);
    banco({ teto_por_contato_hora: 20, teto_por_contato_dia: 60 });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      por_hora: 20,
      por_dia: 60,
      padrao_por_hora: 50,
      padrao_por_dia: 150,
      maximo: 10_000,
    });
  });

  it.each(["viewer", "agent"] as const)("%s recebe 403", async (papel) => {
    sessao(papel);
    const { tabelas } = banco({ teto_por_contato_hora: 20, teto_por_contato_dia: 60 });
    expect((await get()).status).toBe(403);
    expect(tabelas, "leu o banco antes de conferir o papel").toEqual([]);
  });

  it("organização sem linha lê o padrão do produto", async () => {
    sessao("admin");
    banco(null);
    expect((await (await get()).json()).data).toMatchObject({ por_hora: 50, por_dia: 150 });
  });
});

describe("PATCH — quem escreve", () => {
  it.each(["viewer", "agent", "manager"] as const)("⭐ %s recebe 403 e nada é gravado", async (papel) => {
    sessao(papel);
    const { escritas, tabelas } = banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    const res = await patch({ por_hora: 1, por_dia: 1 });
    expect(res.status).toBe(403);
    expect(escritas).toEqual([]);
    expect(tabelas).toEqual([]);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("⭐ admin grava os dois campos, só na organização da sessão, e a resposta é o estado gravado", async () => {
    sessao("admin");
    const { escritas } = banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    const res = await patch({ por_hora: 30, por_dia: 90 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ por_hora: 30, por_dia: 90 });

    expect(escritas).toHaveLength(1);
    expect(escritas[0]!.op).toBe("update");
    expect(escritas[0]!.payload).toMatchObject({ teto_por_contato_hora: 30, teto_por_contato_dia: 90 });
    expect(escritas[0]!.filtros).toEqual([["organization_id", ORG]]);
  });

  it("um campo só muda só aquele campo", async () => {
    sessao("admin");
    const { escritas } = banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    await patch({ por_dia: 0 });
    expect(escritas[0]!.payload).not.toHaveProperty("teto_por_contato_hora");
    expect(escritas[0]!.payload).toMatchObject({ teto_por_contato_dia: 0 });
  });

  it("⭐ organização sem linha: a linha nasce com teto mensal 0 explícito, nunca o default da coluna", async () => {
    sessao("admin");
    const { escritas } = banco(null);
    const res = await patch({ por_hora: 10 });
    expect(res.status).toBe(200);
    expect(escritas).toHaveLength(1);
    expect(escritas[0]!.op).toBe("insert");
    expect(escritas[0]!.payload).toMatchObject({
      organization_id: ORG,
      monthly_limit_cents: 0,
      teto_por_contato_hora: 10,
    });
    expect(escritas[0]!.payload).not.toHaveProperty("enforcement_mode");
  });

  it.each([
    ["negativo", { por_hora: -1 }],
    ["acima do máximo", { por_dia: 10_001 }],
    ["fração", { por_hora: 1.5 }],
    ["texto", { por_hora: "50" }],
    ["nulo", { por_dia: null }],
    ["vazio", {}],
    ["lista", [50, 150]],
  ])("⭐ %s é 422 — e nada chega ao banco", async (_nome, corpo) => {
    sessao("admin");
    const { escritas } = banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    const res = await patch(corpo);
    expect(res.status).toBe(422);
    expect(escritas).toEqual([]);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("⭐ `organization_id` no corpo é recusado: a organização nunca vem de quem chama", async () => {
    sessao("admin");
    const { escritas } = banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    const res = await patch({ por_hora: 5, organization_id: "99999999-9999-4999-8999-999999999999" });
    expect(res.status).toBe(422);
    expect(escritas).toEqual([]);
  });

  it("corpo que não é JSON é 422", async () => {
    sessao("admin");
    banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    expect((await patch("{não é json")).status).toBe(422);
  });

  it("escrita que falha é 500, sem auditoria de uma mudança que não aconteceu", async () => {
    sessao("admin");
    banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 }, { falhaAoGravar: true });
    const res = await patch({ por_hora: 5 });
    expect(res.status).toBe(500);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("⭐ uma mudança = uma linha de auditoria, com antes e depois", async () => {
    sessao("admin");
    banco({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 });
    await patch({ por_hora: 30, por_dia: 0 });
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: "ai.contact_reply_limit_changed",
      actorUserId: ADMIN,
      organizationId: ORG,
      resourceType: "ai_budgets",
      metadata: {
        por_hora: { antes: 50, depois: 30 },
        por_dia: { antes: 150, depois: 0 },
      },
    });
  });
});

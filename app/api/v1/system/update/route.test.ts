import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertError: { code: "", message: "" },
  /** A linha de `system_version` do caso; o padrão é um programa do servidor no ar, que executa. */
  version: {} as Record<string, unknown>,
  inserts: [] as unknown[],
  audit: vi.fn(),
  escrita: vi.fn(async () => ({ user: { id: "owner" }, platformAdmin: { user_id: "owner", scope: "full", mfa_required: false } })),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "owner", is_platform_admin: true }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/requirePlatformAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/requirePlatformAdmin")>()),
  requirePlatformAdminEscrita: mocks.escrita,
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        insert: (row: unknown) => {
          mocks.inserts.push(row);
          return query;
        },
        maybeSingle: async () => ({
          data: table === "system_version" ? mocks.version : null,
          error: null,
        }),
        single: async () => ({ data: null, error: mocks.insertError }),
      };
      return query;
    },
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts = [];
  mocks.version = {
    current_version: "1.0.0",
    latest_version: "1.1.0",
    agent_last_seen_at: new Date().toISOString(),
    executes_updates: true,
  };
});

const clicar = () =>
  POST(new NextRequest("http://localhost/api/v1/system/update", { method: "POST" }));

// ── O programa do servidor da issue #311 ─────────────────────────────────────

it("programa do servidor sem batida recente: 409 agent_offline, e nenhuma rodada nasce", async () => {
  mocks.version.agent_last_seen_at = new Date(Date.now() - 10 * 60_000).toISOString();
  const res = await clicar();
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("agent_offline");
  expect(mocks.inserts).toEqual([]);
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("programa que nunca bateu também é desligado — mesmo sem versão anunciada", async () => {
  // A instalação de antes do programa: ninguém contou a versão disponível. A
  // resposta tem de ser "desligado", não "você já está em dia", que seria um
  // palpite sobre um dado que ninguém mediu.
  mocks.version.agent_last_seen_at = null;
  mocks.version.latest_version = "";
  const res = await clicar();
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("agent_offline");
  expect(mocks.inserts).toEqual([]);
});

it("instalação que anda pela main (o programa só anuncia): 409, nenhuma rodada", async () => {
  mocks.version.executes_updates = false;
  const res = await clicar();
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("state_conflict");
  expect(mocks.inserts).toEqual([]);
});

it("nunca rebaixa: anunciada menor que a instalada é 409", async () => {
  mocks.version.current_version = "1.3.0";
  mocks.version.latest_version = "1.2.9";
  const res = await clicar();
  expect(res.status).toBe(409);
  expect(mocks.inserts).toEqual([]);
});

it("nunca leva à main: alvo que não é número de versão é 409", async () => {
  mocks.version.latest_version = "main";
  const res = await clicar();
  expect(res.status).toBe(409);
  expect(mocks.inserts).toEqual([]);
});

it("programa no ar, release maior: a rodada nasce com quem pediu, de → para", async () => {
  mocks.insertError = { code: "", message: "" };
  await clicar();
  expect(mocks.inserts).toEqual([
    { from_version: "1.0.0", to_version: "1.1.0", status: "dispatched", requested_by: "owner" },
  ]);
});

it("explica a preparação de extensão que bloqueia a atualização sem despachar um run", async () => {
  mocks.insertError = { code: "P0001", message: "extension_preparation_in_progress" };
  const response = await POST(
    new NextRequest("http://localhost/api/v1/system/update", { method: "POST" }),
  );
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.error.code).toBe("state_conflict");
  expect(body.error.message).toContain("Abra Extensões");
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("a recusa nomeia as duas saídas da preparação: quem pediu retoma, qualquer responsável cancela", async () => {
  // O mesmo par de saídas que a gestão de extensões oferece (`SQL_ERRORS`): uma recusa que só
  // dissesse "há uma extensão em preparação" deixaria quem opera a VPS sem o que fazer.
  mocks.insertError = { code: "P0001", message: "extension_preparation_in_progress" };
  const response = await POST(
    new NextRequest("http://localhost/api/v1/system/update", { method: "POST" }),
  );
  const { error } = await response.json();
  expect(error.message).toContain("Atividade recente");
  expect(error.message).toContain("quem pediu pode retomar o pedido");
  expect(error.message).toContain("qualquer responsável pela instalação pode cancelá-lo");
});

it("não disfarça falha de infraestrutura como conflito de extensão", async () => {
  mocks.insertError = { code: "08006", message: "connection failed" };
  const response = await POST(
    new NextRequest("http://localhost/api/v1/system/update", { method: "POST" }),
  );
  expect(response.status).toBe(500);
  expect((await response.json()).error.message).not.toContain("Abra Extensões");
});

it("support_readonly não dispara atualização: 403 forbidden_scope, nada gravado", async () => {
  const { EscritaDePlatformAdminNegada } = await import("@/lib/auth/requirePlatformAdmin");
  mocks.escrita.mockRejectedValueOnce(new EscritaDePlatformAdminNegada("forbidden_scope", "somente leitura"));
  const response = await POST(new NextRequest("http://localhost/api/v1/system/update", { method: "POST" }));
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("forbidden_scope");
  expect(mocks.audit).not.toHaveBeenCalled();
});

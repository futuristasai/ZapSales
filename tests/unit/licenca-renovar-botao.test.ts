// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O BOTÃO "TENTAR RENOVAR AGORA" (POST /api/v1/licenca/renovar) — quem pode, o que dispara e o que devolve.
 *
 * O cliente em si está provado em `lib/licenca/renovar.test.ts`. Aqui o cliente é simulado e se prova o que a
 * ROTA acrescenta: só administrador, a guarda de suporte antes do efeito, a renovação FORÇADA, uma linha de
 * auditoria com quem apertou, e uma resposta que diz o desfecho em código e mais nada.
 */

const requireSupportWrite = vi.fn();
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: () => requireSupportWrite() }));

const requireRole = vi.fn();
vi.mock("@/lib/auth/require-role", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));

const renovarLicenca = vi.fn();
vi.mock("@/lib/licenca/renovar", () => ({
  renovarLicenca: (...a: unknown[]) => renovarLicenca(...a),
}));

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));

import { POST } from "@/app/api/v1/licenca/renovar/route";

const ADMIN = { ok: true, user: { id: "u-admin" }, org: { orgId: "org-1", role: "admin" } };

beforeEach(() => {
  requireSupportWrite.mockReset().mockResolvedValue(null);
  requireRole.mockReset().mockResolvedValue(ADMIN);
  renovarLicenca.mockReset();
  audit.mockReset();
});

describe("quem pode", () => {
  it("exige papel de administrador", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "adiada", ateSegundos: 1 });
    await POST();
    expect(requireRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ resource: "license" }),
    );
  });

  it("quem não é administrador recebe a resposta de recusa do papel, e a renovação NÃO roda", async () => {
    requireRole.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }),
    });
    const r = await POST();
    expect(r.status).toBe(403);
    expect(renovarLicenca).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("suporte em modo somente leitura é barrado ANTES de qualquer efeito", async () => {
    requireSupportWrite.mockResolvedValue(new Response("{}", { status: 403 }));
    const r = await POST();
    expect(r.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(renovarLicenca).not.toHaveBeenCalled();
  });
});

describe("o que dispara", () => {
  it("a renovação FORÇADA (ignora o lembrete da próxima consulta)", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "renovada", tipo: "temporario" });
    await POST();
    expect(renovarLicenca).toHaveBeenCalledWith({ forcar: true });
  });

  it("renovada → UMA linha de auditoria, com quem apertou o botão", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "renovada", tipo: "temporario" });
    await POST();
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "license.renewed",
        actorUserId: "u-admin",
        organizationId: null,
        metadata: { tipo: "temporario" },
      }),
    );
  });

  it.each([
    { resultado: "adiada", ateSegundos: 1_800_000_015 },
    { resultado: "nada_a_fazer", motivo: "nao_ativada" },
    { resultado: "falhou", motivo: "servidor_inalcancavel" },
  ])("rodada que não mudou o estado (%j) não audita", async (rodada) => {
    renovarLicenca.mockResolvedValue(rodada);
    await POST();
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("o que devolve", () => {
  it("o desfecho em código, o motivo quando há, e o prazo quando adiada", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "falhou", motivo: "servidor_inalcancavel" });
    expect(await (await POST()).json()).toMatchObject({
      data: { resultado: "falhou", motivo: "servidor_inalcancavel" },
    });
    renovarLicenca.mockResolvedValue({ resultado: "adiada", ateSegundos: 1_800_000_015 });
    expect(await (await POST()).json()).toMatchObject({
      data: { resultado: "adiada", ate_segundos: 1_800_000_015 },
    });
  });

  it("o código do bloqueio NÃO vai na resposta (a tela o lê do estado, para quem administra)", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "bloqueada", codigo: "reembolso" });
    const corpo = JSON.stringify(await (await POST()).json());
    expect(corpo).toContain("bloqueada");
    expect(corpo).not.toContain("reembolso");
  });
});

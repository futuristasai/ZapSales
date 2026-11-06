// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ROTA DE CRON QUE RENOVA A LICENÇA — autenticação, auditoria só quando há efeito, e o que ela NÃO faz.
 *
 * O cliente em si está provado em `lib/licenca/renovar.test.ts`, contra um servidor de mentira de verdade. Aqui
 * o cliente é simulado e se prova o que a ROTA acrescenta: quem pode chamá-la, o que ela deixa na trilha de
 * auditoria (uma linha por mudança de estado, nenhuma por rodada que não fez nada) e que a resposta não carrega
 * segredo.
 */

const renovarLicenca = vi.fn();
vi.mock("@/lib/licenca/renovar", () => ({
  renovarLicenca: (...a: unknown[]) => renovarLicenca(...a),
}));

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));

const autorizaCron = vi.fn();
vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: (...a: unknown[]) => autorizaCron(...a) }));

import { GET } from "@/app/api/v1/cron/licenca-renovar/route";

const chamar = () => GET(new NextRequest("https://exemplo.test/api/v1/cron/licenca-renovar"));

beforeEach(() => {
  renovarLicenca.mockReset();
  audit.mockReset();
  autorizaCron.mockReset();
  autorizaCron.mockReturnValue(true);
});

describe("autenticação", () => {
  it("sem o segredo do cron: 403, e o cliente nem é chamado (ninguém de fora dispara conversa com o servidor)", async () => {
    autorizaCron.mockReturnValue(false);
    const r = await chamar();
    expect(r.status).toBe(403);
    expect(renovarLicenca).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("auditoria: uma linha quando o estado mudou, nenhuma quando não", () => {
  it("renovada → `license.renewed`, com o tipo e nada mais", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "renovada", tipo: "temporario" });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "license.renewed",
        organizationId: null,
        bypassedRls: true,
        metadata: { tipo: "temporario" },
      }),
    );
  });

  it("bloqueio do servidor → `license.blocked_by_server`, com o código", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "bloqueada", codigo: "reembolso" });
    await chamar();
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "license.blocked_by_server",
        metadata: { codigo: "reembolso" },
      }),
    );
  });

  it.each([
    { resultado: "adiada", ateSegundos: 1_800_003_600 },
    { resultado: "nada_a_fazer", motivo: "permanente" },
    { resultado: "nada_a_fazer", motivo: "nao_ativada" },
    { resultado: "falhou", motivo: "servidor_inalcancavel" },
    { resultado: "falhou", motivo: "selo_rejeitado" },
  ])(
    "rodada que não mudou o estado (%j) não audita — o cron roda a cada 5 minutos",
    async (rodada) => {
      renovarLicenca.mockResolvedValue(rodada);
      const r = await chamar();
      expect(r.status).toBe(200);
      expect(audit).not.toHaveBeenCalled();
    },
  );
});

describe("a resposta", () => {
  it("diz o desfecho e mais nada: sem selo, sem credencial, sem motivo do bloqueio", async () => {
    renovarLicenca.mockResolvedValue({ resultado: "bloqueada", codigo: "reembolso" });
    const corpo = JSON.stringify(await (await chamar()).json());
    expect(corpo).toContain("bloqueada");
    expect(corpo).not.toContain("reembolso");
    expect(corpo).not.toContain("zpl_");
  });
});

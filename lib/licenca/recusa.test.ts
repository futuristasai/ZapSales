// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const consultarPorta = vi.fn();
vi.mock("./porta", () => ({ consultarPorta: (...a: unknown[]) => consultarPorta(...a) }));

import {
  guardaDeLicenca,
  MENSAGEM_DA_RECUSA,
  respostaDeRecusa,
  respostaDeRecusaDaTela,
} from "./recusa";

const RECUSANDO = {
  aplicar: true,
  modo: "valendo",
  motivo: "valendo",
  decisao: { estado: "bloqueada", opera: false },
};

beforeEach(() => consultarPorta.mockReset());

describe("guardaDeLicenca", () => {
  it("devolve null quando a porta não manda recusar (sombra, opera ou estado ilegível)", async () => {
    consultarPorta.mockResolvedValue({
      aplicar: false,
      modo: "sombra",
      motivo: "sombra",
      decisao: null,
    });
    expect(await guardaDeLicenca("cron")).toBeNull();
  });

  it("devolve a recusa quando manda recusar, e pergunta pela porta certa", async () => {
    consultarPorta.mockResolvedValue(RECUSANDO);
    const r = await guardaDeLicenca("webhook", "req-1");
    expect(consultarPorta).toHaveBeenCalledWith("webhook");
    expect(r).not.toBeNull();
    expect(r?.headers.get("x-request-id")).toBe("req-1");
  });
});

describe("o status de cada porta", () => {
  it.each(["cron", "webhook"] as const)(
    "%s → 503 com Retry-After: o remetente tenta de novo e nada se perde",
    async (porta) => {
      const r = respostaDeRecusa(porta, RECUSANDO as never);
      expect(r.status).toBe(503);
      expect(r.headers.get("retry-after")).toBe("300");
      expect(await r.json()).toMatchObject({
        error: {
          code: "license_blocked",
          message: MENSAGEM_DA_RECUSA,
          details: { state: "bloqueada" },
        },
      });
    },
  );

  it.each(["proxy", "api_token"] as const)(
    "%s → 403: quem chama precisa entender que o problema é a licença, não o servidor",
    async (porta) => {
      const r = respostaDeRecusa(porta, RECUSANDO as never);
      expect(r.status).toBe(403);
      expect(r.headers.get("retry-after")).toBeNull();
    },
  );

  it("a mensagem não revela chave, instalação nem texto livre do servidor", async () => {
    const corpo = JSON.stringify(await respostaDeRecusa("proxy", RECUSANDO as never).json());
    expect(corpo).not.toMatch(/zpl_|instalacao|reembolso/i);
  });
});

describe("respostaDeRecusaDaTela", () => {
  it("é HTML 403, sem cache, com o id da requisição", async () => {
    const r = respostaDeRecusaDaTela("abc");
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-request-id")).toBe("abc");
    expect(await r.text()).toContain("<!doctype html>");
  });
});

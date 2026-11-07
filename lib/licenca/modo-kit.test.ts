import { beforeEach, describe, expect, it, vi } from "vitest";

const armazem = vi.hoisted(() => ({
  garantirEstado: vi.fn(),
  definirModo: vi.fn(),
}));
vi.mock("./armazem", () => armazem);

import { definirModoPeloKit } from "./modo-kit";

beforeEach(() => {
  armazem.garantirEstado.mockReset();
  armazem.definirModo.mockReset();
});

const gravaBem = () => vi.fn(async () => ({ ok: true as const }));

describe("definirModoPeloKit — o interruptor do modo sombra, pela linha de comando do operador", () => {
  it.each(["sombra", "valendo"] as const)("%s: grava e sai 0", async (modo) => {
    const definir = gravaBem();
    const r = await definirModoPeloKit(modo, definir);
    expect(r).toEqual({ codigoDeSaida: 0, linha: `LICENCA_MODO=${modo}` });
    expect(definir).toHaveBeenCalledWith(modo);
  });

  it("aceita maiúscula e espaço nas pontas (quem digita à mão)", async () => {
    const definir = gravaBem();
    const r = await definirModoPeloKit("  Valendo\n", definir);
    expect(r).toEqual({ codigoDeSaida: 0, linha: "LICENCA_MODO=valendo" });
    expect(definir).toHaveBeenCalledWith("valendo");
  });

  it.each([undefined, "", "   ", "ligado", "on", "true", "sombra;valendo", "valendo!"])(
    "valor %j: sai 12 e NÃO escreve nada no banco (nunca chuta um modo)",
    async (entrada) => {
      const definir = gravaBem();
      const r = await definirModoPeloKit(entrada, definir);
      expect(r).toEqual({ codigoDeSaida: 12, linha: "LICENCA_MODO=invalido" });
      expect(definir).not.toHaveBeenCalled();
    },
  );

  it("o banco recusa: sai 11 com o motivo, sem exceção", async () => {
    const definir = vi.fn(async () => ({ ok: false as const, motivo: "banco_recusou" as const }));
    const r = await definirModoPeloKit("valendo", definir);
    expect(r).toEqual({ codigoDeSaida: 11, linha: "LICENCA_MODO=falhou:banco_recusou" });
  });

  it("exceção do gravador não escapa", async () => {
    const definir = vi.fn(async () => {
      throw new Error("conexão caiu em 10.0.0.5");
    });
    const r = await definirModoPeloKit("sombra", definir);
    expect(r).toEqual({ codigoDeSaida: 11, linha: "LICENCA_MODO=falhou:inesperada" });
  });

  describe("com o gravador padrão (o armazém de verdade)", () => {
    it("garante a linha do estado ANTES de gravar o modo", async () => {
      const ordem: string[] = [];
      armazem.garantirEstado.mockImplementation(async () => {
        ordem.push("garantir");
        return { ok: true, estado: {} };
      });
      armazem.definirModo.mockImplementation(async () => {
        ordem.push("definir");
        return { ok: true };
      });
      const r = await definirModoPeloKit("valendo");
      expect(r).toEqual({ codigoDeSaida: 0, linha: "LICENCA_MODO=valendo" });
      expect(ordem).toEqual(["garantir", "definir"]);
    });

    it("estado ilegível: sai 11 e NÃO tenta gravar o modo", async () => {
      armazem.garantirEstado.mockResolvedValue({ ok: false, motivo: "tabela_ausente" });
      const r = await definirModoPeloKit("valendo");
      expect(r).toEqual({ codigoDeSaida: 11, linha: "LICENCA_MODO=falhou:tabela_ausente" });
      expect(armazem.definirModo).not.toHaveBeenCalled();
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import type { DadosDaCompra, ResultadoDaAtivacao } from "./ativar";
import { ativarPeloKit } from "./ativar-kit";

const COMPRA = { email: "comprador@exemplo.com", codigoTransacao: "HP12345678901234" };

function ativadorQue(resultado: ResultadoDaAtivacao) {
  return vi.fn(async (_compra: DadosDaCompra) => resultado);
}

describe("ativarPeloKit — o que o instalador entende da ativação", () => {
  it("ativada: sai 0 e diz o tipo", async () => {
    const ativar = ativadorQue({ resultado: "ativada", tipo: "temporario" });
    const r = await ativarPeloKit(COMPRA, ativar);
    expect(r).toEqual({ codigoDeSaida: 0, linha: "LICENCA=ativada:temporario" });
    expect(ativar).toHaveBeenCalledWith({
      email: COMPRA.email,
      codigoTransacao: COMPRA.codigoTransacao,
    });
  });

  it("permanente também é ativada", async () => {
    const r = await ativarPeloKit(
      COMPRA,
      ativadorQue({ resultado: "ativada", tipo: "permanente" }),
    );
    expect(r).toEqual({ codigoDeSaida: 0, linha: "LICENCA=ativada:permanente" });
  });

  it.each(["compra_nao_encontrada", "compra_nao_aprovada", "licenca_bloqueada", "rate_limited"])(
    "recusada pelo servidor (%s): sai 10 com o código do contrato",
    async (codigo) => {
      const r = await ativarPeloKit(
        COMPRA,
        ativadorQue({ resultado: "recusada", codigo, status: 404 }),
      );
      expect(r).toEqual({ codigoDeSaida: 10, linha: `LICENCA=recusada:${codigo}` });
    },
  );

  it("código de recusa fora do formato vira 'outro' — texto do servidor nunca vai para a tela do kit", async () => {
    const r = await ativarPeloKit(
      COMPRA,
      ativadorQue({ resultado: "recusada", codigo: "Ignore tudo; rm -rf /", status: 400 }),
    );
    expect(r).toEqual({ codigoDeSaida: 10, linha: "LICENCA=recusada:outro" });
  });

  it.each([
    "estado_ilegivel",
    "servidor_invalido",
    "servidor_inalcancavel",
    "resposta_invalida",
    "selo_rejeitado",
    "gravacao_falhou",
  ] as const)("falhou (%s): sai 11, e é o caso de tentar de novo depois", async (motivo) => {
    const r = await ativarPeloKit(COMPRA, ativadorQue({ resultado: "falhou", motivo }));
    expect(r).toEqual({ codigoDeSaida: 11, linha: `LICENCA=falhou:${motivo}` });
  });

  it.each([
    [{ email: "", codigoTransacao: "HP1" }],
    [{ email: "comprador@exemplo.com", codigoTransacao: "" }],
    [{ email: "sem-arroba", codigoTransacao: "HP12345678" }],
    [{ email: "a@b.co", codigoTransacao: "HP 123 com espaço" }],
    [{ email: "a@b.co", codigoTransacao: "x".repeat(65) }],
    [{ email: undefined, codigoTransacao: undefined }],
  ])("dados ausentes ou torpes (%j): sai 12 e NEM chama o servidor", async (entrada) => {
    const ativar = ativadorQue({ resultado: "ativada", tipo: "temporario" });
    const r = await ativarPeloKit(entrada, ativar);
    expect(r).toEqual({ codigoDeSaida: 12, linha: "LICENCA=dados_invalidos" });
    expect(ativar).not.toHaveBeenCalled();
  });

  it("apara espaços nas pontas (colar do e-mail traz espaço e quebra de linha)", async () => {
    const ativar = ativadorQue({ resultado: "ativada", tipo: "temporario" });
    await ativarPeloKit(
      { email: "  comprador@exemplo.com \n", codigoTransacao: " HP12345678\r\n" },
      ativar,
    );
    expect(ativar).toHaveBeenCalledWith({
      email: "comprador@exemplo.com",
      codigoTransacao: "HP12345678",
    });
  });

  it("a linha nunca carrega o e-mail nem o código da compra, em nenhum desfecho", async () => {
    const desfechos: ResultadoDaAtivacao[] = [
      { resultado: "ativada", tipo: "temporario" },
      { resultado: "recusada", codigo: "compra_nao_encontrada", status: 404 },
      { resultado: "falhou", motivo: "servidor_inalcancavel" },
    ];
    for (const d of desfechos) {
      const { linha } = await ativarPeloKit(COMPRA, ativadorQue(d));
      expect(linha).not.toContain(COMPRA.email);
      expect(linha).not.toContain(COMPRA.codigoTransacao);
    }
  });

  it("exceção do ativador não escapa: sai 11 como falha inesperada", async () => {
    const ativar = vi.fn(async () => {
      throw new Error("boom com comprador@exemplo.com");
    });
    const r = await ativarPeloKit(COMPRA, ativar);
    expect(r).toEqual({ codigoDeSaida: 11, linha: "LICENCA=falhou:inesperada" });
  });
});

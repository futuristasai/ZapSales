// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  agoraEfetivo,
  estadoDaLinha,
  isoDe,
  segundosDe,
  TOLERANCIA_DE_RECUO_S,
  type LinhaDaLicenca,
} from "./estado";

const INSTALACAO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";

function linha(mudancas: Partial<LinhaDaLicenca> = {}): LinhaDaLicenca {
  return {
    instalacao_id: INSTALACAO,
    selo_atual: null,
    maior_horario_visto: null,
    ativada_em: null,
    bloqueio_codigo: null,
    bloqueio_em: null,
    ultima_consulta_ok_em: null,
    janela_termina_em: null,
    modo: "sombra",
    ...mudancas,
  };
}

describe("segundosDe / isoDe", () => {
  it("ida e volta sem perder o segundo", () => {
    const s = 1_800_000_000;
    expect(segundosDe(isoDe(s))).toBe(s);
    expect(isoDe(s)).toBe("2027-01-15T08:00:00.000Z");
  });

  it("o formato do PostgREST (com fuso e microssegundos) também lê", () => {
    expect(segundosDe("2027-01-15T08:00:00.123456+00:00")).toBe(1_800_000_000);
  });

  it("ausente ou ilegível vira null, nunca NaN nem exceção", () => {
    expect(segundosDe(null)).toBeNull();
    expect(segundosDe(undefined)).toBeNull();
    expect(segundosDe("")).toBeNull();
    expect(segundosDe("ontem")).toBeNull();
  });
});

describe("estadoDaLinha", () => {
  it("instalação que nunca foi ativada: tudo vazio, em sombra", () => {
    expect(estadoDaLinha(linha())).toEqual({
      instalacaoId: INSTALACAO,
      seloAtual: null,
      maiorHorarioVisto: null,
      ativadaEm: null,
      bloqueio: null,
      ultimaConsultaOkEm: null,
      janelaTerminaEm: null,
      proximaConsultaEm: null,
      modo: "sombra",
    });
  });

  it("traduz todos os instantes para segundos e o bloqueio para código + instante", () => {
    const e = estadoDaLinha(
      linha({
        selo_atual: "a.b.c",
        maior_horario_visto: "2027-01-15T08:00:00Z",
        ativada_em: "2027-01-05T08:00:00Z",
        bloqueio_codigo: "reembolso",
        bloqueio_em: "2027-01-15T07:00:00Z",
        ultima_consulta_ok_em: "2027-01-15T07:30:00Z",
        janela_termina_em: "2027-01-15T08:00:00Z",
        proxima_consulta_em: "2027-01-15T08:30:00Z",
        modo: "valendo",
      }),
    );
    expect(e.seloAtual).toBe("a.b.c");
    expect(e.maiorHorarioVisto).toBe(1_800_000_000);
    expect(e.ativadaEm).toBe(1_800_000_000 - 10 * 86_400);
    expect(e.bloqueio).toEqual({ codigo: "reembolso", em: 1_800_000_000 - 3600 });
    expect(e.ultimaConsultaOkEm).toBe(1_800_000_000 - 1800);
    expect(e.janelaTerminaEm).toBe(1_800_000_000);
    expect(e.proximaConsultaEm).toBe(1_800_000_000 + 1800);
    expect(e.modo).toBe("valendo");
  });

  it("linha de banco antigo (sem a coluna da próxima consulta) vira null: pode consultar já", () => {
    expect(estadoDaLinha(linha()).proximaConsultaEm).toBeNull();
  });

  it("modo desconhecido cai em sombra, o lado que não restringe ninguém", () => {
    expect(estadoDaLinha(linha({ modo: "qualquer-coisa" })).modo).toBe("sombra");
  });

  it("bloqueio com instante ilegível CONTINUA sendo bloqueio", () => {
    const e = estadoDaLinha(linha({ bloqueio_codigo: "fraude", bloqueio_em: "lixo" }));
    expect(e.bloqueio).toEqual({ codigo: "fraude", em: 0 });
  });
});

describe("agoraEfetivo — relógio que volta não estende nada", () => {
  const VISTO = 1_800_000_000;

  it("relógio à frente do visto: vale o relógio", () => {
    expect(agoraEfetivo(VISTO + 100, VISTO)).toEqual({ agora: VISTO + 100, relogioRecuou: false });
  });

  it("relógio atrás do visto: vale o visto (o recuo NÃO devolve prazo)", () => {
    const r = agoraEfetivo(VISTO - 2 * 86_400, VISTO);
    expect(r.agora).toBe(VISTO);
    expect(r.relogioRecuou).toBe(true);
  });

  it("recuo dentro da tolerância não acende o alerta, mas o agora continua sendo o maior", () => {
    const r = agoraEfetivo(VISTO - TOLERANCIA_DE_RECUO_S, VISTO);
    expect(r).toEqual({ agora: VISTO, relogioRecuou: false });
    expect(agoraEfetivo(VISTO - TOLERANCIA_DE_RECUO_S - 1, VISTO).relogioRecuou).toBe(true);
  });

  it("sem horário visto: vale o relógio", () => {
    expect(agoraEfetivo(VISTO, null)).toEqual({ agora: VISTO, relogioRecuou: false });
  });

  it("relógio não finito: vale o visto; sem nenhum dos dois, zero (e o selo vence)", () => {
    expect(agoraEfetivo(Number.NaN, VISTO).agora).toBe(VISTO);
    expect(agoraEfetivo(Number.NaN, null).agora).toBe(0);
  });
});

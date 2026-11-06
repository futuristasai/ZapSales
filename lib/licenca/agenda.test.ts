// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CONSULTA_MAXIMA_S,
  CONSULTA_MINIMA_S,
  CONSULTA_PADRAO_S,
  ESPERA_INICIAL_APOS_FALHA_S,
  ESPERA_MAXIMA_APOS_FALHA_S,
  VARIACAO_DA_CONSULTA,
  esperaAposFalha,
  proximaConsulta,
} from "./agenda";

const REF = 1_800_000_000;
const sorteio = (v: number) => () => v;

describe("proximaConsulta — a sugestão do servidor, dentro da faixa", () => {
  it("aceita a sugestão entre 5 minutos e 24 horas e a devolve como veio", () => {
    expect(proximaConsulta(REF, REF + 3600, sorteio(0.5))).toBe(REF + 3600);
    expect(proximaConsulta(REF, REF + CONSULTA_MINIMA_S, sorteio(0.5))).toBe(
      REF + CONSULTA_MINIMA_S,
    );
    expect(proximaConsulta(REF, REF + CONSULTA_MAXIMA_S, sorteio(0.5))).toBe(
      REF + CONSULTA_MAXIMA_S,
    );
  });

  it.each([
    ["1 segundo", 1],
    ["4 min 59 s", CONSULTA_MINIMA_S - 1],
    ["24 h e 1 s", CONSULTA_MAXIMA_S + 1],
    ["30 dias", 30 * 86_400],
    ["zero", 0],
    ["no passado", -3600],
  ])("ignora a sugestão fora da faixa (%s) e usa 1 hora com variação", (_nome, intervalo) => {
    expect(proximaConsulta(REF, REF + intervalo, sorteio(0.5))).toBe(REF + CONSULTA_PADRAO_S);
  });

  it("sem sugestão, ou com sugestão ilegível, usa 1 hora com variação", () => {
    expect(proximaConsulta(REF, null, sorteio(0.5))).toBe(REF + CONSULTA_PADRAO_S);
    expect(proximaConsulta(REF, Number.NaN, sorteio(0.5))).toBe(REF + CONSULTA_PADRAO_S);
    expect(proximaConsulta(REF, Number.POSITIVE_INFINITY, sorteio(0.5))).toBe(
      REF + CONSULTA_PADRAO_S,
    );
  });

  it("a variação do padrão vai de -20 % a +20 %, e as pontas são alcançáveis", () => {
    const menor = proximaConsulta(REF, null, sorteio(0)) - REF;
    const maior = proximaConsulta(REF, null, sorteio(0.999999)) - REF;
    expect(menor).toBe(Math.round(CONSULTA_PADRAO_S * (1 - VARIACAO_DA_CONSULTA)));
    expect(maior).toBeLessThanOrEqual(Math.round(CONSULTA_PADRAO_S * (1 + VARIACAO_DA_CONSULTA)));
    expect(maior).toBeGreaterThan(CONSULTA_PADRAO_S * 1.19);
  });

  it("a variação nunca leva o intervalo para fora da faixa aceita", () => {
    for (let i = 0; i <= 100; i++) {
      const intervalo = proximaConsulta(REF, null, sorteio(i / 100)) - REF;
      expect(intervalo).toBeGreaterThanOrEqual(CONSULTA_MINIMA_S);
      expect(intervalo).toBeLessThanOrEqual(CONSULTA_MAXIMA_S);
    }
  });
});

describe("esperaAposFalha — o servidor fora do ar não é martelado", () => {
  it("começa em 5 minutos e dobra a cada falha seguida, até 1 hora", () => {
    const meio = sorteio(0.5);
    expect(esperaAposFalha(1, null, meio)).toBe(ESPERA_INICIAL_APOS_FALHA_S);
    expect(esperaAposFalha(2, null, meio)).toBe(ESPERA_INICIAL_APOS_FALHA_S * 2);
    expect(esperaAposFalha(3, null, meio)).toBe(ESPERA_INICIAL_APOS_FALHA_S * 4);
    expect(esperaAposFalha(4, null, meio)).toBe(ESPERA_INICIAL_APOS_FALHA_S * 8);
    expect(esperaAposFalha(5, null, meio)).toBe(ESPERA_MAXIMA_APOS_FALHA_S);
    expect(esperaAposFalha(50, null, meio)).toBe(ESPERA_MAXIMA_APOS_FALHA_S);
  });

  it("tem variação, para mil instalações que caíram juntas não voltarem juntas", () => {
    const a = esperaAposFalha(1, null, sorteio(0));
    const b = esperaAposFalha(1, null, sorteio(0.99));
    expect(b).toBeGreaterThan(a);
  });

  it("respeita o Retry-After do servidor, dentro da faixa de 5 min a 24 h", () => {
    expect(esperaAposFalha(1, 900)).toBe(900);
    expect(esperaAposFalha(1, 5)).toBe(CONSULTA_MINIMA_S);
    expect(esperaAposFalha(1, 10 * 86_400)).toBe(CONSULTA_MAXIMA_S);
  });

  it("falha 0 ou negativa conta como a primeira", () => {
    expect(esperaAposFalha(0, null, sorteio(0.5))).toBe(ESPERA_INICIAL_APOS_FALHA_S);
    expect(esperaAposFalha(-3, null, sorteio(0.5))).toBe(ESPERA_INICIAL_APOS_FALHA_S);
  });
});

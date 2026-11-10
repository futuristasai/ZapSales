/**
 * A AJUDA DO ASSISTENTE COBRE TODOS OS PASSOS, NOS TRÊS IDIOMAS.
 *
 * `lib/onboarding/passos.ts` manda na ordem e nos rótulos; `lib/onboarding/ajuda.ts` acrescenta o que a
 * pessoa precisa para decidir (tempo, para que serve, o que escrever). Se um passo novo entrar em
 * `PASSOS` sem ajuda, a trilha mostraria uma linha vazia e o painel de ajuda simplesmente não existiria
 * — nada quebra, ninguém vê, e quem instala fica sem a explicação justamente onde ela mais importa.
 */
import { describe, expect, it } from "vitest";

import {
  AJUDA_DOS_PASSOS,
  TEXTOS_DA_CASCA,
  minutosRestantes,
  preencher,
  textoDoPasso,
  textosDaCasca,
} from "@/lib/onboarding/ajuda";
import { PASSOS } from "@/lib/onboarding/passos";

const IDIOMAS_COMPLETOS = ["pt-BR", "es", "en"] as const;

describe("a ajuda de cada passo do assistente", () => {
  it("existe para todo passo do wizard, e só para eles", () => {
    expect(Object.keys(AJUDA_DOS_PASSOS).sort()).toEqual(PASSOS.map((p) => p.segmento).sort());
  });

  it.each(PASSOS.map((p) => p.segmento))(
    "%s tem texto completo em português, espanhol e inglês",
    (segmento) => {
      const passo = AJUDA_DOS_PASSOS[segmento]!;
      expect(passo.minutos).toBeGreaterThan(0);
      for (const idioma of IDIOMAS_COMPLETOS) {
        const texto = passo.texto[idioma];
        expect(texto, `${segmento} sem ${idioma}`).toBeDefined();
        expect(texto!.resumo.trim()).not.toBe("");
        expect(texto!.paraQueServe.trim()).not.toBe("");
        expect(texto!.comoPreencher.length).toBeGreaterThan(0);
        expect(texto!.duvidas.length).toBeGreaterThan(0);
        // Só o passo que tem botão de pular diz o que acontece se for pulado — e todo passo que
        // pode ser pulado precisa dizer.
        expect(Boolean(texto!.seDeixarParaDepois), `${segmento}/${idioma}`).toBe(passo.podePular);
      }
    },
  );

  it("os três idiomas têm a mesma estrutura (mesma quantidade de passos e dúvidas)", () => {
    for (const [segmento, passo] of Object.entries(AJUDA_DOS_PASSOS)) {
      const base = passo.texto["pt-BR"];
      for (const idioma of ["es", "en"] as const) {
        const t = passo.texto[idioma]!;
        expect(t.comoPreencher.length, `${segmento}/${idioma}`).toBe(base.comoPreencher.length);
        expect(t.duvidas.length, `${segmento}/${idioma}`).toBe(base.duvidas.length);
      }
    }
  });

  it("só o primeiro passo é obrigatório: é o único sem botão de pular", () => {
    const obrigatorios = PASSOS.filter((p) => !AJUDA_DOS_PASSOS[p.segmento]!.podePular).map(
      (p) => p.segmento,
    );
    expect(obrigatorios).toEqual(["welcome"]);
  });

  it("idioma sem texto cai em inglês e depois em português, nunca em erro", () => {
    // `zh-CN` não tem entrada própria: recebe o inglês.
    const zh = textoDoPasso("welcome", "zh-CN" as never);
    expect(zh).toEqual(AJUDA_DOS_PASSOS.welcome!.texto.en);
    expect(textoDoPasso("nao-existe", "pt-BR")).toBeNull();
  });
});

describe("a casca (trilha e selos)", () => {
  it("tem os mesmos textos nos três idiomas", () => {
    const base = Object.keys(TEXTOS_DA_CASCA["pt-BR"]).sort();
    for (const idioma of ["es", "en"] as const) {
      expect(Object.keys(TEXTOS_DA_CASCA[idioma]!).sort()).toEqual(base);
    }
    expect(textosDaCasca("pt-BR").trilha).not.toBe("");
  });

  it("preenche os modelos e soma só os minutos que faltam", () => {
    expect(preencher(textosDaCasca("pt-BR").passoDe, { n: 2, total: 6 })).toBe("Passo 2 de 6");
    expect(preencher(textosDaCasca("en").faltam, { m: 9 })).toBe("about 9 minutes left");
    expect(minutosRestantes([])).toBe(0);
    expect(minutosRestantes(["welcome", "funil"])).toBe(
      AJUDA_DOS_PASSOS.welcome!.minutos + AJUDA_DOS_PASSOS.funil!.minutos,
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  categoriaConhecida,
  contarPorFiltro,
  filtrarModelos,
  partesDoBalao,
  resumoDoTexto,
} from "./galeria-de-modelos";
import type { ModeloParaCampanha, VariavelDoModelo } from "./modelos-da-campanha";

function modelo(
  parcial: Partial<ModeloParaCampanha> & Pick<ModeloParaCampanha, "id" | "name">,
): ModeloParaCampanha {
  return {
    language: "pt_BR",
    category: "UTILITY",
    texto: "",
    variaveis: [],
    botoesDeResposta: [],
    botao_wa_me: null,
    ...parcial,
  };
}

const INSCRICAO = modelo({
  id: "1",
  name: "DESAFIO JAN | INSCRIÇÃO CONFIRMADA",
  texto: "Parabéns! Sua inscrição está confirmada.",
});
const LEMBRETE = modelo({
  id: "2",
  name: "DESAFIO JULHO | LEMBRETE DOMINGO",
  texto: "Hoje às 21h tem aula ao vivo.",
});
const OFERTA = modelo({
  id: "3",
  name: "oferta_de_outubro",
  category: "MARKETING",
  texto: "Aproveite 20% de desconto.",
});
const SEM_CATEGORIA = modelo({
  id: "4",
  name: "recem_sincronizado",
  category: null,
  texto: "Olá.",
});
const TODOS = [INSCRICAO, LEMBRETE, OFERTA, SEM_CATEGORIA];

describe("categoriaConhecida", () => {
  it("aceita o que a Meta manda em maiúsculas e em qualquer caixa", () => {
    expect(categoriaConhecida("UTILITY")).toBe("UTILITY");
    expect(categoriaConhecida("marketing")).toBe("MARKETING");
    expect(categoriaConhecida(" Authentication ")).toBe("AUTHENTICATION");
  });

  it("o que falta ou não é conhecido vira null — nunca vira marketing por palpite", () => {
    expect(categoriaConhecida(null)).toBeNull();
    expect(categoriaConhecida(undefined)).toBeNull();
    expect(categoriaConhecida("")).toBeNull();
    expect(categoriaConhecida("OUTRA")).toBeNull();
  });
});

describe("filtrarModelos", () => {
  it("sem busca e em 'todas' devolve tudo, inclusive o modelo sem categoria", () => {
    expect(filtrarModelos(TODOS, { busca: "", categoria: "todas" })).toEqual(TODOS);
  });

  it("filtra por categoria, e o modelo sem categoria não entra em nenhuma", () => {
    expect(filtrarModelos(TODOS, { busca: "", categoria: "UTILITY" })).toEqual([
      INSCRICAO,
      LEMBRETE,
    ]);
    expect(filtrarModelos(TODOS, { busca: "", categoria: "MARKETING" })).toEqual([OFERTA]);
  });

  it("a busca ignora acento e caixa, e olha o nome e o texto", () => {
    expect(filtrarModelos(TODOS, { busca: "inscricao", categoria: "todas" })).toEqual([INSCRICAO]);
    expect(filtrarModelos(TODOS, { busca: "AULA AO VIVO", categoria: "todas" })).toEqual([
      LEMBRETE,
    ]);
    expect(filtrarModelos(TODOS, { busca: "desconto", categoria: "todas" })).toEqual([OFERTA]);
  });

  it("busca e categoria somam", () => {
    expect(filtrarModelos(TODOS, { busca: "desafio", categoria: "UTILITY" })).toEqual([
      INSCRICAO,
      LEMBRETE,
    ]);
    expect(filtrarModelos(TODOS, { busca: "desafio", categoria: "MARKETING" })).toEqual([]);
  });
});

describe("contarPorFiltro", () => {
  it("conta cada filtro com a mesma régua do filtro", () => {
    expect(contarPorFiltro(TODOS)).toEqual({ todas: 4, UTILITY: 2, MARKETING: 1 });
  });
});

describe("resumoDoTexto", () => {
  it("junta as quebras de linha e corta com reticências só quando passa do limite", () => {
    expect(resumoDoTexto("Oi\n\n  tudo   bem?")).toBe("Oi tudo bem?");
    expect(resumoDoTexto("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
    expect(resumoDoTexto("a".repeat(10), 10)).toBe("a".repeat(10));
  });
});

describe("partesDoBalao", () => {
  const variaveis: VariavelDoModelo[] = [
    { chave: "1", rotulo: "{{1}}", onde: "corpo", antes: "", depois: "", tipo: "text" },
    {
      chave: "button0:1",
      rotulo: "{{1}}",
      onde: "botão 1 (url)",
      antes: "",
      depois: "",
      tipo: "url_suffix",
    },
  ];

  it("a variável do corpo vira o exemplo e fica marcada; o resto é texto comum", () => {
    const partes = partesDoBalao("Oi {{1}}, tudo bem?", variaveis, () => "[primeiro nome]");
    expect(partes).toEqual([
      { texto: "Oi ", variavel: false },
      { texto: "[primeiro nome]", variavel: true },
      { texto: ", tudo bem?", variavel: false },
    ]);
    expect(partes.map((p) => p.texto).join("")).toBe("Oi [primeiro nome], tudo bem?");
  });

  it("variável que o modelo não declara no corpo fica como texto (não inventa fonte)", () => {
    const partes = partesDoBalao("Oi {{9}}", variaveis, () => "x");
    expect(partes.map((p) => p.texto).join("")).toBe("Oi {{9}}");
    expect(partes.some((p) => p.variavel)).toBe(false);
  });

  it("a mesma variável duas vezes aparece duas vezes", () => {
    const partes = partesDoBalao("{{1}} e {{1}}", variaveis, () => "Ana");
    expect(partes.filter((p) => p.variavel)).toHaveLength(2);
  });
});

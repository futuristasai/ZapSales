import { describe, expect, it } from "vitest";

import {
  desmarcarTodos,
  idsDoPublico,
  marcarTodos,
  podeMarcar,
  somaDoPublico,
  type LinhaDaTabela,
} from "./escolha-de-contatos";

const pode = (id: string): LinhaDaTabela => ({ id, motivo: null });
const veto = (id: string): LinhaDaTabela => ({ id, motivo: "opt_out" });

describe("marcarTodos", () => {
  it("marca quem pode receber e pula quem tem veto", () => {
    const r = marcarTodos([], [pode("a"), veto("b"), pode("c")]);
    expect(r.marcados).toEqual(["a", "c"]);
    expect(r.ficaramDeFora).toBe(0);
  });

  it("não repete quem já estava marcado", () => {
    expect(marcarTodos(["a"], [pode("a"), pode("b")]).marcados).toEqual(["a", "b"]);
  });

  it("respeita o teto e diz quantos ficaram de fora, em vez de cortar em silêncio", () => {
    const r = marcarTodos([], [pode("a"), pode("b"), pode("c"), pode("d")], [], 3);
    expect(r.marcados).toEqual(["a", "b", "c"]);
    expect(r.ficaramDeFora).toBe(1);
  });

  it("a planilha ocupa vaga do mesmo teto", () => {
    const r = marcarTodos([], [pode("a"), pode("b"), pode("c")], ["p1", "p2"], 3);
    expect(r.marcados).toEqual(["a"]);
    expect(r.ficaramDeFora).toBe(2);
  });

  it("quem já está na planilha entra de graça: não ocupa uma segunda vaga", () => {
    const r = marcarTodos([], [pode("p1"), pode("b")], ["p1", "p2"], 3);
    expect(r.marcados).toEqual(["p1", "b"]);
    expect(r.ficaramDeFora).toBe(0);
  });
});

describe("desmarcarTodos", () => {
  it("tira só os que a busca achou e mantém o resto", () => {
    expect(desmarcarTodos(["a", "b", "z"], [{ id: "a" }, { id: "b" }])).toEqual(["z"]);
  });
});

describe("somaDoPublico", () => {
  it("mostra as duas origens e o total", () => {
    expect(somaDoPublico(["a", "b"], ["c"])).toEqual({ doCrm: 2, daPlanilha: 1, total: 3 });
  });

  it("a pessoa nas duas origens conta uma vez só", () => {
    expect(somaDoPublico(["a", "b"], ["b", "c"])).toEqual({ doCrm: 2, daPlanilha: 1, total: 3 });
  });
});

describe("idsDoPublico", () => {
  it("junta as duas origens sem repetir e dentro do teto", () => {
    expect(idsDoPublico(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(idsDoPublico(["a", "b"], ["c"], 2)).toEqual(["a", "b"]);
  });
});

describe("podeMarcar", () => {
  it("só quem não tem veto", () => {
    expect(podeMarcar(pode("a"))).toBe(true);
    expect(podeMarcar(veto("a"))).toBe(false);
  });
});

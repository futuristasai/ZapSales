/**
 * Os pares de capacidades que se sobrepõem (issue #326) — e as regras que
 * impedem a lista de virar ruído.
 */
import { describe, expect, it } from "vitest";

import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { IDS_DO_HARNESS } from "@/lib/mcp/tools/ferramentas-do-harness";
import { SOBREPOSICOES, sobreposicoesLigadas } from "@/lib/mcp/tools/sobreposicoes";

const POR_NOME = new Map(TOOL_CATALOG.map((c) => [c.name, c]));

describe("a lista de sobreposições", () => {
  it("não está vazia (guarda de vacuidade das cercas abaixo)", () => {
    expect(SOBREPOSICOES.length).toBeGreaterThan(0);
  });

  it("cada capacidade citada existe no catálogo e pode ser marcada", () => {
    // Nome que sumiu do catálogo faria o par nunca disparar, em silêncio. E uma
    // do harness nunca fica ligada pela tela: o aviso descreveria o impossível.
    for (const { a, b } of SOBREPOSICOES) {
      for (const nome of [a, b]) {
        expect(POR_NOME.has(nome), `"${nome}" não existe no catálogo`).toBe(true);
        expect(IDS_DO_HARNESS.has(nome), `"${nome}" é do harness e a tela não deixa marcar`).toBe(
          false,
        );
      }
    }
  });

  it("nenhum par vive dentro do MESMO pacote", () => {
    // O pacote liga as duas juntas: o aviso apareceria para todo mundo que liga
    // aquele pacote, e aviso que sempre aparece ensina a não ler aviso. Par dentro
    // de um pacote é decisão de desenho do pacote — discute-se lá, não aqui.
    for (const { a, b } of SOBREPOSICOES) {
      const pa = POR_NOME.get(a)!.pacotes;
      const pb = POR_NOME.get(b)!.pacotes;
      const emComum = pa.filter((p) => pb.includes(p));
      expect(emComum, `"${a}" e "${b}" estão juntas em ${emComum.join(", ")}`).toEqual([]);
    }
  });

  it("não repete par, em nenhuma ordem", () => {
    const chaves = SOBREPOSICOES.map(({ a, b }) => [a, b].sort().join("+"));
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("todo par diz o que pode dar errado", () => {
    for (const s of SOBREPOSICOES) {
      expect(s.risco.length, `${s.a} × ${s.b} sem texto de risco`).toBeGreaterThan(30);
      // Nome técnico na frase é jargão para quem configura.
      expect(s.risco).not.toMatch(/crm_/);
    }
  });
});

describe("sobreposicoesLigadas", () => {
  const [primeiro] = SOBREPOSICOES;

  it("só acusa quando as DUAS estão ligadas", () => {
    expect(sobreposicoesLigadas([])).toEqual([]);
    expect(sobreposicoesLigadas([primeiro!.a])).toEqual([]);
    expect(sobreposicoesLigadas([primeiro!.b])).toEqual([]);
    expect(sobreposicoesLigadas([primeiro!.a, primeiro!.b])).toContainEqual(primeiro);
  });

  it("um pacote sozinho nunca acende o aviso", () => {
    // Consequência direta da cerca do "mesmo pacote", medida sobre o resultado:
    // quem liga só uma jornada não vê aviso nenhum.
    const pacotes = [...new Set(TOOL_CATALOG.flatMap((c) => c.pacotes))];
    for (const pacote of pacotes) {
      const doPacote = TOOL_CATALOG.filter((c) => c.pacotes.includes(pacote)).map((c) => c.name);
      expect(sobreposicoesLigadas(doPacote), `pacote ${pacote}`).toEqual([]);
    }
  });
});

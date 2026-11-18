/**
 * Toda capacidade do catálogo tem um exemplo de conversa, e ele existe nos três idiomas.
 *
 * O exemplo é o que a tela «O que o agente pode fazer» mostra embaixo da explicação,
 * dentro do pacote aberto. Sem esta cerca, a capacidade nova nasce sem exemplo e a
 * ficha dela fica mais pobre que as vizinhas sem ninguém perceber — e, pior, o
 * exemplo em português aparece no meio de uma tela em espanhol.
 */
import { describe, expect, it } from "vitest";

import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { EXEMPLOS_DE_CONVERSA, exemploDeConversa } from "@/lib/mcp/tools/exemplos-de-conversa";
import { temTraducao } from "@/lib/i18n/dicionario";

describe("exemplos de conversa das capacidades", () => {
  it("tem exemplo para pelo menos uma capacidade (guarda de vacuidade)", () => {
    expect(Object.keys(EXEMPLOS_DE_CONVERSA).length).toBeGreaterThan(0);
  });

  it.each(TOOL_CATALOG.map((t) => [t.name] as const))("%s tem exemplo de conversa", (nome) => {
    const exemplo = exemploDeConversa(nome);
    expect(exemplo, `escreva o exemplo de "${nome}" em lib/mcp/tools/exemplos-de-conversa.ts`).not.toBeNull();
    expect(exemplo!.trim().length).toBeGreaterThan(30);
    expect(exemplo!.length).toBeLessThanOrEqual(240);
    // Identificador técnico vazado no texto que o leigo lê.
    expect(exemplo).not.toMatch(/\bcrm_[a-z_]+/);
  });

  it("não há exemplo para capacidade que não existe", () => {
    const nomes = new Set(TOOL_CATALOG.map((t) => t.name));
    expect(Object.keys(EXEMPLOS_DE_CONVERSA).filter((n) => !nomes.has(n))).toEqual([]);
  });

  it.each(Object.entries(EXEMPLOS_DE_CONVERSA))("%s tem o exemplo em espanhol e em inglês", (_nome, exemplo) => {
    expect(temTraducao(exemplo, "es")).toBe(true);
    expect(temTraducao(exemplo, "en")).toBe(true);
  });
});

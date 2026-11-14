import { describe, expect, it } from "vitest";

import { custoPeloCatalogo } from "./custo-pelo-catalogo";
import type { TokenUsage } from "./pricing";

const UM_MILHAO: TokenUsage = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Um `db.query` que devolve linhas fixas e guarda o que foi perguntado. */
function bancoCom(linhas: Array<{ entrada: unknown; saida: unknown }>) {
  const perguntas: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      perguntas.push({ sql, params });
      return { rows: linhas };
    },
  };
  return { db: db as never, perguntas };
}

describe("custoPeloCatalogo", () => {
  it("modelo que só o catálogo conhece sai com custo, não com null", async () => {
    // O caso que motivou: `claude-fable-5-1` entra no seletor pela sincronização
    // diária, e a tabela escrita à mão não o conhece. O pg devolve numeric como
    // string — a conversão é parte do contrato.
    const { db } = bancoCom([{ entrada: "1000", saida: "5000" }]);
    expect(await custoPeloCatalogo(db, "anthropic", "claude-fable-5-1", UM_MILHAO, "1h")).toBeCloseTo(1000, 6);
  });

  it("filtra pelo provedor da chamada e tenta o id com e sem prefixo", async () => {
    const { db, perguntas } = bancoCom([{ entrada: 400, saida: 2000 }]);
    await custoPeloCatalogo(db, "openrouter", "anthropic/claude-opus-5.5", UM_MILHAO, "1h");
    expect(perguntas[0]?.params).toEqual([
      "openrouter",
      ["anthropic/claude-opus-5.5", "claude-opus-5.5"],
      "anthropic/claude-opus-5.5",
    ]);
    expect(perguntas[0]?.sql).toContain("deprecated_at is null");
  });

  it("catálogo sem a linha → null (desconhecido, nunca zero)", async () => {
    const { db } = bancoCom([]);
    expect(await custoPeloCatalogo(db, "anthropic", "claude-x", UM_MILHAO, "1h")).toBeNull();
  });

  it("linha sem preço → null", async () => {
    const { db } = bancoCom([{ entrada: null, saida: 5000 }]);
    expect(await custoPeloCatalogo(db, "anthropic", "claude-x", UM_MILHAO, "1h")).toBeNull();
  });

  it("falha do banco não derruba a contabilidade da chamada já paga", async () => {
    const db = {
      query: async () => {
        throw new Error("conexão caiu");
      },
    };
    expect(await custoPeloCatalogo(db as never, "anthropic", "claude-x", UM_MILHAO, "1h")).toBeNull();
  });
});

/**
 * OS MODELOS DA ANTHROPIC DERIVADOS DA LISTA DA OPENROUTER.
 *
 * O erro caro aqui é oferecer no seletor um id que a Anthropic não reconhece:
 * o dono escolhe, publica, e o agente fica mudo com "model not found". Por isso
 * a conversão é estreita, e os casos abaixo cobram mais o que ela RECUSA do que
 * o que ela aceita.
 *
 * As entradas são as linhas reais da OpenRouter gravadas numa instalação em
 * 13/11/2026 (nome, preço, contexto e capacidades).
 */
import { describe, expect, it } from "vitest";

import {
  FONTE_ANTHROPIC_VIA_OPENROUTER,
  derivarCatalogoDaAnthropic,
  idNaAnthropic,
} from "@/lib/ai/catalogo/anthropic";
import type { ModeloDaOpenRouter } from "@/lib/ai/catalogo/openrouter";

/** Dólares por token, como a OpenRouter publica. */
const porToken = (dolaresPorMilhao: number) => String(dolaresPorMilhao / 1_000_000);

const modelo = (
  id: string,
  nome: string,
  entrada: number,
  saida: number,
  extra: Partial<ModeloDaOpenRouter> = {},
): ModeloDaOpenRouter => ({
  id,
  name: nome,
  description: "Claude is Anthropic's model. [Docs](https://example.com)",
  context_length: 1_000_000,
  architecture: { input_modalities: ["text", "image"] },
  pricing: { prompt: porToken(entrada), completion: porToken(saida) },
  supported_parameters: ["tools", "max_tokens"],
  ...extra,
});

describe("conversão do id", () => {
  it.each([
    ["anthropic/claude-opus-5.5", "claude-opus-5-5"],
    ["anthropic/claude-sonnet-5.5", "claude-sonnet-5-5"],
    ["anthropic/claude-haiku-5.5", "claude-haiku-5-5"],
    ["anthropic/claude-fable-5.2", "claude-fable-5-2"],
    ["anthropic/claude-opus-5", "claude-opus-5"],
    ["anthropic/claude-fable-5", "claude-fable-5"],
  ])("%s → %s", (daOpenRouter, naAnthropic) => {
    expect(idNaAnthropic(daOpenRouter)).toBe(naAnthropic);
  });

  it.each([
    // variante de lote: preço de lote, e não é um id da API síncrona
    "anthropic/claude-opus-5.5:batch",
    // geração 4: a curadoria já cobre o que importa dela (piso de geração)
    "anthropic/claude-opus-4.8",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-sonnet-4",
    // restrito a organizações verificadas: oferecer a todos é prometer o que a chave não abre
    "anthropic/claude-mythos-5.2",
    // outro fabricante com nome parecido
    "openai/claude-opus-5.5",
    // sem prefixo, ou com forma desconhecida — na dúvida, não oferecer
    "claude-opus-5.5",
    "anthropic/claude-opus-5.5-20261101",
    "anthropic/claude-opus-5.5.1",
    "anthropic/claude-3.5-sonnet",
    "",
  ])("recusa %s", (id) => {
    expect(idNaAnthropic(id)).toBeNull();
  });
});

describe("derivação do catálogo", () => {
  const daOrigem: ModeloDaOpenRouter[] = [
    modelo("anthropic/claude-opus-5.5", "Anthropic: Claude Opus 5.5", 4, 20),
    modelo("anthropic/claude-opus-5.5:batch", "Anthropic: Claude Opus 5.5 (batch)", 2, 10),
    modelo("anthropic/claude-haiku-5.5", "Anthropic: Claude Haiku 5.5", 0.1, 0.5),
    modelo("anthropic/claude-opus-4.8", "Anthropic: Claude Opus 4.8", 5, 25),
    modelo("openai/gpt-5.6-sol", "OpenAI: GPT-5.6 Sol", 4, 20),
  ];

  it("traz só os aliases de geração 5+, no provedor da Anthropic", () => {
    const linhas = derivarCatalogoDaAnthropic(daOrigem);
    expect(linhas.map((l) => l.model_id).sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5"]);
    for (const l of linhas) {
      expect(l.provider).toBe("anthropic");
      expect(l.source).toBe(FONTE_ANTHROPIC_VIA_OPENROUTER);
    }
  });

  it("o preço é o da tabela, em centavos por milhão", () => {
    const opus = derivarCatalogoDaAnthropic(daOrigem).find((l) => l.model_id === "claude-opus-5-5");
    expect(opus?.input_price_per_million_cents).toBe(400);
    expect(opus?.output_price_per_million_cents).toBe(2000);
    const haiku = derivarCatalogoDaAnthropic(daOrigem).find((l) => l.model_id === "claude-haiku-5-5");
    expect(haiku?.input_price_per_million_cents).toBe(10);
    expect(haiku?.output_price_per_million_cents).toBe(50);
  });

  it("o nome perde o prefixo do fabricante e a descrição em inglês fica de fora", () => {
    const [opus] = derivarCatalogoDaAnthropic([daOrigem[0]!]);
    expect(opus?.display_name).toBe("Claude Opus 5.5");
    expect(opus?.description).toBeNull();
    expect(opus?.context_window).toBe(1_000_000);
    expect(opus?.supports_vision).toBe(true);
    expect(opus?.supports_tools).toBe(true);
  });

  it("modelo sem ferramenta não entra — não serve de atendente", () => {
    const semFerramenta = modelo("anthropic/claude-opus-5.5", "Anthropic: Claude Opus 5.5", 4, 20, {
      supported_parameters: ["max_tokens"],
    });
    expect(derivarCatalogoDaAnthropic([semFerramenta])).toEqual([]);
  });

  it("modelo sem preço não entra — rodaria fora do teto de orçamento", () => {
    const semPreco = modelo("anthropic/claude-opus-5.5", "Anthropic: Claude Opus 5.5", 4, 20, {
      pricing: { prompt: null, completion: null },
    });
    expect(derivarCatalogoDaAnthropic([semPreco])).toEqual([]);
  });

  it("id repetido na origem vira UMA linha (o upsert estouraria)", () => {
    const linhas = derivarCatalogoDaAnthropic([daOrigem[0]!, daOrigem[0]!]);
    expect(linhas).toHaveLength(1);
  });
});

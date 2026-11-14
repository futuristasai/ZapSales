/**
 * A SINCRONIZAÇÃO DIÁRIA ALIMENTA O SELETOR DA ANTHROPIC SEM PISAR NA CURADORIA.
 *
 * O defeito que motivou: com a chave da Anthropic validada, o seletor "Modelo"
 * do agente oferecia a lista da migration 0104 (agosto/2026) — sem Opus 5.5,
 * Sonnet 5.5 nem Fable 5.2. A sincronização diária já baixava esses modelos,
 * mas só os gravava como `provider = 'openrouter'`.
 *
 * Este teste roda `sincronizarCatalogo` inteiro sobre uma tabela em memória e
 * mede as três coisas que a rota precisa garantir juntas: o modelo novo chega
 * ao provedor `anthropic`; a linha curada (`claude-opus-5`, `source = 'manual'`)
 * não é tocada; e a fonte da OpenRouter segue gravando o que gravava.
 */
import { describe, expect, it } from "vitest";

import { sincronizarCatalogo } from "@/app/api/v1/cron/sync-model-catalog/route";
import type { ModeloDaOpenRouter } from "@/lib/ai/catalogo/openrouter";

interface Linha {
  provider: string;
  model_id: string;
  source: string;
  display_name: string;
  description: string | null;
  input_price_per_million_cents: number | null;
  output_price_per_million_cents: number | null;
  deprecated_at: string | null;
  [k: string]: unknown;
}

/** O recorte do cliente do Supabase que a rota usa, sobre um array. */
function adminEmMemoria(inicial: Linha[]) {
  const tabela = inicial.map((l) => ({ ...l }));
  const filtrar = (filtros: Array<(l: Linha) => boolean>) => tabela.filter((l) => filtros.every((f) => f(l)));

  const consulta = (filtros: Array<(l: Linha) => boolean>, aoFim: (linhas: Linha[]) => unknown) => {
    const b = {
      eq: (col: string, v: unknown) => consulta([...filtros, (l) => l[col] === v], aoFim),
      neq: (col: string, v: unknown) => consulta([...filtros, (l) => l[col] !== v], aoFim),
      in: (col: string, vs: unknown[]) => consulta([...filtros, (l) => vs.includes(l[col])], aoFim),
      then: (ok: (r: unknown) => unknown) => ok(aoFim(filtrar(filtros))),
    };
    return b;
  };

  const admin = {
    from: () => ({
      select: () => consulta([], (linhas) => ({ data: linhas.map((l) => ({ ...l })), error: null })),
      upsert: async (linhas: Linha[]) => {
        for (const nova of linhas) {
          const i = tabela.findIndex((l) => l.provider === nova.provider && l.model_id === nova.model_id);
          if (i >= 0) tabela[i] = { ...tabela[i]!, ...nova };
          else tabela.push({ ...nova });
        }
        return { error: null };
      },
      update: (patch: Partial<Linha>) =>
        consulta([], (linhas) => {
          for (const l of linhas) Object.assign(l, patch);
          return { error: null };
        }),
    }),
  };
  return { admin: admin as never, tabela };
}

const porToken = (dolaresPorMilhao: number) => String(dolaresPorMilhao / 1_000_000);
const daOpenRouter = (id: string, nome: string, entrada: number, saida: number): ModeloDaOpenRouter => ({
  id,
  name: nome,
  context_length: 1_000_000,
  architecture: { input_modalities: ["text", "image"] },
  pricing: { prompt: porToken(entrada), completion: porToken(saida) },
  supported_parameters: ["tools"],
});

const ORIGEM: ModeloDaOpenRouter[] = [
  daOpenRouter("anthropic/claude-opus-5.5", "Anthropic: Claude Opus 5.5", 4, 20),
  daOpenRouter("anthropic/claude-opus-5", "Anthropic: Claude Opus 5", 5, 25),
  daOpenRouter("anthropic/claude-fable-5.1", "Anthropic: Claude Fable 5.1", 10, 50),
  daOpenRouter("openai/gpt-5.6-sol", "OpenAI: GPT-5.6 Sol", 4, 20),
];

const CURADA: Linha = {
  provider: "anthropic",
  model_id: "claude-opus-5",
  source: "manual",
  display_name: "Claude Opus 5",
  description: "O mais capaz da Anthropic para trabalho agêntico complexo.",
  input_price_per_million_cents: 500,
  output_price_per_million_cents: 2500,
  deprecated_at: null,
  is_default_for_provider: false,
};

describe("sincronizarCatalogo com as duas fontes", () => {
  it("o modelo novo chega ao seletor da Anthropic, com o id da API dela e o preço", async () => {
    const { admin, tabela } = adminEmMemoria([CURADA]);
    await sincronizarCatalogo(admin, async () => ORIGEM);

    const opus55 = tabela.find((l) => l.provider === "anthropic" && l.model_id === "claude-opus-5-5");
    expect(opus55).toMatchObject({
      display_name: "Claude Opus 5.5",
      source: "openrouter-anthropic",
      input_price_per_million_cents: 400,
      output_price_per_million_cents: 2000,
      supports_tools: true,
      deprecated_at: null,
    });
    expect(tabela.some((l) => l.provider === "anthropic" && l.model_id === "claude-fable-5-1")).toBe(true);
  });

  it("a linha curada não é tocada — nem descrição, nem dono", async () => {
    const { admin, tabela } = adminEmMemoria([CURADA]);
    const resultados = await sincronizarCatalogo(admin, async () => ORIGEM);

    const opus5 = tabela.filter((l) => l.provider === "anthropic" && l.model_id === "claude-opus-5");
    expect(opus5).toHaveLength(1);
    expect(opus5[0]).toEqual(CURADA);
    expect(resultados.find((r) => r.fonte === "openrouter-anthropic")?.preservados).toBe(1);
  });

  it("a fonte da OpenRouter segue gravando o catálogo dela, com prefixo", async () => {
    const { admin, tabela } = adminEmMemoria([CURADA]);
    await sincronizarCatalogo(admin, async () => ORIGEM);

    const daOR = tabela.filter((l) => l.provider === "openrouter").map((l) => l.model_id).sort();
    expect(daOR).toEqual([
      "anthropic/claude-fable-5.1",
      "anthropic/claude-opus-5",
      "anthropic/claude-opus-5.5",
      "openai/gpt-5.6-sol",
    ]);
  });

  it("modelo da Anthropic que sai da origem é depreciado — e só o sincronizado", async () => {
    const { admin, tabela } = adminEmMemoria([CURADA]);
    await sincronizarCatalogo(admin, async () => ORIGEM);
    // No dia seguinte o Fable 5.1 some da origem.
    await sincronizarCatalogo(admin, async () => ORIGEM.filter((m) => !m.id.includes("fable")));

    const fable = tabela.find((l) => l.provider === "anthropic" && l.model_id === "claude-fable-5-1");
    expect(fable?.deprecated_at).not.toBeNull();
    // A curadoria nunca é depreciada pela sincronização, mesmo se sumisse da origem.
    expect(tabela.find((l) => l.model_id === "claude-opus-5" && l.provider === "anthropic")?.deprecated_at).toBeNull();
  });
});

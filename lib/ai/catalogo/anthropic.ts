/**
 * OS MODELOS DA ANTHROPIC, DERIVADOS DA LISTA PÚBLICA DA OPENROUTER.
 *
 * O seletor "Modelo" do agente, com o provedor "Anthropic (Claude)", lê SÓ as
 * linhas `provider = 'anthropic'` de `ai_models`. Até aqui essas linhas vinham
 * apenas de migration, e a lista parou em agosto/2026: um dono de instalação,
 * com a chave validada, não achava Opus 5.5, Sonnet 5.5 nem Fable 5.2 — que a
 * sincronização diária JÁ trazia, mas só como `provider = 'openrouter'`.
 *
 * ## Por que derivar da OpenRouter, e não perguntar à Anthropic
 *
 * A Anthropic tem `GET /v1/models`, mas ele exige uma chave e não traz preço.
 *  - **A chave** seria de uma organização, usada para montar um catálogo que
 *    vale para TODAS as organizações da instalação — chave de um cliente
 *    trabalhando para os outros. A lista da OpenRouter é pública.
 *  - **Sem preço** o modelo entraria no seletor e rodaria fora do teto de
 *    orçamento. A OpenRouter publica o preço de tabela da Anthropic (conferido
 *    linha a linha contra a tabela oficial em 13/11/2026).
 *
 * ## A conversão do id
 *
 * A OpenRouter escreve `anthropic/claude-opus-5.5`; a API da Anthropic,
 * `claude-opus-5-5`. A regra é a convenção dos aliases da Anthropic desde a
 * geração 4.5: família e versão separadas por hífen, sem data. Só converte o
 * que casa EXATAMENTE com essa forma — `:batch`, sufixos de data, `mythos`
 * (restrito a organizações verificadas) e qualquer forma desconhecida ficam de
 * fora. Na dúvida, não oferecer: um id que a Anthropic não reconhece deixaria o
 * agente mudo com a mensagem "model not found".
 *
 * ## O piso de geração
 *
 * Só da geração 5 em diante. A sincronização existe para trazer o que é NOVO;
 * as gerações 4.x que importam já estão na curadoria das migrations, e
 * ressuscitar Opus 4.5/4.6 encheria o seletor de modelos que ninguém deve
 * escolher para um agente novo.
 */
import type { LinhaDeCatalogo, ModeloDaOpenRouter } from "./openrouter";
import { traduzirModelo } from "./openrouter";

/** A origem gravada em `ai_models.source` — distinta da curadoria (`manual`). */
export const FONTE_ANTHROPIC_VIA_OPENROUTER = "openrouter-anthropic";

const FAMILIAS = ["opus", "sonnet", "haiku", "fable"] as const;
const GERACAO_MINIMA = 5;

const FORMA = /^anthropic\/claude-(opus|sonnet|haiku|fable)-(\d+)(?:\.(\d+))?$/;

/**
 * `anthropic/claude-opus-5.5` → `claude-opus-5-5`. `null` para tudo que não é
 * um alias limpo de geração 5 em diante.
 */
export function idNaAnthropic(idDaOpenRouter: string): string | null {
  const m = FORMA.exec(idDaOpenRouter.trim());
  if (!m) return null;
  const [, familia, maior, menor] = m;
  if (!FAMILIAS.includes(familia as (typeof FAMILIAS)[number])) return null;
  if (Number(maior) < GERACAO_MINIMA) return null;
  return menor === undefined ? `claude-${familia}-${maior}` : `claude-${familia}-${maior}-${menor}`;
}

/** "Anthropic: Claude Opus 5.5" → "Claude Opus 5.5". */
function nomeSemFabricante(nome: string): string {
  return nome.replace(/^anthropic:\s*/i, "").trim();
}

/**
 * Do catálogo inteiro da OpenRouter, as linhas `provider = 'anthropic'` que o
 * seletor deve oferecer. Pura — sem rede, sem banco.
 */
export function derivarCatalogoDaAnthropic(
  modelos: readonly ModeloDaOpenRouter[],
): LinhaDeCatalogo[] {
  const porId = new Map<string, LinhaDeCatalogo>();
  for (const m of modelos) {
    const id = idNaAnthropic(m.id ?? "");
    if (id === null) continue;
    const base = traduzirModelo(m);
    if (base === null) continue;
    // Modelo sem ferramenta não serve de atendente (não registra nada no
    // funil), e sem preço rodaria fora do teto. Os dois ficam de fora.
    if (!base.supports_tools) continue;
    if (base.input_price_per_million_cents === null || base.output_price_per_million_cents === null) {
      continue;
    }
    porId.set(id, {
      ...base,
      provider: "anthropic",
      model_id: id,
      display_name: nomeSemFabricante(base.display_name) || id,
      // A descrição da OpenRouter é em inglês e de marketing; a tela é em
      // português. Melhor sem descrição do que com a do vendedor.
      description: null,
      source: FONTE_ANTHROPIC_VIA_OPENROUTER,
    });
  }
  return [...porId.values()];
}

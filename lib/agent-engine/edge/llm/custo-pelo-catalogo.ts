/**
 * O custo de uma chamada cujo modelo a tabela de `pricing.ts` não conhece,
 * pelo preço do catálogo (`ai_models`).
 *
 * O catálogo se atualiza sozinho (`app/api/v1/cron/sync-model-catalog`): um
 * modelo novo da Anthropic entra no seletor no dia seguinte ao lançamento, sem
 * PR. A tabela de `pricing.ts` é escrita à mão e só conhece o modelo quando
 * alguém acrescenta a linha. Entre um e outro, a chamada saía com
 * `cost_cents = null` — e o teto de orçamento soma `coalesce(cost_cents, 0)`,
 * então o modelo mais novo (e quase sempre o mais caro) rodava FORA do teto.
 *
 * A tabela continua vencendo: ela tem o preço exato de cache, que o catálogo
 * não guarda. Este caminho só roda quando ela devolveu null.
 *
 * Nunca lança: a chamada ao modelo já aconteceu e foi paga, e uma falha aqui
 * não pode impedir a linha de `llm_calls` de ser gravada. Na dúvida, null —
 * o mesmo "desconhecido" de antes.
 */
import type pg from 'pg';

import type { CacheTtl } from './stable-prefix';
import { custoComPreco, precoDerivadoDoCatalogo, type TokenUsage } from './pricing';

export async function custoPeloCatalogo(
  db: Pick<pg.Pool, 'query'>,
  provider: string,
  model: string,
  usage: TokenUsage,
  cacheTtl: CacheTtl,
): Promise<number | null> {
  try {
    // O catálogo guarda o id como o provedor o nomeia: com prefixo na
    // OpenRouter (`anthropic/claude-…`), sem ele na Anthropic. O provedor entra
    // no filtro porque o MESMO id pode existir em dois provedores com preços
    // diferentes, e quem pagou foi o provedor da chamada.
    const semPrefixo = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
    const { rows } = await db.query<{
      entrada: string | number | null;
      saida: string | number | null;
    }>(
      `select input_price_per_million_cents as entrada,
              output_price_per_million_cents as saida
         from public.ai_models
        where provider = $1
          and model_id = any($2::text[])
          and deprecated_at is null
        order by (model_id = $3) desc
        limit 1`,
      [provider, [model, semPrefixo], model],
    );
    const linha = rows[0];
    if (!linha) return null;
    const preco = precoDerivadoDoCatalogo(
      provider,
      linha.entrada === null ? null : Number(linha.entrada),
      linha.saida === null ? null : Number(linha.saida),
    );
    return preco === null ? null : custoComPreco(preco, usage, cacheTtl);
  } catch {
    return null;
  }
}

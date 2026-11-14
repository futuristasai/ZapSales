-- manifest: catálogo da Anthropic ganha Opus 5.5, Sonnet 5.5, Haiku 5.5 e Fable 5.2 (com preço na tela e na conta), o Opus 4.7 perde o preço do Opus 4.1 (15/75 → 5/25) e o padrão vira o Sonnet 5.5; o seletor de modelo do agente parou em agosto e não oferecia a geração corrente
--
-- O seletor "Modelo" do agente (IA › Agentes › Inteligência e limites) lê SÓ
-- `ai_models`, e a lista da Anthropic era a da migration 0104 (agosto/2026):
-- Opus 5, Sonnet 5, Opus 4.8, Opus 4.7, Sonnet 4.6, Haiku 4.5. O dono de uma
-- instalação, com a chave da Anthropic validada, perguntou por que os modelos
-- de ponta não apareciam — a chave não tem nada com isso: a tela nunca
-- perguntou à Anthropic, e a lista curada envelheceu.
--
-- Ids e preços (US$ por milhão de tokens), conferidos na tabela de preços da
-- Anthropic e na lista pública da OpenRouter em 13/11/2026:
--   claude-opus-5-5    4 / 20   — o Opus corrente, mais barato que o Opus 5
--   claude-sonnet-5-5  2 / 10   — sucessor do Sonnet 5, mesmo preço
--   claude-haiku-5-5   0,10 / 0,50 até 100 mil tokens de entrada (0,50 / 2,50 acima)
--   claude-fable-5-2   8 / 40   — o mais capaz aberto a todas as contas
--
-- O PADRÃO do provedor passa a ser `claude-sonnet-5-5` (decisão do dono do
-- produto): mesmo preço do Sonnet 5, geração corrente. Agente com modelo já
-- gravado não muda.
--
-- O motor do agente (`@ai-sdk/anthropic` 4.0.82, a versão travada) já conhece
-- os quatro ids: descarta temperatura/top_p/top_k que esses modelos recusam e
-- libera a saída longa. O preço que o motor grava em `llm_calls` vem de
-- `lib/agent-engine/edge/llm/pricing.ts`, atualizado no mesmo PR.
--
-- Idempotente por `on conflict do update`. Espelhada no apêndice do baseline.

insert into public.ai_models
  (provider, model_id, display_name, description, context_window,
   input_price_per_million_cents, output_price_per_million_cents,
   supports_tools, supports_vision)
values
  ('anthropic', 'claude-fable-5-2',  'Claude Fable 5.2',
   'O mais capaz da Anthropic, para raciocínio difícil e tarefas longas. O mais caro da lista.',
   1000000, 800, 4000, true, true),
  ('anthropic', 'claude-opus-5-5',   'Claude Opus 5.5',
   'O Opus mais novo: mais capaz e mais barato que o Opus 5.',
   1000000, 400, 2000, true, true),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5',
   'Sucessor do Sonnet 5, pelo mesmo preço. Bom equilíbrio para atendimento.',
   1000000, 200, 1000, true, true),
  ('anthropic', 'claude-haiku-5-5',  'Claude Haiku 5.5',
   'O mais rápido e barato da Anthropic, para respostas curtas. Preço sobe 5× acima de 100 mil tokens de entrada.',
   1000000, 10, 50, true, true)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  context_window = excluded.context_window,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  source = 'manual',
  deprecated_at = null;

-- A contabilidade de custo usa a MESMA lista: sem a linha aqui, o gasto do
-- modelo novo seria calculado com preço de outro, ou não seria calculado.
insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('claude-fable-5-2',  800, 4000, 'catálogo 0568'),
  ('claude-opus-5-5',   400, 2000, 'catálogo 0568'),
  ('claude-sonnet-5-5', 200, 1000, 'catálogo 0568'),
  ('claude-haiku-5-5',   10,   50, 'catálogo 0568 — até 100k tokens de entrada; acima, 50/250')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;

-- Correção: o Opus 4.7 nasceu no catálogo (migration 0023) com o preço do Opus
-- 4/4.1 — US$ 15/75 — e nunca foi revisto. Ele custa US$ 5/25, que é o que o
-- motor do agente (`pricing.ts`) já cobra em `llm_calls`. A tela anunciava o
-- triplo, e o `ai_pricing` (derivado pelo backfill da 0068) somava o triplo
-- nos workers que leem dele.
update public.ai_models
   set input_price_per_million_cents = 500,
       output_price_per_million_cents = 2500,
       context_window = 1000000,
       description = 'Geração anterior do Opus.'
 where provider = 'anthropic' and model_id = 'claude-opus-4-7';
update public.ai_pricing
   set prompt_cents_per_million_tokens = 500,
       completion_cents_per_million_tokens = 2500,
       notes = 'catálogo 0568 — corrigido de 1500/7500 (preço do Opus 4.1)'
 where model = 'claude-opus-4-7';

-- Padrão do provedor: Sonnet 5.5 no lugar do Sonnet 5 (decisão do dono do
-- produto, 13/11/2026). Mesmo preço, geração corrente. Vale para o que nasce
-- daqui em diante (agente novo, primeira publicação, organização sem modelo
-- escolhido); agente que já tem modelo gravado segue com ele.
-- O índice `ai_models_one_default_per_provider` é UNIQUE parcial e imediato:
-- limpar o anterior vem ANTES de marcar o novo.
update public.ai_models set is_default_for_provider = false
 where provider = 'anthropic' and is_default_for_provider and model_id <> 'claude-sonnet-5-5';
update public.ai_models set is_default_for_provider = true
 where provider = 'anthropic' and model_id = 'claude-sonnet-5-5';

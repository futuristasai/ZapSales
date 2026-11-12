-- manifest: Teto de atendimentos automáticos por contato (por hora e por dia) em ai_budgets, motivo e origem próprios na passagem para humano e índice de llm_calls por contato — um único número deixa de poder consumir o orçamento de IA da organização inteira (#271).
--
-- O teto mensal protege a organização como um todo. Faltava a medida por
-- CONTATO: quem escreve sem parar (uma pessoa insistente, um robô, um laço entre
-- dois bots) gerava um atendimento de IA por mensagem, sem limite. A regra e a
-- consulta moram em lib/agent-engine/agent/teto-por-contato.ts; aqui ficam as
-- duas colunas que a organização ajusta e o vocabulário que a passagem grava.
--
-- Nada muda para quem não estoura: os padrões (50 por hora, 150 por dia) são
-- folgados, e 0 desliga a janela.

alter table public.ai_budgets
  add column if not exists teto_por_contato_hora integer not null default 50
    check (teto_por_contato_hora between 0 and 10000);
alter table public.ai_budgets
  add column if not exists teto_por_contato_dia integer not null default 150
    check (teto_por_contato_dia between 0 and 10000);

comment on column public.ai_budgets.teto_por_contato_hora is
  'Quantas vezes a IA atende o MESMO contato em 60 minutos antes de passar a conversa para uma pessoa (issue #271). 0 = sem teto por hora. Organização sem linha usa o padrão do produto (50). Lido por lib/agent-engine/agent/teto-por-contato.ts.';
comment on column public.ai_budgets.teto_por_contato_dia is
  'Quantas vezes a IA atende o MESMO contato em 24 horas antes de passar a conversa para uma pessoa (issue #271). 0 = sem teto por dia. Organização sem linha usa o padrão do produto (150).';

-- A contagem do teto filtra por contato dentro de uma janela de 24 horas. Sem
-- este índice ela varreria as chamadas do dia da organização inteira a cada
-- turno de resposta.
create index if not exists llm_calls_contato_idx
  on public.llm_calls (organization_id, contact_id, created_at desc)
  where contact_id is not null;

-- O vocabulário da passagem ganha a origem e o motivo do desvio novo. As listas
-- são as mesmas de lib/escalacao/passagem.ts (ORIGENS_DA_PASSAGEM e
-- MOTIVOS_DA_PASSAGEM) — tests/invariants/vocabulario-banco-x-typescript.test.ts
-- compara os dois lados.
alter table public.passagens_de_atendimento
  drop constraint if exists passagens_de_atendimento_origem_check;
alter table public.passagens_de_atendimento
  add constraint passagens_de_atendimento_origem_check
  check (origem in (
    'pedido_explicito','opt_out_provavel','ferramenta_do_modelo',
    'teto_de_gasto','teto_por_contato','caso_escalado','sentimento','legado_pedido',
    'legado_juridico','legado_etapa','legado_confianca','legado_teto',
    'mcp_externo','runtime_nativo'));

alter table public.passagens_de_atendimento
  drop constraint if exists passagens_de_atendimento_motivo_codigo_check;
alter table public.passagens_de_atendimento
  add constraint passagens_de_atendimento_motivo_codigo_check
  check (motivo_codigo in (
    'requested_human','suspected_optout','orcamento_de_ia','limite_por_contato','low_sentiment',
    'low_confidence','critical_stage','legal_mention','refund_mention',
    'caso_escalado'));

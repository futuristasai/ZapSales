-- Dados FICTÍCIOS: o "cérebro" do agente de atendimento da Loja Aurora e a versão vendedora dele.
--
-- Uso (dentro do container do banco, com os arquivos em /tmp):
--   psql -v ON_ERROR_STOP=1 -v org=<uuid da org> -v fim=commit -f semear-materiais.sql
--   (`fim=rollback` é o ensaio)
-- Roda DEPOIS de semear-vendedor.sql e de subir-materiais.mjs (que guarda os dois .md no bucket
-- `ai-policy`, em <org>/demo-vendedor-*.md, pelo mesmo caminho do "colar texto" da tela).
--
-- O QUE ACONTECE DEPOIS: cada material novo emite `knowledge_source.updated`, e o indexador
-- (worker) prepara os trechos com a chave de embedding da ORGANIZAÇÃO — custa centavos e é o que
-- faz o agente encontrar o conteúdo de verdade. Estes eventos NÃO são marcados como consumidos.
-- O agente continua com is_active como estava: publicar a versão não liga atendimento nenhum.

\set ON_ERROR_STOP 1
\if :{?fim}
\else
  \set fim rollback
\endif

select exists (select 1 from ai_knowledge_sources where organization_id = :'org' and name = 'Aurora Empresas — vendas corporativas') as ja \gset
\if :ja
  \echo 'semear-materiais.sql já foi aplicado nesta organização. Nada foi feito.'
  \quit
\endif

\set instrucoes `cat /tmp/instrucoes-da-julia.txt`
select id as agente, published_version_id as atual from ai_agents where organization_id = :'org' and name = 'Atendente da Loja' \gset
select id as faq from ai_knowledge_sources where organization_id = :'org' and name = 'Perguntas frequentes da loja' and status <> 'archived' \gset

begin;

-- a "Tabela de preços" era um PDF sem texto (nunca entrou); preço agora vem só do catálogo
update ai_knowledge_sources set status = 'archived', is_active = false, updated_at = now()
 where organization_id = :'org' and name = 'Tabela de preços' and status <> 'archived';

insert into ai_knowledge_sources (organization_id, source_type, name, status, is_active, source_metadata, ingested_at)
values
 (:'org', 'documento', 'Como a Júlia vende', 'ready', true,
  jsonb_build_object('blob_path', :'org' || '/demo-vendedor-como-a-julia-vende.md', 'ext', 'md', 'origem', 'texto_colado',
                     'filename', 'como-a-julia-vende.md'), now()),
 (:'org', 'documento', 'Aurora Empresas — vendas corporativas', 'ready', true,
  jsonb_build_object('blob_path', :'org' || '/demo-vendedor-aurora-empresas.md', 'ext', 'md', 'origem', 'texto_colado',
                     'filename', 'aurora-empresas.md'), now());

-- perguntas novas no FAQ que já existe
insert into ai_faq_items (organization_id, knowledge_source_id, question, answer, tags, position)
select :'org', :'faq', q, a, t, 100 + n
from (values
 (1, 'Como sei o meu tamanho?', 'Roupas: P (busto 84-88 cm), M (90-94), G (96-100) e GG (102-108). Calçados: forma normal, do 34 ao 44. Na dúvida, me diga a sua medida que eu indico o tamanho.', array['tamanho']),
 (2, 'Vocês embrulham para presente?', 'Sim, sem custo. É só pedir na hora de fechar o pedido, e dá para mandar um cartão com mensagem.', array['presente']),
 (3, 'Vocês têm loja física?', 'Temos, na Rua das Acácias, 120, Pinheiros, São Paulo. De segunda a sábado, das 9h às 19h. Dá para comprar pelo WhatsApp e retirar lá no mesmo dia, sem frete.', array['loja']),
 (4, 'Qual o horário do atendimento no WhatsApp?', 'A Júlia responde a qualquer hora. A equipe confirma pagamentos e trocas de segunda a sábado, das 9h às 19h.', array['atendimento']),
 (5, 'Vocês têm vale-presente?', 'Temos o vale-presente digital, de R$ 100 a R$ 1.000, entregue no mesmo dia por WhatsApp ou e-mail, com mensagem personalizada. Vale por 12 meses.', array['presente']),
 (6, 'Vocês vendem para empresas?', 'Sim, pela Aurora Empresas: kits de boas-vindas, presentes de fim de ano e brindes com o logo da empresa, com desconto por volume a partir de 50 unidades. A gente marca uma conversa de 30 minutos com a consultora corporativa para montar a proposta.', array['empresas']),
 (7, 'Os produtos são originais?', 'Todos são originais, com nota fiscal e garantia do fabricante.', array['garantia']),
 (8, 'Posso reservar um produto?', 'Pode. Reservamos por 24 horas no seu nome enquanto você decide.', array['reserva'])
) v(n, q, a, t);

-- o indexador prepara os três (os dois novos e o FAQ com as perguntas novas)
select emit_event('knowledge_source.updated', 'ai_knowledge_source', s.id,
                  jsonb_build_object('knowledge_source_id', s.id, 'agent_id', null, 'source_type', s.source_type),
                  '{}'::jsonb, :'org')
from ai_knowledge_sources s
where s.organization_id = :'org' and (s.name in ('Como a Júlia vende', 'Aurora Empresas — vendas corporativas') or s.id = :'faq');

-- ===================================================================== Versão vendedora do agente
insert into ai_agent_versions (organization_id, agent_id, version_number, system_prompt, provider, model, credential_id,
  tool_ids, trigger_config, channel_session_id, max_steps, token_budget, cost_budget_cents, history_message_window,
  history_token_window, handoff_keywords, handoff_tool_enabled, status, followup, multimodal_input, split_messages,
  split_max_chars, cases_enabled, pipeline_ids, knowledge_source_ids, profile_persona, profile_tone, profile_objective,
  profile_welcome, profile_language, restrict_topics, allowed_topics, off_topic_reply, created_by)
select v.organization_id, v.agent_id,
  (select max(version_number) + 1 from ai_agent_versions where agent_id = v.agent_id),
  :'instrucoes', v.provider, v.model, v.credential_id,
  array['crm_search_products','crm_search_knowledge','crm_get_org_memory',
        'crm_search_contacts','crm_get_contact','crm_list_conversations','crm_get_conversation','crm_get_conversation_history',
        'crm_list_contact_orders','crm_list_tags','crm_manage_tags','crm_list_message_templates','crm_render_message_template',
        'crm_get_queue_status','crm_list_available_attendants','crm_assign_conversation','crm_schedule_followup',
        'crm_list_pipelines','crm_list_stages','crm_list_leads','crm_get_lead','crm_create_lead','crm_update_lead','crm_move_lead_stage',
        'crm_list_event_types','crm_find_free_slots','crm_book_appointment','crm_reschedule_appointment','crm_list_appointments',
        'crm_list_privacy_requests'],
  v.trigger_config, v.channel_session_id, 14, v.token_budget, v.cost_budget_cents, v.history_message_window,
  v.history_token_window, v.handoff_keywords, v.handoff_tool_enabled, 'draft', v.followup, v.multimodal_input, v.split_messages,
  v.split_max_chars, v.cases_enabled,
  array(select id from crm_pipelines where organization_id = :'org' and slug in ('pedidos', 'aurora-empresas') order by position),
  array(select id from ai_knowledge_sources
         where organization_id = :'org' and status <> 'archived' and is_active
           and name in ('Como a Júlia vende', 'Aurora Empresas — vendas corporativas', 'Perguntas frequentes da loja', 'Política de troca', 'Site da loja')
         order by created_at),
  'Júlia, vendedora da Loja Aurora: atenciosa, consultiva e boa de recomendação',
  v.profile_tone,
  'Entender o que a pessoa procura, recomendar o produto certo e levar o pedido até o pagamento; em vendas para empresas, qualificar e marcar a conversa com a consultora corporativa',
  'Oi! Eu sou a Júlia, da Loja Aurora 💜 Me conta: está procurando algo para você ou para presentear alguém?',
  v.profile_language, true,
  array['Produtos, preços e disponibilidade', 'Recomendação de presentes', 'Prazos de entrega e frete', 'Trocas e devoluções',
        'Pagamento e Pix', 'Vendas para empresas e brindes corporativos', 'Agendamento com a consultora corporativa'],
  'Por aqui eu ajudo com produtos, presentes, pedidos, entregas, trocas e vendas para empresas. Quer falar com uma pessoa da equipe?',
  v.created_by
from ai_agent_versions v where v.id = :'atual'
returning id as nova \gset

select * from fn_publish_ai_agent_version(:'org', :'agente', :'nova', false, null);

update ai_agents set description = 'Vendedora do WhatsApp: recomenda produtos, fecha pedidos e marca reunião corporativa com a consultora.',
  system_prompt = :'instrucoes', updated_at = now()
 where id = :'agente';

select v.version_number, v.status, cardinality(v.tool_ids) as ferramentas, cardinality(v.knowledge_source_ids) as materiais,
       (select string_agg(name, ', ') from crm_pipelines where id = any(v.pipeline_ids)) as funis,
       (select is_active from ai_agents where id = v.agent_id) as agente_ligado
from ai_agent_versions v where v.id = :'nova';
select name, status, source_type from ai_knowledge_sources where organization_id = :'org' order by created_at;

:fim;

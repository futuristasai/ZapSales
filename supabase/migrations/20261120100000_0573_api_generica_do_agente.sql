-- manifest: **API genérica como ferramenta do agente (issue #372).** `agent_external_tools.kind` passa a aceitar `api` (endereço-modelo + `api_config`; a credencial usa as mesmas colunas cifradas do webhook), com pausa automática por falhas seguidas (`consecutive_failures`, `auto_paused_at`); tabela `agent_external_tool_calls` para os limites de uso; e o aviso `external_api_notice` na Central. As opções de segurança moram em `organizations.settings.api_externa`, sem coluna.
-- 0573 — API genérica como ferramenta do agente (issue #372).
--
-- A #94 deu o webhook (formato próprio, exige um intermediário) e a #96 o servidor MCP. Esta
-- etapa acrescenta o TERCEIRO tipo de ferramenta externa: a API pronta de outro sistema, com o
-- método, o endereço, o corpo e a credencial que a própria pessoa cadastra. Entra no MESMO
-- registro e herda tudo — o seletor do agente, o teto de capacidades, a chave «pedir aprovação»,
-- o pedido na Central, a execução única e a expiração.
--
--   * `agent_external_tools.kind = 'api'` — a linha tem `url` (o endereço-MODELO, com os
--     marcadores `{{campo}}` depois do host) e `api_config` (método, cabeçalhos fixos, corpo,
--     tipo de credencial, campos da resposta, dados do contato, limites de uso e pausa
--     automática — lido por um Zod central, `lib/ai/ferramentas-externas/api/esquema.ts`).
--     Não tem servidor MCP. A credencial, quando há, mora nas MESMAS colunas cifradas do
--     webhook (`signing_secret_encrypted` + `signing_secret_last4`): é «o segredo desta
--     ferramenta», cifrado por `fn_encrypt_oauth`, e o caminho que o lê é um só. Numa linha
--     `api` o par é opcional (API aberta); o CHECK de forma amarra cada tipo às suas colunas.
--   * `consecutive_failures` / `auto_paused_at` — a pausa automática: a ferramenta que falha
--     N vezes seguidas se desativa sozinha (`active = false`, com o carimbo) e o dono é
--     avisado. Reativar pela tela zera os dois.
--   * `agent_external_tool_calls` — UMA linha por chamada que o agente tentou, para os limites
--     de uso por conversa e por dia (janela corrida de 24 h). Só ponteiros (organização,
--     ferramenta, conversa) e a hora: nenhum dado da chamada. Server-side only como as
--     tabelas irmãs. As linhas velhas (mais de 2 dias) saem na própria escrita — a tabela não
--     cresce sem dono e não depende de cron.
--   * `agent_inbox_items.kind = 'external_api_notice'` — o aviso ao administrador: cadastro de
--     API criado ou alterado, opção de segurança afrouxada, ação executada sem aprovação.
--
-- As opções de segurança da organização NÃO têm coluna: moram em
-- `organizations.settings.api_externa`, com schema central em
-- `lib/ai/ferramentas-externas/api/seguranca.ts` (mesmo molde de `settings.mcp_externo`).
--
-- Função NOVA em `public`: nenhuma ⇒ o item 9 da doutrina de migrations não é acionado.
-- O vocabulário `kind` é `text` + CHECK (não enum) e vive no TypeScript em
-- `lib/ai/ferramentas-externas/tipos.ts` (TIPOS_DA_FERRAMENTA).

alter table public.agent_external_tools
  add column if not exists api_config jsonb,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists auto_paused_at timestamptz;

alter table public.agent_external_tools drop constraint if exists agent_external_tools_kind_check;
alter table public.agent_external_tools
  add constraint agent_external_tools_kind_check check (kind in ('webhook', 'mcp', 'api'));

-- Cada tipo tem exatamente as suas colunas. As linhas de antes são `webhook` ou `mcp` e nunca
-- tiveram `api_config`: o CHECK novo vale sem tocar em nenhuma.
alter table public.agent_external_tools drop constraint if exists agent_external_tools_kind_shape;
alter table public.agent_external_tools
  add constraint agent_external_tools_kind_shape check (
    (kind = 'webhook'
      and url is not null
      and signing_secret_encrypted is not null
      and signing_secret_last4 is not null
      and mcp_server_id is null
      and mcp_tool_name is null
      and api_config is null)
    or
    (kind = 'mcp'
      and url is null
      and signing_secret_encrypted is null
      and signing_secret_last4 is null
      and mcp_server_id is not null
      and mcp_tool_name is not null
      and api_config is null)
    or
    (kind = 'api'
      and url is not null
      and api_config is not null
      and jsonb_typeof(api_config) = 'object'
      and ((signing_secret_encrypted is null) = (signing_secret_last4 is null))
      and mcp_server_id is null
      and mcp_tool_name is null)
  );

alter table public.agent_external_tools drop constraint if exists agent_external_tools_failures_check;
alter table public.agent_external_tools
  add constraint agent_external_tools_failures_check check (consecutive_failures >= 0);

comment on column public.agent_external_tools.kind is
  'webhook = o endereço que a pessoa cadastrou e o ZapSales assina (#94). mcp = uma ferramenta que um servidor MCP de terceiro oferece e o administrador escolheu (#96). api = a API pronta de outro sistema, com método, endereço-modelo e credencial que a pessoa cadastrou (#372): tem url e api_config, sem servidor MCP.';
comment on column public.agent_external_tools.api_config is
  'Só em kind = api (#372): método, cabeçalhos fixos, corpo, tipo de credencial, campos da resposta, dados do contato, limites de uso e pausa automática. Nunca a credencial. Schema central: lib/ai/ferramentas-externas/api/esquema.ts.';
comment on column public.agent_external_tools.signing_secret_encrypted is
  'O segredo desta ferramenta, cifrado por fn_encrypt_oauth (pgp_sym/aes256). webhook: a chave que assina cada chamada (HMAC-SHA256). api (#372): a credencial da API do outro sistema, enviada em cabeçalho; nula = API sem credencial. mcp: sempre nula (a credencial é do servidor).';
comment on column public.agent_external_tools.consecutive_failures is
  'Falhas seguidas das chamadas do agente (#372). Zera na primeira chamada que dá certo e quando a ferramenta é reativada.';
comment on column public.agent_external_tools.auto_paused_at is
  'Quando a ferramenta se pausou sozinha por falhas seguidas (#372). Nulo = nunca pausou, ou alguém a reativou.';

create table if not exists public.agent_external_tool_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tool_id uuid not null references public.agent_external_tools(id) on delete cascade,
  -- A conversa em que o agente tentou a chamada. Nula no cenário de teste (sem conversa).
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Os dois limites contam por ferramenta, numa janela corrida.
create index if not exists agent_external_tool_calls_janela_idx
  on public.agent_external_tool_calls (organization_id, tool_id, created_at desc);

create index if not exists agent_external_tool_calls_conversa_idx
  on public.agent_external_tool_calls (conversation_id)
  where conversation_id is not null;

comment on table public.agent_external_tool_calls is
  'Uma linha por chamada que o agente tentou fazer a uma ferramenta de API (issue #372), para os limites de uso por conversa e por dia. Só ponteiros e a hora. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated. As linhas com mais de 2 dias saem na própria escrita.';

alter table public.agent_external_tool_calls enable row level security;
revoke all on public.agent_external_tool_calls from anon, authenticated;
grant select, insert, update, delete on public.agent_external_tool_calls to service_role;

-- ─── O aviso ao administrador na Central ────────────────────────────────────
-- A lista é a ÚNICA do baseline, mais `external_api_notice`. Quem acrescentar um kind mexe
-- em dois lugares: a lista do baseline e a última migration que reconstrói a constraint.

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'org_reativada',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'atendimento_gratis_do_numero',
    'external_tool_failed',
    'external_tool_approval',
    'regra_proposta_pelo_agente',
    'external_api_notice',
    'other'
  ));

notify pgrst, 'reload schema';

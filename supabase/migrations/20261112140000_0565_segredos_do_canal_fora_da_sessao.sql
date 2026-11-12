-- manifest: O código do endereço dos avisos do WhatsApp, o segredo da assinatura e as credenciais da conexão oficial deixam de ser legíveis pela sessão do usuário — SELECT por coluna em channel_sessions e webhook_events_log, com a lista liberada tirada do catálogo (#274).
--
-- `channel_sessions` guarda o que autentica os avisos do WhatsApp: o código do
-- endereço (`webhook_path_token`), o segredo da assinatura
-- (`webhook_secret_encrypted`) e as três credenciais da conexão oficial
-- (`meta_token_encrypted`, `meta_app_secret_encrypted`,
-- `meta_verify_token_encrypted`). O dump concede SELECT da tabela inteira a
-- `authenticated`, e a policy de leitura só confere a organização: qualquer
-- membro lia as cinco colunas falando direto com o banco. O mesmo código do
-- endereço fica gravado em `webhook_events_log.webhook_path_token`, legível do
-- mesmo jeito.
--
-- Nenhuma tela precisa dessas colunas com a sessão do usuário — as rotas que
-- as usam leem com o cliente de serviço, depois de conferir o papel (medido por
-- varredura antes de retirar). Então a sessão deixa de alcançá-las, a de quem
-- administra inclusive.
--
-- O SELECT sai POR COLUNA, como em `ai_provider_credentials` (0150): tirar a
-- tabela inteira quebraria toda tela que lista os números. A lista liberada é
-- tirada do CATÁLOGO, e não escrita à mão: coluna nova da tabela já nasce
-- legível, e só o que está nomeado como segredo fica de fora. Tudo num bloco só,
-- para não existir um instante em que a sessão não lê coluna nenhuma.
--
-- Este bloco fica no FIM do arquivo de propósito: ele precisa rodar depois de
-- toda coluna de `channel_sessions` existir, senão a instalação nova e a
-- atualização chegariam a privilégios diferentes.
do $g$
declare
  v_colunas text;
begin
  -- ── channel_sessions ───────────────────────────────────────────────────
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_colunas
    from pg_attribute a
   where a.attrelid = 'public.channel_sessions'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname not in (
       'webhook_path_token', 'webhook_secret_encrypted',
       'meta_token_encrypted', 'meta_app_secret_encrypted', 'meta_verify_token_encrypted');
  revoke select on public.channel_sessions from authenticated, anon;
  -- Concessão por coluna de uma aplicação anterior não some com o revoke da
  -- tabela: as colunas de segredo são retiradas pelo nome.
  revoke select (
    webhook_path_token, webhook_secret_encrypted,
    meta_token_encrypted, meta_app_secret_encrypted, meta_verify_token_encrypted
  ) on public.channel_sessions from authenticated, anon;
  execute format('grant select (%s) on public.channel_sessions to authenticated', v_colunas);

  -- ── webhook_events_log ─────────────────────────────────────────────────
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_colunas
    from pg_attribute a
   where a.attrelid = 'public.webhook_events_log'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname <> 'webhook_path_token';
  revoke select on public.webhook_events_log from authenticated, anon;
  revoke select (webhook_path_token) on public.webhook_events_log from authenticated, anon;
  execute format('grant select (%s) on public.webhook_events_log to authenticated', v_colunas);
end
$g$;

notify pgrst, 'reload schema';

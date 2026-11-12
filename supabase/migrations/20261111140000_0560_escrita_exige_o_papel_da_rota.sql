-- manifest: contacts, messages e as 10 tabelas do financeiro passam a exigir no banco o papel que as rotas já exigem (inclusive para apagar), e a sessão deixa de poder desfazer bloqueio ou anonimização de contato
-- O BANCO EXIGE O PAPEL QUE AS ROTAS JÁ EXIGEM — contatos, mensagens e financeiro.
--
-- O PostgREST fala com o JWT da sessão direto, sem passar por rota nenhuma. Onde
-- a policy só pergunta "é da organização?", o papel que a rota confere não vale
-- para quem fala com o banco por fora dela.
--
-- Levantamento que sustenta os papéis abaixo (feito no código, rota por rota):
--   * toda rota que grava `contacts` ou `messages` com a sessão do usuário exige
--     `agent` ou acima; nenhuma rota de escrita aberta a `viewer` toca nelas;
--   * no financeiro, cada tabela já declara o papel no WITH CHECK (`agent` nas
--     de movimento, `manager` nas de cadastro), e as rotas exigem esse papel ou
--     um maior. Faltava o papel no USING — e DELETE só avalia o USING.
--
-- Os NOMES das policies ficam: há invariante que as lê pelo nome.

-- ─── (1) contacts ────────────────────────────────────────────────────────────
-- `for all`: o USING também valeria para SELECT, mas a leitura tem policy
-- própria (`tenant_isolation_contacts_read`), e policies permissivas somam.
drop policy if exists "tenant_isolation_contacts_write" on public.contacts;
create policy "tenant_isolation_contacts_write" on public.contacts
  for all
  using (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

-- ─── (2) messages ────────────────────────────────────────────────────────────
drop policy if exists "messages_insert" on public.messages;
drop policy if exists "messages_update" on public.messages;
drop policy if exists "messages_delete" on public.messages;

create policy "messages_insert" on public.messages
  for insert with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
create policy "messages_update" on public.messages
  for update using (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
create policy "messages_delete" on public.messages
  for delete using (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

-- ─── (3) financeiro: o papel do WITH CHECK passa a valer também no USING ─────
-- Lido do CATÁLOGO, e não reescrito à mão: cada tabela guarda o próprio papel
-- (`agent` ou `manager`) e a própria expressão de leitura. O laço:
--   * cria `tenant_isolation_<tabela>_read` com o USING que a `_all` tinha —
--     sem ela, quem só lê deixaria de ler;
--   * recria a `_all` com a expressão do WITH CHECK nos dois lados.
-- Só entra no laço a policy que ainda tem o papel SÓ no WITH CHECK: na segunda
-- aplicação não há o que fazer, e numa reaplicação do baseline (que recria a
-- forma antiga lá em cima) o laço conserta de novo.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and cmd = 'ALL'
       and tablename = any (array[
             'account_plans', 'commission_rules', 'commissions', 'financial_accounts',
             'financial_entries', 'loyalty_ledger', 'payment_methods', 'recurring_entries',
             'sale_items', 'sales'])
       and policyname = 'tenant_isolation_' || tablename || '_all'
       and coalesce(with_check, '') like '%fn_role_at_least%'
       and coalesce(qual, '') not like '%fn_role_at_least%'
  loop
    execute format('drop policy if exists %I on public.%I',
                   'tenant_isolation_' || r.tablename || '_read', r.tablename);
    execute format('create policy %I on public.%I for select using (%s)',
                   'tenant_isolation_' || r.tablename || '_read', r.tablename, r.qual);
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)',
                   r.policyname, r.tablename, r.with_check, r.with_check);
  end loop;
end $$;

-- ─── (4) a recusa do contato não se desfaz pela sessão ───────────────────────
-- Desbloquear quem pediu para sair é ato do admin, pela rota própria
-- (`POST /contacts/{id}/unblock`), que grava com o cliente de serviço e audita.
-- Anonimização não se desfaz por caminho nenhum. Nenhuma das duas reversões é
-- edição de ficha — e, com a policy acima, um `agent` ainda conseguiria fazê-las
-- falando direto com o banco.
--
-- `auth.uid() is null` PASSA de propósito, como em
-- `fn_colunas_de_cliente_sao_do_sistema`: é o cliente de serviço e as migrations.
create or replace function public.fn_recusa_do_contato_nao_se_desfaz_pela_sessao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    if old.is_blocked is true and new.is_blocked is not true then
      raise exception 'desbloqueio_e_ato_do_admin_pela_rota' using errcode = '42501';
    end if;
    if old.is_anonymized is true and new.is_anonymized is not true then
      raise exception 'lgpd_anonymization_irreversible' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

comment on function public.fn_recusa_do_contato_nao_se_desfaz_pela_sessao() is
  'Guarda de contacts (migration 0560): sessão nenhuma leva is_blocked ou is_anonymized de true para outra coisa '
  '(42501). O cliente de serviço e as migrations passam. Provado em '
  'tests/invariants/escrita-exige-o-papel-contatos-mensagens-financeiro.test.ts.';

-- Função de trigger não exige EXECUTE de quem dispara o UPDATE; revogar das duas
-- origens (o grant a PUBLIC e o grant direto a `anon` do baseline) não quebra nada.
revoke execute on function public.fn_recusa_do_contato_nao_se_desfaz_pela_sessao()
  from public, anon, authenticated;

-- A WHEN compara VALORES: o caso comum (nenhuma das duas mudou) nem chama a função.
drop trigger if exists trg_contato_recusa_nao_se_desfaz on public.contacts;
create trigger trg_contato_recusa_nao_se_desfaz
  before update on public.contacts
  for each row
  when (old.is_blocked is distinct from new.is_blocked
     or old.is_anonymized is distinct from new.is_anonymized)
  execute function public.fn_recusa_do_contato_nao_se_desfaz_pela_sessao();

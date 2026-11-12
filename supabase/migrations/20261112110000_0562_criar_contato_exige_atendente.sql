-- manifest: Criar contato passa a exigir atendente ou acima no banco, como toda rota e toda importação já exigem — fecha a última operação de contatos em que o papel só valia pela tela (#268).
--
-- A migration 0560 fechou ALTERAR e APAGAR contato por papel. CRIAR ficou de fora
-- porque um invariante (travas do modo somente leitura do suporte) usava
-- `contacts` como a tabela em que só a trava podia recusar um INSERT. Aquele
-- invariante passou a medir numa tabela-cobaia própria, e o produto deixou de
-- estar preso a ele.
--
-- A regra copia as rotas, nunca é mais dura. Varredura de quem cria contato com a
-- sessão do usuário (os demais gravam com o cliente de serviço ou por função
-- `security definer`, e não passam por esta policy):
--
--   POST /api/v1/contacts            atendente
--   POST /api/v1/contacts/import     atendente
--   POST /api/v1/leads/import        atendente
--   POST /api/v1/imports (B2B)       gerente
--
-- Policy RESTRITIVA, como as outras duas de `contacts` (0560): soma por E com a
-- permissiva de sempre, que continua conferindo só a organização.

drop policy if exists "contacts_criar_exige_atendente" on public.contacts;
create policy "contacts_criar_exige_atendente" on public.contacts
  as restrictive
  for insert
  with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

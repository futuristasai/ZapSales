-- manifest: **Listas salvas de pessoas para o disparo em massa.** Tabelas `campaign_audience_lists` (a lista com nome, por organização, nome único sem diferenciar maiúscula) e `campaign_audience_list_members` (as pessoas dela: FK composta para a lista, FK para `contacts` com cascade, chave `(list_id, contact_id)`). Quem lê é a organização inteira (RLS de SELECT por tenant); quem grava é só o servidor, depois de `requireRole('manager')` — nenhum grant de escrita a authenticated.
-- 0555 — Listas salvas de pessoas (disparo em massa).
--
-- O operador escolhe pessoas do CRM na tabela do cartão Público e, até aqui, essa escolha
-- morria com a campanha. A lista salva é o mesmo conjunto de pessoas com um NOME, para voltar
-- em outra campanha sem refazer a busca. É uma lista FIXA de pessoas, não um filtro que se
-- refaz: o que se vê ao salvar é exatamente o que se reaproveita.
--
--   * `campaign_audience_lists` — a lista. Nome único por organização sem diferenciar
--     maiúscula (`lower(name)`), para "Clientes VIP" e "clientes vip" não conviverem.
--   * `campaign_audience_list_members` — quem está nela. A FK composta
--     `(organization_id, list_id)` garante que o membro nunca aponta para a lista de OUTRA
--     organização, nem por escrita direta com a service key. `contact_id` referencia
--     `contacts` com `on delete cascade`: o membro é um PONTEIRO, não histórico — sumir o
--     contato some o ponteiro (anonimizar não apaga o contato, então o ponteiro fica e os
--     vetos de envio continuam valendo na hora de usar a lista).
--   * A junção de contatos duplicados (`fn_mesclar_contatos`) reaponta qualquer FK para
--     `contacts` lendo o catálogo; se o perdedor e o vencedor estavam na mesma lista, a
--     colisão da chave é pulada e o ponteiro do perdedor fica para trás, inerte.
--
-- Segurança: RLS ligada. Policy só de SELECT (tenant), sem policy de escrita e sem grant de
-- escrita a authenticated: quem grava é o servidor (rota com `requireRole('manager')`,
-- `requireSupportWrite` e filtro de organização à mão). Nenhuma função nova em `public`, então
-- o item 9 da doutrina de migrations não é acionado.

create table if not exists public.campaign_audience_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_audience_lists_name_len check (char_length(name) between 2 and 80),
  -- O alvo da FK composta dos membros.
  constraint campaign_audience_lists_org_id_uk unique (organization_id, id)
);

create unique index if not exists campaign_audience_lists_org_name_uk
  on public.campaign_audience_lists (organization_id, lower(name));

create table if not exists public.campaign_audience_list_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  list_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id),
  constraint campaign_audience_list_members_list_fk
    foreign key (organization_id, list_id)
    references public.campaign_audience_lists (organization_id, id) on delete cascade
);

create index if not exists campaign_audience_list_members_contact_idx
  on public.campaign_audience_list_members (organization_id, contact_id);

comment on table public.campaign_audience_lists is
  'Lista salva de pessoas do CRM para o disparo em massa. Fixa: guarda as pessoas marcadas, não um filtro. Só o servidor grava (rota com manager).';
comment on table public.campaign_audience_list_members is
  'Pessoas de uma lista salva. Ponteiro para contacts: os vetos de envio (opt-out, anonimizado, sem telefone, já em campanha) valem na hora de usar a lista.';

drop trigger if exists trg_campaign_audience_lists_updated_at on public.campaign_audience_lists;
create trigger trg_campaign_audience_lists_updated_at
  before update on public.campaign_audience_lists
  for each row execute function public.fn_set_updated_at();

alter table public.campaign_audience_lists enable row level security;
alter table public.campaign_audience_list_members enable row level security;

drop policy if exists campaign_audience_lists_select on public.campaign_audience_lists;
create policy campaign_audience_lists_select on public.campaign_audience_lists
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists campaign_audience_list_members_select on public.campaign_audience_list_members;
create policy campaign_audience_list_members_select on public.campaign_audience_list_members
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

revoke all on public.campaign_audience_lists from anon, authenticated;
revoke all on public.campaign_audience_list_members from anon, authenticated;
grant select on public.campaign_audience_lists to authenticated;
grant select on public.campaign_audience_list_members to authenticated;
grant all on public.campaign_audience_lists to service_role;
grant all on public.campaign_audience_list_members to service_role;

notify pgrst, 'reload schema';

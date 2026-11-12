-- manifest: O repetido de captação passa a ser conferido por FONTE — crm_leads ganha webhook_source_id (preenchido a partir do metadado), um índice único por fonte e o índice antigo fica só para lead sem fonte; um formulário público deixa de poder ocupar o identificador de uma integração assinada (#270).
--
-- Uma organização tem várias fontes de captação — o formulário público do site,
-- a integração assinada da loja —, e o identificador externo (`external_id`) é
-- escolhido por quem envia. O repetido era conferido pela organização inteira
-- (`uniq_crm_leads_org_source_external`: organização + `source` + identificador,
-- e `source` é sempre 'webhook' para qualquer fonte). Quem preenchesse o
-- formulário público com o identificador que a integração ia usar "ocupava"
-- esse identificador: o envio de verdade chegava depois, era tomado por
-- repetido e nenhum lead nascia.
--
-- A fonte vira COLUNA. Ela já existia só em `source_metadata.webhook_source_id`,
-- que é apagado quando o contato é anonimizado e não pode entrar em índice
-- único com chave estrangeira.
alter table public.crm_leads
  add column if not exists webhook_source_id uuid
    references public.webhook_sources(id) on delete set null;

comment on column public.crm_leads.webhook_source_id is
  'A fonte de captação (webhook_sources) que criou o lead. É ela que escopa o repetido por external_id (issue #270). Nula em lead que não veio de fonte de captação, em lead de antes desta coluna sem metadado, e depois que a fonte é apagada.';

-- Quem atualiza: a fonte sai do metadado para a coluna. Compara TEXTO com texto
-- (`s.id::text`) para um metadado que não seja uuid não derrubar a atualização, e
-- exige a mesma organização. Nenhum lead é apagado nem muda de dono.
--
-- O gatilho `trg_crm_leads_updated_at` é desligado só durante este preenchimento:
-- ele carimba `updated_at = now()` em todo UPDATE, e a data de "última alteração"
-- de cada lead antigo passaria a ser a da atualização do sistema. Tudo dentro de
-- UM bloco: se o preenchimento falhar, o desligamento é desfeito junto. O `if`
-- evita tomar a trava da tabela em toda atualização em que não há o que preencher.
do $m$
begin
  if exists (
    select 1
      from public.crm_leads l
      join public.webhook_sources s
        on s.id::text = l.source_metadata->>'webhook_source_id'
       and s.organization_id = l.organization_id
     where l.webhook_source_id is null
       and l.source = 'webhook'
  ) then
    execute 'alter table public.crm_leads disable trigger trg_crm_leads_updated_at';
    update public.crm_leads l
       set webhook_source_id = s.id
      from public.webhook_sources s
     where l.webhook_source_id is null
       and l.source = 'webhook'
       and s.id::text = l.source_metadata->>'webhook_source_id'
       and s.organization_id = l.organization_id;
    execute 'alter table public.crm_leads enable trigger trg_crm_leads_updated_at';
  end if;
end
$m$;

-- O repetido passa a ser por FONTE. Os dados que já existem são únicos por
-- (organização, source, identificador), então também são únicos por
-- (organização, fonte, identificador): o índice novo nunca falha por duplicata.
create unique index if not exists uniq_crm_leads_org_fonte_external
  on public.crm_leads (organization_id, webhook_source_id, external_id)
  where external_id is not null and webhook_source_id is not null;

-- O índice antigo continua valendo para o que NÃO tem fonte (lead de antes da
-- coluna, lead de outras origens que usam identificador externo). Com a fonte
-- preenchida ele deixa de alcançar a linha — senão o formulário e a integração
-- continuariam colidindo NELE. Só é refeito quando ainda está na forma antiga:
-- em quem já atualizou, este bloco não toca o índice.
do $m$
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'uniq_crm_leads_org_source_external'
       and indexdef not ilike '%webhook_source_id%'
  ) then
    drop index public.uniq_crm_leads_org_source_external;
  end if;
end
$m$;
create unique index if not exists uniq_crm_leads_org_source_external
  on public.crm_leads (organization_id, source, external_id)
  where external_id is not null and webhook_source_id is null;

create index if not exists crm_leads_webhook_source_idx
  on public.crm_leads (webhook_source_id)
  where webhook_source_id is not null;

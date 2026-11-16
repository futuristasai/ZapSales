-- manifest: atualizar com um clique (#311) — a batida do programa do servidor passa a contar o último backup, a cópia externa (R2, só "configurada ou não") e se ele executa pedidos; a rodada ganha o passo "conferencia", o desfecho "refused" (recusou antes de tocar) e a hora da última notícia, que passa a medir o pedido parado
--
-- O programa do servidor novo (kit/agente.sh) substitui o agent.sh removido com o
-- kit herdado. Três coisas que a tela precisa e o contrato não tinha:
--
-- 1. BACKUP. O backup roda no servidor (kit/backup.sh), fora do app. A batida
--    passa a trazer a data do último dump bem-sucedido, a da última cópia semanal
--    e um BOOLEANO dizendo se o R2 está configurado — nunca a credencial. Nulo =
--    o programa ainda não contou (programa antigo, ou nenhuma batida ainda).
--
-- 2. QUEM EXECUTA. A produção do próprio projeto anda pela main e só anuncia
--    versão: quem a atualiza é a implantação contínua. `executes_updates = false`
--    faz a tela trocar o botão pela explicação, em vez de criar uma rodada que
--    ninguém vai atender. Nulo = programa antigo, que executava.
--
-- 3. A RODADA. O passo "conferencia" (os 2 minutos de prova depois de instalar)
--    entra no vocabulário de `last_step`; o desfecho "refused" separa "recusei
--    antes de tocar — nada mudou" de "falhei e não consegui voltar", que a tela
--    dizia para os dois; e `last_step_at` guarda a hora do último passo, para o
--    pedido parado ser medido desde a última notícia, e não desde o clique (uma
--    atualização com cópia do banco, imagens e prova passa de 15 minutos sem
--    estar parada).
--
-- Idempotente: `add column if not exists`, e cada CHECK é refeito pelo nome que o
-- Postgres deu à restrição de coluna (`<tabela>_<coluna>_check`), procurada no
-- catálogo para não depender dele.

alter table public.system_version
  add column if not exists last_backup_at timestamptz,
  add column if not exists last_offsite_backup_at timestamptz,
  add column if not exists backup_offsite_configured boolean,
  add column if not exists executes_updates boolean;

comment on column public.system_version.last_backup_at is
  'Último dump do banco bem-sucedido, contado pelo programa do servidor (kit/agente.sh). Nulo = ainda não contado.';
comment on column public.system_version.last_offsite_backup_at is
  'Última cópia semanal (restic → R2) que terminou bem. Nulo = nunca, ou ainda não contado.';
comment on column public.system_version.backup_offsite_configured is
  'Se a cópia externa (R2) tem credenciais no servidor. Só o booleano: a credencial nunca sai do servidor. Nulo = ainda não contado.';
comment on column public.system_version.executes_updates is
  'false quando o programa do servidor só anuncia (instalação que anda pela main, atualizada pela implantação contínua). Nulo = programa antigo, que executava.';

alter table public.system_update_runs
  add column if not exists last_step_at timestamptz;
comment on column public.system_update_runs.last_step_at is
  'Quando o programa do servidor contou o último passo. O pedido parado é medido desde aqui (ou desde dispatched_at, sem passo).';

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.system_update_runs'::regclass
      and c.contype = 'c'
      and a.attname in ('status', 'last_step')
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table public.system_update_runs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.system_update_runs
  add constraint system_update_runs_status_check
    check (status in ('dispatched','success','failed','failed_rolled_back','refused'));
alter table public.system_update_runs
  add constraint system_update_runs_last_step_check
    check (last_step in ('backup','codigo','banco','conferencia'));

-- A trava das extensões espera a atualização do core. Mesmo relógio do app
-- (RUN_STALE_AFTER_MS em lib/system/update-run.ts): parada é 15 minutos sem
-- notícia, contados do último passo.
create or replace function public.fn_extensions_core_update_in_progress()
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.system_update_runs
    where status='dispatched' and coalesce(last_step_at, dispatched_at) > now() - interval '15 minutes');
$$;
revoke execute on function public.fn_extensions_core_update_in_progress() from public, anon, authenticated, service_role;

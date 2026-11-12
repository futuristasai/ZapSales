-- manifest: Regra anotada pelo agente nasce proposta e só passa a valer depois que um gestor aprova — o banco recusa anotação do agente já ativa, a sessão do usuário deixa de escrever em org_memory_entries e a Central ganha o aviso de proposta pendente (#272).
--
-- A memória da organização entra no começo das instruções de TODO agente, em
-- todo atendimento. A ferramenta do agente (`crm_save_org_memory`) gravava a
-- anotação já como `active`: o que o agente escrevesse durante uma conversa —
-- inclusive a pedido de quem estava do outro lado dela — passava a valer para
-- todos os clientes no turno seguinte, sem ninguém ler.
--
-- A regra no banco, para não depender de a ferramenta lembrar: anotação de
-- origem `agent` NASCE proposta. Quem a torna `active` é a aprovação (um UPDATE
-- feito pela rota, depois de conferir o papel de gestor). O motor só carrega
-- `active`. Regras que já estavam ativas não são tocadas: o gatilho é de INSERT.
create or replace function public.fn_regra_do_agente_nasce_proposta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source = 'agent' and new.status = 'active' then
    raise exception 'regra_do_agente_nasce_proposta'
      using errcode = '23514',
            hint = 'Anotação de origem agent entra como proposed; um gestor a aprova em Memória da IA.';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_regra_do_agente_nasce_proposta() from public, anon;

drop trigger if exists trg_regra_do_agente_nasce_proposta on public.org_memory_entries;
create trigger trg_regra_do_agente_nasce_proposta
  before insert on public.org_memory_entries
  for each row execute function public.fn_regra_do_agente_nasce_proposta();

-- Só o servidor escreve na memória. Todo escritor do app usa o cliente de
-- serviço (as rotas de Memória, a aplicação de proposta do sistema e a
-- ferramenta do agente) — medido por varredura antes de retirar. A sessão do
-- usuário continua LENDO: a tela de Memória lê com ela. Sem isto, um atendente
-- aprovaria uma proposta com um UPDATE direto, por fora da rota que confere o
-- papel.
revoke insert, update, delete on table public.org_memory_entries from anon, authenticated;

-- Tabela que perde a escrita pela sessão fica sem trava de suporte (zero
-- policies `support_write_*`): a mesma chamada que o fim do baseline faz.
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

-- O aviso da Central para a proposta pendente. A constraint é reconstruída com o
-- vocabulário INTEIRO, igual ao bloco único do baseline.
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
    'other'
  ));

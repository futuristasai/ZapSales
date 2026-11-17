-- manifest: sinais de escolha errada por capacidade do agente (#326) — fn_agent_tool_signals conta, a partir do audit que já existe, quando uma pessoa moveu o mesmo negócio em até 24 h depois da IA mover ou encerrar, e quando a IA chamou de novo a mesma capacidade logo depois de ela falhar; é o instrumento que faltava para medir o teto de 27, que deixou de bloquear
--
-- POR QUE AGORA. O teto de capacidades por agente era uma heurística que ninguém
-- mediu ("muitas ferramentas pioram a escolha do modelo"). A #326 transformou o
-- 27 em RECOMENDADO — a tela avisa e deixa ligar — e prometeu medir. Esta função
-- é a medida: ela não sabe o que é "escolha errada" (ninguém rotula), conta
-- INDÍCIOS que já estão gravados no `api_audit_log`.
--
-- OS DOIS SINAIS
--
-- 1. corrigidas_por_pessoa — a IA chamou `crm_move_lead_stage` ou
--    `crm_close_demand` com sucesso, fora de teste, e uma PESSOA moveu o mesmo
--    negócio (`lead.moved` com `actor_user_id` preenchido) em até 24 h. Movimento
--    da IA grava `actor_user_id` nulo (`actorAuditPayload`, app/api/v1/leads/_handler.ts),
--    então a própria IA nunca conta como correção. Só estas duas capacidades
--    porque são as que têm um "desfazer" humano inequívoco no audit; as outras
--    entram quando tiverem.
--
-- 2. repetidas_apos_falha — na MESMA execução, a chamada anterior foi a mesma
--    capacidade e falhou. É o padrão de quem preencheu o dado errado e tentou de
--    novo. A falha declarada como "não achei" (`desfecho = 'sem_resultado'`, ver
--    lib/mcp/audit.ts) NÃO conta: buscar de novo com outro termo é legítimo.
--    A ordem dentro da execução é `created_at`; o audit é gravado em sequência
--    pelo laço do turno, e o desempate por `id` só existe para a janela ser
--    determinística.
--
-- MESMA FORMA DA `fn_agent_tool_usage` (migration 0103): `security invoker`, a
-- janela aplicada nos dois lados (run e audit), elo audit<->run por
-- `request_id = ai_agent_runs.id`. O id do negócio sai de `metadata.args.lead_id`
-- e passa por CASE antes do cast — o CASE garante a ordem de avaliação, um
-- filtro com AND não garante, e um texto que não é uuid derrubaria a consulta.
--
-- Idempotente: `create or replace`. EXECUTE revogado das DUAS origens (PUBLIC e
-- anon) — doutrina de migrations, item 9.

create or replace function public.fn_agent_tool_signals(
  p_organization_id uuid,
  p_agent_id        uuid,
  p_since           timestamptz
)
returns table (
  tool_name             text,
  corrigidas_por_pessoa bigint,
  repetidas_apos_falha  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with chamadas as (
    select
      a.metadata->>'tool_name' as tool_name,
      a.metadata->>'success'   as sucesso,
      a.created_at,
      r.is_dry_run,
      case
        when a.metadata->'args'->>'lead_id'
             ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->'args'->>'lead_id')::uuid
      end                                                   as lead_id,
      lag(a.metadata->>'tool_name') over w                  as tool_anterior,
      lag(a.metadata->>'success')   over w                  as sucesso_anterior,
      lag(a.metadata->>'desfecho')  over w                  as desfecho_anterior
    from public.ai_agent_runs r
    join public.api_audit_log a
      on  a.request_id      = r.id::text
      and a.action          = 'mcp.tool_called'
      and a.organization_id = p_organization_id
      and a.created_at     >= p_since
    where r.organization_id = p_organization_id
      and r.agent_id        = p_agent_id
      and r.started_at     >= p_since
      and a.metadata->>'tool_name' is not null
    window w as (partition by r.id order by a.created_at, a.id)
  )
  select
    c.tool_name,
    count(*) filter (
      where not c.is_dry_run
        and c.sucesso = 'true'
        and c.tool_name in ('crm_move_lead_stage', 'crm_close_demand')
        and c.lead_id is not null
        and exists (
          select 1
            from public.api_audit_log h
           where h.organization_id = p_organization_id
             and h.action          = 'lead.moved'
             and h.actor_user_id  is not null
             and h.resource_type   = 'crm_lead'
             and h.resource_id     = c.lead_id
             and h.created_at      > c.created_at
             and h.created_at     <= c.created_at + interval '24 hours'
        )
    )::bigint as corrigidas_por_pessoa,
    count(*) filter (
      where c.tool_anterior = c.tool_name
        and c.sucesso_anterior = 'false'
        and coalesce(c.desfecho_anterior, '') <> 'sem_resultado'
    )::bigint as repetidas_apos_falha
  from chamadas c
  group by 1
$$;

comment on function public.fn_agent_tool_signals(uuid, uuid, timestamptz) is
  'Indícios de escolha errada por capacidade de um agente (#326): corrigidas por pessoa (lead.moved humano até 24 h depois de crm_move_lead_stage/crm_close_demand) e repetidas logo após falhar na mesma execução. Mesma janela e elo audit<->run da fn_agent_tool_usage.';

revoke execute on function public.fn_agent_tool_signals(uuid, uuid, timestamptz) from public, anon;
grant  execute on function public.fn_agent_tool_signals(uuid, uuid, timestamptz) to authenticated, service_role;

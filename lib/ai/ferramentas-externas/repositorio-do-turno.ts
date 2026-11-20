/**
 * As ferramentas externas, vistas pelo MOTOR do agente (pool `pg`, sem PostgREST).
 *
 * O worker fala com o banco pelo pool `pg`; a tabela é server-side only (0551), e o
 * papel do worker pode chamar `fn_decrypt_oauth`. A chave em claro só existe na
 * memória do turno, no instante da chamada.
 *
 * ⚠️ Toda consulta filtra `organization_id`, e o id vem da LINHA do job (fonte
 * confiável), nunca de payload do modelo.
 */
import { randomUUID } from "node:crypto";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";

import { lerConfigDaApi } from "./api/esquema";
import { lerSegurancaDasApis, type SegurancaDasApis } from "./api/seguranca";
import { JANELA_DO_LIMITE_HORAS, type ContatoDaConversa } from "./api/tipos";
import { chaveDeAprovacaoEmVigor, travaDaFerramenta } from "./api/travas";
import { resumoDosDados, resumoEmTexto, tituloDoAviso } from "./aprovacao";
import type { ResultadoDaChamada } from "./chamar";
import { parametrosLidos } from "./esquema";
import { hashDosArgumentos } from "./impressao-digital";
import { lerConfigDeMcp } from "./mcp/config";
import type { AberturaDoPedido, PedidoDoTurno } from "./pedidos-tipos";
import type { PedidoParaOBloco } from "./pedidos-bloco";
import { JANELA_DA_REPETICAO_HORAS, type EstadoDoPedido, type OrigemDoPedido } from "./tipos";
import type { DependenciasDoTurnoExterno, FerramentaDoTurno } from "./turno";

interface LinhaDoTurno {
  id: string;
  slug: string;
  name: string;
  when_to_use: string;
  url: string | null;
  parameters: unknown;
  effect: string;
  require_approval: boolean | null;
  approval_ttl_hours: number;
  kind: string;
  mcp_server_id: string | null;
  mcp_tool_name: string | null;
  api_config: unknown;
  tem_segredo: boolean;
  server_url: string | null;
  server_auth_header: string | null;
  server_has_credential: boolean | null;
}

/**
 * Ativas, entre as que a versão do agente cita, desta organização (consulta e ação que altera).
 *
 * A ferramenta de servidor MCP (issue #96) só entra com TRÊS coisas ligadas: ela, o servidor dela
 * e o interruptor da organização (`settings.mcp_externo`, desligado por padrão e falha desligado).
 * Desligar qualquer um tira a ferramenta do turno — sem apagar nada.
 *
 * A ferramenta de API (issue #372) só entra se NENHUMA trava de segurança da organização a barra
 * (`travaDaFerramenta`): recurso ligado, «somente consulta», lista de endereços permitidos e dados
 * do contato liberados. As travas valem AQUI, a cada turno, e não só no cadastro: ligar uma trava
 * tira do atendimento a ferramenta gravada antes dela. E a chave «pedir aprovação» que o turno lê
 * já é a que vale de verdade (`chaveDeAprovacaoEmVigor`).
 */
export async function carregarFerramentasDoTurno(
  db: Queryable,
  organizationId: string,
  ids: readonly string[],
): Promise<FerramentaDoTurno[]> {
  const { rows } = await db.query<LinhaDoTurno>(
    `select t.id, t.slug, t.name, t.when_to_use, t.url, t.parameters, t.effect, t.require_approval,
            t.approval_ttl_hours, t.kind, t.mcp_server_id, t.mcp_tool_name, t.api_config,
            (t.signing_secret_encrypted is not null) as tem_segredo,
            s.url as server_url, s.auth_header as server_auth_header,
            (s.credential_encrypted is not null) as server_has_credential
       from agent_external_tools t
       left join mcp_servers s on s.organization_id = t.organization_id and s.id = t.mcp_server_id and s.active
      where t.organization_id = $1
        and t.id = any($2::uuid[])
        and t.active
        and (t.kind in ('webhook', 'api') or s.id is not null)
      order by t.name`,
    [organizationId, [...ids]],
  );

  let mcpLigado = false;
  // Ilegível ou não lida = desligada e na posição mais segura (falha fechada).
  let seguranca: SegurancaDasApis = lerSegurancaDasApis(null);
  if (rows.some((r) => r.kind === "mcp" || r.kind === "api")) {
    const { rows: org } = await db.query<{ settings: unknown }>("select settings from organizations where id = $1", [
      organizationId,
    ]);
    mcpLigado = lerConfigDeMcp(org[0]?.settings ?? {}).ligado;
    seguranca = lerSegurancaDasApis(org[0]?.settings ?? {});
  }

  const ferramentas: FerramentaDoTurno[] = [];
  for (const r of rows) {
    const parametros = parametrosLidos.safeParse(r.parameters);
    const base = {
      id: r.id,
      slug: r.slug,
      name: r.name,
      whenToUse: r.when_to_use,
      parameters: parametros.success ? parametros.data : [],
      // Vocabulário desconhecido cai em «altera»: falha FECHADA (pede aprovação e não repete).
      effect: r.effect === "consulta" ? ("consulta" as const) : ("altera" as const),
      requireApproval: r.require_approval,
      approvalTtlHours: r.approval_ttl_hours,
    };
    if (r.kind === "mcp") {
      if (!mcpLigado || !r.server_url || !r.mcp_server_id || !r.mcp_tool_name) continue;
      ferramentas.push({
        ...base,
        url: r.server_url,
        mcp: {
          servidorId: r.mcp_server_id,
          cabecalho: r.server_auth_header ?? "authorization",
          temCredencial: r.server_has_credential === true,
          nomeNoServidor: r.mcp_tool_name,
        },
      });
      continue;
    }
    if (!r.url) continue;
    if (r.kind === "api") {
      const config = lerConfigDaApi(r.api_config);
      // Config ilegível = ferramenta fora do turno: nunca um pedido montado pela metade.
      if (!config) continue;
      if (travaDaFerramenta(seguranca, { efeito: base.effect, urlModelo: r.url, config }) !== null) continue;
      ferramentas.push({
        ...base,
        requireApproval: chaveDeAprovacaoEmVigor(seguranca, base.effect, base.requireApproval),
        url: r.url,
        api: { config, temCredencial: r.tem_segredo === true },
      });
      continue;
    }
    ferramentas.push({ ...base, url: r.url });
  }
  return ferramentas;
}

/**
 * O segredo em claro, ou `null` (sem linha, cifra indisponível, leitura falhou). Nunca lança.
 * Webhook: a chave de assinatura da ferramenta. MCP: a credencial do SERVIDOR dela (`null`
 * também quando o servidor não tem credencial — `temCredencial` é quem diferencia).
 */
export async function lerChaveNoBanco(db: Queryable, organizationId: string, id: string): Promise<string | null> {
  try {
    const { rows } = await db.query<{ chave: string | null }>(
      `select public.fn_decrypt_oauth(coalesce(t.signing_secret_encrypted, s.credential_encrypted)) as chave
         from agent_external_tools t
         left join mcp_servers s on s.organization_id = t.organization_id and s.id = t.mcp_server_id
        where t.organization_id = $1 and t.id = $2`,
      [organizationId, id],
    );
    const chave = rows[0]?.chave ?? null;
    return chave && chave.length > 0 ? chave : null;
  } catch (err) {
    logger.warn("[ferramentas-externas] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Abre o aviso na Central — UM aberto por ferramenta (o título leva o nome). Sem
 * referência: a tabela é só do servidor, e o destino do aviso é a tela das
 * ferramentas (`POLITICAS_DE_AVISO.external_tool_failed`). Nunca lança.
 */
export async function abrirAvisoDeFalha(
  db: Queryable,
  organizationId: string,
  aviso: { titulo: string; corpo: string },
): Promise<void> {
  try {
    await db.query(
      `insert into agent_inbox_items (organization_id, kind, severity, title, body)
       select $1, 'external_tool_failed', 'warn', $2, $3
        where not exists (
          select 1 from agent_inbox_items
           where organization_id = $1 and kind = 'external_tool_failed' and title = $2 and status = 'open'
        )`,
      [organizationId, aviso.titulo, aviso.corpo],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] aviso da falha não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/**
 * O que a auditoria guarda de uma chamada de agente: ferramenta, desfecho, status,
 * motivo, tentativas e duração. Nunca a chave, o corpo enviado nem a resposta.
 */
export function metadadosDaChamada(
  ferramenta: Pick<FerramentaDoTurno, "id" | "slug" | "effect" | "mcp" | "api">,
  resultado: ResultadoDaChamada,
  contexto: { agentId: string | null; jobId: string | null },
): Record<string, unknown> {
  return {
    tool_id: ferramenta.id,
    tool_slug: ferramenta.slug,
    effect: ferramenta.effect,
    kind: ferramenta.mcp ? "mcp" : ferramenta.api ? "api" : "webhook",
    ...(ferramenta.mcp ? { mcp_server_id: ferramenta.mcp.servidorId, mcp_tool: ferramenta.mcp.nomeNoServidor } : {}),
    agent_id: contexto.agentId,
    job_id: contexto.jobId,
    ok: resultado.ok,
    http_status: resultado.httpStatus,
    attempts: resultado.tentativas,
    duration_ms: resultado.duracaoMs,
    ...(resultado.ok ? { truncated: resultado.truncado } : { reason: resultado.motivo }),
  };
}

// ─── API genérica: limite de uso, pausa automática, dado do contato e aviso (issue #372) ──

/**
 * Conta esta chamada e diz se ela cabe nos limites da ferramenta (por conversa e por dia, janela
 * corrida de 24 h). A linha é gravada ANTES de conferir, numa só ida ao banco, então duas chamadas
 * simultâneas se enxergam. As linhas velhas saem aqui mesmo: a tabela não cresce sem dono.
 *
 * Nunca lança, e falha de banco deixa passar: o limite é freio de custo e de abuso, não a barreira
 * de segurança (essa é a aprovação e as travas).
 */
export async function contarUsoDaFerramenta(
  db: Queryable,
  organizationId: string,
  entrada: {
    ferramentaId: string;
    conversationId: string | null;
    limitePorConversa: number | null;
    limitePorDia: number | null;
  },
): Promise<{ cabe: true } | { cabe: false; limite: "conversa" | "dia" }> {
  try {
    await db.query(
      `delete from agent_external_tool_calls
        where organization_id = $1 and tool_id = $2 and created_at < now() - interval '2 days'`,
      [organizationId, entrada.ferramentaId],
    );
    const { rows } = await db.query<{ na_conversa: string; no_dia: string }>(
      `with nova as (
         -- Só conta para a ferramenta DESTA organização: a linha nunca liga a organização de um
         -- turno à ferramenta de outra, nem com um id alheio na mão.
         insert into agent_external_tool_calls (organization_id, tool_id, conversation_id)
         select $1, $2, $3::uuid
          where exists (select 1 from agent_external_tools t where t.organization_id = $1 and t.id = $2)
         returning id
       )
       select
         (select count(*) from agent_external_tool_calls c
           where c.organization_id = $1 and c.tool_id = $2
             and c.conversation_id is not distinct from $3::uuid
             and c.created_at > now() - make_interval(hours => ${JANELA_DO_LIMITE_HORAS})) + (select count(*) from nova) as na_conversa,
         (select count(*) from agent_external_tool_calls c
           where c.organization_id = $1 and c.tool_id = $2
             and c.created_at > now() - make_interval(hours => ${JANELA_DO_LIMITE_HORAS})) + (select count(*) from nova) as no_dia`,
      [organizationId, entrada.ferramentaId, entrada.conversationId],
    );
    const naConversa = Number(rows[0]?.na_conversa ?? 0);
    const noDia = Number(rows[0]?.no_dia ?? 0);
    if (entrada.limitePorConversa !== null && naConversa > entrada.limitePorConversa) return { cabe: false, limite: "conversa" };
    if (entrada.limitePorDia !== null && noDia > entrada.limitePorDia) return { cabe: false, limite: "dia" };
    return { cabe: true };
  } catch (err) {
    logger.warn("[ferramentas-externas] o limite de uso não pôde ser conferido — a chamada segue", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return { cabe: true };
  }
}

/**
 * A pausa automática: sucesso zera a contagem; falha soma um e, ao chegar ao teto da ferramenta,
 * a DESATIVA (com o carimbo de que foi sozinha). Devolve `true` só para a chamada que pausou —
 * é ela que abre o aviso. O UPDATE é um só e condicional: duas falhas simultâneas não pausam
 * duas vezes. Nunca lança.
 */
export async function registrarDesfechoDaFerramenta(
  db: Queryable,
  organizationId: string,
  entrada: { ferramentaId: string; ok: boolean; pausaAposFalhas: number | null },
): Promise<boolean> {
  try {
    if (entrada.ok) {
      await db.query(
        `update agent_external_tools set consecutive_failures = 0
          where organization_id = $1 and id = $2 and consecutive_failures <> 0`,
        [organizationId, entrada.ferramentaId],
      );
      return false;
    }
    const { rows } = await db.query<{ pausou: boolean }>(
      // `antes` trava a linha e guarda o estado de antes: «pausou» é só de quem a encontrou ativa
      // e a deixou desativada.
      `with antes as (
         select active from agent_external_tools
          where organization_id = $1 and id = $2
            for update
       ), depois as (
         update agent_external_tools t
            set consecutive_failures = t.consecutive_failures + 1,
                active = case when $3::int is not null and t.consecutive_failures + 1 >= $3::int then false else t.active end,
                auto_paused_at = case when $3::int is not null and t.consecutive_failures + 1 >= $3::int and t.active
                                      then now() else t.auto_paused_at end
          where t.organization_id = $1 and t.id = $2
          returning t.active
       )
       select (antes.active and not depois.active) as pausou from antes, depois`,
      [organizationId, entrada.ferramentaId, entrada.pausaAposFalhas],
    );
    return rows[0]?.pausou === true;
  } catch (err) {
    logger.warn("[ferramentas-externas] o desfecho da chamada não foi contado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return false;
  }
}

/**
 * Os dados do contato da conversa em curso, lidos pelo SISTEMA — a organização vem da linha do
 * job e a conversa, do turno. Contato anonimizado (LGPD) não tem o que enviar. Nunca lança.
 */
export async function lerContatoDaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string | null,
): Promise<ContatoDaConversa> {
  if (!conversationId) return {};
  try {
    const { rows } = await db.query<{ phone_number: string | null; name: string | null; display_name: string | null; email: string | null }>(
      `select c.phone_number, c.name, c.display_name, c.email
         from conversations cv
         join contacts c on c.organization_id = cv.organization_id and c.id = cv.contact_id
        where cv.organization_id = $1 and cv.id = $2 and not c.is_anonymized and not cv.is_group`,
      [organizationId, conversationId],
    );
    const linha = rows[0];
    if (!linha) return {};
    // O nome é o de `nomeDoContato` — a mesma regra da tela, que descarta identificador técnico.
    return { telefone: linha.phone_number, nome: nomeDoContato(linha), email: linha.email };
  } catch (err) {
    logger.warn("[ferramentas-externas] os dados do contato não foram lidos — a chamada segue sem eles", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return {};
  }
}

/**
 * O aviso ao administrador (`external_api_notice`) — UM aberto por título. Só é gravado se a
 * organização mantém a opção «avisar o administrador» ligada, e quem lê a opção é esta função,
 * na hora: desligá-la cala os avisos seguintes sem ninguém reiniciar nada. Nunca lança.
 */
export async function abrirAvisoAoAdministrador(
  db: Queryable,
  organizationId: string,
  aviso: { titulo: string; corpo: string },
): Promise<void> {
  try {
    await db.query(
      `insert into agent_inbox_items (organization_id, kind, severity, title, body)
       select $1, 'external_api_notice', 'info', $2, $3
        where coalesce((select (o.settings -> 'api_externa' ->> 'avisar_administrador')::boolean
                          from organizations o where o.id = $1), true)
          and not exists (
            select 1 from agent_inbox_items
             where organization_id = $1 and kind = 'external_api_notice' and title = $2 and status = 'open'
          )`,
      [organizationId, aviso.titulo, aviso.corpo],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] o aviso ao administrador não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

// ─── O pedido de execução (issue #95) ────────────────────────────────────────


interface LinhaDoPedido {
  id: string;
  status: EstadoDoPedido;
  uncertain: boolean;
  expires_at: Date | string;
  outcome_content?: string | null;
}

function paraPedidoDoTurno(l: LinhaDoPedido): PedidoDoTurno {
  return {
    id: l.id,
    status: l.status,
    incerto: l.uncertain,
    expiresAt: l.expires_at instanceof Date ? l.expires_at.toISOString() : String(l.expires_at),
    conteudo: l.outcome_content ?? null,
  };
}

/** O critério de «a mesma chamada já está registrada» — o mesmo nas duas consultas abaixo. */
const MESMA_CHAMADA_VIVA = `
  r.organization_id = $1 and r.tool_id = $2
  and r.conversation_id is not distinct from $3::uuid
  and r.arguments_hash = $4
  and (
    r.status in ('pending', 'executing')
    or (r.created_at > now() - make_interval(hours => ${JANELA_DA_REPETICAO_HORAS})
        and (r.status = 'executed' or (r.status = 'failed' and r.uncertain)))
  )`;

export interface EntradaDoPedido {
  ferramenta: Pick<FerramentaDoTurno, "id" | "slug" | "name" | "effect" | "approvalTtlHours">;
  argumentos: Record<string, unknown>;
  origem: OrigemDoPedido;
  autoExecutar: boolean;
  agentId: string | null;
  conversationId: string | null;
  jobId: string | null;
}

/**
 * Abre o pedido de execução — ou reencontra o que já existe para a MESMA chamada na mesma
 * conversa (a repetição do modelo, ou dois turnos concorrentes).
 *
 *  - pendente: o pedido e o item da Central nascem no MESMO comando (sem pedido invisível);
 *  - `autoExecutar` (chave desligada): nasce já `executing`, só para registrar e impedir o
 *    segundo efeito — não há o que aprovar, então não há item na Central;
 *  - quem criou recebe `reivindicado: true` e é o ÚNICO que executa; quem encontrou um
 *    pedido vivo recebe `false` e o estado dele;
 *  - um pendente que já passou do prazo vira `expired` aqui mesmo (o cron pode não ter
 *    rodado) e dá lugar a um pedido novo.
 *
 * Lança se não conseguir nem criar nem encontrar: o turno então NÃO executa a ação.
 */
export async function abrirPedidoNoBanco(
  db: Queryable,
  organizationId: string,
  entrada: EntradaDoPedido,
): Promise<AberturaDoPedido> {
  const hash = hashDosArgumentos(entrada.argumentos);
  const chave = [organizationId, entrada.ferramenta.id, entrada.conversationId, hash];

  // 1. O pendente vencido deixa de ocupar o lugar (e o aviso dele sai da Central).
  await db.query(
    `with vencidos as (
       update agent_external_tool_requests r
          set status = 'expired'
        where ${MESMA_CHAMADA_VIVA}
          and r.status = 'pending' and r.expires_at <= now()
        returning r.inbox_item_id
     )
     update agent_inbox_items i set status = 'resolved'
      where i.organization_id = $1 and i.id in (select inbox_item_id from vencidos where inbox_item_id is not null)`,
    chave,
  );

  // 2. Cria — a menos que a mesma chamada já esteja registrada. O índice único parcial
  //    fecha a corrida entre dois turnos: quem perde recebe 0 linhas.
  const id = randomUUID();
  const avisoId = randomUUID();
  const comAviso = !entrada.autoExecutar;
  const titulo = tituloDoAviso(entrada.ferramenta.name, entrada.argumentos, id);
  const corpo =
    `O agente quer executar «${entrada.ferramenta.name}» e espera a sua decisão. ` +
    `Dados: ${resumoEmTexto(entrada.argumentos)}. ` +
    "Nada foi enviado ao outro sistema. Aprovar executa a ação uma única vez; recusar a cancela.";
  const criado = await db.query<LinhaDoPedido>(
    `with novo as (
       insert into agent_external_tool_requests
         (id, organization_id, tool_id, agent_id, conversation_id, origin, status, arguments, arguments_hash,
          inbox_item_id, expires_at, decided_at)
       select $5::uuid, $1, $2, $6::uuid, $3::uuid, $7, $8, $9::jsonb, $4,
              case when $10::boolean then $11::uuid end,
              now() + make_interval(hours => $12::int),
              case when $8 = 'executing' then now() end
        where not exists (select 1 from agent_external_tool_requests r where ${MESMA_CHAMADA_VIVA})
       on conflict do nothing
       returning id, status, uncertain, expires_at
     ), aviso as (
       insert into agent_inbox_items (id, organization_id, kind, severity, title, body, ref_kind, ref_id)
       select $11::uuid, $1, 'external_tool_approval', 'warn', $13, $14, 'external_tool_request', novo.id
         from novo where $10::boolean
     )
     select id, status, uncertain, expires_at from novo`,
    [
      ...chave,
      id,
      entrada.agentId,
      entrada.origem,
      comAviso ? "pending" : "executing",
      JSON.stringify(entrada.argumentos),
      comAviso,
      avisoId,
      entrada.ferramenta.approvalTtlHours,
      titulo,
      corpo,
    ],
  );
  const novo = criado.rows[0];
  if (novo) {
    await auditarPedido(db, organizationId, {
      action: "ai.external_tool_request_created",
      pedidoId: novo.id,
      ferramentaId: entrada.ferramenta.id,
      metadata: {
        tool_slug: entrada.ferramenta.slug,
        effect: entrada.ferramenta.effect,
        origin: entrada.origem,
        auto_execute: entrada.autoExecutar,
        agent_id: entrada.agentId,
        job_id: entrada.jobId,
        // Um resumo, sem segredos: o que a Central também mostra.
        summary: resumoDosDados(entrada.argumentos),
      },
    });
    return { pedido: paraPedidoDoTurno(novo), reivindicado: true };
  }

  // 3. Já existia: devolve o estado dele.
  const existente = await db.query<LinhaDoPedido>(
    `select r.id, r.status, r.uncertain, r.expires_at, r.outcome_content
       from agent_external_tool_requests r
      where ${MESMA_CHAMADA_VIVA}
      order by r.created_at desc
      limit 1`,
    chave,
  );
  const achado = existente.rows[0];
  if (!achado) throw new Error("pedido de ferramenta externa: nem criado nem encontrado");
  return { pedido: paraPedidoDoTurno(achado), reivindicado: false };
}

/**
 * Fecha o pedido que o TURNO executou (`executing → executed | failed`). Só mexe em quem
 * ainda está `executing`: um pedido já fechado por outro caminho não é reescrito. Nunca lança.
 */
export async function concluirPedidoNoBanco(
  db: Queryable,
  organizationId: string,
  c: { pedido: PedidoDoTurno; resultado: ResultadoDaChamada },
): Promise<void> {
  const r = c.resultado;
  try {
    await db.query(
      `update agent_external_tool_requests
          set status = $3,
              uncertain = $4,
              executed_at = case when $3 = 'executed' then now() end,
              outcome_http_status = $5,
              outcome_reason = $6,
              outcome_content = $7
        where organization_id = $1 and id = $2 and status = 'executing'`,
      [
        organizationId,
        c.pedido.id,
        r.ok ? "executed" : "failed",
        r.ok ? false : r.desfechoIncerto,
        r.httpStatus,
        r.ok ? null : r.motivo,
        r.ok ? r.conteudo : null,
      ],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] o desfecho do pedido não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/** Os pedidos desta conversa, para o agente saber o que aconteceu com o que pediu. Nunca lança. */
export async function pedidosDaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<PedidoParaOBloco[]> {
  try {
    const { rows } = await db.query<{
      tool_name: string;
      status: EstadoDoPedido;
      uncertain: boolean;
      expires_at: Date | string;
      created_at: Date | string;
      arguments: Record<string, unknown>;
      tem_resultado: boolean;
    }>(
      `select t.name as tool_name, r.status, r.uncertain, r.expires_at, r.created_at, r.arguments,
              (r.outcome_content is not null) as tem_resultado
         from agent_external_tool_requests r
         join agent_external_tools t on t.organization_id = r.organization_id and t.id = r.tool_id
        where r.organization_id = $1 and r.conversation_id = $2
          and r.created_at > now() - interval '7 days'
        order by r.created_at desc
        limit 20`,
      [organizationId, conversationId],
    );
    return rows.map((l) => ({
      tool_name: l.tool_name,
      status: l.status,
      uncertain: l.uncertain,
      expires_at: l.expires_at instanceof Date ? l.expires_at.toISOString() : String(l.expires_at),
      created_at: l.created_at instanceof Date ? l.created_at.toISOString() : String(l.created_at),
      arguments: l.arguments ?? {},
      tem_resultado: l.tem_resultado,
    }));
  } catch (err) {
    logger.warn("[ferramentas-externas] os pedidos da conversa não foram lidos", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return [];
  }
}

/** Há um pedido VIVO esperando um humano nesta conversa? (sustenta a promessa «depende da equipe») */
export async function temPedidoPendenteNaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const { rows } = await db.query<{ existe: boolean }>(
      `select exists (
         select 1 from agent_external_tool_requests
          where organization_id = $1 and conversation_id = $2
            and status = 'pending' and expires_at > now()
       ) as existe`,
      [organizationId, conversationId],
    );
    return rows[0]?.existe === true;
  } catch {
    return false;
  }
}

async function auditarPedido(
  db: Queryable,
  organizationId: string,
  a: { action: string; pedidoId: string; ferramentaId: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await db.query(
      `insert into api_audit_log (organization_id, action, resource_type, resource_id, request_id, metadata)
       values ($1, $2, 'agent_external_tool_request', $3, null, $4::jsonb)`,
      [organizationId, a.action, a.pedidoId, JSON.stringify({ tool_id: a.ferramentaId, ...a.metadata })],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] auditoria do pedido não foi gravada", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/** As dependências do turno ligadas ao banco real. O motor passa isto a `montarFerramentasExternas`. */
export function dependenciasDoMotor(args: {
  db: Queryable;
  organizationId: string;
  agentId: string | null;
  jobId: string | null;
  conversationId?: string | null;
  log: DependenciasDoTurnoExterno["log"];
}): DependenciasDoTurnoExterno {
  const { db, organizationId } = args;
  return {
    carregar: (ids) => carregarFerramentasDoTurno(db, organizationId, ids),
    lerChave: (id) => lerChaveNoBanco(db, organizationId, id),
    abrirAviso: (aviso) => abrirAvisoDeFalha(db, organizationId, aviso),
    abrirPedido: (a) =>
      abrirPedidoNoBanco(db, organizationId, {
        ferramenta: a.ferramenta,
        argumentos: a.argumentos,
        origem: a.origem,
        autoExecutar: a.autoExecutar,
        agentId: args.agentId,
        conversationId: args.conversationId ?? null,
        jobId: args.jobId,
      }),
    concluirPedido: (c) => concluirPedidoNoBanco(db, organizationId, c),
    contarUso: (f) =>
      f.api
        ? contarUsoDaFerramenta(db, organizationId, {
            ferramentaId: f.id,
            conversationId: args.conversationId ?? null,
            limitePorConversa: f.api.config.limite_por_conversa,
            limitePorDia: f.api.config.limite_por_dia,
          })
        : Promise.resolve({ cabe: true as const }),
    lerContato: () => lerContatoDaConversa(db, organizationId, args.conversationId ?? null),
    registrarDesfecho: async ({ ferramenta, resultado }) => {
      if (!ferramenta.api) return;
      const pausou = await registrarDesfechoDaFerramenta(db, organizationId, {
        ferramentaId: ferramenta.id,
        ok: resultado.ok,
        pausaAposFalhas: ferramenta.api.config.pausa_apos_falhas,
      });
      if (!pausou) return;
      await abrirAvisoDeFalha(db, organizationId, {
        titulo: `«${ferramenta.name}» foi pausada depois de falhas seguidas`,
        corpo:
          `A API «${ferramenta.name}» falhou ${ferramenta.api.config.pausa_apos_falhas} vezes seguidas e foi pausada sozinha: ` +
          "o agente deixou de usá-la, para não seguir tentando um sistema que não responde. Abra Ferramentas externas › APIs, " +
          "use «Testar de verdade» para ver o que o outro sistema responde e ative-a de novo quando estiver funcionando.",
      });
    },
    avisarExecucaoDireta: ({ ferramenta, resultado }) =>
      abrirAvisoAoAdministrador(db, organizationId, {
        titulo: `O agente executou «${ferramenta.name}» sem aprovação`,
        corpo:
          `A API «${ferramenta.name}» altera dados em outro sistema e está com «pedir aprovação» desligada: o agente a ` +
          `executou sozinho durante um atendimento${resultado.ok ? "" : ", e a chamada não foi concluída"}. Para que cada ação ` +
          "espere a sua aprovação, ligue «pedir aprovação» na ferramenta ou a trava «aprovação sempre obrigatória» em " +
          "Ferramentas externas › APIs › Segurança.",
      }),
    auditar: async ({ ferramenta, resultado }) => {
      // O motor fala com o banco pelo `pg`, e a auditoria vai pelo mesmo caminho (uma linha
      // em `api_audit_log`). Fire-and-forget por contrato: falha de escrita avisa no log e
      // NUNCA derruba o turno nem muda o que o cliente recebe.
      try {
        await db.query(
          `insert into api_audit_log (organization_id, action, resource_type, resource_id, request_id, metadata)
           values ($1, 'ai.external_tool_called', 'agent_external_tool', $2, $3, $4::jsonb)`,
          [
            organizationId,
            ferramenta.id,
            args.jobId,
            JSON.stringify(metadadosDaChamada(ferramenta, resultado, { agentId: args.agentId, jobId: args.jobId })),
          ],
        );
      } catch (err) {
        logger.warn("[ferramentas-externas] auditoria da chamada não foi gravada", {
          organization_id: organizationId,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
        });
      }
    },
    log: args.log,
  };
}

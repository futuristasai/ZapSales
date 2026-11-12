/**
 * O TETO DE ATENDIMENTOS AUTOMÁTICOS POR CONTATO (#271).
 *
 * O teto mensal de gasto (`../edge/llm/orcamento.ts`) protege a ORGANIZAÇÃO
 * inteira, e por isso deixa um vão: um único número que escreve sem parar —
 * uma pessoa insistente, um robô do outro lado, um laço entre dois bots —
 * consome o orçamento de todos os outros clientes antes de qualquer alarme
 * tocar. Cada mensagem recebida vira um turno, e cada turno são várias
 * chamadas de modelo.
 *
 * A regra: a IA atende o MESMO contato até `por_hora` vezes em 60 minutos e
 * até `por_dia` vezes em 24 horas. No atendimento seguinte ela não chama
 * modelo nenhum: avisa o cliente, passa a conversa para a fila humana e abre
 * UM aviso na Central. Dali em diante o contato está em handoff, e todo turno
 * novo dele é no-op no começo (`isLeadInHandoff`) — é isso que faz ser um
 * aviso por estouro, e não um por mensagem.
 *
 * ═══ O QUE É CONTADO ═══
 *
 * Turnos em que o modelo de atendimento de fato rodou: `llm_calls` com
 * `purpose = 'agent_turn'` e `status = 'ok'`, um por `job_id`. Não se conta a
 * linha da fila (`job_queue`) de propósito: um turno pulado — contato em
 * handoff, fora da janela de envio, conversa não elegível — termina `done`
 * sem gastar um token, e contá-lo faria quem ficou uma tarde com um humano
 * voltar ao automático já estourado.
 *
 * ═══ JANELA QUE ANDA, E NÃO DIA DO CALENDÁRIO ═══
 *
 * As duas janelas são contadas para trás a partir do relógio do turno. Não há
 * "virada": meia-noite e o primeiro dia do mês não reabrem a conta de quem
 * acabou de estourar nem prendem quem estourou ontem.
 *
 * ═══ A CONTA RECOMEÇA QUANDO UMA PESSOA DEVOLVE A CONVERSA ═══
 *
 * Só entra na conta o que aconteceu DEPOIS da última passagem para humano
 * daquele contato (`passagens_de_atendimento.criado_em`). Sem isso, o botão
 * "Devolver ao automático" não devolveria nada: a contagem da última hora
 * continuaria acima do teto e a primeira mensagem do cliente derrubaria a
 * conversa de novo. Devolver é uma decisão humana — é ela que zera.
 *
 * ═══ ZERO É "SEM TETO" ═══
 *
 * Mesma convenção do orçamento mensal: 0 desliga aquela janela. Organização
 * sem linha em `ai_budgets` usa o padrão do produto.
 */
import type pg from 'pg';

import type { Idioma } from '@/lib/i18n/idiomas';
import { traduzir } from '@/lib/i18n/dicionario';
import { preencher } from '@/lib/i18n/aviso-no-idioma';

/** O padrão do produto — escolhido pelo dono em 12/11/2026. Folgado de propósito. */
export const TETO_POR_CONTATO_PADRAO = { porHora: 50, porDia: 150 } as const;

/** O maior valor que a tela e o banco aceitam (o CHECK de `ai_budgets`). */
export const TETO_POR_CONTATO_MAXIMO = 10_000;

/** `conversations.last_handoff_reason` e `passagens_de_atendimento.motivo_codigo`. */
export const HANDOFF_REASON_TETO_POR_CONTATO = 'limite_por_contato';

/** Rótulo visível na Central — logo, constante (e chave do dicionário). */
export const TITULO_DO_HANDOFF_POR_TETO_DE_CONTATO =
  'Limite de respostas automáticas por contato atingido — assumir a conversa';

/**
 * Primeira linha do que a pessoa lê ao assumir. Texto de CÓDIGO: gerar este
 * resumo por modelo seria gastar exatamente o que o teto acabou de recusar.
 */
const RESUMO_POR_HORA =
  'A IA parou de responder a este contato porque ele passou do limite de {limite} respostas automáticas por hora — o cliente NÃO pediu atendimento humano. Confira se é uma pessoa ou um robô do outro lado; para devolver a conversa ao atendimento automático, use "Devolver ao automático" no cabeçalho dela. O limite é ajustado em Uso de IA.';
const RESUMO_POR_DIA =
  'A IA parou de responder a este contato porque ele passou do limite de {limite} respostas automáticas por dia — o cliente NÃO pediu atendimento humano. Confira se é uma pessoa ou um robô do outro lado; para devolver a conversa ao atendimento automático, use "Devolver ao automático" no cabeçalho dela. O limite é ajustado em Uso de IA.';

export interface TetoPorContato {
  /** 0 = sem teto por hora. */
  porHora: number;
  /** 0 = sem teto por dia. */
  porDia: number;
}

export interface ContagemDoContato {
  naHora: number;
  noDia: number;
}

export type VereditoDoTeto =
  | { estourou: false }
  | { estourou: true; janela: 'hora' | 'dia'; contagem: number; limite: number };

/**
 * A REGRA, pura. Recebe quantos atendimentos JÁ aconteceram — o turno que
 * pergunta ainda não chamou modelo nenhum. Com teto N, a contagem N-1 passa
 * (este será o N-ésimo) e a contagem N recusa: o atendimento de número N
 * responde, o N+1 não.
 *
 * A hora é conferida antes do dia: quando as duas estouram juntas, a hora é a
 * explicação mais útil para quem assume ("está acontecendo AGORA").
 */
export function decidirTetoPorContato(teto: TetoPorContato, contagem: ContagemDoContato): VereditoDoTeto {
  if (teto.porHora > 0 && contagem.naHora >= teto.porHora) {
    return { estourou: true, janela: 'hora', contagem: contagem.naHora, limite: teto.porHora };
  }
  if (teto.porDia > 0 && contagem.noDia >= teto.porDia) {
    return { estourou: true, janela: 'dia', contagem: contagem.noDia, limite: teto.porDia };
  }
  return { estourou: false };
}

/**
 * Normaliza o que veio do banco. Valor ausente, não numérico ou negativo cai
 * no padrão — nunca em zero: "não consegui ler" não pode virar "sem teto".
 */
export function normalizarTeto(bruto: { porHora: unknown; porDia: unknown }): TetoPorContato {
  const ler = (v: unknown, padrao: number): number => {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return padrao;
    return Math.min(Math.floor(n), TETO_POR_CONTATO_MAXIMO);
  };
  return {
    porHora: ler(bruto.porHora, TETO_POR_CONTATO_PADRAO.porHora),
    porDia: ler(bruto.porDia, TETO_POR_CONTATO_PADRAO.porDia),
  };
}

/**
 * UMA consulta: o teto da organização e as duas contagens do contato.
 *
 *   $1 organização · $2 contato · $3 o relógio do turno
 *   $4 / $5 o padrão do produto, para a organização sem linha em `ai_budgets`
 *
 * É constante exportada, e não SQL inline, porque o invariante de banco
 * (`tests/invariants/teto-de-ia-por-contato.test.ts`) executa ESTE texto num
 * Postgres de verdade — a régua medida é a régua que decide.
 *
 * O turno entra na janela pela sua ÚLTIMA chamada: um atendimento que começou
 * há 61 minutos e terminou há 59 ainda é "da última hora".
 */
export const SQL_TETO_POR_CONTATO = `
with teto as (
  select coalesce(b.teto_por_contato_hora, $4::int) as por_hora,
         coalesce(b.teto_por_contato_dia,  $5::int) as por_dia
    from (select 1) um
    left join ai_budgets b on b.organization_id = $1
), marco as (
  select max(p.criado_em) as desde
    from passagens_de_atendimento p
   where p.organization_id = $1 and p.contact_id = $2
), turnos as (
  select c.job_id, max(c.created_at) as ultima
    from llm_calls c
   cross join marco m
   where c.organization_id = $1
     and c.contact_id = $2
     and c.job_id is not null
     and c.purpose = 'agent_turn'
     and c.status = 'ok'
     and c.created_at > $3::timestamptz - interval '24 hours'
     and (m.desde is null or c.created_at > m.desde)
   group by c.job_id
)
select t.por_hora,
       t.por_dia,
       (select count(*) from turnos where ultima > $3::timestamptz - interval '1 hour')::int as na_hora,
       (select count(*) from turnos)::int as no_dia
  from teto t`;

interface LinhaDoTeto {
  por_hora: number | string | null;
  por_dia: number | string | null;
  na_hora: number | string | null;
  no_dia: number | string | null;
}

/** Lê o teto e a contagem e devolve o veredito. Lança se o banco falhar. */
export async function consultarTetoPorContato(
  db: Pick<pg.Pool, 'query'>,
  alvo: { tenantId: string; leadId: string; agora: Date },
): Promise<VereditoDoTeto> {
  const { rows } = await db.query<LinhaDoTeto>(SQL_TETO_POR_CONTATO, [
    alvo.tenantId,
    alvo.leadId,
    alvo.agora.toISOString(),
    TETO_POR_CONTATO_PADRAO.porHora,
    TETO_POR_CONTATO_PADRAO.porDia,
  ]);
  const linha = rows[0];
  if (linha === undefined) return { estourou: false };
  return decidirTetoPorContato(
    normalizarTeto({ porHora: linha.por_hora, porDia: linha.por_dia }),
    { naHora: Number(linha.na_hora ?? 0), noDia: Number(linha.no_dia ?? 0) },
  );
}

/** O texto fixo que abre o resumo da passagem, no idioma da organização. */
export function resumoDoHandoffPorTetoDeContato(
  veredito: { janela: 'hora' | 'dia'; limite: number },
  idioma: Idioma,
): string {
  const chave = veredito.janela === 'hora' ? RESUMO_POR_HORA : RESUMO_POR_DIA;
  return preencher(traduzir(chave, idioma), { limite: String(veredito.limite) });
}

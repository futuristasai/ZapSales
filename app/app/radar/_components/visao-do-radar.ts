/**
 * O que a tela do radar mostra de cada vez, e PARA ONDE cada clique leva.
 *
 * Lógica pura, sem React, de propósito: as duas regras daqui eram a queixa de
 * quem usa a tela, e regra que só existe dentro de JSX não tem como ser medida.
 *
 *  1. PARA ONDE O CLIQUE VAI. A linha antes escolhia sozinha — conversa quando o
 *     contato tinha uma, o quadro do funil quando não tinha —, sem dizer qual.
 *     Quem clicava em dois negócios vizinhos caía em duas telas diferentes. A
 *     regra agora é uma só, e a tela a ESCREVE em botões: a linha abre a
 *     CONVERSA (risco de perda se resolve falando com o cliente, e a conversa já
 *     traz o negócio no painel ao lado); "Ver no funil" é sempre um botão à
 *     parte e abre o CARTÃO do negócio, não só o quadro. Sem conversa, a linha
 *     diz que não há conversa e o destino passa a ser o funil.
 *
 *  2. UMA LISTA POR VEZ. Os contadores eram etiquetas: pareciam filtro e não
 *     filtravam. Viraram a escolha da lista.
 */
import type { AtRiskData } from "@/hooks/leads/useAtRiskLeads";
import type { SituacaoNoRadar } from "@/lib/leads/radar-de-risco";

export type VisaoDoRadar =
  "todos" | SituacaoNoRadar | "sem_proximo_passo" | "propostas_vencidas" | "propostas_para_revisar";

/** Ordem em que as visões aparecem — e em que a primeira não vazia é escolhida. */
export const VISOES_DO_RADAR: readonly VisaoDoRadar[] = [
  "todos",
  "critico",
  "em_risco",
  "em_voo",
  "sem_proximo_passo",
  "propostas_vencidas",
  "propostas_para_revisar",
];

const SITUACOES: readonly string[] = ["critico", "em_risco", "em_voo"];

/** `?ver=` da URL → visão, ou `null` quando ausente ou desconhecido. */
export function lerVisao(valor: string | null | undefined): VisaoDoRadar | null {
  return valor && (VISOES_DO_RADAR as readonly string[]).includes(valor)
    ? (valor as VisaoDoRadar)
    : null;
}

/** A situação que a visão pede ao servidor (`risk=`), quando ela é uma situação. */
export function situacaoDaVisao(visao: VisaoDoRadar | null): SituacaoNoRadar | undefined {
  return visao && SITUACOES.includes(visao) ? (visao as SituacaoNoRadar) : undefined;
}

type Contagens = Pick<
  AtRiskData,
  | "counts"
  | "total"
  | "total_sem_proximo_passo"
  | "propostas_vencidas_sem_retomada"
  | "propostas_esperando_revisao"
>;

/** Quantos itens cada visão tem — o número que o cartão mostra. */
export function contagemDaVisao(dados: Contagens, visao: VisaoDoRadar): number {
  switch (visao) {
    case "todos":
      return dados.total;
    case "critico":
    case "em_risco":
    case "em_voo":
      return dados.counts[visao];
    case "sem_proximo_passo":
      return dados.total_sem_proximo_passo;
    case "propostas_vencidas":
      return (dados.propostas_vencidas_sem_retomada ?? []).length;
    case "propostas_para_revisar":
      return (dados.propostas_esperando_revisao ?? []).length;
  }
}

/**
 * A visão em vigor. Sem escolha na URL, é a PRIMEIRA NÃO VAZIA: abrir em "Todos"
 * com zero negócios parados mostraria uma lista vazia ao lado de um contador
 * dizendo "19 sem próximo passo" — o vazamento escondido atrás de um clique.
 */
export function visaoEmVigor(dados: Contagens, escolhida: VisaoDoRadar | null): VisaoDoRadar {
  if (escolhida) return escolhida;
  return VISOES_DO_RADAR.find((v) => contagemDaVisao(dados, v) > 0) ?? "todos";
}

export function hrefDaConversa(conversationId: string): string {
  return `/app/inbox?id=${conversationId}`;
}

/** Abre o CARTÃO do negócio no quadro (`?lead=`), não só o quadro. */
export function hrefDoNegocioNoFunil(pipelineId: string, leadId: string): string {
  return `/app/pipelines/${pipelineId}?lead=${leadId}`;
}

export interface DestinosDaLinha {
  /** A conversa com o cliente, quando existe. */
  conversa: string | null;
  /** O cartão do negócio no funil, quando há negócio. */
  funil: string | null;
  /** Para onde a linha inteira leva: a conversa; sem conversa, o funil. */
  principal: string | null;
}

export function destinosDaLinha(alvo: {
  conversation_id: string | null;
  pipeline_id: string | null;
  lead_id: string | null;
}): DestinosDaLinha {
  const conversa = alvo.conversation_id ? hrefDaConversa(alvo.conversation_id) : null;
  const funil =
    alvo.pipeline_id && alvo.lead_id ? hrefDoNegocioNoFunil(alvo.pipeline_id, alvo.lead_id) : null;
  return { conversa, funil, principal: conversa ?? funil };
}

/**
 * "484h" não diz nada a quem lê; "20 dias" diz. Abaixo de dois dias fica em
 * horas, porque ali a hora ainda é a unidade em que se decide.
 */
export function tempoDecorrido(horas: number, t: (texto: string) => string): string {
  const h = Math.max(0, Math.round(horas));
  if (h < 1) return t("menos de 1 hora");
  if (h < 48) return `${h} ${h === 1 ? t("hora") : t("horas")}`;
  return `${Math.round(h / 24)} ${t("dias")}`;
}

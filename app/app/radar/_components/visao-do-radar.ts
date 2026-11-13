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

/** As visões que listam NEGÓCIOS parados — as que podem virar público de um disparo. */
export function visaoDeNegocios(visao: VisaoDoRadar): visao is "todos" | SituacaoNoRadar {
  return visao === "todos" || SITUACOES.includes(visao);
}

export interface PessoasDoResgate {
  /** Os contatos, sem repetir: é isto que vira a lista salva. */
  ids: string[];
  /** Negócios da visão que não têm contato ligado: não há para quem mandar. */
  semContato: number;
  /** Em "Todos": quantas pessoas ficaram de fora por já terem retorno marcado. */
  emVooDeFora: number;
}

/**
 * QUEM ENTRA no resgate por disparo em massa.
 *
 * Em "Todos", quem está EM VOO fica de fora: já tem um retorno marcado, e um
 * disparo por cima manda duas mensagens à mesma pessoa. Quem quer mesmo assim
 * escolhe o cartão "Em voo", onde a tela avisa antes. A pessoa com dois
 * negócios entra uma vez só — e, se um deles está em voo, ela não entra em
 * "Todos": o retorno marcado é da PESSOA, não do negócio.
 */
export function pessoasParaResgatar(
  itens: ReadonlyArray<{ contact_id: string | null; risk: string }>,
  visao: "todos" | SituacaoNoRadar,
): PessoasDoResgate {
  const daVisao = visao === "todos" ? itens : itens.filter((l) => l.risk === visao);
  const emVoo = new Set(
    visao === "todos"
      ? itens.flatMap((l) => (l.risk === "em_voo" && l.contact_id ? [l.contact_id] : []))
      : [],
  );
  const ids = new Set<string>();
  let semContato = 0;
  for (const l of daVisao) {
    if (!l.contact_id) semContato += 1;
    else if (!emVoo.has(l.contact_id)) ids.add(l.contact_id);
  }
  return { ids: [...ids], semContato, emVooDeFora: emVoo.size };
}

/**
 * O nome da lista: de onde veio, qual situação e quando. A hora entra porque o
 * nome é único na organização — dois resgates no mesmo dia não podem colidir —
 * e porque a lista é uma FOTO: amanhã "Crítico" é outra gente.
 */
export function nomeDaListaDeResgate(tela: string, situacao: string, agora: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  const dia = `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}`;
  const hora = `${dois(agora.getHours())}h${dois(agora.getMinutes())}`;
  return `${tela} · ${situacao} · ${dia} ${hora}`;
}

/**
 * O título do negócio só aparece quando ACRESCENTA algo ao nome. Negócio criado
 * a partir de uma conversa nasce com o nome do contato como título, e a linha
 * dizia "Luh Dumont" duas vezes, uma em cima da outra — visto na produção, onde
 * era o caso de quase toda linha; os dados de exemplo tinham títulos próprios e
 * esconderam isso.
 */
export function tituloQueAcrescenta(nome: string | null, titulo: string | null): string | null {
  const limpo = (titulo ?? "").trim();
  if (!limpo) return null;
  if (!nome) return limpo;
  return limpo.toLocaleLowerCase() === nome.trim().toLocaleLowerCase() ? null : limpo;
}

/** Nome que é só número ("+55 21 …") não tem iniciais: "+5" não é de ninguém. */
export function temIniciais(nome: string): boolean {
  return /\p{L}/u.test(nome);
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

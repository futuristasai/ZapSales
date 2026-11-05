/**
 * A DECISÃO da licença — `decidir(estado, relogio, opções)`: a instalação opera ou não?
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2 ("A decisão"). É o ÚNICO
 * lugar do código onde se responde "esta instalação pode trabalhar?". Todas as portas (proxy, cron,
 * worker, webhooks, token) perguntam a `lib/licenca/porta.ts`, que chama esta função; nenhuma outra
 * parte do produto reimplementa a regra. Quem a duplicar cria duas respostas para a mesma pergunta,
 * e a que errar para o lado frouxo some no meio do código — por isso há cerca de teste cobrando as
 * portas (`tests/unit/licenca-portas-chamam-a-decisao.test.ts`).
 *
 * ── PURA ─────────────────────────────────────────────────────────────────────
 *
 * Sem banco, sem rede, sem ambiente e sem `Date.now()`: o relógio entra por parâmetro, e é por isso
 * que o prazo se testa em relógio simulado, sem esperar dias. A única "E/S" é a conferência
 * criptográfica do selo (`verificarSelo`), que é assíncrona por causa do `jose`.
 *
 * ── A ORDEM IMPORTA ──────────────────────────────────────────────────────────
 *
 *  1. selo PERMANENTE válido → opera, e vale mais que qualquer bloqueio local. O contrato (cláusula
 *     6.3) diz que a autorização permanente não é revogada à distância, e o servidor nunca emite o
 *     permanente para licença já bloqueada; o app, depois de recebê-lo, nem consulta mais.
 *  2. bloqueio registrado → NÃO opera (vale mais que um temporário ainda dentro do prazo).
 *  3. selo TEMPORÁRIO válido → opera ("faltam N dias").
 *  4. já foi ativada alguma vez, sem selo válido → NÃO opera ("autorização vencida por falta de
 *     contato"). Instalação ativada NUNCA volta a `sem_selo` por perder ou adulterar o selo.
 *  5. nunca foi ativada → opera como uso não comercial (ou "ativação pendente", durante a instalação).
 *
 * Um selo inválido numa instalação que nunca foi ativada cai no passo 5: um selo forjado não pode
 * ser melhor que nenhum selo, e nenhum selo já opera.
 */
import { agoraEfetivo, type EstadoLocal } from "./estado";
import { verificarSelo, type ChavePublica, type MotivoDeRejeicao, type TipoDeSelo } from "./selo";

export type EstadoDaLicenca =
  | "sem_selo"
  | "ativacao_pendente"
  | "temporario_valido"
  | "permanente_valido"
  | "temporario_vencido"
  | "bloqueada";

/**
 * O que a tela deve dizer, como CÓDIGO. O texto (pt/en/es) é de quem desenha a faixa; manter o
 * código aqui impede que a regra dependa de uma frase.
 */
export type CodigoDeMensagem =
  | "uso_nao_comercial"
  | "ativacao_pendente"
  | "temporaria_faltam_dias"
  | "autorizacao_vencida"
  | "licenca_bloqueada";

export interface Decisao {
  readonly estado: EstadoDaLicenca;
  /** A instalação pode trabalhar? É a resposta que as portas aplicam (em modo `valendo`). */
  readonly opera: boolean;
  readonly mensagem: CodigoDeMensagem | null;
  /** Só no temporário válido com janela conhecida: dias inteiros até o fim da janela, nunca negativo. */
  readonly diasRestantes: number | null;
  /** O tipo do selo que sustentou a decisão, quando houve um. */
  readonly seloTipo: TipoDeSelo | null;
  /** Por que o selo atual NÃO valeu (nulo quando valeu ou quando não havia selo). */
  readonly motivoDoSelo: MotivoDeRejeicao | null;
  /** O relógio local está bem atrás do maior horário já visto: suspeito, para quem registra. */
  readonly relogioRecuou: boolean;
  /** O "agora" efetivo que valeu, em segundos Unix: `max(relógio local, maior horário visto)`. */
  readonly agora: number;
}

export interface OpcoesDaDecisao {
  /** As chaves públicas que valem (de `chavesAceitas`). Quem chama decide produção ou não. */
  readonly chaves: readonly ChavePublica[];
  /**
   * Durante a instalação, antes da ativação feita: "sem selo" vira "ativação pendente". Só muda a
   * mensagem; nos dois casos a instalação opera.
   */
  readonly ativacaoPendente?: boolean;
}

const SEGUNDOS_POR_DIA = 86_400;

function diasAte(fim: number | null, agora: number): number | null {
  if (fim === null) return null;
  return Math.max(0, Math.ceil((fim - agora) / SEGUNDOS_POR_DIA));
}

export async function decidir(
  estado: EstadoLocal,
  relogioLocal: number,
  opcoes: OpcoesDaDecisao,
): Promise<Decisao> {
  const { agora, relogioRecuou } = agoraEfetivo(relogioLocal, estado.maiorHorarioVisto);

  let seloTipo: TipoDeSelo | null = null;
  let motivoDoSelo: MotivoDeRejeicao | null = null;
  if (estado.seloAtual) {
    const r = await verificarSelo(estado.seloAtual, {
      chaves: opcoes.chaves,
      instalacaoId: estado.instalacaoId,
      agora,
    });
    if (r.ok) seloTipo = r.selo.tipo;
    else motivoDoSelo = r.motivo;
  }

  const base = { seloTipo, motivoDoSelo, relogioRecuou, agora };

  // 1. permanente válido: não se revoga à distância.
  if (seloTipo === "permanente") {
    return {
      ...base,
      estado: "permanente_valido",
      opera: true,
      mensagem: null,
      diasRestantes: null,
    };
  }

  // 2. bloqueio registrado.
  if (estado.bloqueio) {
    return {
      ...base,
      estado: "bloqueada",
      opera: false,
      mensagem: "licenca_bloqueada",
      diasRestantes: null,
    };
  }

  // 3. temporário válido.
  if (seloTipo === "temporario") {
    return {
      ...base,
      estado: "temporario_valido",
      opera: true,
      mensagem: "temporaria_faltam_dias",
      diasRestantes: diasAte(estado.janelaTerminaEm, agora),
    };
  }

  // 4. já foi ativada e não há selo válido: nunca volta a `sem_selo`.
  if (estado.ativadaEm !== null) {
    return {
      ...base,
      estado: "temporario_vencido",
      opera: false,
      mensagem: "autorizacao_vencida",
      diasRestantes: null,
    };
  }

  // 5. nunca foi ativada.
  const pendente = opcoes.ativacaoPendente === true;
  return {
    ...base,
    estado: pendente ? "ativacao_pendente" : "sem_selo",
    opera: true,
    mensagem: pendente ? "ativacao_pendente" : "uso_nao_comercial",
    diasRestantes: null,
  };
}

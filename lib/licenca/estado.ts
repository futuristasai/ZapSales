/**
 * O ESTADO LOCAL da licença — a parte PURA: tipos, a tradução da linha do banco e o relógio efetivo.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2. A decisão
 * (`decidir(estado, agora)`) é da próxima parte da Fase 1 e importa só os TIPOS daqui. Este módulo
 * não lê banco, relógio nem ambiente, então roda em qualquer runtime (Node, `proxy.ts`, worker) e
 * se testa com relógio simulado. Quem fala com o banco é `armazem.ts`.
 *
 * Todo instante aqui é em SEGUNDOS Unix UTC, o mesmo que o selo usa (`iat`/`exp`) — uma unidade só
 * no caminho inteiro, para a comparação com `exp` nunca precisar de conversão.
 */

export type ModoDaLicenca = "sombra" | "valendo";

/** O bloqueio que o servidor de licenças registrou: um CÓDIGO (nunca texto livre) e quando. */
export interface BloqueioLocal {
  readonly codigo: string;
  readonly em: number;
}

/** O que a instalação sabe sobre a própria licença. Entrada da decisão. */
export interface EstadoLocal {
  readonly instalacaoId: string;
  /** O último selo recebido, como chegou (JWS compacto). Quem o confere é `verificarSelo`. */
  readonly seloAtual: string | null;
  readonly maiorHorarioVisto: number | null;
  /** Marca de que a instalação JÁ foi ativada alguma vez. Nunca volta a `null`. */
  readonly ativadaEm: number | null;
  readonly bloqueio: BloqueioLocal | null;
  readonly ultimaConsultaOkEm: number | null;
  /** Informado pelo servidor, só para a mensagem "faltam N dias". */
  readonly janelaTerminaEm: number | null;
  readonly modo: ModoDaLicenca;
}

/** A linha de `public.platform_licenca`, como o PostgREST a devolve (sem o envelope da credencial). */
export interface LinhaDaLicenca {
  readonly instalacao_id: string;
  readonly selo_atual: string | null;
  readonly maior_horario_visto: string | null;
  readonly ativada_em: string | null;
  readonly bloqueio_codigo: string | null;
  readonly bloqueio_em: string | null;
  readonly ultima_consulta_ok_em: string | null;
  readonly janela_termina_em: string | null;
  readonly modo: string;
}

/** ISO-8601 → segundos Unix. Valor ausente ou ilegível vira `null`: nunca lança nem devolve NaN. */
export function segundosDe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Segundos Unix → ISO-8601 UTC, o formato que o banco recebe. */
export function isoDe(segundos: number): string {
  return new Date(segundos * 1000).toISOString();
}

/**
 * Traduz a linha do banco. Modo desconhecido vira `sombra`, o lado que não restringe ninguém —
 * o `check` do banco já impede o valor, e isto é só o cinto para quem editar a coluna no escuro.
 * Um bloqueio com instante ilegível continua sendo bloqueio (usa o horário zero): perder o
 * instante nunca pode apagar o bloqueio.
 */
export function estadoDaLinha(linha: LinhaDaLicenca): EstadoLocal {
  const bloqueio: BloqueioLocal | null = linha.bloqueio_codigo
    ? { codigo: linha.bloqueio_codigo, em: segundosDe(linha.bloqueio_em) ?? 0 }
    : null;
  return {
    instalacaoId: linha.instalacao_id,
    seloAtual: linha.selo_atual,
    maiorHorarioVisto: segundosDe(linha.maior_horario_visto),
    ativadaEm: segundosDe(linha.ativada_em),
    bloqueio,
    ultimaConsultaOkEm: segundosDe(linha.ultima_consulta_ok_em),
    janelaTerminaEm: segundosDe(linha.janela_termina_em),
    modo: linha.modo === "valendo" ? "valendo" : "sombra",
  };
}

/**
 * Quanto o relógio local pode ficar atrás do maior horário visto antes de contar como recuo
 * suspeito. O horário visto inclui respostas do servidor, e dois relógios nunca concordam ao
 * segundo; a tolerância é a mesma da emissão do selo (`TOLERANCIA_DE_EMISSAO_S`). Ela só afeta o
 * ALERTA: o `agora` efetivo é sempre o maior dos dois, com ou sem tolerância.
 */
export const TOLERANCIA_DE_RECUO_S = 300;

export interface AgoraEfetivo {
  /** `max(relógio local, maior horário visto)`, em segundos. */
  readonly agora: number;
  /** O relógio local está bem ATRÁS do maior horário já visto: suspeito, e o app registra. */
  readonly relogioRecuou: boolean;
}

/**
 * O "agora" que vale para prazo: `max(relógio local, maior horário visto)`. Relógio que volta não
 * estende nada — o selo temporário vence pelo agora efetivo, não pelo relógio de quem o mexeu.
 * O relógio local é parâmetro (nunca `Date.now()` aqui): é assim que o prazo é testável sem esperar
 * dias. Entrada não finita é tratada como relógio ausente, e o maior horário visto manda.
 */
export function agoraEfetivo(relogioLocal: number, maiorHorarioVisto: number | null): AgoraEfetivo {
  const local = Number.isFinite(relogioLocal) ? relogioLocal : null;
  const visto =
    maiorHorarioVisto !== null && Number.isFinite(maiorHorarioVisto) ? maiorHorarioVisto : null;
  if (local === null) return { agora: visto ?? 0, relogioRecuou: false };
  if (visto === null) return { agora: local, relogioRecuou: false };
  return { agora: Math.max(local, visto), relogioRecuou: visto - local > TOLERANCIA_DE_RECUO_S };
}

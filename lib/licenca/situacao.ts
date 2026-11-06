/**
 * A SITUAÇÃO da licença para a TELA — o que a faixa e a página de licença mostram.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2. Quem MOSTRA não decide: a resposta
 * vem de `consultarPorta` (a mesma decisão que as portas aplicam), então a tela nunca diz uma coisa e o
 * produto faz outra. Este módulo só traduz o veredito para um objeto simples, que atravessa a fronteira
 * servidor → navegador sem arrastar selo, credencial nem nada que a tela não deva ter.
 *
 * ── NUNCA LANÇA, E O ILEGÍVEL SOME ───────────────────────────────────────────
 *
 * Banco fora do ar, tabela ausente (imagem nova sobre schema velho): a situação é `null` e a tela não mostra
 * faixa. Uma faixa que dissesse "bloqueada" porque a leitura falhou seria pior que nenhuma faixa.
 */
import { garantirEstado } from "./armazem";
import type { CodigoDeMensagem, EstadoDaLicenca } from "./decidir";
import type { ModoDaLicenca } from "./estado";
import { consultarPorta } from "./porta";

/** O que a faixa precisa. Só dado simples e serializável. */
export interface SituacaoDaLicenca {
  readonly estado: EstadoDaLicenca;
  readonly opera: boolean;
  readonly mensagem: CodigoDeMensagem | null;
  /** Dias inteiros até o fim da janela, só no temporário válido com janela conhecida. */
  readonly diasRestantes: number | null;
  /** `sombra`: calcula e mostra, nada é restringido. `valendo`: as portas recusam. */
  readonly modo: ModoDaLicenca;
}

/** O que a página de licença mostra a quem administra. */
export interface DetalhesDaLicenca extends SituacaoDaLicenca {
  readonly instalacaoId: string;
  /** Já foi ativada alguma vez (há `ativada_em`). */
  readonly ativada: boolean;
  /** Instantes em ISO-8601 UTC, ou `null`. */
  readonly ultimaConsultaOkEm: string | null;
  readonly janelaTerminaEm: string | null;
  readonly proximaConsultaEm: string | null;
  /** O CÓDIGO do motivo do bloqueio (nunca texto livre), ou `null`. */
  readonly bloqueioCodigo: string | null;
  /** O relógio local está bem atrás do maior horário já visto. */
  readonly relogioRecuou: boolean;
}

const isoDe = (segundos: number | null): string | null =>
  segundos === null ? null : new Date(segundos * 1000).toISOString();

/** A situação, ou `null` quando o estado não pôde ser lido. */
export async function situacaoDaLicenca(): Promise<SituacaoDaLicenca | null> {
  const veredito = await consultarPorta("tela");
  if (!veredito.decisao || !veredito.modo) return null;
  const { decisao } = veredito;
  return {
    estado: decisao.estado,
    opera: decisao.opera,
    mensagem: decisao.mensagem,
    diasRestantes: decisao.diasRestantes,
    modo: veredito.modo,
  };
}

/** A situação com os detalhes da página de licença, ou `null` quando o estado não pôde ser lido. */
export async function detalhesDaLicenca(): Promise<DetalhesDaLicenca | null> {
  const veredito = await consultarPorta("tela");
  if (!veredito.decisao || !veredito.modo) return null;
  const leitura = await garantirEstado();
  if (!leitura.ok) return null;
  const { decisao } = veredito;
  const { estado } = leitura;
  return {
    estado: decisao.estado,
    opera: decisao.opera,
    mensagem: decisao.mensagem,
    diasRestantes: decisao.diasRestantes,
    modo: veredito.modo,
    instalacaoId: estado.instalacaoId,
    ativada: estado.ativadaEm !== null,
    ultimaConsultaOkEm: isoDe(estado.ultimaConsultaOkEm),
    janelaTerminaEm: isoDe(estado.janelaTerminaEm),
    proximaConsultaEm: isoDe(estado.proximaConsultaEm),
    bloqueioCodigo: estado.bloqueio?.codigo ?? null,
    relogioRecuou: decisao.relogioRecuou,
  };
}

/**
 * O CLIENTE DE RENOVAÇÃO — mantém o selo da instalação em dia falando com o servidor de licenças.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seções 3.2 e 4. ADR-0005. Quem chama é a rota
 * de cron `licenca-renovar` (a cada poucos minutos) e, na parte 5 da Fase 1, o botão "tentar renovar agora".
 * O cron bate com frequência; é `proxima_consulta_em` (no banco) que decide se desta vez há conversa de verdade.
 *
 * ── O QUE CADA RESPOSTA FAZ ───────────────────────────────────────────────────
 *
 *  - 200 com selo que passa nas dez conferências → grava o selo novo e o lembrete da próxima consulta;
 *    limpa um bloqueio anterior (o servidor acabou de dizer que a licença vale). Se o selo é PERMANENTE, a
 *    instalação nunca mais consulta: o permanente funciona sem o servidor e não se revoga à distância.
 *  - 403 `licenca_bloqueada` / `instalacao_bloqueada` → grava o bloqueio (o código, nunca texto livre) SEM
 *    tocar no selo; a decisão é quem transforma isso em "não opera". Continua consultando de hora em hora,
 *    para que um desbloqueio chegue.
 *  - 401, 429, 5xx, rede fora, resposta torta, selo recusado → NÃO muda o estado. Uma falha do servidor ou
 *    da rede nunca bloqueia ninguém: o selo vigente segue valendo até vencer, e é o vencimento — não a falha —
 *    que leva a "autorização vencida por falta de contato". Tenta de novo com espera crescente (5 min até
 *    1 h), em memória: reiniciar o processo só adianta a próxima tentativa.
 *
 * ── A PORTA NÃO ENTRA AQUI ────────────────────────────────────────────────────
 *
 * A rota que chama isto NÃO consulta `guardaDeLicenca`: uma instalação vencida ou bloqueada precisa conseguir
 * se renovar, e uma porta que a recusasse tornaria o vencimento definitivo. É exceção declarada na cerca
 * `tests/unit/licenca-portas-chamam-a-decisao.test.ts`.
 *
 * ── O QUE NUNCA SAI PELA REDE ─────────────────────────────────────────────────
 *
 * Só `versao` e `dominio` no corpo e a credencial no cabeçalho (contrato, seção 5). Nada de conversa, contato
 * ou dado de cliente final — nem aqui, nem em log.
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { esperaAposFalha, proximaConsulta, type Aleatorio } from "./agenda";
import {
  garantirEstado,
  gravarBloqueio,
  gravarRenovacao,
  lerCredencial,
  type MotivoDoArmazem,
} from "./armazem";
import { chavesAceitas } from "./chaves";
import { decidir } from "./decidir";
import { agoraEfetivo } from "./estado";
import { esquecerDecisaoDaLicenca } from "./porta";
import { esquemaDaRenovacao, receberSelo } from "./recebimento";
import type { ChavePublica } from "./selo";
import { baseDoServidor, chamarServidor } from "./servidor";

/** Por que uma rodada deu em nada. */
export type MotivoDaFalha =
  | "estado_ilegivel"
  | "credencial_ilegivel"
  | "servidor_invalido"
  | "servidor_inalcancavel"
  | "servidor_recusou"
  | "resposta_invalida"
  | "selo_rejeitado"
  | "gravacao_falhou";

export type ResultadoDaRenovacao =
  | { readonly resultado: "renovada"; readonly tipo: "temporario" | "permanente" }
  | { readonly resultado: "bloqueada"; readonly codigo: string }
  | { readonly resultado: "nada_a_fazer"; readonly motivo: "nao_ativada" | "permanente" }
  | { readonly resultado: "adiada"; readonly ateSegundos: number }
  | { readonly resultado: "falhou"; readonly motivo: MotivoDaFalha };

export interface OpcoesDaRenovacao {
  /** O relógio local, em ms. Padrão `Date.now()`. */
  agoraMs?: number;
  /** "Tentar renovar agora": ignora o lembrete e a espera após falha. Não ignora o permanente. */
  forcar?: boolean;
  /** Chaves aceitas. Padrão: as da imagem (`chavesAceitas`). Só teste passa outra coisa. */
  chaves?: readonly ChavePublica[];
  /** Base da API. Padrão: `LICENCA_SERVIDOR_URL`, ou o endereço oficial. */
  servidor?: string;
  versao?: string;
  dominio?: string;
  aleatorio?: Aleatorio;
  fetchImpl?: typeof fetch;
}

/** O estado do cliente no processo: a espera depois de falhas seguidas. Não vai ao banco. */
let falhasSeguidas = 0;
let naoAntesDeMs = 0;
let emAndamento: Promise<ResultadoDaRenovacao> | null = null;

/** Esquece a espera após falha. Para testes e para o botão "tentar agora". */
export function esquecerFalhasDaRenovacao(): void {
  falhasSeguidas = 0;
  naoAntesDeMs = 0;
  emAndamento = null;
}

/** O nome do domínio desta instalação, sem esquema nem porta. Vazio se o ambiente não o diz. */
export function dominioDaInstalacao(): string {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).hostname;
  } catch {
    return "";
  }
}

export function versaoDaInstalacao(): string {
  return process.env.APP_VERSION || "desconhecida";
}

function motivoDeLeitura(motivo: MotivoDoArmazem): MotivoDaFalha {
  return motivo === "sem_chave_de_cifra" ? "credencial_ilegivel" : "estado_ilegivel";
}

/**
 * Uma rodada do cliente. Nunca lança. Duas chamadas simultâneas no mesmo processo (o cron e o botão) viram
 * uma só conversa com o servidor.
 */
export function renovarLicenca(opcoes: OpcoesDaRenovacao = {}): Promise<ResultadoDaRenovacao> {
  if (emAndamento) return emAndamento;
  const rodada: Promise<ResultadoDaRenovacao> = rodar(opcoes)
    .catch((erro: unknown): ResultadoDaRenovacao => {
      logger.warn("licenca: a renovação falhou de forma inesperada", {
        erro: erro instanceof Error ? erro.name : "desconhecido",
      });
      return { resultado: "falhou", motivo: "estado_ilegivel" };
    })
    .finally(() => {
      if (emAndamento === rodada) emAndamento = null;
    });
  emAndamento = rodada;
  return rodada;
}

function registrarFalha(
  motivo: MotivoDaFalha,
  agoraMs: number,
  aleatorio: Aleatorio | undefined,
  retryAfterS: number | null,
  contexto: Record<string, unknown> = {},
): ResultadoDaRenovacao {
  falhasSeguidas += 1;
  const espera = esperaAposFalha(falhasSeguidas, retryAfterS, aleatorio);
  naoAntesDeMs = agoraMs + espera * 1000;
  logger.warn("licenca: renovação não concluída — o estado não mudou", {
    motivo,
    falhas_seguidas: falhasSeguidas,
    nova_tentativa_em_s: espera,
    ...contexto,
  });
  return { resultado: "falhou", motivo };
}

async function rodar(opcoes: OpcoesDaRenovacao): Promise<ResultadoDaRenovacao> {
  const agoraMs = opcoes.agoraMs ?? Date.now();
  const relogio = Math.floor(agoraMs / 1000);
  const chaves =
    opcoes.chaves ?? chavesAceitas({ producao: process.env.NODE_ENV === "production", extras: [] });

  const leitura = await garantirEstado();
  if (!leitura.ok) return registrarFalha("estado_ilegivel", agoraMs, opcoes.aleatorio, null);
  const { estado } = leitura;
  const { agora } = agoraEfetivo(relogio, estado.maiorHorarioVisto);

  // O permanente vale sem o servidor e não se revoga: depois dele, a instalação para de perguntar.
  const decisao = await decidir(estado, relogio, { chaves });
  if (decisao.estado === "permanente_valido") {
    return { resultado: "nada_a_fazer", motivo: "permanente" };
  }

  const credencial = await lerCredencial();
  if (!credencial.ok) {
    if (credencial.motivo === "sem_credencial") {
      return { resultado: "nada_a_fazer", motivo: "nao_ativada" };
    }
    return registrarFalha(motivoDeLeitura(credencial.motivo), agoraMs, opcoes.aleatorio, null);
  }

  if (!opcoes.forcar) {
    if (naoAntesDeMs > agoraMs) {
      return { resultado: "adiada", ateSegundos: Math.ceil(naoAntesDeMs / 1000) };
    }
    if (estado.proximaConsultaEm !== null && agora < estado.proximaConsultaEm) {
      return { resultado: "adiada", ateSegundos: estado.proximaConsultaEm };
    }
  }

  const base = baseDoServidor(opcoes.servidor ?? env.LICENCA_SERVIDOR_URL);
  if (!base) return registrarFalha("servidor_invalido", agoraMs, opcoes.aleatorio, null);

  const resposta = await chamarServidor({
    base,
    rota: "/licenca/renovar",
    credencial: credencial.credencial,
    corpo: {
      versao: opcoes.versao ?? versaoDaInstalacao(),
      dominio: opcoes.dominio ?? dominioDaInstalacao(),
    },
    esquema: esquemaDaRenovacao,
    ...(opcoes.fetchImpl ? { fetchImpl: opcoes.fetchImpl } : {}),
  });

  if (!resposta.ok) {
    const { falha } = resposta;
    if (falha.tipo === "rede") {
      return registrarFalha("servidor_inalcancavel", agoraMs, opcoes.aleatorio, null);
    }
    if (falha.tipo === "resposta_invalida") {
      return registrarFalha("resposta_invalida", agoraMs, opcoes.aleatorio, null, {
        status: falha.status,
      });
    }
    if (
      falha.status === 403 &&
      (falha.codigo === "licenca_bloqueada" || falha.codigo === "instalacao_bloqueada")
    ) {
      // O bloqueio não é falha: o servidor respondeu. Vale o MOTIVO (código) quando veio, senão o do erro.
      const codigo = falha.motivoCodigo ?? falha.codigo;
      const proxima = proximaConsulta(agora, null, opcoes.aleatorio);
      const gravado = await gravarBloqueio(codigo, agora, proxima);
      esquecerDecisaoDaLicenca();
      if (!gravado.ok) {
        return registrarFalha("gravacao_falhou", agoraMs, opcoes.aleatorio, null, {
          gravacao: gravado.motivo,
        });
      }
      falhasSeguidas = 0;
      naoAntesDeMs = 0;
      logger.warn("licenca: o servidor respondeu bloqueio", { codigo });
      return { resultado: "bloqueada", codigo };
    }
    // 401 (credencial que o servidor não reconhece), 429, 5xx: nada muda, tenta de novo mais tarde.
    return registrarFalha("servidor_recusou", agoraMs, opcoes.aleatorio, falha.retryAfterS, {
      status: falha.status,
      codigo: falha.codigo,
    });
  }

  const recebimento = await receberSelo(resposta.dados, {
    chaves,
    instalacaoId: estado.instalacaoId,
    agora,
    aleatorio: opcoes.aleatorio,
  });
  if (!recebimento.ok) {
    return registrarFalha("selo_rejeitado", agoraMs, opcoes.aleatorio, null, {
      motivo_do_selo: recebimento.motivo,
    });
  }
  const { recebido } = recebimento;

  const gravado = await gravarRenovacao({
    selo: recebido.texto,
    agora: recebido.agora,
    janelaTerminaEm: recebido.janelaTerminaEm,
    proximaConsultaEm: recebido.proximaConsultaEm,
  });
  esquecerDecisaoDaLicenca();
  if (!gravado.ok) {
    return registrarFalha("gravacao_falhou", agoraMs, opcoes.aleatorio, null, {
      gravacao: gravado.motivo,
    });
  }
  falhasSeguidas = 0;
  naoAntesDeMs = 0;
  return { resultado: "renovada", tipo: recebido.selo.tipo };
}

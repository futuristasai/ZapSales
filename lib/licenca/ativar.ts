/**
 * A ATIVAÇÃO — a primeira vez que a instalação se apresenta ao servidor de licenças.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 3.1. Quem chama é o kit de instalação
 * (Fase 3 do licenciamento): o comprador informa o e-mail e o código da compra, e a instalação troca isso por
 * uma credencial (`zpl_…`, mostrada UMA vez) e o primeiro selo.
 *
 * Tudo o que vale para a renovação vale aqui (`renovar.ts`): o selo só é gravado depois de conferido, o corpo
 * leva só o que o contrato autoriza, e uma falha de rede nunca vira um estado novo. A diferença é que aqui o
 * resultado inclui a RECUSA, com o código do servidor, porque quem está na frente da tela precisa saber se a
 * compra não foi achada, ainda não foi aprovada ou foi bloqueada — a renovação, que roda sozinha, não precisa.
 *
 * A credencial e o e-mail não vão para log.
 */
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import type { Aleatorio } from "./agenda";
import { garantirEstado, gravarAtivacao } from "./armazem";
import { chavesAceitas } from "./chaves";
import { agoraEfetivo } from "./estado";
import { esquecerDecisaoDaLicenca } from "./porta";
import { esquemaDaAtivacao, receberSelo } from "./recebimento";
import { dominioDaInstalacao, versaoDaInstalacao } from "./renovar";
import type { ChavePublica } from "./selo";
import { baseDoServidor, chamarServidor } from "./servidor";

export interface DadosDaCompra {
  /** O e-mail da compra. O servidor normaliza (minúsculas, sem espaços). */
  email: string;
  /** O código da transação, formato `HP…`. */
  codigoTransacao: string;
}

export type ResultadoDaAtivacao =
  | { readonly resultado: "ativada"; readonly tipo: "temporario" | "permanente" }
  /** O servidor disse não, com o código do contrato: `compra_nao_encontrada`, `licenca_bloqueada`, … */
  | { readonly resultado: "recusada"; readonly codigo: string; readonly status: number }
  | {
      readonly resultado: "falhou";
      readonly motivo:
        | "estado_ilegivel"
        | "servidor_invalido"
        | "servidor_inalcancavel"
        | "resposta_invalida"
        | "selo_rejeitado"
        | "gravacao_falhou";
    };

export interface OpcoesDaAtivacao {
  agoraMs?: number;
  chaves?: readonly ChavePublica[];
  servidor?: string;
  versao?: string;
  dominio?: string;
  /** Repetir a ativação da mesma compra com a mesma chave não duplica nada no servidor. */
  idempotencyKey?: string;
  aleatorio?: Aleatorio;
  fetchImpl?: typeof fetch;
}

export async function ativarLicenca(
  compra: DadosDaCompra,
  opcoes: OpcoesDaAtivacao = {},
): Promise<ResultadoDaAtivacao> {
  try {
    const agoraMs = opcoes.agoraMs ?? Date.now();
    const chaves =
      opcoes.chaves ??
      chavesAceitas({ producao: process.env.NODE_ENV === "production", extras: [] });

    const leitura = await garantirEstado();
    if (!leitura.ok) return { resultado: "falhou", motivo: "estado_ilegivel" };
    const { estado } = leitura;

    const base = baseDoServidor(opcoes.servidor ?? env.LICENCA_SERVIDOR_URL);
    if (!base) return { resultado: "falhou", motivo: "servidor_invalido" };

    const resposta = await chamarServidor({
      base,
      rota: "/licenca/ativar",
      corpo: {
        email: compra.email,
        codigo_transacao: compra.codigoTransacao,
        instalacao_id: estado.instalacaoId,
        versao: opcoes.versao ?? versaoDaInstalacao(),
        dominio: opcoes.dominio ?? dominioDaInstalacao(),
      },
      esquema: esquemaDaAtivacao,
      idempotencyKey: opcoes.idempotencyKey ?? randomUUID(),
      ...(opcoes.fetchImpl ? { fetchImpl: opcoes.fetchImpl } : {}),
    });
    if (!resposta.ok) {
      const { falha } = resposta;
      if (falha.tipo === "rede") return { resultado: "falhou", motivo: "servidor_inalcancavel" };
      if (falha.tipo === "resposta_invalida") {
        return { resultado: "falhou", motivo: "resposta_invalida" };
      }
      return { resultado: "recusada", codigo: falha.codigo, status: falha.status };
    }

    const { agora } = agoraEfetivo(Math.floor(agoraMs / 1000), estado.maiorHorarioVisto);
    const recebimento = await receberSelo(resposta.dados, {
      chaves,
      instalacaoId: estado.instalacaoId,
      agora,
      aleatorio: opcoes.aleatorio,
    });
    if (!recebimento.ok) {
      logger.warn("licenca: o selo da ativação foi recusado", {
        motivo_do_selo: recebimento.motivo,
      });
      return { resultado: "falhou", motivo: "selo_rejeitado" };
    }
    const { recebido } = recebimento;

    const gravado = await gravarAtivacao({
      credencial: resposta.dados.credencial,
      selo: recebido.texto,
      agora: recebido.agora,
      janelaTerminaEm: recebido.janelaTerminaEm,
      proximaConsultaEm: recebido.proximaConsultaEm,
    });
    esquecerDecisaoDaLicenca();
    if (!gravado.ok) {
      logger.warn("licenca: a ativação não pôde ser gravada", { motivo: gravado.motivo });
      return { resultado: "falhou", motivo: "gravacao_falhou" };
    }
    return { resultado: "ativada", tipo: recebido.selo.tipo };
  } catch (erro) {
    logger.warn("licenca: a ativação falhou de forma inesperada", {
      erro: erro instanceof Error ? erro.name : "desconhecido",
    });
    return { resultado: "falhou", motivo: "estado_ilegivel" };
  }
}

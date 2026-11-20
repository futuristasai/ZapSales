/**
 * A CHAMADA de uma ferramenta de API (issue #372): monta o pedido, passa pela rede segura
 * única, respeita prazo e tamanho, repete só a consulta e devolve o resultado como DADO.
 *
 * É o irmão de `../chamar.ts` (webhook) e de `../mcp/cliente.ts` (servidor MCP), e devolve o
 * MESMO `ResultadoDaChamada` — então o pedido, a auditoria, a Central e o que o modelo lê são
 * os de sempre. O que muda é o que sai: o método, o endereço e o corpo que a API do outro
 * sistema espera, com a credencial dela no cabeçalho, em vez do envelope assinado do webhook.
 *
 * Nunca lança: todo desfecho é um `ResultadoDaChamada`.
 */
import { buscarSeguro, type PoliticaDeDestino } from "@/lib/net/rede-segura";

import { conteudoDeTexto, motivoDoErro, motivoDoStatus, type DependenciasDaChamada, type ResultadoDaChamada } from "../chamar";
import { LIMITES_DA_CHAMADA, MOTIVOS_DE_FALHA_CERTA, type EfeitoDaFerramenta, type MotivoDeFalha } from "../tipos";
import { montarPedido, type ResumoDoPedido } from "./montagem";
import { selecionarCamposDaResposta } from "./resposta";
import type { ContatoDaConversa, DestinoApi } from "./tipos";

export interface EntradaDaChamadaDeApi {
  /** O endereço-modelo que a pessoa cadastrou (com os marcadores). */
  urlModelo: string;
  efeito: EfeitoDaFerramenta;
  api: DestinoApi;
  /** A credencial em claro, ou `null` (API sem credencial, ou credencial que não pôde ser lida). */
  credencial: string | null;
  /** O que o agente preencheu, JÁ validado contra os campos da ferramenta. */
  argumentos: Record<string, unknown>;
  /** Os dados do contato da conversa, lidos pelo sistema. */
  contato?: ContatoDaConversa;
  /** O id do pedido aprovado: vai como `Idempotency-Key`. */
  idDeEntrega?: string;
}

/** O resultado, mais o que a tela de teste mostra do que foi enviado (sem credencial). */
export type ResultadoDaChamadaDeApi = ResultadoDaChamada & { enviado?: ResumoDoPedido };

export async function chamarApi(
  entrada: EntradaDaChamadaDeApi,
  deps: DependenciasDaChamada = {},
): Promise<ResultadoDaChamadaDeApi> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const falhou = (motivo: MotivoDeFalha, tentativas: number, httpStatus: number | null = null): ResultadoDaChamada => ({
    ok: false,
    motivo,
    httpStatus,
    tentativas,
    duracaoMs: agora() - inicio,
    desfechoIncerto: !MOTIVOS_DE_FALHA_CERTA.has(motivo),
  });

  // Há credencial gravada e ela não pôde ser lida: falha fechada. Chamar «sem autenticação» uma
  // API que exige credencial só produziria um 401 — ou, pior, uma resposta pública diferente.
  if (entrada.api.config.credencial.tipo !== "nenhuma" && (!entrada.api.temCredencial || !entrada.credencial)) {
    return falhou("segredo_indisponivel", 0);
  }

  const montado = montarPedido({
    urlModelo: entrada.urlModelo,
    config: entrada.api.config,
    argumentos: entrada.argumentos,
    contato: entrada.contato ?? {},
    credencial: entrada.credencial,
    ...(entrada.idDeEntrega ? { idDeEntrega: entrada.idDeEntrega } : {}),
  });
  if (!montado.ok) {
    return falhou(montado.motivo === "dado_do_contato_nao_liberado" ? "bloqueada_pela_seguranca" : "pedido_invalido", 0);
  }
  const { pedido, resumo } = montado;

  const politica: PoliticaDeDestino = deps.politica ?? { permitirHttp: process.env.NODE_ENV !== "production" };
  // Consulta repete uma vez. Ação que ALTERA não repete nunca: o prazo estourado ou o 5xx não
  // dizem se o outro sistema já fez — repetir poderia criar o pedido duas vezes.
  const teto = entrada.efeito === "altera" ? 1 : LIMITES_DA_CHAMADA.tentativasDaConsulta;

  let ultimo: { motivo: MotivoDeFalha; httpStatus: number | null } = { motivo: "rede", httpStatus: null };
  for (let tentativa = 1; tentativa <= teto; tentativa++) {
    let repetivel: boolean;
    try {
      const res = await buscarSeguro(pedido.url, {
        ...politica,
        metodo: pedido.metodo,
        headers: pedido.headers,
        ...(pedido.corpo !== null ? { corpo: pedido.corpo } : {}),
        timeoutMs: deps.timeoutMs ?? LIMITES_DA_CHAMADA.timeoutMs,
        maxBytes: LIMITES_DA_CHAMADA.maxBytesDaResposta,
        // Sem `maxRedirecionamentos`: um 3xx volta como resposta e vira falha. A credencial não
        // vai atrás de um endereço que ninguém cadastrou.
      });
      if (res.status >= 200 && res.status < 300) {
        const selecionado = selecionarCamposDaResposta(res.corpo.toString("utf8"), entrada.api.config.campos_resposta);
        const { texto, truncado } = conteudoDeTexto(selecionado);
        return {
          ok: true,
          httpStatus: res.status,
          conteudo: texto,
          truncado,
          tentativas: tentativa,
          duracaoMs: agora() - inicio,
          enviado: resumo,
        };
      }
      // A API recusou a credencial: nada foi feito, e repetir daria a mesma resposta.
      const falha =
        res.status === 401 || res.status === 403
          ? { motivo: "credencial_recusada" as const, repetivel: false }
          : motivoDoStatus(res.status);
      ultimo = { motivo: falha.motivo, httpStatus: res.status };
      repetivel = falha.repetivel;
    } catch (err) {
      const falha = motivoDoErro(err);
      ultimo = { motivo: falha.motivo, httpStatus: null };
      repetivel = falha.repetivel;
    }
    if (!repetivel || tentativa === teto) return { ...falhou(ultimo.motivo, tentativa, ultimo.httpStatus), enviado: resumo };
    await dormir(LIMITES_DA_CHAMADA.esperaEntreTentativasMs);
  }
  return { ...falhou(ultimo.motivo, teto, ultimo.httpStatus), enviado: resumo };
}

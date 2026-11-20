/**
 * O QUE O AGENTE LÊ da resposta de uma API (issue #372) — a opção «campos da resposta».
 *
 * Uma API de e-commerce devolve páginas de dados para responder «onde está o pedido»: o agente
 * leria os primeiros 4.000 caracteres de ruído, a conversa ficaria mais cara e ele receberia
 * dados que não precisa ver (minimização). Com os caminhos escolhidos, só eles chegam.
 *
 * Pura e tolerante: resposta que não é JSON, ou caminho que não existe, nunca lança — o que
 * não dá para selecionar segue como veio, e quem corta o tamanho é `conteudoDeTexto`.
 */
import { LIMITES_DA_API } from "./tipos";

/** `cliente.nome`, `itens.0.titulo`. Letras, números, `_`, `-` e ponto entre os trechos. */
export const CAMINHO_DA_RESPOSTA = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

function pegar(no: unknown, trechos: readonly string[]): unknown {
  if (trechos.length === 0) return no;
  if (no === null || typeof no !== "object") return undefined;
  const [trecho, ...resto] = trechos as [string, ...string[]];
  if (Array.isArray(no)) {
    // Um índice pega o item; um nome percorre a lista (limitada) e pega o campo de cada item.
    if (/^\d+$/.test(trecho)) return pegar(no[Number(trecho)], resto);
    const itens = no
      .slice(0, LIMITES_DA_API.itensDeLista)
      .map((item) => pegar(item, trechos))
      .filter((item) => item !== undefined);
    return itens.length > 0 ? itens : undefined;
  }
  // Só chave PRÓPRIA: `constructor`, `__proto__` e companhia não são dado da resposta.
  if (!Object.prototype.hasOwnProperty.call(no, trecho)) return undefined;
  return pegar((no as Record<string, unknown>)[trecho], resto);
}

/**
 * A resposta reduzida aos caminhos escolhidos, como JSON compacto `{ "caminho": valor }`.
 * Sem caminhos, ou com resposta que não é JSON, devolve o texto como veio.
 */
export function selecionarCamposDaResposta(conteudo: string, caminhos: readonly string[]): string {
  const validos = caminhos.filter((c) => CAMINHO_DA_RESPOSTA.test(c));
  if (validos.length === 0) return conteudo;
  let lido: unknown;
  try {
    lido = JSON.parse(conteudo);
  } catch {
    return conteudo;
  }
  const saida: Record<string, unknown> = {};
  for (const caminho of validos) {
    const valor = pegar(lido, caminho.split("."));
    if (valor !== undefined) saida[caminho] = valor;
  }
  return JSON.stringify(saida);
}

import type { ResultadoDaBusca } from "./menu";

/**
 * A BUSCA DA NAVEGAÇÃO (⌘K), como função pura (issue #187).
 *
 * Uma tela é achada por tudo o que a pessoa pode usar para chamá-la: o NOME que
 * o menu mostra, o NOME ANTIGO (`sinonimos`), o TERMO TÉCNICO que fica embaixo do
 * nome, a DESCRIÇÃO e o lugar do menu em que mora (a área ou o bloco). O técnico que digita "webhook" e o antigo usuário
 * que digita "Inbox" chegam à mesma tela, sem ninguém precisar saber como o
 * catálogo guarda isso.
 *
 * Achar não é autorizar: quem decide o que entra na lista é `buscaveis()` (papel,
 * módulos, interface por empresa). Aqui só se filtra o que já é visível.
 */

/** Sem acento e sem caixa: ninguém digita "orçamento" com cedilha às pressas. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * `termo` já vem normalizado (`normalizarBusca`) e aparado; vazio casa com tudo.
 *
 * `traduzir`, quando dado, soma ao texto buscável o que a pessoa VÊ na língua
 * dela: quem escolheu espanhol e digita "clave" precisa achar a "Clave de la IA".
 * Vale também para o NOME ANTIGO: quem via "Credentials" no menu
 * continua digitando "Credentials". O português continua valendo sempre — um
 * sinônimo sem tradução é devolvido como está.
 */
export function casaComABusca(
  destino: Pick<ResultadoDaBusca, "label" | "description" | "termo" | "sinonimos">,
  termo: string,
  rotuloDoLugar: string,
  traduzir: (texto: string) => string = (texto) => texto,
): boolean {
  if (!termo) return true;
  const tecnico = destino.termo ?? "";
  const sinonimos = destino.sinonimos ?? [];
  return normalizarBusca(
    [
      destino.label,
      traduzir(destino.label),
      tecnico,
      tecnico && traduzir(tecnico),
      destino.description,
      traduzir(destino.description),
      rotuloDoLugar,
      ...sinonimos,
      ...sinonimos.map(traduzir),
    ].join(" "),
  ).includes(termo);
}

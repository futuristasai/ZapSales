import type { NavDestination } from "./registry";

/**
 * A DICA de uma tela no menu (o `title` que o navegador mostra ao passar o mouse).
 *
 * Diz o nome, o termo técnico entre parênteses e a frase do que a tela faz, para
 * tirar a dúvida sem entrar nela (issue #187): "Avisar outros sistemas (webhooks) —
 * Avise outros sistemas quando algo acontecer aqui dentro."
 *
 * `traduzir` é o `t` do idioma da pessoa; o texto vem do catálogo em português.
 */
export function dicaDoDestino(
  destino: Pick<NavDestination, "label" | "description" | "menu">,
  traduzir: (texto: string) => string,
): string {
  const nome = traduzir(destino.label);
  const termo = destino.menu.termo ? ` (${traduzir(destino.menu.termo)})` : "";
  return `${nome}${termo} — ${traduzir(destino.description)}`;
}

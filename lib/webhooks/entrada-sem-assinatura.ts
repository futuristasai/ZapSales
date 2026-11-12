/**
 * O que uma entrada de lead SEM ASSINATURA pode afirmar sobre um contato que
 * já existe (#270).
 *
 * Uma fonte de captação sem segredo é um endereço público: o token vai no HTML
 * da página, e qualquer pessoa pode montar um envio com o telefone de quem
 * quiser. O envio não prova que foi o dono do telefone quem preencheu.
 *
 * Por isso há uma assimetria, e ela é de propósito:
 *
 *   - RECUSAR sempre vale. Errar para o lado da recusa custa uma mensagem que
 *     não foi enviada.
 *   - CONCEDER, por entrada sem assinatura, não desfaz o "não" que o contato já
 *     deu — nem o pedido de saída (`is_blocked`). Errar para este lado é falar
 *     com quem pediu para não ser procurado, com base no que um terceiro digitou.
 *
 * Contato novo, ou contato que nunca recusou, segue como sempre: o formulário é
 * justamente o lugar onde a pessoa concede.
 *
 * Fonte COM assinatura conferida não passa por esta régua: quem assina é o
 * sistema do cliente, e é ele quem responde pelo que afirma.
 */

export interface EstadoDoContato {
  /** `recusouMarketing(contact.consent)` — há `declined_at` gravado. */
  recusouMarketing: boolean;
  /** `contacts.is_blocked` — pediu para sair, por palavra ou por ato do admin. */
  bloqueado: boolean;
}

/** O contato disse "não" de algum jeito que uma entrada sem assinatura não desfaz? */
export function contatoDisseNao(contato: EstadoDoContato | null): boolean {
  return contato !== null && (contato.recusouMarketing || contato.bloqueado);
}

/**
 * Este envio pode gravar o consentimento que afirma, num contato que JÁ existia?
 *
 * `contato === null` = não foi possível ler o estado atual. Para uma concessão
 * sem assinatura isso recusa: sem saber se havia um "não", não se grava "sim".
 */
export function podeGravarConsentimento(input: {
  concede: boolean;
  fonteAssinada: boolean;
  contato: EstadoDoContato | null;
}): boolean {
  if (!input.concede) return true;
  if (input.fonteAssinada) return true;
  if (input.contato === null) return false;
  return !contatoDisseNao(input.contato);
}

/**
 * Este envio pode autorizar a IA a atender o contato? Contato que nasceu neste
 * envio não tem "não" anterior (`contato` é o estado de quem JÁ existia; passe
 * `"novo"` para o recém-criado).
 */
export function podeAutorizarIA(input: {
  fonteAssinada: boolean;
  contato: EstadoDoContato | null | "novo";
}): boolean {
  if (input.fonteAssinada) return true;
  if (input.contato === "novo") return true;
  if (input.contato === null) return false;
  return !contatoDisseNao(input.contato);
}

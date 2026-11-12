/**
 * QUAL mensagem um aviso de "editada" ou "apagada" pode alterar (#274).
 *
 * O aviso traz o id da mensagem ORIGINAL (`editedMessageId` / `revokedMessageId`).
 * Casar só por esse id, dentro da organização, deixava um aviso vindo de UM
 * número alterar a mensagem de OUTRO número da mesma empresa, e deixava um
 * aviso de quem RECEBEU alterar o que a empresa ENVIOU — bastava o id.
 *
 * O WhatsApp só deixa o autor editar ou apagar a própria mensagem, e cada aviso
 * chega pela sessão do número que a trocou. São esses dois fatos que o filtro
 * passa a exigir:
 *
 *   - a SESSÃO: a mensagem é do mesmo número que recebeu o aviso (quem aplica
 *     isso é o chamador, com `channel_session_id`);
 *   - o AUTOR: aviso de mensagem "minha" (`fromMe`) só alcança mensagem enviada;
 *     aviso de mensagem do contato só alcança mensagem recebida.
 *
 * De onde sai o autor, em ordem: o prefixo do id composto da original
 * (`true_<chat>_<id>` / `false_<chat>_<id>` — é o dado mais próximo da
 * mensagem), e só então o `fromMe` do aviso. Sem nenhum dos dois o lado fica
 * DESCONHECIDO e não entra no filtro: recusar a edição legítima de um engine
 * que não manda o campo seria trocar um defeito por outro.
 */
import { bareWaMessageId } from "@/lib/waha/message-id";

export interface AlvoDoAviso {
  /** O id cru, como `messages.external_id` o guarda. */
  externalId: string;
  /** `null` = o aviso não diz de quem era a mensagem. */
  direction: "inbound" | "outbound" | null;
}

export function alvoDoAviso(idDaOriginal: unknown, fromMe: unknown): AlvoDoAviso | null {
  if (typeof idDaOriginal !== "string" || idDaOriginal === "") return null;
  const externalId = bareWaMessageId(idDaOriginal);
  if (!externalId) return null;

  let minha: boolean | null = null;
  if (idDaOriginal.startsWith("true_")) minha = true;
  else if (idDaOriginal.startsWith("false_")) minha = false;
  else if (typeof fromMe === "boolean") minha = fromMe;

  return { externalId, direction: minha === null ? null : minha ? "outbound" : "inbound" };
}

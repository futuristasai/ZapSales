/**
 * A RECUSA da licença em HTTP — o que cada porta devolve quando `consultarPorta` manda recusar.
 *
 * `guardaDeLicenca(porta)` é o que as rotas chamam: devolve `null` quando a instalação opera (ou
 * quando o modo é `sombra`, o padrão) e a resposta de recusa quando não. É a guarda que a cerca
 * `tests/unit/licenca-portas-chamam-a-decisao.test.ts` cobra nos crons e nos webhooks — o mesmo
 * desenho de `requireSupportWrite`.
 *
 * Status por porta, e a razão de cada um:
 *  - `cron` e `webhook` → 503 com `Retry-After`. Quem chama (o agendador, o provedor do canal) trata 503 como
 *    "tente de novo", e é o que queremos: nada é perdido, só adiado até a licença voltar. Um 4xx faria
 *    o remetente desistir (um provedor chega a desativar a assinatura do webhook).
 *  - `api_token` e `proxy` → 403, porque quem chama é uma pessoa ou uma integração que precisa
 *    entender que a licença é o problema, não que o servidor está caindo.
 */
import { NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";

import { consultarPorta, type PortaDaLicenca, type VereditoDaPorta } from "./porta";

/** Tempo, em segundos, que o remetente deve esperar antes de tentar de novo (cron e webhook). */
const RETRY_AFTER_S = 300;

export const MENSAGEM_DA_RECUSA =
  "License blocked or expired. Renew it on the license screen to resume.";

export function respostaDeRecusa(
  porta: PortaDaLicenca,
  veredito: VereditoDaPorta,
  requestId?: string,
) {
  const retentavel = porta === "cron" || porta === "webhook";
  return fail("license_blocked", MENSAGEM_DA_RECUSA, retentavel ? 503 : 403, {
    ...(requestId ? { requestId } : {}),
    details: { state: veredito.decisao?.estado ?? null },
    ...(retentavel ? { headers: { "Retry-After": String(RETRY_AFTER_S) } } : {}),
  });
}

/**
 * `null` = pode trabalhar. Resposta = devolva-a e não faça o trabalho. Nunca lança.
 *
 * ```ts
 * const bloqueio = await guardaDeLicenca("cron", requestId);
 * if (bloqueio) return bloqueio;
 * ```
 */
export async function guardaDeLicenca(porta: PortaDaLicenca, requestId?: string) {
  const veredito = await consultarPorta(porta);
  return veredito.aplicar ? respostaDeRecusa(porta, veredito, requestId) : null;
}

/** O caminho da tela de licença: a única tela que uma instalação barrada continua alcançando. */
export const CAMINHO_DA_TELA_DE_LICENCA = "/app/licenca";

/**
 * A recusa para quem está numa TELA.
 *
 * Quem NAVEGA (GET/HEAD) vai para a tela de licença (`/licenca`), que explica o que aconteceu, mostra a
 * situação e oferece o "tentar renovar agora" — é a saída de quem está barrado. O redirecionamento é
 * temporário (307): amanhã a licença volta, e o endereço original tem de voltar a abrir.
 *
 * Quem NÃO navega (um POST de ação de tela, por exemplo) recebe a página mínima 403: uma resposta de
 * redirecionamento a um POST faria o navegador repeti-lo noutro lugar, e a ação não deve rodar nem ser
 * levada adiante. Texto fixo e sem componente, de propósito: o produto inteiro está barrado, então ela não
 * pode depender de i18n nem de banco.
 */
export function respostaDeRecusaDaTela(
  requestId: string,
  pedido?: { readonly method: string; readonly url: string },
) {
  if (pedido && (pedido.method === "GET" || pedido.method === "HEAD")) {
    return NextResponse.redirect(new URL(CAMINHO_DA_TELA_DE_LICENCA, pedido.url), {
      status: 307,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Licença</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">Licença bloqueada ou vencida</h1><p>Esta instalação não está autorizada a operar neste momento. Os seus dados estão preservados e a exportação continua disponível.</p><p>Fale com quem forneceu este sistema para regularizar a licença.</p><p lang="en" style="color:#555">License blocked or expired. Your data is preserved and export remains available.</p></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-request-id": requestId,
      "cache-control": "no-store",
    },
  });
}

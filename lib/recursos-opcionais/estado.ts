/**
 * As LEITURAS que o catálogo de recursos opcionais consome — só servidor.
 *
 * Separado de `catalogo.ts` porque aqui entram banco, `.env` e credencial: o
 * catálogo fica puro e testável, e é só este arquivo que sabe de onde vem cada
 * resposta. Toda leitura reusa o detector que a tela do próprio recurso já usa
 * — nenhuma regra nova de "está configurado".
 *
 * ⚠️ NENHUM VALOR DE SEGREDO SAI DAQUI. Só booleanos: "configurado" ou não.
 *
 * Nunca lança. Uma fonte que falha vira `null`, e o catálogo a mostra como
 * "Não consegui ler agora" — nunca como "desligado".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { googleEstaConfigurado } from "@/lib/agenda/google/config";
import { modoDeCadastro } from "@/lib/auth/politica-de-cadastro";
import { marcaEhADoProduto } from "@/lib/branding";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDaInstalacao, camadaDoAmbiente, resolverMarca } from "@/lib/branding/resolve";
import { appDaMeta } from "@/lib/channels/meta/app";
import { emailConfigurado } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";
import { vapidPronto } from "@/lib/notifications/vapid";
import { googleAdsEstaConfigurado } from "@/lib/plataformas-de-anuncio/google/config";
import { getWacallsClient } from "@/lib/wacalls/client";

import type { FontesDeEstado } from "./catalogo";

async function detectar(
  id: string,
  ler: () => boolean | Promise<boolean>,
): Promise<[string, boolean | null]> {
  try {
    return [id, await ler()];
  } catch (erro) {
    logger.warn("recursos opcionais: detecção falhou — a tela mostra 'não consegui ler'", {
      recurso: id,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return [id, null];
  }
}

/**
 * O que o servidor tem configurado, por `id` do catálogo.
 *
 * `marca` e `cadastro` (issue #308) moram no banco da instalação, e não no `.env`, mas a
 * pergunta é a mesma — "isto está decidido nesta instalação?" — e o checklist do Painel
 * e a tela de Recursos opcionais leem as duas daqui, pelo mesmo `peloServidor`.
 */
export async function detectarServidor(): Promise<Record<string, boolean | null>> {
  const pares = await Promise.all([
    detectar("email", emailConfigurado),
    detectar("google_agenda", googleEstaConfigurado),
    detectar("meta", async () => {
      const app = await appDaMeta();
      return Boolean(app.appSecret && app.verifyToken);
    }),
    detectar("voz_whatsapp", () => getWacallsClient() !== null),
    detectar("google_ads", () => googleAdsEstaConfigurado()),
    detectar("web_push", vapidPronto),
    detectar("transcricao", () => env.TRANSCRIPTION_BASE_URL.trim().length > 0),
    // A MESMA resolução do layout raiz (`app/layout.tsx`): banco acima do `.env`.
    detectar("marca", async () => {
      const marca = resolverMarca(
        [camadaDaInstalacao(await marcaDaInstalacao()), camadaDoAmbiente(env)],
        REGUA_DO_PRODUTO,
      );
      return !marcaEhADoProduto(marca);
    }),
    // Há sempre um modo em vigor; ler o modo é a prova de que a decisão existe.
    detectar("cadastro", async () => Boolean(await modoDeCadastro())),
  ]);
  return Object.fromEntries(pares);
}

/** Fontes da tela da empresa. `organizationId` vem da SESSÃO, nunca da requisição. */
export async function fontesDaEmpresa(
  db: SupabaseClient,
  organizationId: string,
): Promise<FontesDeEstado> {
  const [modulos, settings] = await Promise.all([
    // ponytail: `modulosLigados` falha fechada (erro de banco = nenhum módulo) e não
    // distingue "desligado" de "não li". Para a tela que só informa, isso vira
    // "desligado"; separar os dois pede mudar o contrato dele, e não é deste PR.
    modulosLigados(db),
    (async (): Promise<FontesDeEstado["settings"]> => {
      try {
        const { data, error } = await db
          .from("organizations")
          .select("settings")
          .eq("id", organizationId)
          .maybeSingle();
        if (error || !data) return null;
        const s = (data as { settings?: unknown }).settings;
        return s && typeof s === "object" && !Array.isArray(s)
          ? (s as Record<string, unknown>)
          : {};
      } catch {
        return null;
      }
    })(),
  ]);
  return { modulos, settings, servidor: {} };
}

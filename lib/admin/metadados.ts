import "server-only";

import type { Metadata } from "next";

import { loadAuthUser } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";

import { itemDoAdmin } from "./catalogo";

/**
 * O título da aba de uma tela da área de administração, no idioma de quem a abre
 * (issue #308, história 15). Uso: `export const generateMetadata = metadadosDaTelaDoAdmin("/admin/x")`.
 *
 * O sufixo com a marca vem do `template` do layout raiz (`app/layout.tsx`); aqui
 * entra só "<tela> · Administração". `loadAuthUser` é `cache()` do React: a mesma
 * leitura serve a página na mesma requisição, sem ida a mais ao banco.
 */
export function metadadosDaTelaDoAdmin(href: string): () => Promise<Metadata> {
  return async () => {
    const item = itemDoAdmin(href);
    const usuario = await loadAuthUser().catch(() => null);
    const idioma = usuario?.idioma ?? IDIOMA_PADRAO;
    const tela = item ? traduzir(item.label, idioma) : traduzir("Administração", idioma);
    return { title: `${tela} · ${traduzir("Administração", idioma)}` };
  };
}

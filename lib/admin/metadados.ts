import "server-only";

import type { Metadata } from "next";

import { loadAuthUser } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";

import { SUBPAGINAS_DO_ADMIN, itemDoAdmin, type SubpaginaDoAdmin } from "./catalogo";

/**
 * O título da aba de uma tela da área de administração, no idioma de quem a abre
 * (issue #308, história 15). Uso: `export const generateMetadata = metadadosDaTelaDoAdmin("/admin/x")`.
 *
 * Subpágina passa a tela-mãe do catálogo e a chave dela em `SUBPAGINAS_DO_ADMIN`:
 * "Detalhe do incidente · Incidentes · Administração". Tela fora do catálogo (a de
 * acesso negado) passa `null` como tela-mãe.
 *
 * O sufixo com a marca vem do `template` do layout raiz (`app/layout.tsx`); aqui
 * entra só "<tela> · Administração". `loadAuthUser` é `cache()` do React: a mesma
 * leitura serve a página na mesma requisição, sem ida a mais ao banco.
 */
export function metadadosDaTelaDoAdmin(
  href: string | null,
  subpagina?: SubpaginaDoAdmin,
): () => Promise<Metadata> {
  return async () => {
    const item = href ? itemDoAdmin(href) : undefined;
    const usuario = await loadAuthUser().catch(() => null);
    const idioma = usuario?.idioma ?? IDIOMA_PADRAO;
    const partes = [
      subpagina ? traduzir(SUBPAGINAS_DO_ADMIN[subpagina], idioma) : null,
      item ? traduzir(item.label, idioma) : null,
      traduzir("Administração", idioma),
    ].filter((p): p is string => Boolean(p));
    return { title: partes.join(" · ") };
  };
}

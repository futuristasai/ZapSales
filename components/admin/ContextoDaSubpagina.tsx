"use client";
import Link from "next/link";

import { grupoDoAdmin, itemDoAdmin } from "@/lib/admin/catalogo";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

import { ICONES_DO_ADMIN } from "./icones-do-admin";

/**
 * O topo de uma SUBPÁGINA da administração (detalhe de uma empresa, de um incidente,
 * "Nova empresa") — issue #308: "subpáginas usam o título do registro com a ajuda do
 * grupo-mãe". O título continua sendo o do registro, no `<h1>` da própria tela; acima
 * dele vai esta linha, com o ícone e o tom do item no menu, o caminho "Grupo › Tela" e o
 * "para que serve" da tela-mãe — a mesma ajuda que o celular não teria pela dica do menu.
 */
export function ContextoDaSubpagina({ href }: { href: string }) {
  const t = useT();
  const item = itemDoAdmin(href);
  if (!item) return null;
  const Icone = ICONES_DO_ADMIN[item.icone];
  const grupo = grupoDoAdmin(item.grupo);

  return (
    <div className="flex items-start gap-2.5" data-testid="contexto-da-subpagina">
      <Icone size={18} weight="duotone" className={cn("mt-0.5 shrink-0", grupo.tom)} aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t(grupo.label)} ›{" "}
          <Link href={item.href} className="underline-offset-2 hover:underline">
            {t(item.label)}
          </Link>
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">{t(item.paraQueServe)}</p>
      </div>
    </div>
  );
}

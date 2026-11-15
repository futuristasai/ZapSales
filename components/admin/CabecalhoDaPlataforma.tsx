"use client";
import type { ReactNode } from "react";

import { grupoDoAdmin, itemDoAdmin } from "@/lib/admin/catalogo";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

import { ICONES_DO_ADMIN } from "./icones-do-admin";

interface CabecalhoDaPlataformaProps {
  /** A rota da tela no catálogo (`lib/admin/catalogo.ts`). Título, ajuda e ícone saem dali. */
  href: string;
  /** Botões da tela (ex.: "Nova empresa"), à direita do título. */
  acoes?: ReactNode;
  /** Uma linha a mais embaixo da ajuda (ex.: contagem de itens). Já traduzida. */
  complemento?: ReactNode;
}

/**
 * O cabeçalho padrão de toda tela de primeiro nível da área de administração
 * (issue #308): ícone (o mesmo do menu, no tom do grupo), título, para que serve e
 * quando usar.
 *
 * A ajuda fica VISÍVEL aqui, e não só na dica do menu, porque no celular não existe
 * "passar o mouse": no toque, é este cabeçalho que explica a tela.
 *
 * Componente de cliente para servir os dois tipos de página: as de servidor o
 * desenham direto, as de cliente (`_client.tsx`) também — o texto vem do mesmo
 * `useT()` do resto da área, sob o `IdiomaProvider` da casca.
 */
export function CabecalhoDaPlataforma({ href, acoes, complemento }: CabecalhoDaPlataformaProps) {
  const t = useT();
  const item = itemDoAdmin(href);
  if (!item) return null;
  const Icone = ICONES_DO_ADMIN[item.icone];
  const grupo = grupoDoAdmin(item.grupo);

  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4"
      data-testid="cabecalho-da-plataforma"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-surface"
          aria-hidden
        >
          <Icone size={22} weight="duotone" className={cn(grupo.tom)} />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t(grupo.label)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t(item.label)}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t(item.paraQueServe)}</p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("Quando usar:")}</span>{" "}
            {t(item.quandoUsar)}
          </p>
          {complemento ? <div className="text-sm text-muted-foreground">{complemento}</div> : null}
        </div>
      </div>
      {acoes ? <div className="flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </header>
  );
}

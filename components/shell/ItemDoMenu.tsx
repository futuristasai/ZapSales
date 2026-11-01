"use client";
import Link from "next/link";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { useT } from "@/hooks/i18n/useT";
import { dicaDoDestino } from "@/lib/navigation/dica";
import type { NavDestination } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

/**
 * Uma tela na lista do painel: ícone, nome, o termo técnico embaixo (issue #187) e,
 * quando a tela tem, o contador de pendências ou a saúde das conexões.
 *
 * A tela atual é marcada de TRÊS jeitos que não dependem de cor: `aria-current`
 * para o leitor de tela, peso da fonte e uma barra no canto. Só o fundo tingido
 * seria um estado que quem não distingue cores não vê.
 */
export function ItemDoMenu({
  item,
  ativo,
  aoNavegar,
}: {
  item: NavDestination;
  ativo: boolean;
  aoNavegar?: () => void;
}) {
  const t = useT();
  const Icone = item.icon;
  return (
    <Link
      href={item.href}
      title={dicaDoDestino(item, t)}
      aria-current={ativo ? "page" : undefined}
      onClick={aoNavegar}
      className={cn(
        "relative flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
        ativo
          ? "bg-accent-soft font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent"
          : "text-muted-foreground hover:bg-accent-soft hover:text-foreground",
      )}
    >
      <Icone size={20} weight={ativo ? "fill" : "regular"} aria-hidden className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{t(item.label)}</span>
        {item.menu.termo ? (
          <span className="truncate text-[11px] leading-3 font-normal text-text-subtle">
            {t(item.menu.termo)}
          </span>
        ) : null}
      </span>
      {item.healthDot && <ConnectionHealthDot className="ml-auto" />}
      {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
      {item.contador === "fila" && <ContadorDaFila compacto={false} />}
    </Link>
  );
}

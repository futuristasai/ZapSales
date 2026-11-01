"use client";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { ENDERECO_DO_MANUAL } from "@/lib/navigation/manual";
import type { GrupoProjetado } from "@/lib/navigation/menu";
import { BookOpen, UserCheck } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O menu da conta, o botão «Você» da faixa (issue #188): Perfil, Segurança e
 * Notificações — as telas PESSOAIS, que não pertencem a nenhuma área de Configurar — e o
 * Manual, que assim fica a um clique mesmo com o painel recolhido.
 *
 * Quem vê Perfil, Segurança e Notificações é a mesma regra de sempre (vêm do grupo
 * «Você» do catálogo). A sessão em si (Sair, idioma, tema, modo administrador) segue no
 * menu do avatar, no topo.
 */
export function MenuDaConta({
  grupo,
  className,
}: {
  grupo: GrupoProjetado | null;
  className?: string;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(className)} aria-label={t("Você")} aria-haspopup="menu">
          <UserCheck size={24} aria-hidden />
          <span>{t("Você")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8} className="min-w-[220px]">
        <DropdownMenuLabel>{t("Você")}</DropdownMenuLabel>
        {grupo?.itens.map((item) => {
          const Icone = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <Icone size={16} className="mr-2" aria-hidden />
                {t(item.label)}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={ENDERECO_DO_MANUAL} target="_blank" rel="noopener">
            <BookOpen size={16} className="mr-2" aria-hidden />
            {t("Manual")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

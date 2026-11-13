"use client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { CaretDown, Check } from "@/lib/ui/icons";

export interface FunilDoSeletor {
  id: string;
  name: string;
}

/**
 * Trocar de funil SEM SAIR do quadro (pedido do dono do produto, 13/11/2026).
 *
 * O atalho «Quadro do funil» do menu abre o funil principal, e até aqui o único jeito de ver
 * outro era voltar a «Funis» e escolher na lista. Este botão fica ao lado do nome do funil e
 * lista todos os funis vivos da empresa, na ordem da lista; o que está aberto vem marcado.
 *
 * Cada linha é um LINK para o quadro daquele funil — endereço próprio, que dá para abrir em
 * outra aba e guardar nos favoritos —, e não um estado guardado aqui. Os filtros da tela não
 * acompanham a troca de propósito: as etapas e os responsáveis de um funil não são os do outro.
 *
 * Aparece mesmo com um funil só: o botão fica sempre no mesmo lugar, e a última linha leva à
 * lista, que é onde se cria o segundo.
 */
export function SeletorDeFunil({
  funis,
  atualId,
}: {
  /** Os funis vivos da empresa, na ordem da lista de Funis. */
  funis: readonly FunilDoSeletor[];
  atualId: string;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          {t("Trocar de funil")}
          <CaretDown size={14} aria-hidden className="ml-1.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t("Funis da empresa")}</DropdownMenuLabel>
        {funis.map((funil) => {
          const atual = funil.id === atualId;
          return (
            <DropdownMenuItem key={funil.id} asChild>
              <Link
                href={`/app/pipelines/${funil.id}`}
                aria-current={atual ? "page" : undefined}
                className={atual ? "font-semibold" : undefined}
              >
                {/* `title`: o nome comprido é cortado na lista, e o mouse mostra ele inteiro. */}
                <span className="min-w-0 flex-1 truncate" title={funil.name}>
                  {funil.name}
                </span>
                {atual ? <Check aria-hidden /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/kanban">{t("Ver todos os funis")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

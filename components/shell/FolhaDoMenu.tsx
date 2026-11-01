"use client";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode, RefObject } from "react";

import { VersionFooter } from "@/components/shell/VersionFooter";
import { useT } from "@/hooks/i18n/useT";
import { ENDERECO_DO_MANUAL } from "@/lib/navigation/manual";
import { BookOpen, X } from "@/lib/ui/icons";

/**
 * A folha do menu do celular (issue #190): sobe de baixo com a lista de uma aba.
 *
 * Comporta-se como diálogo — o Radix prende o foco dentro dela, Esc fecha, e o fundo fica
 * inerte para o leitor de tela. Ao fechar, o foco volta ao botão da aba que a abriu (`gatilho`),
 * e não ao topo da página. Escolher uma tela fecha a folha: quem monta o conteúdo passa o
 * `aoNavegar` que ela entrega.
 *
 * Alvo de toque: tudo que é link ou botão aqui tem pelo menos 44 px de altura — `[&_a]:min-h-11`
 * eleva as linhas da lista (que no computador têm 36 px) sem tocar no componente delas, e o do rodapé
 * eleva o aviso de nova versão (`VersionFooter`, que só aparece a quem administra e tem atualização).
 */
export function FolhaDoMenu({
  titulo,
  gatilho,
  aoFechar,
  children,
}: {
  titulo: string;
  /** O botão da aba que abriu a folha: recebe o foco de volta ao fechar. */
  gatilho: RefObject<HTMLElement | null>;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <Dialog.Root open onOpenChange={(aberta) => !aberta && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-safe:animate-in motion-safe:fade-in-0 fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          // Sem descrição: o título já diz do que se trata, e um parágrafo a mais só seria lido.
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            gatilho.current?.focus();
          }}
          className="motion-safe:animate-in motion-safe:slide-in-from-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t bg-card shadow-xl focus-visible:outline-hidden"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
          <header className="flex shrink-0 items-center gap-2 py-1 pr-2 pl-4">
            <Dialog.Title className="min-w-0 flex-1 truncate text-lg font-semibold">
              {titulo}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("Fechar")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <X size={22} aria-hidden />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [&_a]:min-h-11">
            {children}
          </div>
          <footer className="shrink-0 border-t px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] [&_a]:min-h-11">
            <a
              href={ENDERECO_DO_MANUAL}
              target="_blank"
              rel="noopener"
              onClick={aoFechar}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground"
            >
              <BookOpen size={20} aria-hidden />
              <span>{t("Manual")}</span>
            </a>
            <VersionFooter collapsed={false} onNavigate={aoFechar} />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

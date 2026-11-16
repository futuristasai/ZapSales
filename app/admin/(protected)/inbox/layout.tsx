import type { ReactNode } from "react";
import { InboxList } from "./_components/InboxList";

/**
 * 3-column layout: list (360px fixed) | thread (flex) | side panel (320px fixed)
 * List is always visible. Thread+side are rendered by child pages via `children`.
 */
export default function AdminInboxLayout({ children }: { children: ReactNode }) {
  // Altura TRAVADA na janela (issue #309). `h-full` não travava nada: o `<main>` do
  // `AdminShell` não tem altura própria, então a coluna crescia até o tamanho da
  // lista — com 30 conversas, ~1.900 px — e o aviso "Selecione uma conversa",
  // centralizado nela, ia parar abaixo da dobra.
  //
  // A conta depende do `AdminShell` e da `PlatformModeBanner`; mexeu nelas, revise aqui.
  // A partir de `lg` ela é exata: tarja de uma linha (2,5rem) + respiro do `<main>`
  // (`sm:p-6`, 3rem). Abaixo de `lg` a tarja quebra em duas linhas e a barra do menu
  // (3rem) aparece, então o desconto é folgado (11rem) em vez de exato: sobrar um pouco
  // de fundo é melhor que esconder o fim da lista. Quem mede: `admin-plataforma-claro`.
  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[28rem] w-full overflow-hidden lg:h-[calc(100dvh-5.5rem)]">
      {/* ── Conversation list — fixed 360px ── */}
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-border">
        <InboxList />
      </aside>

      {/* ── Thread + side panel area ── */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

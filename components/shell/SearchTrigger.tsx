"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function SearchTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // No celular sobra o ícone e o alvo de toque tem 44 px também na largura (#190).
        className="gap-2 text-muted-foreground max-md:min-w-11"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={14} aria-hidden />
        {/* O nome do botão vem do TEXTO, nunca de um aria-label: o texto visível («Buscar... ⌘K»)
            tem de estar dentro do nome acessível (WCAG 2.5.3, regra `label-content-name-mismatch`
            do axe). No celular o texto fica só para o leitor de tela. */}
        <span className="max-md:sr-only">{t("Buscar...")}</span>
        <kbd className="ml-2 hidden md:inline rounded-md border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

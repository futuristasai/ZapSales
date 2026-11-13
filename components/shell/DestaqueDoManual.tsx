"use client";
import { useT } from "@/hooks/i18n/useT";
import { ENDERECO_DO_MANUAL } from "@/lib/navigation/manual";
import { ArrowSquareOut, BookOpen } from "@/lib/ui/icons";

/**
 * O Manual, em destaque no painel de Todo dia.
 *
 * Era uma linha no rodapé do painel, do tamanho do aviso de versão — e quem mais precisa dele
 * (quem acabou de instalar) não o via. Agora é um bloco da lista, com título próprio, no lugar
 * que «Se a sua empresa usa» ocupava com Comandas e Chamadas (decisão do dono do produto,
 * 12/11/2026).
 *
 * O NOME do link continua sendo só «Manual» (`aria-labelledby`); a frase de baixo é a descrição
 * dele (`aria-describedby`). Assim o leitor de tela anuncia o mesmo nome que o menu «Você» e a
 * folha do celular usam, e o texto visível está contido no nome.
 *
 * Abre em outra aba: o manual é um site estático servido pela instalação (`app/manual`), fora do
 * casco do app, e quem o consulta quer voltar para a tela em que estava.
 */
export function DestaqueDoManual({ aoNavegar }: { aoNavegar?: () => void }) {
  const t = useT();
  return (
    <section aria-labelledby="menu-manual-titulo" data-testid="destaque-do-manual">
      <h3 id="menu-manual-titulo" className="px-3 pt-3 pb-1.5 text-xs font-bold text-text-subtle">
        {t("Dúvidas? Consulte o manual")}
      </h3>
      <a
        href={ENDERECO_DO_MANUAL}
        target="_blank"
        rel="noopener"
        onClick={aoNavegar}
        aria-labelledby="menu-manual-nome"
        aria-describedby="menu-manual-descricao"
        className="group flex items-center gap-3 rounded-xl border border-accent/40 bg-background px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent-soft/60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <BookOpen size={20} weight="fill" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span id="menu-manual-nome" className="text-sm leading-tight font-semibold text-foreground">
            {t("Manual")}
          </span>
          <span id="menu-manual-descricao" className="text-xs leading-snug text-muted-foreground">
            {t("Passo a passo de cada tela")}
          </span>
        </span>
        <ArrowSquareOut
          size={16}
          aria-hidden
          className="shrink-0 text-text-subtle group-hover:text-foreground"
        />
      </a>
    </section>
  );
}

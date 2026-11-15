"use client";
import Link from "next/link";
import { HardDrives } from "@/lib/ui/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useT } from "@/hooks/i18n/useT";

/**
 * Sticky top banner that signals the user is administering the whole
 * installation (every company hosted on it). Persistent visual cue to prevent accidental destructive
 * actions when the operator forgets which surface they're in.
 *
 * ── Por que a troca de tema mora AQUI ────────────────────────────────────────
 *
 * O `AdminShell` não tem barra de topo no desktop — o único `<header>` dele é
 * `lg:hidden`. Esta tarja é o único elemento persistente do topo em TODAS as
 * larguras, então é o único lugar onde um controle global cabe sem inventar
 * uma barra nova (o que mudaria o layout de todas as telas do admin).
 *
 * ── Por que as cores são token e não `amber-*` ───────────────────────────────
 *
 * A versão anterior usava `bg-warning-bg border-warning/40 text-warning-fg`, cru
 * do Tailwind e portanto FIXO: a tarja não acompanhava claro e escuro, e num
 * tema escuro ela virava uma faixa clara gritando no topo. Os tokens de
 * `warning` são os mesmos que o `Badge variant="warning"` usa, e existem nos
 * dois temas com contraste aferido.
 *
 * O `--color-warning-bg` é translúcido (12% em claro, 18% em escuro), e esta
 * tarja é `sticky` — conteúdo rolando por baixo apareceria através dela. Por
 * isso são DOIS elementos: o de fora dá o fundo opaco da página, o de dentro
 * dá o tom de aviso por cima. Sem `backdrop-blur`, que é anti-pattern nº 5.
 */
export function PlatformModeBanner() {
  const t = useT();
  return (
    <div
      role="region"
      aria-label={t("Administração da instalação")}
      className="sticky top-0 z-40 w-full bg-bg"
    >
      <div className="flex h-10 w-full items-center justify-between border-b border-warning/35 bg-warning-bg px-4 text-warning-fg">
        {/* Issue #308: o dono não é programador, e "MODO PLATAFORMA — operação
            cross-tenant" não dizia nada a ele. A frase nova diz o PESO do que se faz
            aqui. O ícone é o servidor: o prédio passou a ser o de "Empresas" no menu. */}
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <HardDrives size={18} weight="fill" className="shrink-0" aria-hidden />
          <span className="truncate font-semibold tracking-tight">
            {t("Administração da instalação")}
          </span>
          <span className="hidden truncate opacity-80 md:inline">
            {t("— o que você muda aqui vale para todas as empresas")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 40px de tarja não comportam os 44px de alvo de toque do `size="icon"`.
              O mesmo já valia para o link ao lado, que é `text-xs`: quem opera o
              modo plataforma está num desktop, com cursor. */}
          <ThemeToggle className="h-7 w-7 text-warning-fg lg:h-7 lg:w-7" />
          <Link
            href="/app"
            className="rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            {t("Voltar para a sua empresa")}
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import type { ElementType } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Buildings, CaretRight, ChartBar, Clock, Scales, WifiSlash } from "@/lib/ui/icons";
import type { DashboardKPIs } from "@/app/api/v1/admin/dashboard/kpis/route";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

/**
 * Um cartão do Painel (issue #308, histórias 29–31). Antes eram cinco números que não
 * se clicavam, e o zero não dizia se era bom ou ruim. Agora cada cartão:
 *
 *   - leva à lista que ele conta (o cartão inteiro é o link);
 *   - diz em palavras o que o número quer dizer — o zero é "tudo em dia", não um enigma;
 *   - quando há problema, ganha o tom de atenção e diz o que fazer.
 *
 * A leitura das contagens é a mesma de antes (`/api/v1/admin/dashboard/kpis`): muda só
 * a apresentação.
 */
interface CartaoDoPainel {
  id: string;
  rotulo: string;
  valor: number;
  href: string;
  Icone: ElementType;
  /** O que dizer quando está tudo bem (geralmente o zero). */
  emDia: string;
  /** O que fazer quando o número pede ação. */
  problema: string;
  /** O número pede ação? Para "Empresas ativas", é o zero que pede. */
  temProblema: boolean;
  /** Gravidade do problema: `erro` só para prazo legal. */
  gravidade?: "atencao" | "erro";
}

function Cartao({ c }: { c: CartaoDoPainel }) {
  const t = useT();
  const erro = c.temProblema && c.gravidade === "erro";
  const atencao = c.temProblema && !erro;
  return (
    <Link
      href={c.href}
      data-testid={`cartao-${c.id}`}
      data-estado={c.temProblema ? "problema" : "em-dia"}
      className="group block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <Card
        className={cn(
          "h-full transition-colors group-hover:border-border-strong",
          atencao && "border-warning/40 bg-warning-bg",
          erro && "border-error/40 bg-error-bg",
        )}
      >
        <CardContent className="flex h-full flex-col gap-2 pt-6">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(c.rotulo)}
            </p>
            <c.Icone
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                erro ? "text-error" : atencao ? "text-warning" : "text-muted-foreground",
              )}
              aria-hidden
            />
          </div>
          <p
            className={cn(
              "text-3xl font-bold tabular-nums",
              erro ? "text-error-fg" : atencao ? "text-warning-fg" : "text-foreground",
            )}
          >
            {c.valor}
          </p>
          <p className={cn("text-sm", c.temProblema ? "text-foreground" : "text-muted-foreground")}>
            {t(c.temProblema ? c.problema : c.emDia)}
          </p>
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            {t("Abrir")}
            <CaretRight size={12} aria-hidden />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Os textos dos cartões, fora do componente para a cerca de idioma lê-los como dado. */
export const TEXTOS_DOS_CARTOES = {
  empresas: {
    rotulo: "Empresas ativas",
    emDia: "Empresas usando esta instalação agora.",
    problema: "Nenhuma empresa ativa ainda — cadastre a primeira.",
  },
  esperando: {
    rotulo: "Esperando resposta há mais de 10 min",
    emDia: "Nenhuma conversa esperando — tudo em dia.",
    problema: "Há clientes sem resposta. Abra as conversas para ver em qual empresa.",
  },
  numeros: {
    // Neutro de canal de propósito: "Alertas WAHA" nomeava o provedor, o que
    // `lint:channels` proíbe fora de `lib/channels/` — e o dono não sabe o que é WAHA.
    rotulo: "Números com problema",
    emDia: "Todos os números de WhatsApp estão funcionando.",
    problema: "Algum número caiu ou foi bloqueado. Veja nos alertas abaixo qual empresa.",
  },
  lgpd: {
    rotulo: "Pedidos de LGPD perto do prazo",
    emDia: "Nenhum pedido de LGPD perto do prazo.",
    problema: "Responda antes que o prazo legal vença.",
  },
  tetoDeIa: {
    // "acumulado", e não "no mês": o número vem de
    // `ai_budgets.current_month_consumed_cents`, um contador que o gatilho soma sem
    // olhar a data e que nada zera — é o gasto desde a instalação. Ver o cálculo em
    // `app/api/v1/admin/dashboard/kpis/route.ts`.
    rotulo: "Empresas perto do teto de IA",
    emDia: "Nenhuma empresa passou de 80% do teto de gasto com IA.",
    problema: "O gasto acumulado com IA passou de 80% do teto. Confira o uso dessas empresas.",
  },
} as const;

export function KPICards({ kpis }: { kpis: DashboardKPIs }) {
  const T = TEXTOS_DOS_CARTOES;
  const cartoes: CartaoDoPainel[] = [
    {
      id: "empresas",
      ...T.empresas,
      valor: kpis.tenants_active,
      href: "/admin/tenants",
      Icone: Buildings,
      temProblema: kpis.tenants_active === 0,
    },
    {
      id: "esperando",
      ...T.esperando,
      valor: kpis.conv_pending_10min,
      href: "/admin/inbox",
      Icone: Clock,
      temProblema: kpis.conv_pending_10min > 0,
    },
    {
      id: "numeros",
      ...T.numeros,
      valor: kpis.waha_ban_alerts,
      // Cada número com problema é de uma empresa; a lista que ele conta são os alertas.
      href: "#alertas",
      Icone: WifiSlash,
      temProblema: kpis.waha_ban_alerts > 0,
    },
    {
      id: "lgpd",
      ...T.lgpd,
      valor: kpis.lgpd_at_risk,
      href: "/admin/lgpd",
      Icone: Scales,
      temProblema: kpis.lgpd_at_risk > 0,
      gravidade: "erro",
    },
    {
      id: "teto-de-ia",
      ...T.tetoDeIa,
      valor: kpis.ai_budget_warnings,
      href: "/admin/usage",
      Icone: ChartBar,
      temProblema: kpis.ai_budget_warnings > 0,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cartoes.map((c) => (
        <Cartao key={c.id} c={c} />
      ))}
    </div>
  );
}

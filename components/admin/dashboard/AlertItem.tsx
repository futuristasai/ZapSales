"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { WifiSlash, Scales, ChartBar, Clock, Warning } from "@/lib/ui/icons";
import type {
  AlertItem as AlertItemType,
  AlertKind,
} from "@/app/api/v1/admin/dashboard/kpis/route";
import type { ElementType } from "react";
import { useT } from "@/hooks/i18n/useT";

const KIND_ICONS: Record<AlertKind, ElementType> = {
  waha_ban: WifiSlash,
  lgpd_at_risk: Scales,
  ai_budget: ChartBar,
  tenant_pending_overflow: Clock,
};

// Neutros e em português (issue #308): "WAHA", "IA Budget" e "Overflow" não diziam
// nada a quem administra a instalação.
const KIND_LABELS: Record<AlertKind, string> = {
  waha_ban: "Número com problema",
  lgpd_at_risk: "LGPD",
  ai_budget: "Teto de IA",
  tenant_pending_overflow: "Fila de espera",
};

interface AlertItemProps {
  alert: AlertItemType;
}

export function AlertItem({ alert }: AlertItemProps) {
  const t = useT();
  const router = useRouter();
  const Icon = KIND_ICONS[alert.kind] ?? Warning;
  const kindLabel = t(KIND_LABELS[alert.kind] ?? alert.kind);

  const severityVariant =
    alert.severity === "critical"
      ? "destructive"
      : alert.severity === "warning"
        ? "outline"
        : "secondary";

  const severityLabel =
    alert.severity === "critical"
      ? t("Crítico")
      : alert.severity === "warning"
        ? t("Atenção")
        : t("Info");

  return (
    <button
      type="button"
      onClick={() => router.push(alert.link)}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{alert.tenant_name}</span>
          <Badge variant={severityVariant} className="shrink-0 text-xs">
            {severityLabel}
          </Badge>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {kindLabel}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{alert.message}</p>
      </div>
    </button>
  );
}

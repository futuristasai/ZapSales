"use client";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { useT } from "@/hooks/i18n/useT";
import type { AlertKind } from "@/app/api/v1/admin/dashboard/kpis/route";

// Os mesmos nomes dos selos do Painel (issue #308): "WAHA", "Budget" e "Overflow" não
// diziam nada a quem administra a instalação. A frase inteira é a chave de tradução.
const KIND_LABELS: Record<AlertKind, string> = {
  waha_ban: "Novo aviso: número com problema",
  lgpd_at_risk: "Novo aviso: pedido de LGPD perto do prazo",
  ai_budget: "Novo aviso: empresa perto do teto de IA",
  tenant_pending_overflow: "Novo aviso: fila de espera cheia",
};

interface AlertBroadcast {
  kind?: AlertKind;
  message?: string;
}

export function useAlertsRealtime() {
  const qc = useQueryClient();
  const t = useT();

  const onChange = useCallback(
    (payload: unknown) => {
      const data = (payload as { payload?: AlertBroadcast } | null)?.payload;
      const kind = data?.kind;
      toast.warning(t((kind && KIND_LABELS[kind]) || "Novo aviso"), { description: data?.message });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard", "kpis"] });
    },
    [qc, t],
  );

  // Pelo hook compartilhado, e não por `.channel()` cru: o cookie de sessão é
  // httpOnly, então o supabase-js do browser não enxerga a sessão e assina como
  // ANÔNIMO — canal que recebe "ok", loga "subscribed" e nunca entrega evento.
  // A correção (24b9ec2) mora em `useRealtimeChannel`, que chama `setAuth` antes
  // do `subscribe`; quem abre canal direto ficou de fora dela.
  useRealtimeChannel({ name: "alerts-platform", broadcast: { event: "*" }, onChange });
}

"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { KPICards } from "@/components/admin/dashboard/KPICards";
import { AlertsBanner } from "@/components/admin/dashboard/AlertsBanner";
import {
  ChecklistDaInstalacao,
  type ChecklistVisto,
} from "@/components/admin/dashboard/ChecklistDaInstalacao";
import { useAdminDashboardKPIs } from "@/hooks/useAdminDashboardKPIs";
import { useAlertsRealtime } from "@/hooks/useAlertsRealtime";
import { useT } from "@/hooks/i18n/useT";
import { CabecalhoDaPlataforma } from "@/components/admin/CabecalhoDaPlataforma";

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ checklist }: { checklist: ChecklistVisto }) {
  const t = useT();
  const { data, isLoading } = useAdminDashboardKPIs();
  useAlertsRealtime();

  return (
    <div className="space-y-6">
      <CabecalhoDaPlataforma
        href="/admin/dashboard"
        complemento={t("Os números se atualizam sozinhos a cada 30 segundos.")}
      />

      {/* Primeiro "o que falta configurar?", depois "está tudo bem?" — numa instalação
          recém-feita os números estão todos em zero, e o que importa é o checklist. */}
      <ChecklistDaInstalacao checklist={checklist} />

      {isLoading || !data ? (
        <>
          <KPISkeleton />
          <AlertsSkeleton />
        </>
      ) : (
        <>
          <KPICards kpis={data} />
          <div id="alertas" className="scroll-mt-16">
            <AlertsBanner alerts={data.alerts} />
          </div>
        </>
      )}
    </div>
  );
}

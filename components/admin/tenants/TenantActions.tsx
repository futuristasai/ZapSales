"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuspendDialog } from "./SuspendDialog";
import { ReactivateDialog } from "./ReactivateDialog";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "redacted";
  displayName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantActions({ organizationId, status, displayName }: TenantActionsProps) {
  const t = useT();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const canSuspend = status === "active";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  return (
    <>
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          {t("Ações")}
        </h2>

        {/* Impersonate (S-11.07) */}
        <ImpersonateButton
          organizationId={organizationId}
          displayName={displayName}
          disabled={isRedacted}
          disabledReason={isRedacted ? t("Empresa anonimizada — ação não disponível") : undefined}
        />

        {/* Suspend */}
        {canSuspend && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setSuspendOpen(true)}
            aria-label={t("Suspender empresa")}
          >
            {t("Suspender empresa")}
          </Button>
        )}

        {/* Reactivate */}
        {isSuspended && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setReactivateOpen(true)}
            aria-label={t("Reativar empresa")}
          >
            {t("Reativar empresa")}
          </Button>
        )}

        {isRedacted && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            {t("Empresa anonimizada — as ações de gestão não estão disponíveis.")}
          </p>
        )}
      </div>

      <SuspendDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        organizationId={organizationId}
      />

      <ReactivateDialog
        open={reactivateOpen}
        onClose={() => setReactivateOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}

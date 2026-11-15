"use client";
import { useState } from "react";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReactivateTenant } from "@/hooks/useReactivateTenant";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const reasonSchema = z.string().min(10, "Mínimo 10 caracteres").max(500, "Máximo 500 caracteres");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReactivateDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReactivateDialog({ open, onClose, organizationId }: ReactivateDialogProps) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reactivate = useReactivateTenant();
  const validation = reasonSchema.safeParse(reason);
  const isValid = validation.success;

  function handleConfirm() {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? "Razão inválida"));
      return;
    }
    reactivate.mutate(
      { id: organizationId, reason: parsed.data },
      {
        onSuccess: () => {
          setReason("");
          setError(null);
          onClose();
        },
      },
    );
  }

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Reativar empresa")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "A reativação devolve o acesso das pessoas desta empresa. Informe o motivo, que fica guardado no Registro de ações.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="reactivate-reason">
            {t("Motivo da reativação")}{" "}
            <span className="text-xs font-normal text-muted-foreground">({reason.length}/500)</span>
          </Label>
          <Textarea
            id="reactivate-reason"
            placeholder={t("Descreva o motivo da reativação (mínimo 10 caracteres)...")}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={4}
            maxLength={500}
            aria-describedby={error ? "reactivate-reason-error" : undefined}
          />
          {error && (
            <p id="reactivate-reason-error" className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>{t("Cancelar")}</AlertDialogCancel>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={!isValid || reactivate.isPending}
          >
            {reactivate.isPending ? t("Reativando...") : t("Confirmar reativação")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

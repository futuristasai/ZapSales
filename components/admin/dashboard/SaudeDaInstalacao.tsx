"use client";
import { useRouter } from "next/navigation";
import { useTransition, type ElementType } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowsClockwise,
  Database,
  Heartbeat,
  Lightning,
  ListChecks,
  QrCode,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import {
  TEXTOS_DA_SAUDE,
  type EstadoDeSaude,
  type IdDoItemDeSaude,
  type SaudeDaInstalacao as Saude,
} from "@/lib/saude/da-instalacao";

/** O significado de cada estado no sistema de selos — "não configurado" e "não lido" não são falha. */
const SELO_DO_ESTADO: Record<EstadoDeSaude, SignificadoDoSelo> = {
  ok: "concluido",
  fora: "falha",
  nao_configurado: "neutro",
  nao_lido: "neutro",
};

const ICONE_DO_ITEM: Record<IdDoItemDeSaude, ElementType> = {
  banco: Database,
  whatsapp: QrCode,
  redis: Lightning,
  fila: ListChecks,
};

/**
 * "ESTÁ TUDO BEM?" (issue #310, histórias 54–55 da #308): banco, WhatsApp por QR code,
 * Redis e fila de tarefas, em verde ou vermelho, cada vermelho com a frase do que fazer —
 * e, quando um comando resolve, o comando, pronto para copiar.
 *
 * Recebe a saúde já calculada no servidor (`saudeDaInstalacaoAgora`): nenhum endereço,
 * erro cru nem segredo chega aqui. "Conferir de novo" pede ao servidor uma leitura nova.
 */
export function SaudeDaInstalacao({ saude }: { saude: Saude }) {
  const t = useT();
  const T = TEXTOS_DA_SAUDE;
  const router = useRouter();
  const [conferindo, iniciar] = useTransition();

  return (
    <Card className="p-0" data-testid="saude-da-instalacao" aria-busy={conferindo}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <Heartbeat
          size={22}
          weight={saude.tudoBem ? "regular" : "fill"}
          className={cn(
            "mt-0.5 shrink-0",
            saude.fora > 0
              ? "text-error"
              : saude.tudoBem
                ? "text-success"
                : "text-muted-foreground",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t(T.titulo)}</h2>
          <p className="text-sm text-muted-foreground" data-testid="saude-resumo">
            {t(saude.tudoBem ? T.tudoBem : T.algoFora)}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={conferindo}
          onClick={() => iniciar(() => router.refresh())}
        >
          <ArrowsClockwise size={14} className={cn(conferindo && "animate-spin")} aria-hidden />
          {t(T.conferirDeNovo)}
        </Button>
      </div>
      <ul className="divide-y border-t">
        {saude.itens.map((item) => {
          const Icone = ICONE_DO_ITEM[item.id];
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-4 py-3"
              data-testid={`saude-${item.id}`}
              data-estado={item.estado}
            >
              <Icone size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">{t(T.nomes[item.id])}</span>
                  <Selo significado={SELO_DO_ESTADO[item.estado]}>{t(T.estados[item.estado])}</Selo>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    item.estado === "fora" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(item.frase)}
                </p>
                {item.comando ? (
                  <div className="space-y-1 pt-1">
                    <p className="text-xs text-muted-foreground">{t(T.ondeRodar)}</p>
                    <code
                      className="block overflow-x-auto rounded-md border bg-surface-elevated px-2 py-1.5 font-mono text-xs whitespace-pre select-all"
                      data-testid={`saude-${item.id}-comando`}
                    >
                      {item.comando}
                    </code>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Enquanto as sondas respondem (até ~3 s quando algo está fora). */
export function SaudeCarregando() {
  return (
    <Card className="space-y-3 p-4" data-testid="saude-carregando">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </Card>
  );
}

/** Enquanto a licença é lida. */
export function LicencaCarregando() {
  return (
    <Card className="space-y-3 p-4" data-testid="licenca-carregando">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-full" />
    </Card>
  );
}

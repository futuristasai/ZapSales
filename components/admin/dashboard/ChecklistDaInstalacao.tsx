"use client";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CaretDown, CheckCircle, Circle, Question, WarningCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

/** O que o servidor manda: só dado serializável, já calculado por `checklistDaInstalacao`. */
export interface ItemDoChecklistVisto {
  id: string;
  nome: string;
  oQueFaz: string;
  href: string;
  nivel: "obrigatorio" | "opcional";
  estado: "ligado" | "desligado" | "varia" | "nao_verificado" | "nao_lido";
  feito: boolean;
}

export interface ChecklistVisto {
  itens: ItemDoChecklistVisto[];
  essencialPronto: boolean;
  tudoPronto: boolean;
  faltamObrigatorios: number;
  faltamOpcionais: number;
}

/** Os textos fixos, como dado — a cerca de idioma do admin os lê daqui. */
export const TEXTOS_DO_CHECKLIST = {
  titulo: "Sua instalação está pronta?",
  tudoPronto: "Tudo configurado.",
  essencialPronto: "O essencial está pronto. O que falta é opcional — ligue quando precisar.",
  faltaEssencial: "Falta configurar o essencial para a instalação funcionar inteira.",
  obrigatorio: "Obrigatório",
  opcional: "Opcional",
  feito: "Pronto",
  falta: "Falta",
  naoLido: "Não consegui ler agora",
  configurar: "Configurar",
  revisar: "Revisar",
} as const;

/**
 * "SUA INSTALAÇÃO ESTÁ PRONTA?" (issue #308, histórias 32–35).
 *
 * Só leitura: o estado é o mesmo de Recursos opcionais (o servidor o calcula com
 * `checklistDaInstalacao`, sobre o mesmo catálogo), e "Configurar" leva à tela do recurso.
 *
 * Aberto enquanto falta algo obrigatório. Com o essencial pronto, recolhe num resumo de
 * uma linha (`<details>` fechado) — o Google Agenda desligado não é defeito e não merece
 * ocupar a tela. O `<details>` nativo abre e fecha pelo teclado sem JavaScript nosso.
 */
export function ChecklistDaInstalacao({ checklist }: { checklist: ChecklistVisto }) {
  const t = useT();
  const T = TEXTOS_DO_CHECKLIST;
  const resumo = checklist.tudoPronto
    ? T.tudoPronto
    : checklist.essencialPronto
      ? T.essencialPronto
      : T.faltaEssencial;
  const contagem = checklist.tudoPronto
    ? null
    : `${checklist.faltamObrigatorios + checklist.faltamOpcionais} ${t(T.falta).toLowerCase()}`;

  return (
    <Card className="p-0" data-testid="checklist-da-instalacao">
      <details open={!checklist.essencialPronto} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
          {checklist.tudoPronto ? (
            <CheckCircle
              size={22}
              weight="fill"
              className="mt-0.5 shrink-0 text-success"
              aria-hidden
            />
          ) : checklist.essencialPronto ? (
            <CheckCircle size={22} className="mt-0.5 shrink-0 text-success" aria-hidden />
          ) : (
            <WarningCircle
              size={22}
              weight="fill"
              className="mt-0.5 shrink-0 text-warning"
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t(T.titulo)}</h2>
            <p className="text-sm text-muted-foreground" data-testid="checklist-resumo">
              {t(resumo)}
            </p>
          </div>
          {contagem ? (
            <span className="shrink-0 pt-1 text-xs text-muted-foreground">{contagem}</span>
          ) : null}
          <CaretDown
            size={16}
            className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ul className="divide-y border-t">
          {checklist.itens.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-testid={`checklist-${item.id}`}
              data-feito={item.feito ? "sim" : "nao"}
            >
              <IconeDoEstado item={item} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{t(item.nome)}</span>
                  <Badge
                    variant={item.nivel === "obrigatorio" ? "warning" : "secondary"}
                    className="text-[11px]"
                  >
                    {t(item.nivel === "obrigatorio" ? T.obrigatorio : T.opcional)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t(item.oQueFaz)}</p>
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  item.feito
                    ? "text-success-fg"
                    : item.estado === "nao_lido"
                      ? "text-muted-foreground"
                      : "text-foreground",
                )}
              >
                {t(item.feito ? T.feito : item.estado === "nao_lido" ? T.naoLido : T.falta)}
              </span>
              <Button asChild size="sm" variant={item.feito ? "ghost" : "outline"}>
                <Link href={item.href}>{t(item.feito ? T.revisar : T.configurar)}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function IconeDoEstado({ item }: { item: ItemDoChecklistVisto }) {
  if (item.feito)
    return <CheckCircle size={18} weight="fill" className="shrink-0 text-success" aria-hidden />;
  if (item.estado === "nao_lido")
    return <Question size={18} className="shrink-0 text-muted-foreground" aria-hidden />;
  if (item.nivel === "obrigatorio")
    return <WarningCircle size={18} weight="fill" className="shrink-0 text-warning" aria-hidden />;
  return <Circle size={18} className="shrink-0 text-muted-foreground" aria-hidden />;
}

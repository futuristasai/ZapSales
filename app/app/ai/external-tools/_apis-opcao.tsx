"use client";
/**
 * Como UMA opção de segurança das APIs aparece na tela (issue #372).
 *
 * Quem configura não é programador, e a regra do produto é que nenhuma opção apareça «pelada»:
 * toda opção mostra o nome, o que faz, um exemplo, a posição recomendada e — quando está fora
 * dela — o selo «Fora do recomendado» com o risco escrito. Os textos vêm de
 * `lib/ai/ferramentas-externas/api/opcoes.ts`; este componente só os desenha, sempre do mesmo
 * jeito, na organização e em cada API.
 */
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import { opcaoExplicada } from "@/lib/ai/ferramentas-externas/api/opcoes";

export function OpcaoDeSeguranca({
  id,
  fora,
  children,
}: {
  /** O id da opção em `OPCOES_EXPLICADAS`. */
  id: string;
  /** A opção está fora da posição recomendada agora? */
  fora: boolean;
  /** O controle (interruptor, lista, campo). */
  children: ReactNode;
}) {
  const t = useT();
  const opcao = opcaoExplicada(id);
  return (
    <section
      className="space-y-2 rounded-md border border-border/60 p-3"
      data-testid={`opcao-${id}`}
      data-fora={fora ? "sim" : "nao"}
      aria-label={t(opcao.nome)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{t(opcao.nome)}</h4>
        {fora ? (
          <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg" data-testid={`selo-fora-${id}`}>
            {t("Fora do recomendado")}
          </Badge>
        ) : opcao.comAlerta ? (
          <Badge variant="outline" className="border-success/40 text-[11px] text-success-fg" data-testid={`selo-recomendado-${id}`}>
            {t("Na posição recomendada")}
          </Badge>
        ) : null}
      </div>
      <p className="max-w-[68ch] text-sm text-muted-foreground">{t(opcao.oQueFaz)}</p>
      <p className="max-w-[68ch] text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">{t("Exemplo:")}</strong> {t(opcao.exemplo)}
      </p>
      <div className="pt-1">{children}</div>
      <p className="max-w-[68ch] text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">{t("Recomendação:")}</strong> {t(opcao.recomendacao)}
      </p>
      {fora || !opcao.comAlerta ? (
        <p
          role={fora ? "alert" : undefined}
          className={`max-w-[68ch] text-xs ${fora ? "text-warning-fg" : "text-muted-foreground"}`}
          data-testid={`risco-${id}`}
        >
          <strong className="font-medium">{t("Risco:")}</strong> {t(opcao.risco)}
        </p>
      ) : null}
    </section>
  );
}

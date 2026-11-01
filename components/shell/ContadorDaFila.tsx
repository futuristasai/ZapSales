"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Quantas conversas esperam uma PESSOA — o número ao lado de "Inbox" no menu.
 *
 * É a aba Fila: conversa sem dono em que o automático saiu de campo — a IA
 * passou a conversa para a equipe (cliente irritado, pedido de atendente,
 * reclamação) ou alguém a devolveu à fila. Medido numa loja (26/09/2026): a IA
 * passou duas conversas numa manhã e o dono só soube abrindo o Inbox e
 * procurando; pediu para "ver as transferências no menu". Reusa a MESMA
 * contagem das abas do Inbox (sem filtros, a chave do React Query é a mesma).
 */
export function ContadorDaFila({
  compacto,
  naFaixa = false,
}: {
  compacto: boolean;
  /**
   * O número sobre o ícone de Todo dia na faixa (issue #188). Mesmo dado, mesma
   * regra — zero não desenha nada —, só que pousado no canto do botão em vez de
   * empurrado para a ponta da linha. Vale `compacto` ou não: a faixa nunca mostra
   * só um ponto, porque "tem alguém esperando" e "tem 3 esperando" são avisos
   * diferentes.
   */
  naFaixa?: boolean;
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);
  const esperando = data?.fila ?? data?.unassigned ?? 0;
  if (!esperando) return null;
  const rotulo =
    esperando === 1 ? t("1 conversa esperando uma pessoa") : `${esperando} ${t("conversas esperando uma pessoa")}`;
  return (
    <span
      data-testid="contador-da-fila"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        // Texto claro no tema claro e escuro no tema escuro: o vermelho do escuro é
        // mais claro, e branco sobre ele não chega ao contraste mínimo.
        "rounded-full bg-error text-[10px] font-semibold leading-none text-white tabular-nums dark:text-neutral-900",
        naFaixa
          ? "absolute right-2 top-1 min-w-[1.125rem] px-1 py-[3px] text-center"
          : compacto
            ? "absolute top-1 right-1 h-2 w-2"
            : "ml-auto px-1.5 py-0.5",
      )}
    >
      {compacto && !naFaixa ? null : esperando}
    </span>
  );
}

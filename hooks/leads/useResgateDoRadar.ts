"use client";
import { useQuery } from "@tanstack/react-query";

import type { AtRiskData } from "@/hooks/leads/useAtRiskLeads";
import { apiClient } from "@/lib/api/client";
import type { SituacaoNoRadar } from "@/lib/leads/radar-de-risco";

/** O teto da rota — o do pool que o radar varre no servidor. */
export const TETO_DO_RESGATE = 500;

/**
 * TODOS os negócios de uma situação, para montar o público do resgate.
 *
 * A lista da tela vem de 50 em 50; o resgate é sobre o conjunto que o contador
 * mostra, não sobre as linhas que por acaso estão carregadas. Por isso é uma
 * busca à parte, com o teto da rota, feita só quando o diálogo abre.
 *
 * A chave começa por `"leads-at-risk"` como as da lista: quem invalida o radar
 * (assumir uma conversa) invalida esta também.
 */
export function useNegociosDoResgate(visao: "todos" | SituacaoNoRadar, aberto: boolean) {
  return useQuery({
    queryKey: ["leads-at-risk", "resgate", visao],
    enabled: aberto,
    staleTime: 0,
    queryFn: () => {
      const q = new URLSearchParams({ limit: String(TETO_DO_RESGATE) });
      if (visao !== "todos") q.set("risk", visao);
      return apiClient.get<{ data: AtRiskData }>(`/api/v1/leads/at-risk?${q}`).then((r) => r.data);
    },
  });
}

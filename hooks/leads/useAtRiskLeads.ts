"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/**
 * O tipo vem da ROTA, não é redigitado aqui. Uma cópia local já custou caro nesta
 * entrega: o dono-agente entrou na rota e o radar continuou exibindo "Sem dono"
 * porque a cópia não sabia da coluna nova — e o compilador não reclamou, porque
 * as duas versões eram válidas separadamente. Contrato duplicado é contrato que
 * diverge em silêncio.
 */
export type { AtRiskLead } from "@/app/api/v1/leads/at-risk/route";
import type { AtRiskLead } from "@/app/api/v1/leads/at-risk/route";
import type {
  DemandaSemProximoPasso,
  PropostaEsperandoRevisao,
  PropostaVencidaSemRetomada,
  SituacaoNoRadar,
} from "@/lib/leads/radar-de-risco";

export interface AtRiskData {
  items: AtRiskLead[];
  counts: { critico: number; em_risco: number; em_voo: number };
  total: number;
  /** Invariante 4 (passo 4 do cap. 5): demandas abertas sem próximo passo. */
  sem_proximo_passo: DemandaSemProximoPasso[];
  total_sem_proximo_passo: number;
  /** N3: negócios com proposta vencida e sem proposta mais nova. */
  propostas_vencidas_sem_retomada: PropostaVencidaSemRetomada[];
  /** C6: rascunhos com aviso de revisão aberto na Central. */
  propostas_esperando_revisao: PropostaEsperandoRevisao[];
}

export interface FiltroDoRadar {
  /** Só uma situação; sem ela vêm todas, da mais urgente para a menos. */
  risk?: SituacaoNoRadar;
  /** Quantas linhas pedir (a tela cresce de 50 em 50 com "Mostrar mais"). */
  limit?: number;
}

/**
 * Radar de risco (C1). Polling 60s — a atividade dos leads muda no worker/inbox.
 *
 * A chave começa por `"leads-at-risk"` em TODAS as variações: quem invalida por
 * esse prefixo (assumir uma conversa, por exemplo) alcança a lista filtrada
 * também. `keepPreviousData` segura as linhas na tela enquanto o filtro novo
 * carrega — sem ele a lista pisca vazia a cada clique.
 */
export function useAtRiskLeads(filtro: FiltroDoRadar = {}) {
  const risk = filtro.risk ?? null;
  const limit = filtro.limit ?? 50;
  return useQuery({
    queryKey: ["leads-at-risk", { risk, limit }],
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (risk) q.set("risk", risk);
      return apiClient.get<{ data: AtRiskData }>(`/api/v1/leads/at-risk?${q}`).then((r) => r.data);
    },
  });
}

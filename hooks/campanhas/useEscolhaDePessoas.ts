"use client";
/**
 * Os dados da tabela "escolher pessoas do CRM": as etiquetas que existem nos contatos e as
 * pessoas que a busca e os filtros encontram. Só leitura — quem vira público é quem o operador
 * marca, e isso mora na tela da campanha.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { ContatoDaTabela } from "@/lib/campanhas/escolha-de-contatos";

export interface FiltrosDaTabela {
  com_alguma_tag: string[];
  sem_tags: string[];
  funis: string[];
  etapas: string[];
  sem_interacao_ha_dias: number | null;
}

export interface PessoasEncontradas {
  contatos: ContatoDaTabela[];
  total: number;
  /** Bateu no teto: pode haver mais gente do que a lista mostra. */
  cortado: boolean;
  /** Motivo (código) → frase. A tela traduz. */
  legenda: Record<string, string>;
}

/** As etiquetas que as pessoas do CRM já têm — para escolher, em vez de digitar. */
export function useEtiquetasDoCrm() {
  return useQuery({
    queryKey: ["campanhas-etiquetas-do-crm"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> =>
      (await apiClient.get<{ data: string[] }>("/api/v1/contact-tags")).data,
  });
}

export function usePessoasEncontradas(
  corpo: { filtros: FiltrosDaTabela; busca: string; campanhaId?: string } | null,
) {
  return useQuery({
    queryKey: ["campanhas-pessoas-encontradas", corpo],
    enabled: corpo !== null,
    staleTime: 15_000,
    // Trocar o filtro não pisca a tabela: a lista anterior fica até a nova chegar.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PessoasEncontradas> =>
      (
        await apiClient.post<{ data: PessoasEncontradas }>("/api/v1/campaigns/contatos", {
          audience_filter: corpo!.filtros,
          busca: corpo!.busca,
          ...(corpo!.campanhaId ? { campaign_id: corpo!.campanhaId } : {}),
        })
      ).data,
  });
}

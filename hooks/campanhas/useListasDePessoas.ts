"use client";
/**
 * As listas salvas de pessoas do disparo em massa: ver, salvar as pessoas marcadas com um nome,
 * usar (trazer as pessoas de volta para a tabela) e apagar. A lista é FIXA — guarda pessoas, não
 * filtro — e os vetos de envio são conferidos na hora de usá-la.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { ContatoDaTabela } from "@/lib/campanhas/escolha-de-contatos";
import type { ListaSalva } from "@/lib/campanhas/listas-de-pessoas";

export type { ListaSalva };

export interface PessoasDaLista {
  contatos: ContatoDaTabela[];
  /** Quantas pessoas a lista guarda. */
  guardadas: number;
  /** Quantas delas ainda existem como pessoa desta organização. */
  total: number;
  /** Motivo (código) → frase. A tela traduz. */
  legenda: Record<string, string>;
}

const CHAVE = ["campanhas-listas-de-pessoas"] as const;

export function useListasDePessoas() {
  return useQuery({
    queryKey: CHAVE,
    staleTime: 30_000,
    queryFn: async (): Promise<ListaSalva[]> =>
      (await apiClient.get<{ data: ListaSalva[] }>("/api/v1/campaigns/listas")).data,
  });
}

export function useSalvarListaDePessoas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: { name: string; contact_ids: string[] }): Promise<ListaSalva> =>
      (await apiClient.post<{ data: ListaSalva }>("/api/v1/campaigns/listas", corpo)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE }),
    onError: (err) => showApiError(err),
  });
}

export function useApagarListaDePessoas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/campaigns/listas/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE }),
    onError: (err) => showApiError(err),
  });
}

/** Traz as pessoas de uma lista, já com o motivo de quem não pode receber. */
export function useUsarListaDePessoas() {
  return useMutation({
    mutationFn: async (entrada: { id: string; campanhaId?: string }): Promise<PessoasDaLista> => {
      const busca = entrada.campanhaId ? `?campaign_id=${entrada.campanhaId}` : "";
      return (
        await apiClient.get<{ data: PessoasDaLista }>(
          `/api/v1/campaigns/listas/${entrada.id}${busca}`,
        )
      ).data;
    },
    onError: (err) => showApiError(err),
  });
}

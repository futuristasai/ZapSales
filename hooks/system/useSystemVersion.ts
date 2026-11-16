"use client";
import { useQuery } from "@tanstack/react-query";

import { useDepoisDaAbertura } from "@/lib/ui/depois-da-abertura";

import { apiClient } from "@/lib/api/client";
import type { RodadaDoBanco } from "@/lib/system/update-run";

export interface SystemVersion {
  current_version: string;
  is_owner: boolean;
  latest_version?: string;
  update_available?: boolean;
  off_release?: boolean;
  /** O host não conseguiu comparar a versão instalada com a última publicada. */
  compare_failed?: boolean;
  /** O host já viu ao menos uma tag `v*` publicada neste repositório. */
  has_known_release?: boolean;
  /** O programa do servidor bateu nos últimos 5 minutos. */
  agent_online?: boolean;
  /** A última batida do programa do servidor (issue #311). */
  agent_last_seen_at?: string | null;
  /**
   * `false` quando a instalação anda pela main e o programa do servidor só
   * anuncia a versão: quem atualiza é a implantação contínua (issue #311).
   */
  executes_updates?: boolean;
  /** O backup como o programa do servidor contou. Nulo = ainda não contou. */
  backup?: {
    last_backup_at: string | null;
    last_offsite_backup_at: string | null;
    offsite_configured: boolean | null;
  };
  /** As últimas rodadas pedidas pela tela, da mais nova à mais velha. */
  history?: Array<{
    id: string;
    dispatched_at: string;
    finished_at: string | null;
    from_version: string;
    to_version: string;
    status: string;
    requested_by_email: string | null;
  }>;
  /**
   * A atualização terminou bem e o host ainda não confirmou (janela de até 5
   * min). Fora dela é `false` — o campo se fecha sozinho.
   */
  just_updated?: boolean;
  notes?: {
    /** Um por versão da faixa que tem aviso, do mais novo ao mais antigo. */
    requires_attention: Array<{ version: string; texto: string }>;
    /** Todas as seções entre a versão no ar e a alvo, da mais nova à mais antiga. */
    sections: Array<{ version: string; body: string }>;
    /** `false`: o texto recebido pode não alcançar a versão instalada. */
    complete: boolean;
  } | null;
  run?: {
    id: string;
    status: string;
    last_step: string | null;
    /** Quando o pedido foi registrado — a tela conta o tempo a partir daqui. */
    dispatched_at?: string;
    /** Versão que estava instalada quando o run começou. */
    from_version: string;
    /** Versão que o run tentou instalar. */
    to_version: string;
    /** Últimas linhas da saída do update.sh — o diagnóstico da falha. */
    log_tail: string;
    /**
     * A falha deste run já foi superada por um deploy posterior (o host reporta
     * uma versão que o run não descreve). A tela deixa de mostrar o aviso dela.
     */
    superseded?: boolean;
    /**
     * O que a rodada contou sobre o banco — se a base estava ocupada (disputa),
     * quantas retentativas custou e em qual passada fechou. Vem da linha do run;
     * ausente quando ninguém mediu (rodada que não passou pelo banco), e a tela
     * fica calada nesse caso em vez de afirmar zero.
     */
    rodada_do_banco?: RodadaDoBanco | null;
  } | null;
}

/**
 * Estado da versão desta instalação. Fonte única do rodapé da sidebar, da tela
 * de atualização e dos cartões Versão e Backup do Painel do admin. Poll folgado
 * (5 min) por padrão: o rodapé não precisa de mais; a tela de atualização pede 5 s.
 */
export function useSystemVersion(opts?: { refetchInterval?: number; depoisDaAbertura?: boolean }) {
  // O rodapé da sidebar mostra a versão numa letra miúda: não precisa competir
  // com as chamadas que preenchem a tela ao abrir (#66). A tela de atualização,
  // que É a informação, segue pedindo na hora.
  const liberado = useDepoisDaAbertura();
  const habilitado = opts?.depoisDaAbertura ? liberado : true;
  return useQuery({
    enabled: habilitado,
    queryKey: ["system-version"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SystemVersion }>("/api/v1/system/version");
      return res.data;
    },
    staleTime: 60_000,
    refetchInterval: opts?.refetchInterval ?? 5 * 60_000,
  });
}

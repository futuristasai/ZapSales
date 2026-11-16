/**
 * A FILA DE TAREFAS está andando? — leitura do `event_log` para o Painel da
 * administração (issue #310).
 *
 * ── A régua: atraso, não idade ───────────────────────────────────────────────
 *
 * "O evento pendente mais antigo" mente. Medido na produção em 15/11/2026: os únicos dois
 * `pending` eram pedidos de roteamento de 31/10 — com `next_attempt_at` no FUTURO, porque o
 * roteador os reagenda de propósito enquanto espera um atendente. Pela idade, a fila estaria
 * parada há 15 dias; ela estava em dia.
 *
 * Então a pergunta é a do próprio processador (`lib/event-log/drain.ts`): o que está
 * `pending` e JÁ podia rodar (`next_attempt_at` nulo ou vencido) — e há quanto tempo podia.
 * Esse atraso é o que cresce quando o agendador para.
 *
 * Duas consultas em vez de uma porque o PostgREST não ordena por `coalesce`: a mais antiga
 * sem reagendamento (pela criação) e a mais antiga reagendada já vencida (pelo
 * reagendamento). Cada uma devolve um instante, e só ele — nenhum payload sai daqui.
 *
 * NUNCA LANÇA: falha de leitura vira `null` ("não consegui ler"), nunca vermelho.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LeituraDaFila } from "./da-instalacao";

export async function lerAtrasoDaFila(
  admin: SupabaseClient,
  agoraMs: number = Date.now(),
): Promise<LeituraDaFila> {
  try {
    const agoraIso = new Date(agoraMs).toISOString();
    const [semReagendar, reagendadoVencido] = await Promise.all([
      admin
        .from("event_log")
        .select("created_at")
        .eq("status", "pending")
        .is("next_attempt_at", null)
        .order("created_at", { ascending: true })
        .limit(1),
      admin
        .from("event_log")
        .select("next_attempt_at")
        .eq("status", "pending")
        .lte("next_attempt_at", agoraIso)
        .order("next_attempt_at", { ascending: true })
        .limit(1),
    ]);
    if (semReagendar.error || reagendadoVencido.error) return null;
    const instantes = [
      (semReagendar.data?.[0] as { created_at?: string } | undefined)?.created_at,
      (reagendadoVencido.data?.[0] as { next_attempt_at?: string } | undefined)?.next_attempt_at,
    ]
      .map((iso) => (iso ? Date.parse(iso) : Number.NaN))
      .filter((ms) => Number.isFinite(ms));
    if (instantes.length === 0) return { atrasoSegundos: null };
    return { atrasoSegundos: Math.max(0, Math.floor((agoraMs - Math.min(...instantes)) / 1000)) };
  } catch {
    return null;
  }
}

/**
 * A sonda do transporte por QR code — a mesma do `/api/v1/health` (campo `checks.waha`),
 * agora também lida pelo Painel da administração (issue #310).
 *
 * Mora na fronteira de canais porque nomeia o provedor (`scripts/lint-channels.ts`): quem
 * está fora dela pergunta "o transporte por QR code responde?" sem saber qual é.
 */
import "server-only";

import { env } from "@/lib/env";
import { alvoDe, classificarFalhaDeAlcance } from "@/lib/net/alcance";
import { motivoDoStatusHttp, withTimeout, type Check } from "@/lib/saude/sonda";

export async function sondarTransporteQr(): Promise<Check> {
  const t0 = Date.now();
  const base = env.WAHA_API_BASE_URL;
  if (!base) {
    return {
      status: "degraded",
      latency_ms: 0,
      error: "not_configured",
      reason: "nao_configurado",
    };
  }
  try {
    // /api/sessions valida conectividade E autenticação num tiro só. O WAHA Core não
    // expõe /api/health (daria 404 mesmo autenticado).
    const res = await withTimeout(
      fetch(`${base.replace(/\/$/, "")}/api/sessions`, {
        headers: env.WAHA_API_KEY ? { "X-Api-Key": env.WAHA_API_KEY } : {},
        cache: "no-store",
      }),
    );
    if (!res.ok) {
      return {
        status: "down",
        latency_ms: Date.now() - t0,
        error: `http_${res.status}`,
        reason: motivoDoStatusHttp(res.status),
        target: alvoDe(base),
      };
    }
    return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(base) };
  } catch (e) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      reason: classificarFalhaDeAlcance(e),
      target: alvoDe(base),
    };
  }
}

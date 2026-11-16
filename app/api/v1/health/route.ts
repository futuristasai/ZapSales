/**
 * GET /api/v1/health — Supabase, Redis e WAHA respondem?
 *
 * ─── Por que cada check diz a CAUSA, e não só "down" ─────────────────────────
 * A versão anterior devolvia `error: "fetch failed"` — a mensagem que o `fetch`
 * dá para causas opostas. Com ela, produção passou semanas indistinguível entre
 * "o endereço configurado não existe" e "o serviço caiu", e a leitura que
 * prevaleceu foi a segunda: o dono reiniciava, toda vez, um container que nunca
 * havia caído (medido: `restarts=0`). Um diagnóstico que não separa configuração
 * de disponibilidade manda metade das pessoas para o lugar errado — e sempre a
 * mesma metade, porque "o serviço caiu" é a hipótese que não acusa quem
 * configurou.
 *
 * `reason` é a classificação (ver `lib/net/alcance`), e é o que basta para saber
 * ONDE mexer.
 *
 * ─── Por que o ENDEREÇO só sai autenticado ───────────────────────────────────
 * Esta rota é pública — é o que permite um monitor externo bater nela. O endereço
 * do Redis e do WAHA é superfície de ataque: publicá-lo entrega a quem varre a
 * internet o alvo exato de dois serviços que falam com o WhatsApp do cliente.
 * Então `target` só sai com `?verbose=1` mais o mesmo segredo interno dos crons:
 * quem opera o sistema vê para onde ele tentou ir; quem só passa na frente, não.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { sondarTransporteQr } from "@/lib/channels/sonda-do-transporte-qr";
import { semAlvo, type Check } from "@/lib/saude/sonda";
import { checkRedis, checkSupabase } from "@/lib/saude/sondas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// As sondas moram em `lib/saude/` (e a do transporte por QR code, em `lib/channels/`)
// desde a issue #310: o Painel da administração faz a mesma pergunta que esta rota.

/**
 * O segredo interno dos crons também abre o modo verboso. Mesmo contrato de
 * `/api/v1/system/agent`: Bearer, comparação em tempo constante, e segredo vazio
 * nunca vira credencial válida.
 */
function segredoInternoConfere(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const fornecido = bearer || (req.headers.get("x-cron-secret")?.trim() ?? "");
  if (!fornecido) return false;
  const aceitos = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  return aceitos.some((esperado) => {
    const a = Buffer.from(fornecido);
    const b = Buffer.from(esperado);
    // timingSafeEqual LANÇA se os tamanhos diferirem.
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function GET(req: NextRequest) {
  const [supabase, redis, waha] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    sondarTransporteQr(),
  ]);

  const verboso = req.nextUrl.searchParams.get("verbose") === "1" && segredoInternoConfere(req);
  const filtrar = verboso ? (c: Check) => c : semAlvo;
  const checks = { supabase: filtrar(supabase), redis: filtrar(redis), waha: filtrar(waha) };

  const anyDown = Object.values(checks).some((c) => c.status === "down");
  const anyDegraded = Object.values(checks).some((c) => c.status === "degraded");
  const status: "healthy" | "degraded" | "unhealthy" = anyDown
    ? "unhealthy"
    : anyDegraded
      ? "degraded"
      : "healthy";

  const httpStatus = status === "unhealthy" ? 503 : 200;

  return NextResponse.json(
    {
      data: {
        status,
        // APP_VERSION é injetada no build da imagem (ARG no Dockerfile) e vale
        // "1.2.3" numa release, ou o SHA curto fora de tag.
        //
        // Antes isto era `process.env.npm_package_version ?? "0.1.0"`, e a
        // variável só existe quando o processo nasce de um `npm`/`pnpm run`. O
        // CMD da imagem é `node server.js`: TODA instalação do mundo reportava
        // "0.1.0". Um campo que responde o valor errado com confiança é pior que
        // um campo ausente — ele desliga a pergunta em vez de deixá-la aberta.
        // Por isso o fallback agora é "desconhecido", e não um número plausível.
        version: process.env.APP_VERSION || "desconhecido",
        timestamp: new Date().toISOString(),
        checks,
      },
    },
    { status: httpStatus },
  );
}

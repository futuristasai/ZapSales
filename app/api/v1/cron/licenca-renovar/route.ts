/**
 * GET /api/v1/cron/licenca-renovar
 *
 * Mantém o selo da instalação em dia: pergunta ao servidor de licenças se a licença continua valendo e grava o
 * selo novo (ou o bloqueio). Roda a cada 5 minutos, mas só conversa com o servidor quando `proxima_consulta_em`
 * (no banco) venceu — em instalação saudável, cerca de 1 passada em 12 (1 hora, com variação). O restante é
 * uma leitura barata e termina em `adiada`.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seções 3.2 e 4. Cliente: `lib/licenca/renovar.ts`.
 *
 * ── ESTA ROTA NÃO TEM A PORTA DA LICENÇA, DE PROPÓSITO ────────────────────────────────────────────────────
 *
 * Todo cron passa pela guarda da licença (lib/licenca/recusa.ts): instalação vencida ou bloqueada não trabalha. Esta é a
 * exceção, e a única que não é dever legal: se a porta a recusasse, uma instalação com a autorização vencida
 * (por um servidor fora do ar durante dois dias, por exemplo) nunca conseguiria buscar a renovação que a
 * destrava — o vencimento viraria definitivo. Está declarada em `CRONS_SEM_PORTA` na cerca
 * `tests/unit/licenca-portas-chamam-a-decisao.test.ts`, com esta razão.
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fecha quando falta o segredo).
 *
 * Auditoria: UMA linha quando a rodada mudou o estado (selo novo ou bloqueio). Rodada que não conversou, ou que
 * conversou e nada mudou, não é mutação e não audita (`tests/unit/cron-audita-so-quando-ha-efeito.test.ts`).
 * A falha do servidor não vai para a trilha: vai para o log, com espera crescente, e o selo vigente segue
 * valendo até vencer.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { renovarLicenca } from "@/lib/licenca/renovar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const rodada = await renovarLicenca();

  // Só o que mudou o estado deixa rastro. O selo e a credencial nunca vão para a trilha: só o tipo e o código.
  if (rodada.resultado === "renovada") {
    void audit({
      action: "license.renewed",
      organizationId: null,
      bypassedRls: true,
      metadata: { tipo: rodada.tipo },
      requestId,
    });
  } else if (rodada.resultado === "bloqueada") {
    void audit({
      action: "license.blocked_by_server",
      organizationId: null,
      bypassedRls: true,
      metadata: { codigo: rodada.codigo },
      requestId,
    });
  }

  return ok({ resultado: rodada.resultado }, { requestId });
}

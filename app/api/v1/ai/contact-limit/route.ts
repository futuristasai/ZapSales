import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET   /api/v1/ai/contact-limit — o teto de atendimentos automáticos por contato (manager+).
 * PATCH /api/v1/ai/contact-limit — muda o teto por hora e/ou por dia (admin).
 *
 * Issue #271. `organization_id` vem do JWT via `requireRole` — nunca do body. A
 * escrita usa o client de serviço e filtra a organização explicitamente:
 * `ai_budgets` não é gravável pela sessão desde a migration 0160.
 *
 * Rota própria, e não mais um campo no PATCH do orçamento: lá vale a escada
 * `off → avisar → bloquear` com piso e carência, e nada disso se aplica a este
 * teto, que nasce LIGADO com um padrão folgado. Misturar as duas regras num
 * payload só faria uma herdar as recusas da outra.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { TETO_POR_CONTATO_MAXIMO } from "@/lib/agent-engine/agent/teto-por-contato";
import { gravarTetoPorContato, lerTetoPorContato } from "@/lib/ai/budget/teto-por-contato";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const campo = z.number().int().min(0).max(TETO_POR_CONTATO_MAXIMO);

const patchSchema = z
  .strictObject({ por_hora: campo.optional(), por_dia: campo.optional() })
  .refine((v) => v.por_hora !== undefined || v.por_dia !== undefined, {
    message: "Informe ao menos um campo: por_hora ou por_dia.",
  });

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_budget" });
  if (!authz.ok) return authz.response;
  return ok(await lerTetoPorContato(authz.org.orgId), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_budget" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("validation_failed", t("JSON inválido."), 422, { requestId });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", t("Informe um número inteiro entre 0 e 10.000."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  const antes = await lerTetoPorContato(org.orgId, admin);
  const gravou = await gravarTetoPorContato(admin, org.orgId, parsed.data);
  if (!gravou.ok) {
    logger.error("teto-por-contato: escrita falhou", {
      organization_id: org.orgId,
      request_id: requestId,
      causa: gravou.causa,
    });
    return fail("internal_error", t("Não foi possível salvar o limite por contato."), 500, {
      requestId,
    });
  }
  const depois = await lerTetoPorContato(org.orgId, admin);

  void audit({
    action: "ai.contact_reply_limit_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_budgets",
    resourceId: org.orgId,
    requestId,
    metadata: {
      por_hora: { antes: antes.por_hora, depois: depois.por_hora },
      por_dia: { antes: antes.por_dia, depois: depois.por_dia },
    },
  });

  return ok(depois, { requestId });
}

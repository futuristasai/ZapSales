import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * Épico Operação Visível (F1) — PATCH: arquiva/reativa uma entrada de memória
 * da org (migration 0067). Filtro `organization_id` sempre (admin client
 * bypassa RLS).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { decidirPropostaDeRegra } from "@/lib/ai/memoria/propostas";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const patchSchema = z.object({ status: z.enum(["archived", "active"]) });

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "org_memory" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org } = authz;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", t("status inválido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();

  // ─── PROPOSTA DO AGENTE (#272) ───────────────────────────────────────────
  //
  // Uma entrada `proposed` não é arquivada nem reativada — é DECIDIDA: `active`
  // aprova (a regra passa a valer no próximo atendimento) e `archived` recusa.
  // O caminho é próprio por três razões: a trava otimista (só muda o que ainda
  // está `proposed`), a ação de auditoria (quem aprovou uma regra é pergunta
  // que alguém vai fazer sozinha) e o aviso da Central, que fecha quando a
  // última proposta é decidida.
  const { data: atual, error: erroDaLeitura } = await admin
    .from("org_memory_entries")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (erroDaLeitura || !atual) {
    return fail("not_found", t("Entrada de memória não encontrada nesta organização."), 404, {
      requestId,
    });
  }
  if (atual.status === "proposed") {
    const decisao = parsed.data.status === "active" ? "aprovar" : "recusar";
    let decidida: Awaited<ReturnType<typeof decidirPropostaDeRegra>>;
    try {
      decidida = await decidirPropostaDeRegra(admin, { organizationId: org.orgId, id, decisao });
    } catch {
      return fail("internal_error", t("Não foi possível decidir a proposta."), 500, { requestId });
    }
    if (!decidida) {
      return fail("conflict", t("Esta proposta já foi decidida por outra pessoa."), 409, { requestId });
    }
    await audit({
      action: decisao === "aprovar" ? "ai.org_memory_proposal_approved" : "ai.org_memory_proposal_rejected",
      actorUserId: authUser.id,
      organizationId: org.orgId,
      resourceType: "org_memory_entries",
      resourceId: id,
      requestId,
      metadata: { status: { antes: "proposed", depois: decidida.status } },
    });
    return ok({ id: decidida.id, status: decidida.status }, { requestId });
  }

  const { data, error } = await admin
    .from("org_memory_entries")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id, status")
    .single();
  if (error || !data) {
    return fail("not_found", t("Entrada de memória não encontrada nesta organização."), 404, {
      requestId,
    });
  }

  await audit({
    action: "ai.org_memory_entry_updated",
    actorUserId: authUser.id,
    organizationId: org.orgId,
    resourceType: "org_memory_entries",
    resourceId: id,
    requestId,
    metadata: { status: parsed.data.status },
  });

  return ok({ id: data.id, status: data.status }, { requestId });
}

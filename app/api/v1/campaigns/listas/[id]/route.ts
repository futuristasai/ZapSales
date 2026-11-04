/**
 * GET    /api/v1/campaigns/listas/[id] — as pessoas da lista, com o motivo de quem não pode receber.
 * DELETE /api/v1/campaigns/listas/[id] — apaga a lista (as pessoas e as campanhas não mudam).
 *
 * O GET devolve a MESMA forma da tabela de busca (`POST /campaigns/contatos`), pela mesma consulta:
 * usar uma lista salva não fura opt-out, anonimização, falta de telefone nem "já em campanha".
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { listarContatosPorIds } from "@/lib/campanhas/consulta-de-audiencia";
import {
  apagarLista,
  consultaDaListaSchema,
  lerIdsDaLista,
} from "@/lib/campanhas/listas-de-pessoas";
import { TEXTO_DA_EXCLUSAO } from "@/lib/campanhas/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return fail("lista_de_pessoas_nao_encontrada", t("Lista não encontrada."), 404, { requestId });
  }
  const consulta = consultaDaListaSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!consulta.success) {
    return fail("validation_failed", t("Campanha inválida."), 422, { requestId });
  }

  try {
    const admin = createAdminClient();
    const ids = await lerIdsDaLista(admin, authz.org.orgId, id);
    if (ids === null) {
      return fail("lista_de_pessoas_nao_encontrada", t("Lista não encontrada."), 404, {
        requestId,
      });
    }
    const contatos = await listarContatosPorIds(admin, {
      organizationId: authz.org.orgId,
      ids,
      campanhaId: consulta.data.campaign_id,
    });
    return ok(
      {
        contatos,
        // Quantas pessoas a lista guarda, e quantas ainda existem como pessoa desta organização.
        guardadas: ids.length,
        total: contatos.length,
        legenda: TEXTO_DA_EXCLUSAO,
      },
      { requestId },
    );
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return fail("lista_de_pessoas_nao_encontrada", t("Lista não encontrada."), 404, { requestId });
  }

  try {
    const apagada = await apagarLista(createAdminClient(), authz.org.orgId, id);
    if (!apagada) {
      return fail("lista_de_pessoas_nao_encontrada", t("Lista não encontrada."), 404, {
        requestId,
      });
    }
    void audit({
      action: "campaign.audience_list_deleted",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "campaign_audience_list",
      resourceId: id,
      requestId,
      metadata: { nome: apagada.name },
    });
    return ok({ id }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}

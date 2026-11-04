/**
 * GET  /api/v1/campaigns/listas — as listas salvas de pessoas da organização.
 * POST /api/v1/campaigns/listas — salva as pessoas marcadas como uma lista com nome.
 *
 * A lista é FIXA: guarda as pessoas, não o filtro. Os vetos de envio (opt-out, anonimizado, sem
 * telefone, já em campanha) não entram no que se guarda — valem na hora de usar a lista
 * (`GET /listas/[id]`), pela mesma régua da tabela de busca.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { criarLista, criarListaSchema, listarListas } from "@/lib/campanhas/listas-de-pessoas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  try {
    const listas = await listarListas(createAdminClient(), authz.org.orgId);
    return ok(listas, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = criarListaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      "validation_failed",
      t("Dê um nome à lista (de 2 a 80 letras) e marque ao menos uma pessoa."),
      422,
      {
        requestId,
        details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      },
    );
  }

  try {
    const resultado = await criarLista(createAdminClient(), {
      organizationId: authz.org.orgId,
      userId: authz.user.id,
      name: parsed.data.name,
      contactIds: parsed.data.contact_ids,
    });
    if (!resultado.ok) {
      if (resultado.motivo === "nome_repetido") {
        return fail(
          "lista_de_pessoas_nome_repetido",
          t("Já existe uma lista com esse nome."),
          409,
          {
            requestId,
          },
        );
      }
      if (resultado.motivo === "limite_de_listas") {
        return fail(
          "lista_de_pessoas_limite",
          t("Você já guarda o máximo de listas. Apague alguma para salvar outra."),
          422,
          { requestId },
        );
      }
      return fail(
        "lista_de_pessoas_vazia",
        t("Nenhuma das pessoas marcadas foi encontrada. Busque de novo e marque outra vez."),
        422,
        { requestId },
      );
    }

    void audit({
      action: "campaign.audience_list_created",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "campaign_audience_list",
      resourceId: resultado.lista.id,
      requestId,
      // Só o nome e o tamanho: quem está na lista é dado de pessoa e fica no banco, não no log.
      metadata: { nome: resultado.lista.name, pessoas: resultado.lista.total },
    });
    return ok(resultado.lista, { requestId, status: 201 });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}

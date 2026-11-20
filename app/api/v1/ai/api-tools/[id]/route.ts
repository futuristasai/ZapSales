import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * UMA API QUE O AGENTE USA (issue #372).
 *
 *   PATCH  — edita o cadastro (nome, «quando usar», endereço, campos, config, efeito, aprovação,
 *            validade), troca a credencial e liga/desliga (`ativa`). Reativar tira a ferramenta da
 *            pausa automática.
 *   DELETE — apaga, e só se nenhuma versão de agente a cita (histórico imutável); quem já foi
 *            usada se DESATIVA.
 *
 * Quem pode é o que a organização escolheu (administrador, por padrão), com a segunda etapa se
 * exigida. Editar exige o recurso LIGADO; DESATIVAR e APAGAR não — tirar uma API do ar tem de
 * ser possível com o recurso desligado. E PAUSAR (`{ ativa: false }`) não exige a segunda etapa:
 * é o freio de emergência de quem tem o papel.
 *
 * As travas da organização valem aqui como no cadastro, sobre o estado que a edição PRODUZ.
 * A organização vem da sessão. Id de outra organização, ou de ferramenta que não é API, é 404.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { editarApiSchema } from "@/lib/ai/ferramentas-externas/api/esquema";
import { camposAlteradosDaApi, editarApi } from "@/lib/ai/ferramentas-externas/api/repositorio";
import { portaoDeCadastro } from "@/lib/ai/ferramentas-externas/api/rotas";
import { avisarAdministrador } from "@/lib/ai/ferramentas-externas/api/seguranca-servidor";
import { FRASE_DA_TRAVA, travaDaFerramenta } from "@/lib/ai/ferramentas-externas/api/travas";
import type { ConfigDaApi } from "@/lib/ai/ferramentas-externas/api/tipos";
import { apagarFerramenta, buscarFerramenta } from "@/lib/ai/ferramentas-externas/repositorio";
import { fraseDaRecusaDeEndereco } from "@/lib/ai/ferramentas-externas/tipos";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }
  const parsed = editarApiSchema.safeParse(raw);
  // Só desligar (`{ ativa: false }`) passa com o recurso desligado.
  const soDesativa = parsed.success && Object.keys(parsed.data).length === 1 && parsed.data.ativa === false;

  const portao = await portaoDeCadastro(requestId, { exigirLigado: !soDesativa, exigirDuasEtapas: !soDesativa });
  if (!portao.ok) return portao.response;
  const { user, org, seguranca, admin, t } = portao;

  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos da API: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const patch = parsed.data;

  try {
    const atual = await buscarFerramenta(admin, org.orgId, id);
    if (!atual || atual.kind !== "api") return fail("not_found", t("API não encontrada."), 404, { requestId });

    // O estado que a edição PRODUZ é o que as travas julgam. Só DESATIVAR não é julgado: tirar do
    // ar o que uma trava passou a proibir é exatamente o que se quer permitir.
    const config = (patch.config ?? atual.api?.config) as ConfigDaApi | undefined;
    const efeito = patch.efeito ?? atual.effect;
    const url = patch.url ?? atual.url ?? "";
    if (!soDesativa) {
      if (!config) {
        return fail("validation_failed", t("O cadastro desta API está ilegível. Envie o cadastro inteiro de novo."), 422, { requestId });
      }
      const trava = travaDaFerramenta(seguranca, { efeito, urlModelo: url, config });
      if (trava) return fail("api_blocked_by_security", t(FRASE_DA_TRAVA[trava]), 422, { requestId, details: { trava } });
      const aprovacao = patch.pedir_aprovacao ?? (patch.efeito !== undefined && patch.efeito !== atual.effect ? null : atual.require_approval);
      if (seguranca.aprovacao_obrigatoria && efeito === "altera" && aprovacao === false) {
        return fail(
          "api_blocked_by_security",
          t("A segurança das APIs exige aprovação para toda ação que altera dados: não é possível salvar esta ferramenta com a aprovação desligada."),
          422,
          { requestId, details: { trava: "aprovacao_obrigatoria" } },
        );
      }
    }

    if (patch.url !== undefined) {
      const recusa = await motivoDaRecusaDeDestino(patch.url.replace(/\{\{[^}]*\}\}/g, "x"), "organizacao");
      if (recusa) {
        return fail("validation_failed", t(fraseDaRecusaDeEndereco(recusa)), 422, { requestId, details: { url: recusa } });
      }
    }

    const editada = await editarApi(admin, { organizationId: org.orgId, id, atorId: user.id, patch, atual });
    if (!editada.ok) {
      if (editada.erro === "nao_encontrada") return fail("not_found", t("API não encontrada."), 404, { requestId });
      if (editada.erro === "falta_credencial") {
        return fail("validation_failed", t("Informe a credencial da API."), 422, { requestId, details: { credencial: "ausente" } });
      }
      return fail(
        "encryption_unavailable",
        t("Não consigo guardar a credencial com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
        422,
        { requestId },
      );
    }
    const f = editada.ferramenta;
    const campos = camposAlteradosDaApi(patch);
    void audit({
      action: "ai.external_tool_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      // Os NOMES dos campos que mudaram — nunca os valores (o endereço pode levar um token, e a
      // credencial é segredo). O que NÃO é segredo e importa ao rastro vai com o valor.
      metadata: {
        kind: "api",
        slug: f.slug,
        fields: campos,
        credential_changed: patch.credencial !== undefined,
        ...(patch.ativa !== undefined ? { active: patch.ativa } : {}),
        ...(patch.pedir_aprovacao !== undefined ? { require_approval: patch.pedir_aprovacao } : {}),
        ...(patch.efeito !== undefined ? { effect: patch.efeito } : {}),
        ...(patch.config !== undefined
          ? {
              method: patch.config.metodo,
              contact_data: patch.config.dados_contato,
              usage_limit_per_conversation: patch.config.limite_por_conversa,
              usage_limit_per_day: patch.config.limite_por_dia,
              auto_pause_after: patch.config.pausa_apos_falhas,
            }
          : {}),
      },
    });
    // Ligar e desligar pelo interruptor da lista não vira aviso: é rotina, e encheria a Central.
    if (campos.some((c) => c !== "ativa")) {
      await avisarAdministrador(admin, org.orgId, seguranca.avisar_administrador, {
        titulo: `A API «${f.name}» foi alterada (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`,
        corpo:
          `O cadastro da API «${f.name}» foi alterado${patch.credencial !== undefined ? ", e a credencial foi trocada" : ""}. ` +
          `Quem alterou: ${user.email ?? user.id}.`,
      });
    }
    return ok(f, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível salvar a API."), 500, { requestId });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const portao = await portaoDeCadastro(requestId, { exigirLigado: false });
  if (!portao.ok) return portao.response;
  const { user, org, seguranca, admin, t } = portao;

  try {
    const antes = await buscarFerramenta(admin, org.orgId, id);
    if (!antes || antes.kind !== "api") return fail("not_found", t("API não encontrada."), 404, { requestId });
    const resultado = await apagarFerramenta(admin, org.orgId, id);
    if (resultado === "em_uso") {
      return fail(
        "external_tool_in_use",
        t("Esta API já faz parte de uma versão de agente e o histórico precisa dela. Desative em vez de apagar."),
        409,
        { requestId },
      );
    }
    if (resultado === "nao_encontrada") return fail("not_found", t("API não encontrada."), 404, { requestId });
    void audit({
      action: "ai.external_tool_deleted",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      metadata: { slug: antes.slug, kind: "api" },
    });
    await avisarAdministrador(admin, org.orgId, seguranca.avisar_administrador, {
      titulo: `A API «${antes.name}» foi apagada`,
      corpo: `A API «${antes.name}» foi apagada, com a credencial dela. Quem apagou: ${user.email ?? user.id}.`,
    });
    return ok({ id, deleted: true }, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível apagar a API."), 500, { requestId });
  }
}

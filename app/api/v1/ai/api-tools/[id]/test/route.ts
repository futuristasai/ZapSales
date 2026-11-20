import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/api-tools/:id/test — o botão «Testar de verdade» de uma API (issue #372).
 *
 * Chama a API DE VERDADE, com os dados de exemplo que a pessoa escreveu, e mostra o que o outro
 * sistema respondeu e o que foi enviado (método, endereço e corpo — nunca a credencial). É o
 * único caminho em que uma ferramenta executa fora de um atendimento real, e só por ação
 * explícita desta tela.
 *
 * Numa ferramenta que ALTERA algo, o teste é uma alteração de verdade no outro sistema — por isso
 * a tela avisa antes e a auditoria registra o efeito. Quem clica É a aprovação.
 *
 * O teste passa pelo MESMO portão do cadastro (papel, recurso ligado, segunda etapa) e pelas
 * MESMAS travas da execução: uma API que a segurança barra não é testada «só para ver». Os dados
 * do contato são os de EXEMPLO que a pessoa digitou — não há conversa aqui — e só entram os que a
 * ferramenta declara. O teste não conta no limite de uso nem na pausa automática.
 *
 * A resposta é sempre 200 com `ok: true|false` e a frase do que fazer: o erro do outro sistema é
 * resultado do teste, não falha da rota.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chamarApi } from "@/lib/ai/ferramentas-externas/api/chamar";
import { portaoDeCadastro } from "@/lib/ai/ferramentas-externas/api/rotas";
import { FRASE_DA_TRAVA } from "@/lib/ai/ferramentas-externas/api/travas";
import { DADOS_DO_CONTATO } from "@/lib/ai/ferramentas-externas/api/tipos";
import { fraseDoMotivo } from "@/lib/ai/ferramentas-externas/chamar";
import { validarArgumentos } from "@/lib/ai/ferramentas-externas/esquema";
import { buscarFerramenta, lerChaveDaFerramenta } from "@/lib/ai/ferramentas-externas/repositorio";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

const postSchema = z
  .object({
    arguments: z.record(z.string(), z.unknown()).default({}),
    /** Os dados de EXEMPLO do contato, digitados por quem testa. */
    contact: z
      .object(Object.fromEntries(DADOS_DO_CONTATO.map((d) => [d, z.string().trim().max(200).optional()])))
      .strict()
      .default({}),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  // Não grava no banco, mas dispara uma chamada para fora em nome da organização:
  // suporte temporário não faz isso por ela.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const portao = await portaoDeCadastro(requestId);
  if (!portao.ok) return portao.response;
  const { user, org, admin, t } = portao;

  let raw: unknown = {};
  try {
    const texto = await req.text();
    if (texto.trim()) raw = JSON.parse(texto);
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados de exemplo: o formato não é o esperado."), 422, { requestId });
  }

  try {
    const ferramenta = await buscarFerramenta(admin, org.orgId, id);
    if (!ferramenta || ferramenta.kind !== "api") return fail("not_found", t("API não encontrada."), 404, { requestId });
    if (ferramenta.unavailable_reason === "config_ilegivel" || !ferramenta.api) {
      return fail("validation_failed", t("O cadastro desta API está ilegível. Abra «Editar» e salve de novo."), 422, { requestId });
    }
    // As mesmas travas da execução: o que a segurança barra não é testado.
    const trava = ferramenta.unavailable_reason;
    if (trava && trava !== "mcp_desligado" && trava !== "servidor_desativado") {
      return fail("api_blocked_by_security", t(FRASE_DA_TRAVA[trava]), 409, { requestId, details: { trava } });
    }

    // Os dados de exemplo passam pela MESMA conferência do que o agente preenche.
    const validado = validarArgumentos(ferramenta.parameters, parsed.data.arguments);
    if (!validado.ok) return fail("validation_failed", validado.mensagem, 422, { requestId });

    const credencial = ferramenta.api.has_credential ? await lerChaveDaFerramenta(admin, org.orgId, id) : null;
    const resultado = await chamarApi({
      urlModelo: ferramenta.url ?? "",
      efeito: ferramenta.effect,
      api: { config: ferramenta.api.config, temCredencial: ferramenta.api.has_credential },
      credencial,
      argumentos: validado.valor,
      contato: parsed.data.contact,
    });

    // O fato, sem a credencial, sem o corpo enviado e sem o que o outro sistema respondeu.
    void audit({
      action: "ai.external_tool_tested",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      metadata: {
        slug: ferramenta.slug,
        effect: ferramenta.effect,
        kind: "api",
        method: ferramenta.api.config.metodo,
        ok: resultado.ok,
        http_status: resultado.httpStatus,
        attempts: resultado.tentativas,
        duration_ms: resultado.duracaoMs,
        ...(resultado.ok ? {} : { reason: resultado.motivo }),
      },
    });

    const base = {
      http_status: resultado.httpStatus,
      attempts: resultado.tentativas,
      duration_ms: resultado.duracaoMs,
      // O que saiu: método, endereço e corpo. Nunca a credencial nem cabeçalho nenhum.
      sent: resultado.enviado ?? null,
    };
    if (resultado.ok) {
      return ok({ ok: true as const, content: resultado.conteudo, truncated: resultado.truncado, ...base }, { requestId });
    }
    return ok({ ok: false as const, reason: resultado.motivo, message: t(fraseDoMotivo(resultado.motivo)), ...base }, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível testar a API."), 500, { requestId });
  }
}

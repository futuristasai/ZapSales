import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * AS APIs QUE O AGENTE USA (Agente de IA › Ferramentas externas › APIs) — issue #372.
 *
 *   GET  — a lista da organização, sem nenhuma credencial (só os 4 últimos caracteres), com a
 *          trava que barra cada uma agora, se houver. Gerente.
 *   POST — cadastra uma API: método, endereço-modelo, cabeçalhos fixos, corpo, credencial e as
 *          opções de segurança da ferramenta. Quem pode é o que a organização escolheu
 *          (administrador, por padrão), com o recurso LIGADO e, se exigida, a segunda etapa.
 *
 * ═══ O que esta rota garante ═══
 *
 *  - A credencial é cifrada e NUNCA volta, nem nesta resposta.
 *  - O endereço passa pela rede segura única ANTES de gravar (`https`, público, nunca da rede
 *    interna) e de novo a cada chamada; e o host nunca é marcador (o esquema recusa).
 *  - As TRAVAS da organização valem no cadastro: «somente consulta» recusa ferramenta que
 *    altera; a lista de endereços permitidos recusa host fora dela; dado do contato que a
 *    organização não liberou não entra; e, com «aprovação sempre obrigatória», não se cadastra
 *    ferramenta que altera com a aprovação desligada. As mesmas travas valem de novo na execução.
 *  - A organização vem da sessão, nunca do corpo (o schema é `strict`).
 *
 * `Idempotency-Key` (uuid, TTL 24h) é aceito. A credencial entra no hash do corpo (detecta reuso
 * da chave com outro conteúdo) e NUNCA no recibo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { criarApiSchema } from "@/lib/ai/ferramentas-externas/api/esquema";
import { criarApi, efeitoPadraoDoMetodo } from "@/lib/ai/ferramentas-externas/api/repositorio";
import { RECURSO_DAS_APIS, portaoDeCadastro, quemFez } from "@/lib/ai/ferramentas-externas/api/rotas";
import { avisarAdministrador } from "@/lib/ai/ferramentas-externas/api/seguranca-servidor";
import { FRASE_DA_TRAVA, travaDaFerramenta } from "@/lib/ai/ferramentas-externas/api/travas";
import type { ConfigDaApi } from "@/lib/ai/ferramentas-externas/api/tipos";
import { listarFerramentas, type FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { fraseDaRecusaDeEndereco } from "@/lib/ai/ferramentas-externas/tipos";
import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ENDPOINT = "POST /api/v1/ai/api-tools";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: RECURSO_DAS_APIS });
  if (!authz.ok) return authz.response;
  try {
    return ok(await listarFerramentas(createAdminClient(), authz.org.orgId, { tipo: "api" }), { requestId });
  } catch {
    return fail("internal_error", traduzir("Não consegui ler as APIs.", authz.user.idioma), 500, { requestId });
  }
}

/** A recusa atravessa o `comIdempotencia` como exceção — assim ela não vira recibo. */
class CadastroRecusado extends Error {
  constructor(
    readonly codigo: string,
    readonly texto: string,
    readonly status: number,
  ) {
    super(texto);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const portao = await portaoDeCadastro(requestId);
  if (!portao.ok) return portao.response;
  const { user, org, seguranca, admin, t } = portao;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = criarApiSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos da API: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const dados = parsed.data;
  const config = dados.config as ConfigDaApi;
  const efeito = dados.efeito ?? efeitoPadraoDoMetodo(config.metodo);

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  // As travas da organização valem no cadastro (e de novo na execução).
  const trava = travaDaFerramenta(seguranca, { efeito, urlModelo: dados.url, config });
  if (trava) {
    return fail("api_blocked_by_security", t(FRASE_DA_TRAVA[trava]), 422, { requestId, details: { trava } });
  }
  if (seguranca.aprovacao_obrigatoria && efeito === "altera" && dados.pedir_aprovacao === false) {
    return fail(
      "api_blocked_by_security",
      t("A segurança das APIs exige aprovação para toda ação que altera dados: não é possível cadastrar esta ferramenta com a aprovação desligada."),
      422,
      { requestId, details: { trava: "aprovacao_obrigatoria" } },
    );
  }

  // O endereço é escolhido por uma ORGANIZAÇÃO: a régua de destino de organização recusa a rede
  // interna, privada e local ANTES de gravar. Os marcadores ficam depois do host, então o
  // endereço-modelo com eles trocados resolve o mesmo nome.
  const recusa = await motivoDaRecusaDeDestino(dados.url.replace(/\{\{[^}]*\}\}/g, "x"), "organizacao");
  if (recusa) {
    return fail("validation_failed", t(fraseDaRecusaDeEndereco(recusa)), 422, { requestId, details: { url: recusa } });
  }

  async function criar(): Promise<FerramentaExterna> {
    const criada = await criarApi(admin, { organizationId: org.orgId, atorId: user.id, dados });
    if (!criada.ok) {
      throw criada.erro === "cifra_indisponivel"
        ? new CadastroRecusado(
            "encryption_unavailable",
            t("Não consigo guardar a credencial com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
            422,
          )
        : new CadastroRecusado("internal_error", t("Não foi possível cadastrar a API."), 500);
    }
    const f = criada.ferramenta;
    // Sem a credencial, sem o corpo e sem o endereço inteiro: a auditoria guarda o fato.
    void audit({
      action: "ai.external_tool_created",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: f.id,
      requestId,
      metadata: {
        kind: "api",
        slug: f.slug,
        effect: f.effect,
        method: config.metodo,
        require_approval: f.require_approval,
        approval_ttl_hours: f.approval_ttl_hours,
        host: new URL(dados.url.replace(/\{\{[^}]*\}\}/g, "x")).host,
        parameters: f.parameters.length,
        credential_type: config.credencial.tipo,
        contact_data: config.dados_contato,
        usage_limit_per_conversation: config.limite_por_conversa,
        usage_limit_per_day: config.limite_por_dia,
        auto_pause_after: config.pausa_apos_falhas,
      },
    });
    await avisarAdministrador(admin, org.orgId, seguranca.avisar_administrador, {
      titulo: `A API «${f.name}» foi cadastrada`,
      corpo:
        `Uma API nova foi cadastrada para o agente: «${f.name}» (${config.metodo}, ${efeito === "altera" ? "altera dados" : "só consulta"}). ` +
        `Ela só é usada pelos agentes em que alguém a marcar. Quem cadastrou: ${quemFez(user)}.`,
    });
    return f;
  }

  try {
    if (chave === null) return ok(await criar(), { requestId, status: 201 });
    const desfecho = await comIdempotencia({
      db: await createClient(),
      organizationId: org.orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: dados,
      executar: async () => ({ resposta: await criar(), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      return fail("idempotency_conflict", "Esta chave de idempotência já foi usada com outro conteúdo.", 409, { requestId });
    }
    if (desfecho.tipo === "em_curso") {
      return fail("idempotency_in_progress", "A mesma requisição ainda está em curso. Tente de novo em instantes.", 409, {
        requestId,
      });
    }
    return ok(desfecho.resposta, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof CadastroRecusado) return fail(err.codigo, err.texto, err.status, { requestId });
    return fail("internal_error", t("Não foi possível cadastrar a API."), 500, { requestId });
  }
}

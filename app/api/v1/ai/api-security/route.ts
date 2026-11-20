import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * A SEGURANÇA DAS APIs da organização (Agente de IA › Ferramentas externas › APIs) — issue #372.
 *
 *   GET — o estado: ligado?, quem aceitou, as opções em vigor, o nível que elas correspondem, quais
 *         estão fora do recomendado e se ESTA sessão provou a segunda etapa. Gerente (para a tela
 *         dizer «peça a um administrador»).
 *   PUT — liga, desliga e muda as opções. Administrador. Ligar exige o aceite (o agente passa a
 *         poder enviar dados da conversa a sistemas de terceiros); a rota confere, e não só a tela.
 *
 * ═══ O que esta rota garante ═══
 *
 *  - NASCE DESLIGADO e na posição recomendada. A instalação inteira segue útil sem o recurso.
 *  - DESLIGAR NÃO APAGA: as APIs e as credenciais cifradas ficam; somem do atendimento, e pedido
 *    pendente não executa. Ligar de novo devolve tudo.
 *  - RASTRO. Toda mudança vai à auditoria com os NOMES das opções que mudaram e quais foram
 *    AFROUXADAS; e, com «avisar o administrador» ligado, abre um aviso na Central — inclusive o
 *    último, quando o que se desliga é o próprio aviso.
 *
 * A organização vem da sessão, nunca do corpo (o schema é `strict`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { RECURSO_DAS_APIS, horaDoAviso, quemFez } from "@/lib/ai/ferramentas-externas/api/rotas";
import {
  OPCOES_COM_RECOMENDACAO,
  afrouxa,
  foraDoRecomendado,
  mudancaDeSegurancaSchema,
  nivelEmVigor,
  opcoesDe,
  type OpcoesDeSeguranca,
  type SegurancaDasApis,
} from "@/lib/ai/ferramentas-externas/api/seguranca";
import {
  avisarAdministrador,
  gravarSegurancaDaOrganizacao,
  lerSegurancaDaOrganizacao,
} from "@/lib/ai/ferramentas-externas/api/seguranca-servidor";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function contar(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const [todas, ativas] = await Promise.all([
    admin.from("agent_external_tools").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("kind", "api"),
    admin
      .from("agent_external_tools")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("kind", "api")
      .eq("active", true),
  ]);
  return { apis: todas.count ?? 0, apis_ativas: ativas.count ?? 0 };
}

async function estado(admin: ReturnType<typeof createAdminClient>, orgId: string, config: SegurancaDasApis) {
  const opcoes = opcoesDe(config);
  const total = await contar(admin, orgId);
  return {
    ligado: config.ligado,
    aceite: config.aceite,
    opcoes,
    nivel: nivelEmVigor(opcoes),
    fora_do_recomendado: foraDoRecomendado(opcoes),
    ...total,
  };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: RECURSO_DAS_APIS });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  try {
    const admin = createAdminClient();
    const config = await lerSegurancaDaOrganizacao(admin, authz.org.orgId);
    if (!config) return fail("internal_error", t("Não consegui ler a segurança das APIs."), 500, { requestId });
    return ok(await estado(admin, authz.org.orgId, config), { requestId });
  } catch {
    return fail("internal_error", t("Não consegui ler a segurança das APIs."), 500, { requestId });
  }
}

/** O nome que a pessoa lê de cada opção, para o corpo do aviso ao administrador. */
const NOME_DA_OPCAO: Record<keyof OpcoesDeSeguranca, string> = {
  quem_cadastra: "Quem pode cadastrar APIs",
  dominios_permitidos: "Endereços permitidos",
  somente_consulta: "Somente consulta",
  aprovacao_obrigatoria: "Aprovação sempre obrigatória",
  dados_do_contato: "Dados do contato que podem sair",
  quem_aprova: "Quem pode aprovar",
  avisar_administrador: "Aviso ao administrador",
};

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: RECURSO_DAS_APIS });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = mudancaDeSegurancaSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira as opções de segurança: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const mudanca = parsed.data;

  try {
    const admin = createAdminClient();
    const atual = await lerSegurancaDaOrganizacao(admin, org.orgId);
    if (!atual) return fail("internal_error", t("Não consegui ler a segurança das APIs."), 500, { requestId });

    // Ligar exige o aceite — o gravado antes, ou o que chega agora. A tela marca; a rota confere.
    if (mudanca.ligado === true && atual.aceite === null && mudanca.aceitar !== true) {
      return fail(
        "validation_failed",
        t("Para ligar, confirme que concorda que o agente envie dados da conversa aos sistemas que você cadastrar."),
        422,
        { requestId, details: { motivo: "sem_aceite" } },
      );
    }

    const gravado = await gravarSegurancaDaOrganizacao({ admin, orgId: org.orgId, actorUserId: user.id, mudanca });
    if (!gravado.ok) {
      if (gravado.motivo === "config_invalida") {
        return fail("validation_failed", t("Confira as opções de segurança: algum valor está fora do permitido."), 422, { requestId });
      }
      return fail("internal_error", t("Não foi possível salvar a segurança das APIs."), 500, { requestId });
    }
    const { antes, depois } = gravado;
    const opcoesAntes = opcoesDe(antes);
    const opcoesDepois = opcoesDe(depois);
    const mudaram = (Object.keys(opcoesDepois) as Array<keyof OpcoesDeSeguranca>).filter(
      (chave) => JSON.stringify(opcoesAntes[chave]) !== JSON.stringify(opcoesDepois[chave]),
    );
    const afrouxadas = OPCOES_COM_RECOMENDACAO.filter((chave) => afrouxa(chave, opcoesAntes, opcoesDepois));
    const mudouInterruptor = antes.ligado !== depois.ligado;

    void audit({
      action: "ai.api_security_changed",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "organization",
      resourceId: org.orgId,
      requestId,
      // Os NOMES das opções — e, das que têm posição recomendada, o valor novo (não é segredo: é
      // exatamente o rastro de quem tirou uma proteção). A lista de endereços não vai inteira.
      metadata: {
        ligado: depois.ligado,
        mudou_interruptor: mudouInterruptor,
        aceite_novo: mudanca.aceitar === true,
        opcoes_alteradas: mudaram,
        afrouxadas,
        nivel: nivelEmVigor(opcoesDepois),
        dominios_permitidos: depois.dominios_permitidos.length,
        ...Object.fromEntries(OPCOES_COM_RECOMENDACAO.filter((c) => mudaram.includes(c)).map((c) => [c, opcoesDepois[c]])),
      },
    });

    if (mudouInterruptor || mudaram.length > 0) {
      const partes: string[] = [];
      if (mudouInterruptor) partes.push(depois.ligado ? "As APIs foram ligadas." : "As APIs foram desligadas.");
      if (mudaram.length > 0) partes.push(`Opções alteradas: ${mudaram.map((c) => NOME_DA_OPCAO[c]).join(", ")}.`);
      if (afrouxadas.length > 0) {
        partes.push(`Saíram da posição recomendada: ${afrouxadas.map((c) => NOME_DA_OPCAO[c]).join(", ")}.`);
      }
      // O título diz O QUE mudou: um aviso por mudança, e o que tira uma proteção nunca fica
      // escondido atrás de outro com o mesmo título.
      const oQueMudou =
        afrouxadas.length > 0
          ? `fora do recomendado: ${afrouxadas.map((c) => NOME_DA_OPCAO[c]).join(", ")}`
          : mudaram.length > 0
            ? mudaram.map((c) => NOME_DA_OPCAO[c]).join(", ")
            : depois.ligado
              ? "APIs ligadas"
              : "APIs desligadas";
      // `antes.avisar_administrador`: desligar o aviso ainda gera o último aviso.
      await avisarAdministrador(admin, org.orgId, antes.avisar_administrador || depois.avisar_administrador, {
        titulo: `A segurança das APIs foi alterada — ${oQueMudou.slice(0, 110)} (${horaDoAviso()})`,
        corpo: `${partes.join(" ")} Quem alterou: ${quemFez(user)}.`,
      });
    }

    return ok(await estado(admin, org.orgId, depois), { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível salvar a segurança das APIs."), 500, { requestId });
  }
}

/**
 * O cadastro das ferramentas de API, visto pela API (cliente `service_role` do PostgREST) — issue
 * #372. As linhas moram em `agent_external_tools` com `kind = 'api'`, ao lado dos webhooks e das
 * ferramentas de servidor MCP; a leitura é a do repositório compartilhado (`../repositorio.ts`),
 * que já entrega a config, a trava em vigor e a aprovação que vale.
 *
 * A credencial nasce na tela, é cifrada por `fn_encrypt_oauth` e NUNCA volta: depois só os 4
 * últimos caracteres saem. A cerca entre organizações é o filtro `organization_id` que TODA
 * consulta daqui carrega — o id vem sempre da sessão (quem chama), nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { slugDaFerramenta } from "../esquema";
import { buscarFerramenta, type FerramentaExterna } from "../repositorio";
import type { EfeitoDaFerramenta } from "../tipos";
import type { CriarApiInput, EditarApiInput } from "./esquema";
import type { ConfigDaApi, MetodoDaApi } from "./tipos";

/** `GET` nasce «só consulta»; todo outro método nasce «altera dados». */
export function efeitoPadraoDoMetodo(metodo: MetodoDaApi): EfeitoDaFerramenta {
  return metodo === "GET" ? "consulta" : "altera";
}

/** Os 4 últimos caracteres, para a tela reconhecer QUAL credencial está gravada sem vê-la. */
function ultimos4(credencial: string): string {
  return credencial.slice(-4);
}

export type ResultadoDaCriacaoDaApi =
  | { ok: true; ferramenta: FerramentaExterna }
  | { ok: false; erro: "cifra_indisponivel" | "erro_ao_gravar"; detalhe?: string };

export async function criarApi(
  admin: SupabaseClient,
  input: { organizationId: string; atorId: string; dados: CriarApiInput },
): Promise<ResultadoDaCriacaoDaApi> {
  const { dados } = input;
  let cifrada: string | null = null;
  if (dados.credencial !== undefined) {
    cifrada = await encryptWebhookSecret(admin, dados.credencial);
    // Sem cifra, não grava: credencial em claro no banco não é um «modo degradado».
    if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
  }
  const config = dados.config as ConfigDaApi;

  // O identificador é único por organização. Duas criações simultâneas podem escolher o mesmo
  // slug: o índice único decide, e a perdedora relê.
  let detalhe: string | undefined;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: usados, error: erroDeLeitura } = await admin
      .from("agent_external_tools")
      .select("slug")
      .eq("organization_id", input.organizationId);
    if (erroDeLeitura) return { ok: false, erro: "erro_ao_gravar", detalhe: erroDeLeitura.message };
    const slug = slugDaFerramenta(dados.nome, new Set(((usados ?? []) as Array<{ slug: string }>).map((u) => u.slug)));
    const { data, error } = await admin
      .from("agent_external_tools")
      .insert({
        organization_id: input.organizationId,
        kind: "api",
        name: dados.nome,
        slug,
        when_to_use: dados.quando_usar,
        url: dados.url,
        parameters: dados.parametros,
        effect: dados.efeito ?? efeitoPadraoDoMetodo(config.metodo),
        // Ausente = «o padrão do efeito»: a coluna fica NULA e quem decide é `decidirSePedeAprovacao`.
        require_approval: dados.pedir_aprovacao ?? null,
        ...(dados.validade_horas !== undefined ? { approval_ttl_hours: dados.validade_horas } : {}),
        active: true,
        api_config: config,
        signing_secret_encrypted: cifrada,
        signing_secret_last4: dados.credencial !== undefined ? ultimos4(dados.credencial) : null,
        created_by: input.atorId,
        updated_by: input.atorId,
      })
      .select("id")
      .single();
    if (!error && data) {
      const ferramenta = await buscarFerramenta(admin, input.organizationId, (data as { id: string }).id);
      if (ferramenta) return { ok: true, ferramenta };
      return { ok: false, erro: "erro_ao_gravar", detalhe: "criada e não relida" };
    }
    detalhe = error?.message;
    if (error?.code !== "23505") break;
  }
  return { ok: false, erro: "erro_ao_gravar", detalhe };
}

/** Os campos que mudaram, pelo nome — é o que a auditoria registra (nunca os valores). */
export function camposAlteradosDaApi(patch: EditarApiInput): string[] {
  // A credencial entra como «credencial»: o fato da troca fica no rastro, o valor nunca.
  return Object.keys(patch).sort();
}

export type ResultadoDaEdicaoDaApi =
  | { ok: true; ferramenta: FerramentaExterna }
  | { ok: false; erro: "nao_encontrada" | "cifra_indisponivel" | "falta_credencial" };

export async function editarApi(
  admin: SupabaseClient,
  input: { organizationId: string; id: string; atorId: string; patch: EditarApiInput; atual: FerramentaExterna },
): Promise<ResultadoDaEdicaoDaApi> {
  const { patch, atual } = input;
  const mudanca: Record<string, unknown> = { updated_by: input.atorId };
  if (patch.nome !== undefined) mudanca.name = patch.nome;
  if (patch.quando_usar !== undefined) mudanca.when_to_use = patch.quando_usar;
  if (patch.url !== undefined) mudanca.url = patch.url;
  if (patch.parametros !== undefined) mudanca.parameters = patch.parametros;
  if (patch.config !== undefined) mudanca.api_config = patch.config;
  if (patch.efeito !== undefined) mudanca.effect = patch.efeito;
  // Trocar o EFEITO sem decidir a chave devolve a chave ao padrão do efeito (a mesma regra do webhook).
  if (patch.pedir_aprovacao !== undefined) mudanca.require_approval = patch.pedir_aprovacao;
  else if (patch.efeito !== undefined && patch.efeito !== atual.effect) mudanca.require_approval = null;
  if (patch.validade_horas !== undefined) mudanca.approval_ttl_hours = patch.validade_horas;
  if (patch.ativa !== undefined) {
    mudanca.active = patch.ativa;
    // Reativar é a decisão de uma pessoa: tira a ferramenta da pausa automática e zera a contagem.
    if (patch.ativa) {
      mudanca.consecutive_failures = 0;
      mudanca.auto_paused_at = null;
    }
  }

  // A credencial: nova = troca; tipo «nenhuma» = apaga a gravada; senão fica a que está.
  const tipo = (patch.config?.credencial.tipo ?? atual.api?.config.credencial.tipo) as string | undefined;
  if (patch.credencial !== undefined) {
    const cifrada = await encryptWebhookSecret(admin, patch.credencial);
    if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
    mudanca.signing_secret_encrypted = cifrada;
    mudanca.signing_secret_last4 = ultimos4(patch.credencial);
  } else if (tipo === "nenhuma") {
    mudanca.signing_secret_encrypted = null;
    mudanca.signing_secret_last4 = null;
  } else if (patch.config !== undefined && !atual.api?.has_credential) {
    // Passou a exigir credencial e não há nenhuma gravada nem enviada.
    return { ok: false, erro: "falta_credencial" };
  }

  // O identificador (`slug`) NÃO muda quando o nome muda: versões publicadas e o histórico o conhecem.
  const { data, error } = await admin
    .from("agent_external_tools")
    .update(mudanca)
    .eq("organization_id", input.organizationId)
    .eq("id", input.id)
    .eq("kind", "api")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`edição da ferramenta de API falhou: ${error.message}`);
  if (!data) return { ok: false, erro: "nao_encontrada" };
  const ferramenta = await buscarFerramenta(admin, input.organizationId, input.id);
  return ferramenta ? { ok: true, ferramenta } : { ok: false, erro: "nao_encontrada" };
}

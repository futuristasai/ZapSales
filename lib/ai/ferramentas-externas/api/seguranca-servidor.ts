/**
 * A segurança das APIs, vista pelo SERVIDOR (cliente `service_role` do PostgREST) — issue #372.
 *
 * As regras puras e o schema estão em `seguranca.ts`; aqui ficam a leitura e a gravação em
 * `organizations.settings.api_externa` e o aviso ao administrador. A organização vem SEMPRE de
 * quem chama (a sessão), nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";

import {
  configDeApiSchema,
  lerSegurancaDasApis,
  mesclarSeguranca,
  type MudancaDeSeguranca,
  type SegurancaDasApis,
} from "./seguranca";
import type { ContatoDaConversa } from "./tipos";

/** O estado em vigor, ou `null` se a leitura falhou (quem chama decide: falha fechada). */
export async function lerSegurancaDaOrganizacao(admin: SupabaseClient, orgId: string): Promise<SegurancaDasApis | null> {
  const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error || !data) return null;
  return lerSegurancaDasApis((data as { settings?: unknown }).settings ?? {});
}

export type ResultadoDeGravarSeguranca =
  | { ok: true; antes: SegurancaDasApis; depois: SegurancaDasApis }
  | { ok: false; motivo: "leitura_falhou" | "config_invalida" | "escrita_recusada" };

/**
 * Lê, mescla e grava. `settings` é jsonb COMPARTILHADO (marca, MFA, IA padrão, MCP, áudio…): gravar
 * `{ api_externa }` sozinho apagaria o resto em silêncio. O service role passa por cima da RLS,
 * então o `.eq("id", orgId)` é a única cerca entre esta empresa e a instalação inteira. Auditar e
 * avisar é de quem chama (a rota), que recebe o antes e o depois.
 */
export async function gravarSegurancaDaOrganizacao(p: {
  /** O cliente ADMIN, provado pelo tipo: com o de sessão a RLS casaria zero linhas e devolveria sucesso. */
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  actorUserId: string;
  mudanca: MudancaDeSeguranca;
  agora?: Date;
}): Promise<ResultadoDeGravarSeguranca> {
  const { data: org, error: leituraErr } = await p.admin
    .from("organizations")
    .select("settings")
    .eq("id", p.orgId)
    .maybeSingle();
  if (leituraErr || !org) return { ok: false, motivo: "leitura_falhou" };

  const settingsAtuais = ((org as { settings?: unknown }).settings ?? {}) as Record<string, unknown>;
  const antes = lerSegurancaDasApis(settingsAtuais);
  const proxima = configDeApiSchema.safeParse(
    mesclarSeguranca(antes, p.mudanca, { em: (p.agora ?? new Date()).toISOString(), por: p.actorUserId }),
  );
  if (!proxima.success) return { ok: false, motivo: "config_invalida" };

  const { data: gravado, error: escritaErr } = await p.admin
    .from("organizations")
    .update({ settings: { ...settingsAtuais, api_externa: proxima.data } })
    .eq("id", p.orgId)
    .select("settings")
    .maybeSingle();
  // Zero linhas volta como SUCESSO no PostgREST: sem esta conferência, a tela diria «salvo» para
  // uma escrita que não aconteceu.
  if (escritaErr || !gravado) return { ok: false, motivo: "escrita_recusada" };
  return { ok: true, antes, depois: proxima.data };
}

/**
 * O aviso ao administrador (`external_api_notice`) — UM aberto por título. `avisar` é a opção em
 * vigor ANTES da mudança que se está avisando: desligar os avisos ainda gera o último aviso.
 * Nunca lança: aviso é rastro para humano, não parte do efeito.
 */
export async function avisarAdministrador(
  admin: SupabaseClient,
  orgId: string,
  avisar: boolean,
  aviso: { titulo: string; corpo: string },
): Promise<void> {
  if (!avisar) return;
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", orgId)
      .eq("kind", "external_api_notice")
      .eq("title", aviso.titulo)
      .eq("status", "open")
      .maybeSingle();
    if (aberto) return;
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: orgId,
      kind: "external_api_notice",
      severity: "info",
      title: aviso.titulo,
      body: aviso.corpo,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("[ferramentas-externas] o aviso ao administrador não foi gravado", {
      organization_id: orgId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/**
 * Os dados do contato de uma conversa, lidos pelo SISTEMA para a execução de um pedido aprovado.
 * Contato anonimizado (LGPD) e conversa de grupo não têm o que enviar. Nunca lança.
 */
export async function lerContatoDaConversaPelaApi(
  admin: SupabaseClient,
  orgId: string,
  conversationId: string | null,
): Promise<ContatoDaConversa> {
  if (!conversationId) return {};
  try {
    const { data: conversa } = await admin
      .from("conversations")
      .select("contact_id, is_group")
      .eq("organization_id", orgId)
      .eq("id", conversationId)
      .maybeSingle();
    const c = conversa as { contact_id: string | null; is_group: boolean } | null;
    if (!c?.contact_id || c.is_group) return {};
    const { data: contato } = await admin
      .from("contacts")
      .select("name, display_name, email, phone_number, is_anonymized")
      .eq("organization_id", orgId)
      .eq("id", c.contact_id)
      .maybeSingle();
    const l = contato as {
      name: string | null;
      display_name: string | null;
      email: string | null;
      phone_number: string | null;
      is_anonymized: boolean;
    } | null;
    if (!l || l.is_anonymized) return {};
    return { telefone: l.phone_number, nome: nomeDoContato(l), email: l.email };
  } catch (err) {
    logger.warn("[ferramentas-externas] os dados do contato não foram lidos — a chamada segue sem eles", {
      organization_id: orgId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return {};
  }
}

/**
 * REGRA ANOTADA PELO AGENTE É PROPOSTA — só vale depois que um gestor aprova (#272).
 *
 * A memória da organização entra no começo das instruções de TODO agente, em
 * todo atendimento. A ferramenta `crm_save_org_memory` gravava a anotação já
 * como `active`: o que o agente escrevesse durante uma conversa — inclusive
 * por sugestão de quem estava do outro lado dela — passava a valer para todos
 * os clientes no turno seguinte, sem ninguém ler.
 *
 * Agora a anotação nasce `proposed`. O motor só carrega `active`
 * (`lib/agent-engine/agent/org-memory.ts`), então a proposta não muda nenhum
 * atendimento até que alguém com papel de gestor a aprove na tela de Memória.
 *
 * Este módulo é o que acontece EM VOLTA da proposta:
 *   - abrir UM aviso na Central enquanto houver proposta pendente — proposta
 *     que ninguém vê é regra que nunca entra, e o agente segue achando que
 *     anotou;
 *   - decidir (aprovar ou recusar) com trava otimista: só muda o que ainda
 *     está `proposed`, para dois gestores clicando juntos não brigarem;
 *   - fechar o aviso quando a última proposta for decidida.
 *
 * Quem chama já resolveu a organização de fonte confiável. Todas as consultas
 * filtram `organization_id` — o client é o de serviço.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { idiomaPeloCliente } from "@/lib/i18n/aviso-no-idioma";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";

/** `agent_inbox_items.kind` — par de `agent_inbox_items_kind_check`. */
export const KIND_DA_PROPOSTA_DE_REGRA = "regra_proposta_pelo_agente";

/** Rótulos visíveis na Central (chaves do dicionário). */
export const TITULO_DO_AVISO_DE_PROPOSTA = "O agente propôs uma regra nova — falta um gestor aprovar";
export const CORPO_DO_AVISO_DE_PROPOSTA =
  "Um agente de IA anotou uma regra que valeria para todos os atendimentos. Ela ainda NÃO está valendo: abra Memória da IA, leia a proposta e aprove ou recuse.";

/**
 * O que a ferramenta devolve ao agente. Dito com todas as letras porque o
 * modelo, ao ler "registrado", tende a afirmar ao cliente que a regra já vale.
 */
export const SITUACAO_DA_PROPOSTA =
  "Proposta registrada. Ela NÃO está valendo: só passa a valer depois que um gestor aprovar em Memória da IA. Não diga a ninguém que a regra já foi adotada.";

export type DecisaoDaProposta = "aprovar" | "recusar";

/**
 * Abre o aviso na Central — UM por organização enquanto houver proposta
 * pendente. NUNCA lança: falhar ao avisar não pode desfazer a proposta que já
 * foi gravada; a falha vai ao log.
 */
export async function avisarPropostaDeRegra(admin: SupabaseClient, organizationId: string): Promise<void> {
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", KIND_DA_PROPOSTA_DE_REGRA)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (aberto) return;

    const idioma = await idiomaPeloCliente(admin, organizationId);
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: KIND_DA_PROPOSTA_DE_REGRA,
      severity: "warn",
      title: traduzir(TITULO_DO_AVISO_DE_PROPOSTA, idioma),
      body: traduzir(CORPO_DO_AVISO_DE_PROPOSTA, idioma),
    });
    if (error) {
      logger.warn("[memoria.propostas] o banco recusou o aviso de proposta de regra", {
        organization_id: organizationId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[memoria.propostas] não consegui abrir o aviso de proposta de regra", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Aprova (`active`) ou recusa (`archived`) UMA proposta.
 *
 * O filtro `status = 'proposed'` é a trava: quem chega depois de outra pessoa
 * já ter decidido não reescreve a decisão dela — recebe `null`, e a rota
 * responde que a proposta já foi decidida.
 */
export async function decidirPropostaDeRegra(
  admin: SupabaseClient,
  alvo: { organizationId: string; id: string; decisao: DecisaoDaProposta },
): Promise<{ id: string; status: string; title: string } | null> {
  const { data, error } = await admin
    .from("org_memory_entries")
    .update({
      status: alvo.decisao === "aprovar" ? "active" : "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", alvo.id)
    .eq("organization_id", alvo.organizationId)
    .eq("status", "proposed")
    .select("id, status, title")
    .maybeSingle();
  if (error) throw new Error(`decidir_proposta_falhou: ${error.message}`);
  if (!data) return null;

  await fecharAvisoSeNaoHaPendentes(admin, alvo.organizationId);
  return data as { id: string; status: string; title: string };
}

/**
 * O laço de retorno: decidida a última proposta, o aviso da Central fecha
 * sozinho. Um aviso que só some por clique vira ruído — a Central diria "falta
 * aprovar" com a lista vazia. NUNCA lança.
 */
export async function fecharAvisoSeNaoHaPendentes(admin: SupabaseClient, organizationId: string): Promise<void> {
  try {
    const { count, error } = await admin
      .from("org_memory_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "proposed");
    if (error || (count ?? 0) > 0) return;
    await admin
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("kind", KIND_DA_PROPOSTA_DE_REGRA)
      .eq("status", "open");
  } catch (err) {
    logger.warn("[memoria.propostas] não consegui fechar o aviso de proposta de regra", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

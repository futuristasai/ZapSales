/**
 * Listas salvas de pessoas do disparo em massa — a parte que fala com o banco.
 *
 * Uma lista é um NOME mais as pessoas que o operador marcou na tabela do cartão Público. É fixa
 * de propósito: guarda quem foi marcado, não o filtro, então o que se vê ao salvar é exatamente o
 * que volta em outra campanha. Os vetos de envio (opt-out, anonimizado, sem telefone, já em
 * campanha) NÃO são guardados na lista: valem na hora de usá-la, pela mesma régua da tabela de
 * busca (`listarContatosPorIds`).
 *
 * O client recebido é o admin, que ignora RLS: `organization_id` entra em TODA consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { TETO_DA_TABELA } from "./escolha-de-contatos";

/** Quantas listas uma organização guarda. Alto o bastante para não ser sentido, baixo para não crescer sem fim. */
export const TETO_DE_LISTAS = 200;

/** Quantas linhas o PostgREST devolve por página (`max-rows` padrão do Supabase). */
const LINHAS_POR_PAGINA = 1000;
/** Quantas pessoas vão num só INSERT de membros. */
const MEMBROS_POR_INSERT = 1000;
/** Quantos ids vão num só `in (...)` — a URL do PostgREST não aguarda mais que isso. */
const IDS_POR_CONSULTA = 200;

export const criarListaSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contact_ids: z.array(z.string().uuid()).min(1).max(TETO_DA_TABELA),
});

export const consultaDaListaSchema = z.object({
  campaign_id: z.string().uuid().optional(),
});

export interface ListaSalva {
  id: string;
  name: string;
  total: number;
  created_at: string;
}

export type ResultadoDeCriar =
  | { ok: true; lista: ListaSalva }
  | { ok: false; motivo: "nome_repetido" | "limite_de_listas" | "sem_pessoas_validas" };

function emBlocos<T>(itens: readonly T[], tamanho: number): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

/** As listas da organização, da mais recente para a mais antiga, com quantas pessoas cada uma tem. */
export async function listarListas(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ListaSalva[]> {
  const { data, error } = await admin
    .from("campaign_audience_lists")
    .select("id, name, created_at, campaign_audience_list_members(count)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(TETO_DE_LISTAS);
  if (error) throw new Error(`listas de pessoas: ${error.message}`);
  return (data ?? []).map((l) => {
    const linha = l as unknown as {
      id: string;
      name: string;
      created_at: string;
      campaign_audience_list_members: Array<{ count: number }> | null;
    };
    return {
      id: linha.id,
      name: linha.name,
      created_at: linha.created_at,
      total: linha.campaign_audience_list_members?.[0]?.count ?? 0,
    };
  });
}

/** Dos ids pedidos, os que são pessoas desta organização (não grupo, não cadastro mesclado). */
async function idsValidos(
  admin: SupabaseClient,
  organizationId: string,
  ids: readonly string[],
): Promise<string[]> {
  const validos: string[] = [];
  for (const bloco of emBlocos(ids, IDS_POR_CONSULTA)) {
    const { data, error } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "person")
      .is("is_merged_into", null)
      .in("id", bloco);
    if (error) throw new Error(`listas de pessoas: contatos — ${error.message}`);
    validos.push(...(data ?? []).map((c) => (c as { id: string }).id));
  }
  return validos;
}

/**
 * Cria a lista com as pessoas. Quem não é pessoa desta organização é descartado em silêncio — o
 * navegador só conhece ids que a própria busca devolveu, e um id estranho é adulteração, não erro
 * de quem usa. Se nenhum sobra, a lista não nasce.
 */
export async function criarLista(
  admin: SupabaseClient,
  entrada: { organizationId: string; userId: string; name: string; contactIds: readonly string[] },
): Promise<ResultadoDeCriar> {
  const { organizationId, name } = entrada;

  const { count, error: erroContagem } = await admin
    .from("campaign_audience_lists")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (erroContagem) throw new Error(`listas de pessoas: ${erroContagem.message}`);
  if ((count ?? 0) >= TETO_DE_LISTAS) return { ok: false, motivo: "limite_de_listas" };

  const ids = await idsValidos(admin, organizationId, [...new Set(entrada.contactIds)]);
  if (ids.length === 0) return { ok: false, motivo: "sem_pessoas_validas" };

  const { data: criada, error } = await admin
    .from("campaign_audience_lists")
    .insert({ organization_id: organizationId, name, created_by: entrada.userId })
    .select("id, name, created_at")
    .single();
  if (error) {
    // Nome repetido (sem diferenciar maiúscula): o índice único da organização.
    if ((error as { code?: string }).code === "23505")
      return { ok: false, motivo: "nome_repetido" };
    throw new Error(`listas de pessoas: ${error.message}`);
  }
  const lista = criada as { id: string; name: string; created_at: string };

  for (const bloco of emBlocos(ids, MEMBROS_POR_INSERT)) {
    const { error: erroMembros } = await admin.from("campaign_audience_list_members").insert(
      bloco.map((contactId) => ({
        organization_id: organizationId,
        list_id: lista.id,
        contact_id: contactId,
      })),
    );
    if (erroMembros) {
      // Lista pela metade é pior que nenhuma lista: desfaz (os membros caem em cascata).
      await admin
        .from("campaign_audience_lists")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", lista.id);
      throw new Error(`listas de pessoas: membros — ${erroMembros.message}`);
    }
  }

  return { ok: true, lista: { ...lista, total: ids.length } };
}

/** Os ids das pessoas de uma lista, ou `null` quando a lista não existe nesta organização. */
export async function lerIdsDaLista(
  admin: SupabaseClient,
  organizationId: string,
  listId: string,
): Promise<string[] | null> {
  const { data: lista, error } = await admin
    .from("campaign_audience_lists")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", listId)
    .maybeSingle();
  if (error) throw new Error(`listas de pessoas: ${error.message}`);
  if (!lista) return null;

  const ids: string[] = [];
  for (let de = 0; ; de += LINHAS_POR_PAGINA) {
    const { data, error: erroMembros } = await admin
      .from("campaign_audience_list_members")
      .select("contact_id")
      .eq("organization_id", organizationId)
      .eq("list_id", listId)
      .order("contact_id", { ascending: true })
      .range(de, de + LINHAS_POR_PAGINA - 1);
    if (erroMembros) throw new Error(`listas de pessoas: membros — ${erroMembros.message}`);
    const pagina = (data ?? []).map((m) => (m as { contact_id: string }).contact_id);
    ids.push(...pagina);
    if (pagina.length < LINHAS_POR_PAGINA) break;
  }
  return ids;
}

/** Apaga a lista (e, em cascata, os ponteiros). As pessoas e as campanhas que a usaram não mudam. */
export async function apagarLista(
  admin: SupabaseClient,
  organizationId: string,
  listId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await admin
    .from("campaign_audience_lists")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", listId)
    .select("id, name")
    .maybeSingle();
  if (error) throw new Error(`listas de pessoas: ${error.message}`);
  return (data as { id: string; name: string } | null) ?? null;
}

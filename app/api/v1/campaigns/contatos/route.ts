/**
 * POST /api/v1/campaigns/contatos — as pessoas que a busca e os filtros encontram, para o
 * operador marcar uma a uma na tela do público.
 *
 * Não grava nada. Usa a MESMA consulta da prévia e do snapshot (`listarContatosDaTabela` chama
 * `lerLinhas`): a tabela que mostra "estas 230 pessoas" e a prévia que conta "230 podem receber"
 * não podem medir por caminhos diferentes. Quem não pode receber (pediu para sair, sem telefone,
 * já em outra campanha) vem na lista com o motivo, para a tela esmaecer a linha em vez de
 * escondê-la — esconder faria o operador achar que a pessoa sumiu.
 *
 * É POST porque o filtro é um objeto — não porque muda alguma coisa.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { temRecorte } from "@/lib/campanhas/audiencia";
import { listarContatosDaTabela } from "@/lib/campanhas/consulta-de-audiencia";
import { contatosDaTabelaSchema } from "@/lib/campanhas/schemas";
import { TETO_DA_TABELA } from "@/lib/campanhas/escolha-de-contatos";
import { TEXTO_DA_EXCLUSAO } from "@/lib/campanhas/tipos";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // Guarda de suporte num handler que NÃO escreve: o gate `suporte-cobertura-de-efeitos` mede por
  // MÉTODO, e a exceção custaria mais que a restrição (mesma escolha de `campaigns/preview`).
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = contatosDaTabelaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Os filtros da lista de pessoas estão inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  // A tabela só ENCONTRA gente: a lista que o operador já escolheu (incluir/excluir) é dele, e o
  // teto é o da tabela, que é o mesmo do público (5.000).
  const filtro = {
    ...parsed.data.audience_filter,
    incluir_contatos: [],
    excluir_contatos: [],
    limite: TETO_DA_TABELA,
  };
  const busca = parsed.data.busca;

  // Sem filtro e sem busca a consulta não roda: "todos os contatos" não é um recorte (ver
  // `audiencia.ts`), e uma tabela de 5.000 linhas sem critério não se confere.
  if (!temRecorte(filtro) && busca.length < 2) {
    return ok(
      { contatos: [], total: 0, cortado: false, legenda: TEXTO_DA_EXCLUSAO },
      { requestId },
    );
  }

  try {
    const contatos = await listarContatosDaTabela(createAdminClient(), {
      organizationId: authz.org.orgId,
      filtro,
      busca,
      agora: new Date(),
      campanhaId: parsed.data.campaign_id,
    });
    return ok(
      {
        contatos,
        total: contatos.length,
        // Bateu no teto: pode haver mais gente do que a lista mostra, e a tela avisa.
        cortado: contatos.length >= TETO_DA_TABELA,
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

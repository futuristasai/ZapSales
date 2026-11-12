/**
 * O teto de atendimentos automáticos por contato, como a TELA o lê e grava (#271).
 *
 * A regra que decide mora em `lib/agent-engine/agent/teto-por-contato.ts` — é
 * de lá que saem o padrão e o máximo, para que a tela nunca mostre um número
 * diferente do que o motor aplica. Aqui só a leitura e a escrita da linha de
 * `ai_budgets`, pelo client de serviço: quem chama já resolveu a organização de
 * fonte confiável (`requireRole` ou a sessão do Server Component). Nunca do body.
 */
import {
  normalizarTeto,
  TETO_POR_CONTATO_MAXIMO,
  TETO_POR_CONTATO_PADRAO,
} from "@/lib/agent-engine/agent/teto-por-contato";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TetoPorContatoDaOrg {
  /** 0 = sem teto por hora. */
  por_hora: number;
  /** 0 = sem teto por dia. */
  por_dia: number;
  /** O padrão do produto, para a tela poder oferecer "voltar ao padrão". */
  padrao_por_hora: number;
  padrao_por_dia: number;
  maximo: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

function comPadrao(porHora: unknown, porDia: unknown): TetoPorContatoDaOrg {
  const teto = normalizarTeto({ porHora, porDia });
  return {
    por_hora: teto.porHora,
    por_dia: teto.porDia,
    padrao_por_hora: TETO_POR_CONTATO_PADRAO.porHora,
    padrao_por_dia: TETO_POR_CONTATO_PADRAO.porDia,
    maximo: TETO_POR_CONTATO_MAXIMO,
  };
}

/**
 * Nunca lança. Leitura que falha devolve o padrão — que é o que o motor usa
 * quando não há linha — e LOGA: uma tela que mostra o padrão porque a consulta
 * falhou é indistinguível de uma que mostra a verdade.
 */
export async function lerTetoPorContato(
  orgId: string,
  admin: AdminClient = createAdminClient(),
): Promise<TetoPorContatoDaOrg> {
  const { data, error } = await admin
    .from("ai_budgets")
    .select("teto_por_contato_hora, teto_por_contato_dia")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    logger.warn("teto-por-contato: leitura falhou — a tela mostra o padrão", {
      organization_id: orgId,
      causa: error.message,
    });
  }
  const linha = data as { teto_por_contato_hora?: unknown; teto_por_contato_dia?: unknown } | null;
  return comPadrao(linha?.teto_por_contato_hora, linha?.teto_por_contato_dia);
}

/**
 * Grava os campos informados. Organização sem linha ganha uma — e ela nasce com
 * `monthly_limit_cents: 0` EXPLÍCITO, pela mesma razão da rota do orçamento: o
 * `DEFAULT 5000` da coluna é um teto mensal que ninguém escolheu.
 */
export async function gravarTetoPorContato(
  admin: AdminClient,
  orgId: string,
  novo: { por_hora?: number; por_dia?: number },
): Promise<{ ok: true } | { ok: false; causa: string }> {
  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (novo.por_hora !== undefined) campos.teto_por_contato_hora = novo.por_hora;
  if (novo.por_dia !== undefined) campos.teto_por_contato_dia = novo.por_dia;

  const { data: existente, error: erroDaLeitura } = await admin
    .from("ai_budgets")
    .select("organization_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (erroDaLeitura) return { ok: false, causa: erroDaLeitura.message };

  if (existente) {
    const { error } = await admin.from("ai_budgets").update(campos).eq("organization_id", orgId);
    return error ? { ok: false, causa: error.message } : { ok: true };
  }
  const { error } = await admin
    .from("ai_budgets")
    .insert({ organization_id: orgId, monthly_limit_cents: 0, ...campos });
  return error ? { ok: false, causa: error.message } : { ok: true };
}

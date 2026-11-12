/**
 * O GASTO DE LER MÍDIA ENTRA NA CONTA (#271).
 *
 * Transcrever um áudio e descrever uma imagem são chamadas pagas a um provedor
 * de IA, e nenhuma das duas deixava linha em `llm_calls` — a única tabela que a
 * tela de Uso e o teto mensal somam. Quem recebia cem notas de voz por dia via
 * "US$ 0,00" de transcrição, e o teto mensal nunca enxergava esse dinheiro.
 *
 * Este módulo é o registro: uma linha por chamada, com o ponto
 * (`transcricao_de_audio` ou `visao_de_imagem`), o modelo e o custo. O custo
 * segue a regra de `pricing.ts`: quando o produto não sabe o preço, grava NULL
 * — nunca zero. Custo nulo acende o aviso "parte do gasto não entra nesta
 * conta" no cartão de orçamento, que é a verdade.
 *
 * NUNCA lança: falhar ao registrar o gasto não pode derrubar a leitura da
 * mídia que já aconteceu. A falha vai ao log.
 */
import { costCents, custoDoAudioCents } from "@/lib/agent-engine/edge/llm/pricing";
import { logger } from "@/lib/logger";

export type PontoDaMidia = "transcricao_de_audio" | "visao_de_imagem";

export interface MedidaDeMidia {
  ponto: PontoDaMidia;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Centavo de DÓLAR; `null` = preço desconhecido. */
  costCents: number | null;
  latencyMs: number | null;
}

/** O `usage` do AI SDK, só com o que este registro lê. */
interface UsoDoSdk {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined } | undefined;
}

/** Uma chamada a um modelo de CONVERSA (visão, ou transcrição pelo modelo). */
export function medidaDoModeloDeConversa(d: {
  ponto: PontoDaMidia;
  provider: string;
  model: string;
  usage: UsoDoSdk | undefined;
  latencyMs: number;
}): MedidaDeMidia {
  const inputTokens = d.usage?.inputTokens ?? 0;
  const outputTokens = d.usage?.outputTokens ?? 0;
  return {
    ponto: d.ponto,
    provider: d.provider,
    model: d.model,
    inputTokens,
    outputTokens,
    costCents: costCents(d.model, {
      inputTokens,
      outputTokens,
      cacheReadTokens: d.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: d.usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
    }),
    latencyMs: d.latencyMs,
  };
}

/**
 * Uma chamada ao serviço de transcrição (`/v1/audio/transcriptions`).
 *
 * O serviço cobra por DURAÇÃO do áudio, e a resposta diz quantos segundos
 * foram: `usage: { type: "duration", seconds }`. Quando o serviço não devolve
 * a duração (ou cobra por token, como os modelos `gpt-*-transcribe`), o custo
 * fica NULL — o preço por token de áudio não está na tabela, e inventar um
 * número seria pior que dizer "não sei".
 */
export function medidaDoServicoDeTranscricao(d: {
  provider: string;
  model: string;
  usage: unknown;
  latencyMs: number;
}): MedidaDeMidia {
  const uso = (typeof d.usage === "object" && d.usage !== null ? d.usage : {}) as {
    type?: unknown;
    seconds?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  const segundos =
    uso.type === "duration" && typeof uso.seconds === "number" && Number.isFinite(uso.seconds) && uso.seconds >= 0
      ? uso.seconds
      : null;
  const inteiro = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  return {
    ponto: "transcricao_de_audio",
    provider: d.provider,
    model: d.model,
    inputTokens: inteiro(uso.input_tokens),
    outputTokens: inteiro(uso.output_tokens),
    costCents: segundos === null ? null : custoDoAudioCents(d.model, segundos),
    latencyMs: d.latencyMs,
  };
}

/** O nome do provedor de um serviço de transcrição, pelo endereço dele. */
export function provedorDoServico(baseUrl: string | undefined): string {
  const bruto = (baseUrl ?? "").trim();
  if (bruto === "") return "openai";
  try {
    const host = new URL(bruto).hostname.toLowerCase();
    return host === "api.openai.com" ? "openai" : host;
  } catch {
    return "transcricao";
  }
}

/** O mínimo do supabase-js que a gravação usa. */
interface ClienteQueInsere {
  from(tabela: string): { insert(linhas: unknown): PromiseLike<{ error: { message: string } | null }> };
}

/**
 * Grava as medidas em `llm_calls`. `contactId` é o contato da mensagem — é ele
 * que deixa o gasto de mídia aparecer por contato, como o resto.
 */
export async function registrarGastoDaMidia(
  admin: ClienteQueInsere,
  alvo: { organizationId: string; contactId: string | null },
  medidas: readonly MedidaDeMidia[],
): Promise<void> {
  if (medidas.length === 0) return;
  try {
    const { error } = await admin.from("llm_calls").insert(
      medidas.map((m) => ({
        organization_id: alvo.organizationId,
        contact_id: alvo.contactId,
        purpose: m.ponto,
        provider: m.provider,
        model: m.model,
        input_tokens: m.inputTokens,
        output_tokens: m.outputTokens,
        cost_cents: m.costCents,
        latency_ms: m.latencyMs,
        status: "ok",
      })),
    );
    if (error) {
      logger.warn("[gasto-da-midia] o banco recusou o registro do gasto", {
        organization_id: alvo.organizationId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[gasto-da-midia] não consegui registrar o gasto", {
      organization_id: alvo.organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

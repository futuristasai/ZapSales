/**
 * O GASTO DE LER MÍDIA ENTRA NA CONTA (#271).
 *
 * Transcrever um áudio e descrever uma imagem são chamadas pagas, e nenhuma das
 * duas deixava linha em `llm_calls` — a tabela que a tela de Uso e o teto mensal
 * somam. O gasto exibido era menor que o real.
 *
 * O que fica fixado:
 *   1. o serviço de transcrição entrega a medida, e ela vira custo quando o
 *      preço é conhecido (Whisper, por duração) e NULL quando não é;
 *   2. o modelo de conversa (visão e transcrição pelo modelo) é cobrado pela
 *      mesma tabela de preços do turno do agente;
 *   3. o registro grava uma linha por chamada, na organização e no contato
 *      certos, e nunca derruba quem o chamou.
 */
import { describe, expect, it, vi } from "vitest";

import { costCents, custoDoAudioCents } from "@/lib/agent-engine/edge/llm/pricing";
import {
  medidaDoModeloDeConversa,
  medidaDoServicoDeTranscricao,
  provedorDoServico,
  registrarGastoDaMidia,
  type MedidaDeMidia,
} from "@/lib/messaging/media/gasto-da-midia";
import { apiTranscriptionProvider } from "@/lib/messaging/media/transcription";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@/lib/logger";

describe("preço do áudio por duração", () => {
  it("Whisper: US$ 0,006 por minuto", () => {
    expect(custoDoAudioCents("whisper-1", 60)).toBeCloseTo(0.6, 10);
    expect(custoDoAudioCents("whisper-1", 30)).toBeCloseTo(0.3, 10);
    expect(custoDoAudioCents("whisper-1", 0)).toBe(0);
  });

  it.each(["gpt-4o-transcribe", "whisper-large-v3", "gpt-transcribe", ""])(
    "⭐ %j não tem preço por duração: NULL, nunca zero",
    (modelo) => {
      expect(custoDoAudioCents(modelo, 60)).toBeNull();
    },
  );

  it.each([Number.NaN, -5, Number.POSITIVE_INFINITY])("duração %j não vira custo", (segundos) => {
    expect(custoDoAudioCents("whisper-1", segundos)).toBeNull();
  });
});

describe("a medida do serviço de transcrição", () => {
  it("⭐ resposta com duração vira custo", () => {
    const m = medidaDoServicoDeTranscricao({
      provider: "openai",
      model: "whisper-1",
      usage: { type: "duration", seconds: 90 },
      latencyMs: 800,
    });
    expect(m).toMatchObject({ ponto: "transcricao_de_audio", provider: "openai", model: "whisper-1", latencyMs: 800 });
    expect(m.costCents).toBeCloseTo(0.9, 10);
  });

  it.each([
    ["sem usage", undefined],
    ["usage nulo", null],
    ["usage que não é objeto", "90s"],
    ["duração que não é número", { type: "duration", seconds: "90" }],
    ["duração negativa", { type: "duration", seconds: -1 }],
  ])("⭐ %s: a chamada é registrada com custo NULL", (_nome, usage) => {
    const m = medidaDoServicoDeTranscricao({ provider: "openai", model: "whisper-1", usage, latencyMs: 1 });
    expect(m.costCents).toBeNull();
    expect(m.inputTokens).toBe(0);
  });

  it("serviço que cobra por token: os tokens ficam registrados e o custo é NULL (tarifa fora da tabela)", () => {
    const m = medidaDoServicoDeTranscricao({
      provider: "openai",
      model: "gpt-4o-transcribe",
      usage: { type: "tokens", input_tokens: 1200, output_tokens: 80 },
      latencyMs: 1,
    });
    expect(m).toMatchObject({ inputTokens: 1200, outputTokens: 80, costCents: null });
  });

  it("o provedor sai do endereço do serviço", () => {
    expect(provedorDoServico(undefined)).toBe("openai");
    expect(provedorDoServico("")).toBe("openai");
    expect(provedorDoServico("https://api.openai.com/v1")).toBe("openai");
    expect(provedorDoServico("https://api.groq.com/openai/v1")).toBe("api.groq.com");
    expect(provedorDoServico("isto não é url")).toBe("transcricao");
  });
});

describe("a medida do modelo de conversa", () => {
  it("⭐ é cobrada pela MESMA tabela do turno do agente", () => {
    const usage = { inputTokens: 1500, outputTokens: 60, inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 } };
    const m = medidaDoModeloDeConversa({
      ponto: "visao_de_imagem",
      provider: "anthropic",
      model: "claude-sonnet-5",
      usage,
      latencyMs: 1200,
    });
    expect(m.costCents).toBe(
      costCents("claude-sonnet-5", { inputTokens: 1500, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    );
    expect(m.costCents).toBeGreaterThan(0);
    expect(m).toMatchObject({ ponto: "visao_de_imagem", inputTokens: 1500, outputTokens: 60, latencyMs: 1200 });
  });

  it("modelo fora da tabela: custo NULL — acende o aviso de medição incompleta em vez de mentir zero", () => {
    const m = medidaDoModeloDeConversa({
      ponto: "transcricao_de_audio",
      provider: "openrouter",
      model: "fabricante/modelo-que-ninguem-conhece",
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    });
    expect(m.costCents).toBeNull();
  });

  it("provedor que não devolve usage não quebra: zero token, e o custo é o da tabela para zero", () => {
    const m = medidaDoModeloDeConversa({
      ponto: "visao_de_imagem",
      provider: "anthropic",
      model: "claude-sonnet-5",
      usage: undefined,
      latencyMs: 1,
    });
    expect(m).toMatchObject({ inputTokens: 0, outputTokens: 0, costCents: 0 });
  });
});

describe("o serviço de transcrição avisa quanto custou", () => {
  function fetchQueResponde(corpo: unknown, status = 200) {
    return vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
  }

  it("⭐ uma transcrição que deu certo entrega UMA medida, com o modelo e o usage da resposta", async () => {
    const aoMedir = vi.fn();
    const provedor = apiTranscriptionProvider(
      { apiKey: "sk-teste", model: "whisper-1", aoMedir },
      fetchQueResponde({ text: "olá", usage: { type: "duration", seconds: 12 } }),
    );
    expect(await provedor.transcribe(Buffer.from("x"), "audio/ogg")).toBe("olá");
    expect(aoMedir).toHaveBeenCalledTimes(1);
    expect(aoMedir.mock.calls[0]![0]).toMatchObject({ model: "whisper-1", usage: { type: "duration", seconds: 12 } });
    expect(aoMedir.mock.calls[0]![0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("chamada que falhou não é medida — não houve cobrança a registrar", async () => {
    const aoMedir = vi.fn();
    const provedor = apiTranscriptionProvider({ apiKey: "sk-teste", aoMedir }, fetchQueResponde({ error: "x" }, 401));
    await expect(provedor.transcribe(Buffer.from("x"), "audio/ogg")).rejects.toThrow("transcription_401");
    expect(aoMedir).not.toHaveBeenCalled();
  });

  it("CONTROLE: sem `aoMedir` o comportamento é o de antes", async () => {
    const provedor = apiTranscriptionProvider({ apiKey: "sk-teste" }, fetchQueResponde({ text: "olá" }));
    expect(await provedor.transcribe(Buffer.from("x"), "audio/ogg")).toBe("olá");
  });
});

describe("o registro em llm_calls", () => {
  const ORG = "0b000000-0000-4000-8000-000000000001";
  const CONTATO = "0b000000-0000-4000-8000-0000000000c1";
  const medida = (over: Partial<MedidaDeMidia> = {}): MedidaDeMidia => ({
    ponto: "transcricao_de_audio",
    provider: "openai",
    model: "whisper-1",
    inputTokens: 0,
    outputTokens: 0,
    costCents: 0.6,
    latencyMs: 700,
    ...over,
  });

  function banco(resposta: { error: { message: string } | null } | Error = { error: null }) {
    const gravado: Array<{ tabela: string; linhas: unknown }> = [];
    const admin = {
      from: (tabela: string) => ({
        insert: async (linhas: unknown) => {
          gravado.push({ tabela, linhas });
          if (resposta instanceof Error) throw resposta;
          return resposta;
        },
      }),
    };
    return { admin, gravado };
  }

  it("⭐ uma linha por chamada, na organização e no contato da mensagem", async () => {
    const { admin, gravado } = banco();
    await registrarGastoDaMidia(admin, { organizationId: ORG, contactId: CONTATO }, [
      medida(),
      medida({ ponto: "visao_de_imagem", provider: "anthropic", model: "claude-sonnet-5", inputTokens: 900, outputTokens: 40, costCents: null }),
    ]);
    expect(gravado).toHaveLength(1);
    expect(gravado[0]!.tabela).toBe("llm_calls");
    expect(gravado[0]!.linhas).toEqual([
      {
        organization_id: ORG,
        contact_id: CONTATO,
        purpose: "transcricao_de_audio",
        provider: "openai",
        model: "whisper-1",
        input_tokens: 0,
        output_tokens: 0,
        cost_cents: 0.6,
        latency_ms: 700,
        status: "ok",
      },
      {
        organization_id: ORG,
        contact_id: CONTATO,
        purpose: "visao_de_imagem",
        provider: "anthropic",
        model: "claude-sonnet-5",
        input_tokens: 900,
        output_tokens: 40,
        // NULL, e não zero: preço desconhecido não pode parecer "de graça".
        cost_cents: null,
        latency_ms: 700,
        status: "ok",
      },
    ]);
  });

  it("sem medida não há escrita", async () => {
    const { admin, gravado } = banco();
    await registrarGastoDaMidia(admin, { organizationId: ORG, contactId: null }, []);
    expect(gravado).toEqual([]);
  });

  it("mensagem sem contato ainda registra o gasto da organização", async () => {
    const { admin, gravado } = banco();
    await registrarGastoDaMidia(admin, { organizationId: ORG, contactId: null }, [medida()]);
    expect((gravado[0]!.linhas as Array<{ contact_id: unknown }>)[0]!.contact_id).toBeNull();
  });

  it.each([
    ["o banco recusa", { error: { message: "permission denied" } }],
    ["o cliente lança", new Error("rede fora")],
  ])("⭐ %s: quem chamou não é derrubado, e o motivo vai ao log", async (_nome, resposta) => {
    vi.mocked(logger.warn).mockClear();
    const { admin } = banco(resposta as never);
    await expect(
      registrarGastoDaMidia(admin, { organizationId: ORG, contactId: CONTATO }, [medida()]),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("a escada de transcrição repassa o gasto, qualquer que seja o degrau", () => {
  it("⭐ degrau da chave OpenAI: a medida chega a quem registra, já com provedor e custo", async () => {
    const { decidirTranscricao } = await import("@/lib/messaging/media/escada-de-transcricao");
    const fetchFalso = vi.fn(
      async () => new Response(JSON.stringify({ text: "bom dia", usage: { type: "duration", seconds: 60 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    try {
      const medidas: MedidaDeMidia[] = [];
      const decisao = await decidirTranscricao({
        conversa: null,
        idiomas: [],
        chaveOpenai: async () => "sk-teste",
        aoGastar: (m) => medidas.push(m),
      });
      // Com TRANSCRIPTION_API_KEY no ambiente o degrau é o do serviço; sem ela, o da chave OpenAI.
      expect(["padrao_openai_compativel", "servico_da_instalacao"]).toContain(decisao.origem);
      expect(await decisao.transcriber!.transcribe(Buffer.from("x"), "audio/ogg")).toBe("bom dia");
      expect(medidas).toHaveLength(1);
      expect(medidas[0]).toMatchObject({ ponto: "transcricao_de_audio" });
      expect(typeof medidas[0]!.provider).toBe("string");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("CONTROLE: sem `aoGastar` a escada devolve um transcritor que funciona como antes", async () => {
    const { decidirTranscricao } = await import("@/lib/messaging/media/escada-de-transcricao");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "oi" }), { status: 200 })));
    try {
      const decisao = await decidirTranscricao({ conversa: null, idiomas: [], chaveOpenai: async () => "sk-teste" });
      expect(await decisao.transcriber!.transcribe(Buffer.from("x"), "audio/ogg")).toBe("oi");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("o worker de mídia registra o que gastou", () => {
  // Leitura do artefato: o caminho de erro de uma derivação é caro demais para
  // provar de ponta a ponta, e o que precisa ser fixado é pequeno e exato.
  it("⭐ as três chamadas pagas passam pelo coletor, e a gravação fica no `finally`", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("workers/media-derive-worker.ts", "utf8");
    // a transcrição (qualquer degrau) e a visão recebem o coletor
    expect(fonte).toMatch(/decidirTranscricao\(\{[\s\S]{0,400}?aoGastar,\s*\}\)/);
    expect(fonte).toMatch(/buildDeriveDeps\([\s\S]{0,200}?aoGastar,\s*\)/);
    expect(fonte).toMatch(/ponto: "visao_de_imagem"/);
    // …e o que foi pago é gravado mesmo quando o passo seguinte falha
    expect(fonte).toMatch(/\} finally \{\s*await registrarGastoDaMidia\(/);
    // com o contato da mensagem, lido junto com ela
    expect(fonte).toMatch(/\.select\("id, organization_id, contact_id, /);
    expect(fonte).toMatch(/contactId: msg\.contact_id \?\? null/);
  });
});

/**
 * O TETO DE ATENDIMENTOS AUTOMÁTICOS POR CONTATO (#271).
 *
 * O teto mensal protege a organização inteira; faltava a medida por contato. Um
 * número que escreve sem parar gerava um atendimento de IA por mensagem — 200
 * mensagens, 200 turnos, sem nenhum freio antes do teto mensal (que nasce
 * desligado).
 *
 * Três coisas são fixadas aqui, sem banco:
 *   1. A REGRA, exata: o atendimento de número N responde, o N+1 não.
 *   2. O DESVIO: ao estourar, nenhum modelo é chamado, o cliente é avisado ANTES
 *      de a conversa ser silenciada, e a passagem nasce com motivo próprio.
 *   3. O LUGAR: a guarda fica antes da primeira chamada de modelo do turno.
 *
 * A consulta de verdade (janela que anda, recomeço depois da devolução, virada
 * de dia e de mês) é medida num Postgres real em
 * `tests/invariants/teto-de-ia-por-contato.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DesfechoDoAviso } from "@/lib/agent-engine/agent/aviso-de-escalacao";
import { passarParaHumanoSeOContatoEstourouOTeto } from "@/lib/agent-engine/agent/inbound-turn";
import {
  decidirTetoPorContato,
  HANDOFF_REASON_TETO_POR_CONTATO,
  normalizarTeto,
  resumoDoHandoffPorTetoDeContato,
  SQL_TETO_POR_CONTATO,
  TETO_POR_CONTATO_MAXIMO,
  TETO_POR_CONTATO_PADRAO,
  TITULO_DO_HANDOFF_POR_TETO_DE_CONTATO,
} from "@/lib/agent-engine/agent/teto-por-contato";
import { motivoDoAviso } from "@/lib/escalacao/aviso-ao-lead";
import {
  FRASE_DO_MOTIVO,
  MOTIVOS_DA_PASSAGEM,
  ORIGENS_DA_PASSAGEM,
} from "@/lib/escalacao/passagem";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-11-12T15:00:00.000Z");

describe("a regra", () => {
  const teto = { porHora: 50, porDia: 150 };

  it("⭐ o atendimento de número N responde, o N+1 não", () => {
    // A contagem é do que JÁ aconteceu; o turno que pergunta ainda não gastou.
    expect(decidirTetoPorContato(teto, { naHora: 49, noDia: 49 })).toEqual({ estourou: false });
    expect(decidirTetoPorContato(teto, { naHora: 50, noDia: 50 })).toEqual({
      estourou: true,
      janela: "hora",
      contagem: 50,
      limite: 50,
    });
  });

  it("⭐ o dia estoura mesmo com a hora folgada", () => {
    expect(decidirTetoPorContato(teto, { naHora: 3, noDia: 149 })).toEqual({ estourou: false });
    expect(decidirTetoPorContato(teto, { naHora: 3, noDia: 150 })).toEqual({
      estourou: true,
      janela: "dia",
      contagem: 150,
      limite: 150,
    });
  });

  it("quando as duas janelas estouram juntas, a explicação é a da hora", () => {
    const v = decidirTetoPorContato(teto, { naHora: 60, noDia: 200 });
    expect(v).toMatchObject({ estourou: true, janela: "hora" });
  });

  it("zero desliga aquela janela, e só ela", () => {
    expect(decidirTetoPorContato({ porHora: 0, porDia: 150 }, { naHora: 9_999, noDia: 100 })).toEqual({
      estourou: false,
    });
    expect(decidirTetoPorContato({ porHora: 0, porDia: 150 }, { naHora: 9_999, noDia: 150 })).toMatchObject({
      estourou: true,
      janela: "dia",
    });
    expect(decidirTetoPorContato({ porHora: 0, porDia: 0 }, { naHora: 9_999, noDia: 9_999 })).toEqual({
      estourou: false,
    });
  });

  it("uma conversa normal de 30 mensagens não bate no padrão", () => {
    for (let n = 0; n < 30; n++) {
      expect(decidirTetoPorContato(normalizarTeto({ porHora: null, porDia: null }), { naHora: n, noDia: n })).toEqual({
        estourou: false,
      });
    }
  });

  it("o padrão é o que o dono escolheu: 50 por hora e 150 por dia", () => {
    expect(TETO_POR_CONTATO_PADRAO).toEqual({ porHora: 50, porDia: 150 });
  });
});

describe("normalizarTeto", () => {
  it.each([
    ["ausente", null, 50],
    ["indefinido", undefined, 50],
    ["texto que não é número", "muito", 50],
    ["negativo", -1, 50],
    ["NaN", Number.NaN, 50],
    ["infinito", Number.POSITIVE_INFINITY, 50],
  ])("⭐ %s cai no padrão — nunca em 'sem teto'", (_nome, valor, esperado) => {
    expect(normalizarTeto({ porHora: valor, porDia: 150 }).porHora).toBe(esperado);
  });

  it("zero é escolha, e é preservado", () => {
    expect(normalizarTeto({ porHora: 0, porDia: 0 })).toEqual({ porHora: 0, porDia: 0 });
  });

  it("número que o driver entrega como texto é aceito", () => {
    expect(normalizarTeto({ porHora: "20", porDia: "60" })).toEqual({ porHora: 20, porDia: 60 });
  });

  it("acima do máximo é cortado no máximo", () => {
    expect(normalizarTeto({ porHora: 99_999_999, porDia: 5 })).toEqual({
      porHora: TETO_POR_CONTATO_MAXIMO,
      porDia: 5,
    });
  });
});

// ── o desvio, com um banco que anota ────────────────────────────────────────

interface Chamada {
  sql: string;
  params: unknown[];
}

function poolFalso(opts: { naHora?: number; noDia?: number; porHora?: number; porDia?: number; falha?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    chamadas.push({ sql, params });
    if (sql === SQL_TETO_POR_CONTATO) {
      if (opts.falha) throw new Error('column "teto_por_contato_hora" does not exist');
      return {
        rows: [
          {
            por_hora: opts.porHora ?? 50,
            por_dia: opts.porDia ?? 150,
            na_hora: opts.naHora ?? 0,
            no_dia: opts.noDia ?? 0,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query } as never, chamadas };
}

function logFalso() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function contexto(pool: unknown, avisarLead = vi.fn(async (): Promise<DesfechoDoAviso> => ({ avisado: true }))) {
  const log = logFalso();
  return {
    ctx: {
      pool: pool as never,
      tenantId: ORG,
      leadId: LEAD,
      conversationId: CONVERSA,
      agora: AGORA,
      avisarLead,
      log: log as never,
    },
    log,
    avisarLead,
  };
}

const escritas = (chamadas: Chamada[]) =>
  chamadas.filter((c) => /^\s*(insert|update|delete|with)\b/i.test(c.sql) && c.sql !== SQL_TETO_POR_CONTATO);

describe("o desvio do turno", () => {
  it("abaixo do teto: o turno segue, sem aviso e sem uma escrita sequer", async () => {
    const { pool, chamadas } = poolFalso({ naHora: 49, noDia: 149 });
    const { ctx, avisarLead } = contexto(pool);

    expect(await passarParaHumanoSeOContatoEstourouOTeto(ctx)).toBe(false);
    expect(avisarLead).not.toHaveBeenCalled();
    expect(escritas(chamadas)).toEqual([]);
    // Uma consulta só, com a organização, o contato e o relógio DO TURNO.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.params).toEqual([ORG, LEAD, AGORA.toISOString(), 50, 150]);
  });

  it("⭐ no teto: o turno termina, a conversa vai para a fila humana e a Central é avisada", async () => {
    const { pool, chamadas } = poolFalso({ naHora: 50, noDia: 50 });
    const { ctx, avisarLead, log } = contexto(pool);

    expect(await passarParaHumanoSeOContatoEstourouOTeto(ctx)).toBe(true);
    expect(avisarLead).toHaveBeenCalledTimes(1);

    const forceHuman = chamadas.find((c) => c.sql.includes("set force_human = true"));
    expect(forceHuman?.params).toEqual([ORG, LEAD]);

    const conversa = chamadas.find((c) => c.sql.includes("update conversations"));
    expect(conversa?.params?.slice(0, 2)).toEqual([ORG, CONVERSA]);
    expect(conversa?.params).toContain(HANDOFF_REASON_TETO_POR_CONTATO);

    const passagem = chamadas.find((c) => c.sql.includes("insert into passagens_de_atendimento"));
    expect(passagem, "a passagem por teto de contato não virou registro").toBeDefined();
    expect(passagem?.params).toContain("teto_por_contato");
    expect(passagem?.params).toContain("limite_por_contato");

    const inbox = chamadas.find((c) => c.sql.includes("insert into agent_inbox_items"));
    expect(inbox, "estouro sem aviso na Central é parada que ninguém vê").toBeDefined();
    expect(inbox?.params).toContain(TITULO_DO_HANDOFF_POR_TETO_DE_CONTATO);

    // O log leva números, nunca conteúdo de conversa.
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("teto por contato"),
      expect.objectContaining({ janela: "hora", contagem: 50, limite: 50, lead_avisado: true }),
    );
  });

  it("⭐ o cliente é avisado ANTES de a conversa ser silenciada", async () => {
    const { pool, chamadas } = poolFalso({ naHora: 50 });
    const ordem: string[] = [];
    const avisarLead = vi.fn(async (): Promise<DesfechoDoAviso> => {
      ordem.push(`aviso@${chamadas.filter((c) => c.sql.includes("force_human = true")).length}`);
      return { avisado: true };
    });
    const { ctx } = contexto(pool, avisarLead);

    await passarParaHumanoSeOContatoEstourouOTeto(ctx);
    // No instante do aviso, nenhuma trava tinha sido armada: `force_human` veta
    // todo envio, então avisar depois seria o silêncio que o aviso existe para evitar.
    expect(ordem).toEqual(["aviso@0"]);
  });

  it("o resumo de quem assume diz que o cliente NÃO pediu uma pessoa, e qual limite estourou", async () => {
    const { pool, chamadas } = poolFalso({ naHora: 3, noDia: 150 });
    const { ctx } = contexto(pool);

    await passarParaHumanoSeOContatoEstourouOTeto(ctx);
    const passagem = chamadas.find((c) => c.sql.includes("insert into passagens_de_atendimento"));
    const corpo = String(
      passagem?.params?.find((p) => typeof p === "string" && p.includes("NÃO pediu atendimento humano")) ?? "",
    );
    expect(corpo).toContain("150 respostas automáticas por dia");
    expect(corpo).toContain('"Devolver ao automático"');
  });

  it("aviso que falha NÃO impede a passagem", async () => {
    const { pool, chamadas } = poolFalso({ naHora: 50 });
    const { ctx } = contexto(
      pool,
      vi.fn(async (): Promise<DesfechoDoAviso> => {
        throw new Error("canal fora");
      }),
    );

    expect(await passarParaHumanoSeOContatoEstourouOTeto(ctx)).toBe(true);
    expect(chamadas.some((c) => c.sql.includes("set force_human = true"))).toBe(true);
  });

  it("⭐ consulta que falha não derruba o atendimento: o turno segue e o motivo vai ao log", async () => {
    const { pool, chamadas } = poolFalso({ falha: true });
    const { ctx, avisarLead, log } = contexto(pool);

    expect(await passarParaHumanoSeOContatoEstourouOTeto(ctx)).toBe(false);
    expect(avisarLead).not.toHaveBeenCalled();
    expect(escritas(chamadas)).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("não pôde ser lido"),
      expect.objectContaining({ error: expect.stringContaining("teto_por_contato_hora") }),
    );
  });

  it("organização que desligou o teto (0 e 0) nunca é desviada", async () => {
    const { pool } = poolFalso({ porHora: 0, porDia: 0, naHora: 5_000, noDia: 5_000 });
    const { ctx } = contexto(pool);
    expect(await passarParaHumanoSeOContatoEstourouOTeto(ctx)).toBe(false);
  });
});

describe("os textos", () => {
  it("o resumo nomeia a janela e o número, em português e em espanhol", () => {
    expect(resumoDoHandoffPorTetoDeContato({ janela: "hora", limite: 50 }, "pt-BR")).toContain(
      "50 respostas automáticas por hora",
    );
    const es = resumoDoHandoffPorTetoDeContato({ janela: "dia", limite: 150 }, "es");
    expect(es).toContain("150 respuestas automáticas por día");
    expect(es, "marcador sem preencher chegou a quem assume").not.toContain("{limite}");
  });

  it("o motivo e a origem existem no vocabulário da passagem, com frase em português", () => {
    expect(MOTIVOS_DA_PASSAGEM).toContain(HANDOFF_REASON_TETO_POR_CONTATO);
    expect(ORIGENS_DA_PASSAGEM).toContain("teto_por_contato");
    expect(FRASE_DO_MOTIVO.limite_por_contato).toMatch(/não pediu uma pessoa/);
  });

  it("o cliente lê a frase de 'a IA saiu de campo', não a de 'você pediu um atendente'", () => {
    expect(motivoDoAviso(HANDOFF_REASON_TETO_POR_CONTATO)).toBe("orcamento_de_ia");
  });
});

describe("o lugar da guarda no turno", () => {
  const fonte = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
  const nucleo = fonte.slice(fonte.indexOf("async function executarTurnoDoAgente("));

  it("a sonda enxerga o núcleo do turno (controle de vacuidade)", () => {
    expect(nucleo.length).toBeGreaterThan(10_000);
    expect(nucleo).toContain("resolveConversationTurn(");
  });

  it("⭐ a guarda roda antes da primeira chamada de modelo do turno (o roteador de intenção)", () => {
    const guarda = nucleo.indexOf("passarParaHumanoSeOContatoEstourouOTeto({");
    expect(guarda, "o núcleo do turno não chama a guarda").toBeGreaterThan(-1);
    for (const chamada of ["resolveConversationTurn(", "classifyStage(", "maybeCompact(", "runModelCall("]) {
      const onde = nucleo.indexOf(chamada);
      expect(onde, `${chamada} não aparece no núcleo — a sonda está cega`).toBeGreaterThan(-1);
      expect(guarda, `${chamada} roda antes do teto por contato`).toBeLessThan(onde);
    }
  });

  it("a guarda vem depois das que não custam nada: handoff, elegibilidade e janela", () => {
    const guarda = nucleo.indexOf("passarParaHumanoSeOContatoEstourouOTeto({");
    for (const antes of ["isLeadInHandoff(", "decidirElegibilidadeDaConversa(", "janelaDeEnvioAberta("]) {
      expect(nucleo.indexOf(antes)).toBeGreaterThan(-1);
      expect(nucleo.indexOf(antes), `${antes} deveria vir antes do teto`).toBeLessThan(guarda);
    }
  });

  it("só o turno que REAGE a uma mensagem recebida é medido, e a prévia nunca", () => {
    const trecho = nucleo.slice(nucleo.indexOf("// TETO POR CONTATO (#271)"), nucleo.indexOf("const routed = preview"));
    expect(trecho).toMatch(/if \(!preview && eTurnoDeResposta\(liveJob\(\)\)\)/);
    expect(trecho).toMatch(/if \(estourou\) return;/);
  });

  it("a consulta conta turnos em que o modelo de atendimento rodou, e só depois da última passagem", () => {
    const sql = SQL_TETO_POR_CONTATO.replace(/\s+/g, " ");
    expect(sql).toContain("c.purpose = 'agent_turn'");
    expect(sql).toContain("c.status = 'ok'");
    expect(sql).toContain("from passagens_de_atendimento p");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("interval '1 hour'");
    // Organização e contato são parâmetro em TODA tabela tenant-aware da consulta.
    expect(sql.match(/organization_id = \$1/g)?.length).toBe(3);
  });
});

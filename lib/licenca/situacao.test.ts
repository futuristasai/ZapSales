// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const consultarPorta = vi.fn();
vi.mock("./porta", () => ({ consultarPorta: (...a: unknown[]) => consultarPorta(...a) }));

const garantirEstado = vi.fn();
vi.mock("./armazem", () => ({ garantirEstado: () => garantirEstado() }));

import { detalhesDaLicenca, situacaoDaLicenca } from "./situacao";

const T0 = 1_800_000_000;

const decisao = (mudancas: Record<string, unknown> = {}) => ({
  estado: "temporario_valido",
  opera: true,
  mensagem: "temporaria_faltam_dias",
  diasRestantes: 7,
  seloTipo: "temporario",
  motivoDoSelo: null,
  relogioRecuou: false,
  agora: T0,
  ...mudancas,
});

const veredito = (d: unknown, modo: string | null = "sombra") => ({
  aplicar: false,
  decisao: d,
  modo,
  motivo: "sombra",
});

const estadoLocal = (mudancas: Record<string, unknown> = {}) => ({
  instalacaoId: "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f",
  seloAtual: "a.b.c",
  maiorHorarioVisto: T0,
  ativadaEm: T0 - 3 * 86_400,
  bloqueio: null,
  ultimaConsultaOkEm: T0 - 600,
  janelaTerminaEm: T0 + 7 * 86_400,
  proximaConsultaEm: T0 + 3000,
  modo: "sombra",
  ...mudancas,
});

beforeEach(() => {
  consultarPorta.mockReset();
  garantirEstado.mockReset();
});

describe("situacaoDaLicenca — o que a faixa recebe", () => {
  it("é a MESMA decisão das portas (consulta a porta), traduzida para dado simples", async () => {
    consultarPorta.mockResolvedValue(veredito(decisao()));
    expect(await situacaoDaLicenca()).toEqual({
      estado: "temporario_valido",
      opera: true,
      mensagem: "temporaria_faltam_dias",
      diasRestantes: 7,
      modo: "sombra",
    });
    expect(consultarPorta).toHaveBeenCalledWith("tela");
  });

  it("estado ilegível (decisão nula): null — nunca uma faixa inventada", async () => {
    consultarPorta.mockResolvedValue(veredito(null, null));
    expect(await situacaoDaLicenca()).toBeNull();
  });

  it("não carrega selo, credencial nem o motivo do selo para o navegador", async () => {
    consultarPorta.mockResolvedValue(veredito(decisao({ motivoDoSelo: "assinatura_invalida" })));
    const texto = JSON.stringify(await situacaoDaLicenca());
    expect(texto).not.toContain("assinatura_invalida");
    expect(texto).not.toContain("a.b.c");
  });
});

describe("detalhesDaLicenca — a página de quem administra", () => {
  it("junta a decisão com as datas do estado local, em ISO", async () => {
    consultarPorta.mockResolvedValue(veredito(decisao()));
    garantirEstado.mockResolvedValue({ ok: true, estado: estadoLocal() });
    expect(await detalhesDaLicenca()).toEqual({
      estado: "temporario_valido",
      opera: true,
      mensagem: "temporaria_faltam_dias",
      diasRestantes: 7,
      modo: "sombra",
      instalacaoId: "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f",
      ativada: true,
      ultimaConsultaOkEm: new Date((T0 - 600) * 1000).toISOString(),
      janelaTerminaEm: new Date((T0 + 7 * 86_400) * 1000).toISOString(),
      proximaConsultaEm: new Date((T0 + 3000) * 1000).toISOString(),
      bloqueioCodigo: null,
      relogioRecuou: false,
    });
  });

  it("instalação nunca ativada: ativada=false e datas nulas; o bloqueio vem como CÓDIGO", async () => {
    consultarPorta.mockResolvedValue(veredito(decisao({ estado: "bloqueada", opera: false })));
    garantirEstado.mockResolvedValue({
      ok: true,
      estado: estadoLocal({
        ativadaEm: null,
        ultimaConsultaOkEm: null,
        janelaTerminaEm: null,
        proximaConsultaEm: null,
        bloqueio: { codigo: "reembolso", em: T0 },
      }),
    });
    expect(await detalhesDaLicenca()).toMatchObject({
      ativada: false,
      ultimaConsultaOkEm: null,
      janelaTerminaEm: null,
      proximaConsultaEm: null,
      bloqueioCodigo: "reembolso",
    });
  });

  it("estado ilegível (em qualquer das duas leituras): null", async () => {
    consultarPorta.mockResolvedValue(veredito(null, null));
    expect(await detalhesDaLicenca()).toBeNull();
    consultarPorta.mockResolvedValue(veredito(decisao()));
    garantirEstado.mockResolvedValue({ ok: false, motivo: "tabela_ausente" });
    expect(await detalhesDaLicenca()).toBeNull();
  });
});

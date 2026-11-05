// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assinarParaTeste } from "../../tests/support/licenca-chave-de-teste";
import { INSTALACAO_DE_EXEMPLO } from "../../tests/support/licenca-selos-de-exemplo";
import type { EstadoLocal } from "./estado";

const garantirEstado = vi.fn();
const registrarHorarioVisto = vi.fn(async (_segundos: number) => ({ ok: true }));
vi.mock("./armazem", () => ({
  garantirEstado: () => garantirEstado(),
  registrarHorarioVisto: (s: number) => registrarHorarioVisto(s),
}));

// Em teste NODE_ENV não é "production": a chave de teste entra pelas `extras`... que a porta não
// passa. Por isso a lista de chaves é trocada aqui — o que se prova é a porta, não a lista.
vi.mock("./chaves", async () => {
  const { chavePublicaDeTeste } = await import("../../tests/support/licenca-chave-de-teste");
  return { chavesAceitas: () => [chavePublicaDeTeste] };
});

import {
  caminhoLiberadoDaLicenca,
  consultarPorta,
  esquecerDecisaoDaLicenca,
  INTERVALO_DE_REGISTRO_DO_HORARIO_MS,
  VALIDADE_DA_DECISAO_MS,
} from "./porta";

const AGORA_S = 1_800_000_000;
const AGORA_MS = AGORA_S * 1000;
const DIA = 86_400;

function estado(mudancas: Partial<EstadoLocal> = {}): EstadoLocal {
  return {
    instalacaoId: INSTALACAO_DE_EXEMPLO,
    seloAtual: null,
    maiorHorarioVisto: null,
    ativadaEm: null,
    bloqueio: null,
    ultimaConsultaOkEm: null,
    janelaTerminaEm: null,
    modo: "sombra",
    ...mudancas,
  };
}

const ativadaSemSelo = (modo: "sombra" | "valendo") =>
  estado({ ativadaEm: AGORA_S - 3 * DIA, modo });

beforeEach(() => {
  esquecerDecisaoDaLicenca();
  garantirEstado.mockReset();
  registrarHorarioVisto.mockClear();
});

describe("modo sombra — calcula e registra, nunca restringe", () => {
  it("instalação que a decisão barraria NÃO é recusada em sombra", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: ativadaSemSelo("sombra") });
    const v = await consultarPorta("proxy", AGORA_MS);
    expect(v.aplicar).toBe(false);
    expect(v.decisao).toMatchObject({ estado: "temporario_vencido", opera: false });
    expect(v.motivo).toBe("sombra");
  });

  it("instalação que nunca foi ativada opera, em qualquer modo", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: estado({ modo: "valendo" }) });
    const v = await consultarPorta("cron", AGORA_MS);
    expect(v).toMatchObject({ aplicar: false, motivo: "opera" });
  });
});

describe("modo valendo — a decisão vira recusa", () => {
  it("ativada, sem selo válido: a porta RECUSA", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: ativadaSemSelo("valendo") });
    const v = await consultarPorta("worker", AGORA_MS);
    expect(v).toMatchObject({ aplicar: true, motivo: "valendo" });
  });

  it("bloqueada: recusa", async () => {
    garantirEstado.mockResolvedValue({
      ok: true,
      estado: estado({ modo: "valendo", bloqueio: { codigo: "reembolso", em: AGORA_S } }),
    });
    expect((await consultarPorta("webhook", AGORA_MS)).aplicar).toBe(true);
  });

  it("com selo temporário válido: opera", async () => {
    const selo = await assinarParaTeste({
      v: 1,
      iss: "zapsales-licencas",
      sub: INSTALACAO_DE_EXEMPLO,
      lic: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      tipo: "temporario",
      iat: AGORA_S - 3600,
      exp: AGORA_S + 47 * 3600,
      jti: "00000000-0000-4000-8000-0000000000aa",
    });
    garantirEstado.mockResolvedValue({
      ok: true,
      estado: estado({ modo: "valendo", seloAtual: selo, ativadaEm: AGORA_S - DIA }),
    });
    expect(await consultarPorta("proxy", AGORA_MS)).toMatchObject({
      aplicar: false,
      motivo: "opera",
    });
  });
});

describe("falha para o lado que não derruba o cliente", () => {
  it("estado ilegível (tabela ausente) NÃO recusa e diz por quê", async () => {
    garantirEstado.mockResolvedValue({ ok: false, motivo: "tabela_ausente" });
    expect(await consultarPorta("proxy", AGORA_MS)).toEqual({
      aplicar: false,
      decisao: null,
      modo: null,
      motivo: "estado_indisponivel",
    });
  });

  it("exceção inesperada não vaza e não recusa", async () => {
    garantirEstado.mockRejectedValue(new Error("explodiu"));
    const v = await consultarPorta("proxy", AGORA_MS);
    expect(v).toMatchObject({ aplicar: false, motivo: "estado_indisponivel" });
  });

  it("a falha inesperada não fica lembrada: a pergunta seguinte tenta de novo", async () => {
    garantirEstado.mockRejectedValueOnce(new Error("explodiu"));
    await consultarPorta("proxy", AGORA_MS);
    garantirEstado.mockResolvedValue({ ok: true, estado: ativadaSemSelo("valendo") });
    expect((await consultarPorta("proxy", AGORA_MS + 1)).aplicar).toBe(true);
  });
});

describe("custo — a decisão é lembrada e o horário vai ao banco de tempos em tempos", () => {
  it("duas perguntas dentro da validade leem o banco UMA vez", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: estado() });
    await consultarPorta("proxy", AGORA_MS);
    await consultarPorta("api_token", AGORA_MS + VALIDADE_DA_DECISAO_MS - 1);
    expect(garantirEstado).toHaveBeenCalledTimes(1);
  });

  it("passada a validade, relê (uma mudança de estado alcança o processo)", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: estado() });
    await consultarPorta("proxy", AGORA_MS);
    garantirEstado.mockResolvedValue({ ok: true, estado: ativadaSemSelo("valendo") });
    const v = await consultarPorta("proxy", AGORA_MS + VALIDADE_DA_DECISAO_MS);
    expect(v.aplicar).toBe(true);
    expect(garantirEstado).toHaveBeenCalledTimes(2);
  });

  it("o maior horário visto é gravado na primeira leitura e depois só a cada intervalo", async () => {
    garantirEstado.mockResolvedValue({ ok: true, estado: estado() });
    await consultarPorta("proxy", AGORA_MS);
    await consultarPorta("proxy", AGORA_MS + VALIDADE_DA_DECISAO_MS);
    expect(registrarHorarioVisto).toHaveBeenCalledTimes(1);
    await consultarPorta("proxy", AGORA_MS + INTERVALO_DE_REGISTRO_DO_HORARIO_MS);
    expect(registrarHorarioVisto).toHaveBeenCalledTimes(2);
    expect(registrarHorarioVisto).toHaveBeenLastCalledWith(
      AGORA_S + INTERVALO_DE_REGISTRO_DO_HORARIO_MS / 1000,
    );
  });

  it("relógio que voltou grava o horário EFETIVO (o maior), nunca o recuado", async () => {
    garantirEstado.mockResolvedValue({
      ok: true,
      estado: estado({ maiorHorarioVisto: AGORA_S + 10 * DIA }),
    });
    await consultarPorta("proxy", AGORA_MS);
    expect(registrarHorarioVisto).toHaveBeenCalledWith(AGORA_S + 10 * DIA);
  });
});

describe("caminhoLiberadoDaLicenca — o que continua aberto sem licença", () => {
  it.each([
    "/api/v1/health",
    "/login",
    "/auth/confirm",
    "/api/v1/auth/realtime-token",
    "/api/v1/audit/export",
    "/api/v1/lgpd/requests",
    "/app/lgpd",
    "/licenca",
    "/licenca/renovar",
    "/api/v1/licenca/renovar",
  ])("%s está liberado", (caminho) => {
    expect(caminhoLiberadoDaLicenca(caminho)).toBe(true);
  });

  it.each([
    "/app/inbox",
    "/api/v1/conversations",
    "/api/v1/messages",
    "/api/v1/health/extra",
    "/api/v1/audit/exports-novos",
    "/licencas",
    "/api/v1/licencas",
    "/admin/licenca",
  ])("%s NÃO está liberado (a âncora impede carona)", (caminho) => {
    expect(caminhoLiberadoDaLicenca(caminho)).toBe(false);
  });
});

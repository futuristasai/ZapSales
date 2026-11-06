// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // base64 de "chave-de-teste-nao-e-de-producao" (32 bytes): falsa à vista.
  process.env.AI_CRED_AES_KEY = "Y2hhdmUtZGUtdGVzdGUtbmFvLWUtZGUtcHJvZHVjYW8="; // gitleaks:allow — chave FALSA de teste
  delete process.env.INSTALACAO_ID;
});

import { bancoFalso, type BancoFalso } from "../../tests/support/licenca-banco-falso";
import { chavePublicaDeTeste } from "../../tests/support/licenca-chave-de-teste";
import {
  emitirSelo,
  respostaDeErro,
  respostaDeSelo,
  subirServidorFalso,
  type ServidorFalso,
} from "../../tests/support/servidor-de-licencas-falso";

let banco: BancoFalso;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => banco.cliente }));

const esquecerDecisao = vi.fn();
vi.mock("./porta", () => ({ esquecerDecisaoDaLicenca: () => esquecerDecisao() }));

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { ativarLicenca } from "./ativar";
import { garantirEstado, lerCredencial } from "./armazem";
import { decidir } from "./decidir";

const INSTALACAO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const T0 = 1_800_000_000;
const DIA = 86_400;
const CREDENCIAL = "zpl_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const COMPRA = { email: "comprador@exemplo.com", codigoTransacao: "HP12345678901234" };

let servidor: ServidorFalso;
beforeAll(async () => {
  servidor = await subirServidorFalso();
});
afterAll(async () => {
  await servidor.fechar();
});

const ativar = (extra: Parameters<typeof ativarLicenca>[1] = {}) =>
  ativarLicenca(COMPRA, {
    agoraMs: T0 * 1000,
    chaves: [chavePublicaDeTeste],
    servidor: servidor.base,
    versao: "1.2.3",
    dominio: "crm.exemplo.com",
    aleatorio: () => 0.5,
    ...extra,
  });

const linha = () => banco.linha()!;

beforeEach(() => {
  env.INSTALACAO_ID = INSTALACAO;
  banco = bancoFalso();
  servidor.pedidos.length = 0;
  servidor.atender(() => respostaDeErro(500, "internal_error"));
  esquecerDecisao.mockReset();
  vi.restoreAllMocks();
});

describe("ativação: o caminho feliz", () => {
  it("troca e-mail + código da compra por credencial e selo, e grava tudo (credencial cifrada)", async () => {
    servidor.atender(() =>
      respostaDeSelo({
        instalacaoId: INSTALACAO,
        tipo: "temporario",
        iat: T0,
        janelaTerminaEm: T0 + 10 * DIA,
        credencial: CREDENCIAL,
      }),
    );

    const r = await ativar();

    expect(r).toEqual({ resultado: "ativada", tipo: "temporario" });
    expect(linha().ativada_em).toBe(new Date(T0 * 1000).toISOString());
    expect(linha().selo_atual).toEqual(expect.any(String));
    expect(linha().proxima_consulta_em).toBe(new Date((T0 + 3600) * 1000).toISOString());
    expect(linha().janela_termina_em).toBe(new Date((T0 + 10 * DIA) * 1000).toISOString());
    // A credencial só existe cifrada no banco, e o armazém a devolve em claro para a renovação.
    expect(JSON.stringify(linha())).not.toContain(CREDENCIAL);
    expect(await lerCredencial()).toEqual({ ok: true, credencial: CREDENCIAL });
    expect(esquecerDecisao).toHaveBeenCalled();
    const leitura = await garantirEstado();
    if (!leitura.ok) throw new Error("estado ilegível");
    expect(await decidir(leitura.estado, T0, { chaves: [chavePublicaDeTeste] })).toMatchObject({
      estado: "temporario_valido",
      opera: true,
    });
  });

  it("manda só o que o contrato autoriza (seção 5): e-mail, código, id da instalação, versão, domínio", async () => {
    servidor.atender(() =>
      respostaDeSelo({
        instalacaoId: INSTALACAO,
        tipo: "temporario",
        iat: T0,
        credencial: CREDENCIAL,
      }),
    );

    await ativar({ idempotencyKey: "chave-idempotente-1" });

    const pedido = servidor.pedidos[0]!;
    expect(pedido.caminho).toBe("/api/v1/licenca/ativar");
    expect(pedido.query).toBe("");
    expect(pedido.cabecalhos.authorization).toBeUndefined();
    expect(pedido.cabecalhos["idempotency-key"]).toBe("chave-idempotente-1");
    expect(pedido.corpo).toEqual({
      email: COMPRA.email,
      codigo_transacao: COMPRA.codigoTransacao,
      instalacao_id: INSTALACAO,
      versao: "1.2.3",
      dominio: "crm.exemplo.com",
    });
  });

  it("compra fora da janela recebe o permanente de uma vez, sem próxima consulta", async () => {
    servidor.atender(() =>
      respostaDeSelo({
        instalacaoId: INSTALACAO,
        tipo: "permanente",
        iat: T0,
        credencial: CREDENCIAL,
      }),
    );
    expect(await ativar()).toEqual({ resultado: "ativada", tipo: "permanente" });
    expect(linha().proxima_consulta_em).toBeNull();
  });
});

describe("ativação: a recusa do servidor chega à tela com o CÓDIGO", () => {
  it.each([
    [404, "compra_nao_encontrada"],
    [409, "compra_nao_aprovada"],
    [403, "licenca_bloqueada"],
    [422, "validation_error"],
    [429, "rate_limited"],
  ])("%s %s", async (status, codigo) => {
    servidor.atender(() => respostaDeErro(status, codigo));
    const r = await ativar();
    expect(r).toEqual({ resultado: "recusada", codigo, status });
    // Recusa não deixa estado nenhum: a instalação segue como estava (nunca ativada).
    expect(linha().ativada_em).toBeNull();
    expect(linha().selo_atual).toBeNull();
    expect(linha().credencial_ciphertext).toBeNull();
  });
});

describe("ativação: falha nunca grava", () => {
  it("servidor fora do ar", async () => {
    const r = await ativar({ servidor: "http://127.0.0.1:1/api/v1" });
    expect(r).toEqual({ resultado: "falhou", motivo: "servidor_inalcancavel" });
    expect(linha().ativada_em).toBeNull();
  });

  it("resposta torta", async () => {
    servidor.atender(() => ({ status: 200, bruto: "isto nao e json" }));
    expect(await ativar()).toEqual({ resultado: "falhou", motivo: "resposta_invalida" });
    expect(linha().ativada_em).toBeNull();
  });

  it("resposta sem credencial (a ativação exige a credencial)", async () => {
    servidor.atender(() =>
      respostaDeSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0 }),
    );
    expect(await ativar()).toEqual({ resultado: "falhou", motivo: "resposta_invalida" });
    expect(linha().ativada_em).toBeNull();
  });

  it.each([
    [
      "selo de outra instalação",
      () =>
        emitirSelo({
          instalacaoId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
          tipo: "temporario",
          iat: T0,
        }),
    ],
    [
      "selo com campo extra",
      () =>
        emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0, mudancas: { x: 1 } }),
    ],
    [
      "selo vencido",
      () => emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0 - 5 * DIA }),
    ],
  ])("%s é recusado e a instalação NÃO é marcada como ativada", async (_nome, fabricar) => {
    const selo = await fabricar();
    servidor.atender(() => ({
      status: 200,
      corpo: { data: { credencial: CREDENCIAL, selo, tipo: "temporario" } },
    }));
    expect(await ativar()).toEqual({ resultado: "falhou", motivo: "selo_rejeitado" });
    expect(linha().ativada_em).toBeNull();
    expect(linha().credencial_ciphertext).toBeNull();
  });

  it("endereço inseguro não é usado, e nada vai pela rede", async () => {
    expect(await ativar({ servidor: "http://licencas.exemplo.com/api/v1" })).toEqual({
      resultado: "falhou",
      motivo: "servidor_invalido",
    });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it("banco fora do ar: falha sem lançar e sem chamar o servidor", async () => {
    banco = bancoFalso({ lanca: true });
    expect(await ativar()).toEqual({ resultado: "falhou", motivo: "estado_ilegivel" });
    expect(servidor.pedidos).toHaveLength(0);
  });
});

describe("ativação: o segredo não vaza", () => {
  it("nem a credencial nem o e-mail aparecem em log", async () => {
    const espioes = [vi.spyOn(logger, "warn"), vi.spyOn(logger, "info"), vi.spyOn(logger, "error")];
    const selo = await emitirSelo({
      instalacaoId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      tipo: "temporario",
      iat: T0,
    });
    servidor.atender(() => ({
      status: 200,
      corpo: { data: { credencial: CREDENCIAL, selo, tipo: "temporario" } },
    }));
    await ativar();
    const tudo = JSON.stringify(espioes.flatMap((e) => e.mock.calls));
    expect(tudo.length).toBeGreaterThan(10);
    expect(tudo).not.toContain(CREDENCIAL);
    expect(tudo).not.toContain(COMPRA.email);
    expect(tudo).not.toContain(COMPRA.codigoTransacao);
  });
});

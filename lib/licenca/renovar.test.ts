// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Precisa existir ANTES do import: `lib/env.ts` lê o processo no carregamento do módulo.
vi.hoisted(() => {
  // base64 de "chave-de-teste-nao-e-de-producao" (32 bytes): falsa à vista.
  process.env.AI_CRED_AES_KEY = "Y2hhdmUtZGUtdGVzdGUtbmFvLWUtZGUtcHJvZHVjYW8="; // gitleaks:allow — chave FALSA de teste
  delete process.env.INSTALACAO_ID;
});

import { chavePublicaDeTeste } from "../../tests/support/licenca-chave-de-teste";
import { bancoFalso, type BancoFalso } from "../../tests/support/licenca-banco-falso";
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

import { CONSULTA_PADRAO_S } from "./agenda";
import { garantirEstado, gravarAtivacao } from "./armazem";
import { decidir } from "./decidir";
import { esquecerFalhasDaRenovacao, renovarLicenca, type OpcoesDaRenovacao } from "./renovar";

const INSTALACAO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const OUTRA_INSTALACAO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const T0 = 1_800_000_000;
const HORA = 3600;
const DIA = 86_400;
const CREDENCIAL = "zpl_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const CHAVES = [chavePublicaDeTeste];
const meio = () => 0.5;

let servidor: ServidorFalso;
beforeAll(async () => {
  servidor = await subirServidorFalso();
});
afterAll(async () => {
  await servidor.fechar();
});

const linhaBase = (mudancas: Record<string, unknown> = {}) => ({
  id: 1,
  instalacao_id: INSTALACAO,
  selo_atual: null,
  maior_horario_visto: null,
  ativada_em: null,
  bloqueio_codigo: null,
  bloqueio_em: null,
  ultima_consulta_ok_em: null,
  janela_termina_em: null,
  proxima_consulta_em: null,
  credencial_ciphertext: null,
  modo: "sombra",
  ...mudancas,
});

/** Uma instalação ATIVADA em `T0`: credencial gravada (cifrada), selo temporário de 48 h, consulta marcada p/ 1 h. */
async function instalacaoAtivada(opcoes: { proximaEmS?: number } = {}) {
  banco = bancoFalso({ inicial: linhaBase() });
  expect((await garantirEstado()).ok).toBe(true);
  const selo = await emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0 });
  const r = await gravarAtivacao({
    credencial: CREDENCIAL,
    selo,
    agora: T0,
    janelaTerminaEm: T0 + 10 * DIA,
    proximaConsultaEm: T0 + (opcoes.proximaEmS ?? HORA),
  });
  expect(r).toEqual({ ok: true });
  return selo;
}

/** Roda uma rodada em `T0 + segundos`, contra o servidor de mentira, com o sorteio fixo. */
const rodada = (depoisDeT0: number, extra: Partial<OpcoesDaRenovacao> = {}) =>
  renovarLicenca({
    agoraMs: (T0 + depoisDeT0) * 1000,
    chaves: CHAVES,
    servidor: servidor.base,
    versao: "1.2.3",
    dominio: "crm.exemplo.com",
    aleatorio: meio,
    ...extra,
  });

/** O servidor responde com selo novo, emitido no instante `T0 + depoisDeT0`. */
function servidorRenova(
  depoisDeT0: number,
  extra: Partial<Parameters<typeof respostaDeSelo>[0]> = {},
) {
  servidor.atender(() =>
    respostaDeSelo({
      instalacaoId: INSTALACAO,
      tipo: "temporario",
      iat: T0 + depoisDeT0,
      janelaTerminaEm: T0 + 10 * DIA,
      ...extra,
    }),
  );
}

const linha = () => banco.linha()!;
const decisaoEm = async (depoisDeT0: number) => {
  const leitura = await garantirEstado();
  if (!leitura.ok) throw new Error("estado ilegível");
  return decidir(leitura.estado, T0 + depoisDeT0, { chaves: CHAVES });
};

beforeEach(() => {
  env.INSTALACAO_ID = "";
  servidor.pedidos.length = 0;
  servidor.atender(() => respostaDeErro(500, "internal_error"));
  esquecerFalhasDaRenovacao();
  esquecerDecisao.mockReset();
  vi.restoreAllMocks();
});

describe("renovação: o caminho feliz", () => {
  it("troca o selo, marca a próxima consulta e a decisão continua `opera`", async () => {
    const seloAntigo = await instalacaoAtivada();
    servidorRenova(HORA + 5);

    const r = await rodada(HORA + 5);

    expect(r).toEqual({ resultado: "renovada", tipo: "temporario" });
    expect(linha().selo_atual).not.toBe(seloAntigo);
    expect(linha().proxima_consulta_em).toBe(new Date((T0 + HORA + 5 + HORA) * 1000).toISOString());
    expect(linha().ultima_consulta_ok_em).toBe(new Date((T0 + HORA + 5) * 1000).toISOString());
    expect(esquecerDecisao).toHaveBeenCalled();
    expect(await decisaoEm(HORA + 5)).toMatchObject({ estado: "temporario_valido", opera: true });
    // O selo novo vence 48 h depois da EMISSÃO, não depois do anterior: a instalação segue viva.
    expect(await decisaoEm(HORA + 5 + 47 * HORA)).toMatchObject({ opera: true });
  });

  it("manda só `versao` e `dominio` no corpo e a credencial no cabeçalho — nada na URL, nada de dado do cliente", async () => {
    await instalacaoAtivada();
    servidorRenova(HORA);

    await rodada(HORA);

    expect(servidor.pedidos).toHaveLength(1);
    const pedido = servidor.pedidos[0]!;
    expect(pedido.metodo).toBe("POST");
    expect(pedido.caminho).toBe("/api/v1/licenca/renovar");
    expect(pedido.query).toBe("");
    expect(pedido.cabecalhos.authorization).toBe(`Bearer ${CREDENCIAL}`);
    expect(pedido.corpo).toEqual({ versao: "1.2.3", dominio: "crm.exemplo.com" });
    expect(Object.keys(pedido.corpo as object).sort()).toEqual(["dominio", "versao"]);
    expect(pedido.caminho + pedido.query + pedido.corpoBruto).not.toContain("zpl_");
  });

  it("usa a sugestão do servidor quando ela cabe na faixa (2 h)", async () => {
    await instalacaoAtivada();
    servidorRenova(HORA, { proximaEmS: 2 * HORA });
    await rodada(HORA);
    expect(linha().proxima_consulta_em).toBe(new Date((T0 + HORA + 2 * HORA) * 1000).toISOString());
  });

  it.each([
    ["30 segundos", 30],
    ["30 dias", 30 * DIA],
  ])("ignora sugestão fora da faixa (%s) e usa 1 hora", async (_nome, sugestao) => {
    await instalacaoAtivada();
    servidorRenova(HORA, { proximaEmS: sugestao });
    await rodada(HORA);
    expect(linha().proxima_consulta_em).toBe(
      new Date((T0 + HORA + CONSULTA_PADRAO_S) * 1000).toISOString(),
    );
  });

  it("servidor sem `proxima_consulta_em` na resposta: usa 1 hora; campos desconhecidos são ignorados", async () => {
    await instalacaoAtivada();
    servidorRenova(HORA, { proximaEmS: null, extras: { novidade_da_v2: { qualquer: "coisa" } } });
    expect(await rodada(HORA)).toEqual({ resultado: "renovada", tipo: "temporario" });
    expect(linha().proxima_consulta_em).toBe(
      new Date((T0 + HORA + CONSULTA_PADRAO_S) * 1000).toISOString(),
    );
  });
});

describe("renovação: o lembrete da próxima consulta", () => {
  it("antes do instante marcado não fala com o servidor (o cron bate toda hora; a rede, não)", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidorRenova(10);

    const cedo = await rodada(HORA - 1);

    expect(cedo).toEqual({ resultado: "adiada", ateSegundos: T0 + HORA });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it("no instante marcado fala", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidorRenova(HORA);
    expect(await rodada(HORA)).toMatchObject({ resultado: "renovada" });
    expect(servidor.pedidos).toHaveLength(1);
  });

  it("`forcar` ignora o lembrete (é o 'tentar renovar agora' da tela)", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidorRenova(60);
    expect(await rodada(60, { forcar: true })).toMatchObject({ resultado: "renovada" });
  });

  it("relógio local atrasado não adia a renovação: vale o maior horário já visto", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    // O banco já viu T0 + 2 h (por exemplo, numa resposta de bloqueio ou num registro do horário).
    banco = bancoFalso({
      inicial: {
        ...linha(),
        maior_horario_visto: new Date((T0 + 2 * HORA) * 1000).toISOString(),
      },
    });
    servidorRenova(2 * HORA);

    // O relógio local diz T0 + 10 min (atrasado em quase 2 h), mas o agora efetivo é T0 + 2 h.
    const r = await rodada(10 * 60);

    expect(r).toMatchObject({ resultado: "renovada" });
    expect(servidor.pedidos).toHaveLength(1);
  });
});

describe("renovação: permanente — depois dele o app para de perguntar", () => {
  it("grava o permanente sem próxima consulta, e a instalação opera sem o servidor por anos", async () => {
    await instalacaoAtivada();
    servidorRenova(10 * DIA, { tipo: "permanente" });

    expect(await rodada(10 * DIA)).toEqual({ resultado: "renovada", tipo: "permanente" });
    expect(linha().proxima_consulta_em).toBeNull();

    servidor.pedidos.length = 0;
    servidor.atender(() => respostaDeErro(500, "internal_error"));
    // Dez anos depois, com o servidor fora do ar: opera, e nem tenta falar com ele.
    expect(await rodada(10 * DIA + 3650 * DIA)).toEqual({
      resultado: "nada_a_fazer",
      motivo: "permanente",
    });
    expect(await rodada(10 * DIA + 3650 * DIA, { forcar: true })).toEqual({
      resultado: "nada_a_fazer",
      motivo: "permanente",
    });
    expect(servidor.pedidos).toHaveLength(0);
    expect(await decisaoEm(10 * DIA + 3650 * DIA)).toMatchObject({
      estado: "permanente_valido",
      opera: true,
    });
  });

  it("o servidor que passa a responder bloqueio DEPOIS do permanente não é nem consultado (cláusula 6.3)", async () => {
    await instalacaoAtivada();
    servidorRenova(10 * DIA, { tipo: "permanente" });
    await rodada(10 * DIA);

    servidor.pedidos.length = 0;
    servidor.atender(() => respostaDeErro(403, "licenca_bloqueada"));
    await rodada(20 * DIA, { forcar: true });

    expect(servidor.pedidos).toHaveLength(0);
    expect(linha().bloqueio_codigo).toBeNull();
  });
});

describe("renovação: bloqueio do servidor", () => {
  it("grava o bloqueio com o MOTIVO (código) sem tocar no selo, e a decisão passa a `bloqueada`", async () => {
    const seloAntes = await instalacaoAtivada();
    servidor.atender(() =>
      respostaDeErro(403, "instalacao_bloqueada", { motivoCodigo: "reembolso" }),
    );

    const r = await rodada(HORA);

    expect(r).toEqual({ resultado: "bloqueada", codigo: "reembolso" });
    expect(linha().bloqueio_codigo).toBe("reembolso");
    expect(linha().selo_atual).toBe(seloAntes);
    expect(esquecerDecisao).toHaveBeenCalled();
    // Bloqueio vence o temporário ainda dentro do prazo (a ordem da decisão).
    expect(await decisaoEm(HORA)).toMatchObject({ estado: "bloqueada", opera: false });
  });

  it("sem `motivo_codigo`, o código do erro é o motivo; e o bloqueio continua consultando para um desbloqueio chegar", async () => {
    await instalacaoAtivada();
    servidor.atender(() => respostaDeErro(403, "licenca_bloqueada"));

    await rodada(HORA);

    expect(linha().bloqueio_codigo).toBe("licenca_bloqueada");
    expect(linha().proxima_consulta_em).toBe(new Date((T0 + HORA + HORA) * 1000).toISOString());
  });

  it("o desbloqueio chega: a resposta válida seguinte limpa o bloqueio e a instalação volta a operar", async () => {
    await instalacaoAtivada();
    servidor.atender(() => respostaDeErro(403, "licenca_bloqueada"));
    await rodada(HORA);
    expect((await decisaoEm(HORA)).opera).toBe(false);

    servidorRenova(3 * HORA);
    expect(await rodada(3 * HORA)).toMatchObject({ resultado: "renovada" });

    expect(linha().bloqueio_codigo).toBeNull();
    expect(await decisaoEm(3 * HORA)).toMatchObject({ estado: "temporario_valido", opera: true });
  });
});

describe("renovação: falha do servidor ou da rede NUNCA bloqueia ninguém", () => {
  it.each([
    ["500", () => respostaDeErro(500, "internal_error"), "servidor_recusou"],
    ["503", () => respostaDeErro(503, "unavailable"), "servidor_recusou"],
    ["429", () => respostaDeErro(429, "rate_limited"), "servidor_recusou"],
    [
      "401 (credencial não reconhecida)",
      () => respostaDeErro(401, "credencial_invalida"),
      "servidor_recusou",
    ],
    ["404", () => respostaDeErro(404, "nao_encontrado"), "servidor_recusou"],
    ["JSON torto", () => ({ status: 200, bruto: "{ torto" }), "resposta_invalida"],
  ])("%s: o estado fica EXATAMENTE como estava", async (_nome, resposta, motivo) => {
    await instalacaoAtivada();
    const antes = linha();
    servidor.atender(resposta);

    const r = await rodada(HORA);

    expect(r).toEqual({ resultado: "falhou", motivo });
    expect(linha()).toEqual(antes);
    expect(esquecerDecisao).not.toHaveBeenCalled();
    expect((await decisaoEm(HORA)).opera).toBe(true);
  });

  it("servidor fora do ar (conexão recusada): falha de rede, estado intacto", async () => {
    await instalacaoAtivada();
    const antes = linha();
    const r = await rodada(HORA, { servidor: "http://127.0.0.1:1/api/v1" });
    expect(r).toEqual({ resultado: "falhou", motivo: "servidor_inalcancavel" });
    expect(linha()).toEqual(antes);
  });

  it("desconectada, a instalação NÃO funciona para sempre: o temporário vence em 48 h (e vence por prazo, não por bloqueio)", async () => {
    await instalacaoAtivada();
    servidor.atender(() => respostaDeErro(500, "internal_error"));

    // Tenta durante 47 h, a cada hora (acima da espera crescente): sempre falha, sempre opera.
    for (let h = 1; h <= 47; h++) {
      esquecerFalhasDaRenovacao();
      await rodada(h * HORA);
      expect((await decisaoEm(h * HORA)).opera).toBe(true);
    }
    // 48 h e 1 s depois: o selo venceu. O estado é `temporario_vencido` — "falta de contato" —, nunca `bloqueada`.
    esquecerFalhasDaRenovacao();
    await rodada(48 * HORA + 1);
    expect(await decisaoEm(48 * HORA + 1)).toMatchObject({
      estado: "temporario_vencido",
      opera: false,
      mensagem: "autorizacao_vencida",
    });
    expect(linha().bloqueio_codigo).toBeNull();
  });

  it("e a volta do servidor destrava a instalação que estava vencida", async () => {
    await instalacaoAtivada();
    esquecerFalhasDaRenovacao();
    expect((await decisaoEm(50 * HORA)).opera).toBe(false);

    servidorRenova(50 * HORA);
    expect(await rodada(50 * HORA, { forcar: true })).toMatchObject({ resultado: "renovada" });

    expect(await decisaoEm(50 * HORA)).toMatchObject({ estado: "temporario_valido", opera: true });
  });
});

describe("renovação: espera depois de falha (o servidor fora do ar não é martelado)", () => {
  it("depois de uma falha, a próxima passada do cron não bate no servidor; passados 5 min, tenta", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() => respostaDeErro(500, "internal_error"));

    await rodada(HORA);
    expect(servidor.pedidos).toHaveLength(1);

    expect(await rodada(HORA + 60)).toMatchObject({ resultado: "adiada" });
    expect(await rodada(HORA + 299)).toMatchObject({ resultado: "adiada" });
    expect(servidor.pedidos).toHaveLength(1);

    await rodada(HORA + 301);
    expect(servidor.pedidos).toHaveLength(2);
  });

  it("a espera dobra a cada falha seguida (5 min, 10 min, 20 min)", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() => respostaDeErro(500, "internal_error"));

    await rodada(HORA); // 1ª falha → próxima em 5 min
    await rodada(HORA + 301); // 2ª falha → próxima em 10 min
    expect(await rodada(HORA + 301 + 599)).toMatchObject({ resultado: "adiada" });
    await rodada(HORA + 301 + 601); // 3ª falha → próxima em 20 min
    expect(await rodada(HORA + 301 + 601 + 1199)).toMatchObject({ resultado: "adiada" });
    expect(servidor.pedidos).toHaveLength(3);
  });

  it("respeita o Retry-After do servidor (15 min)", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() =>
      respostaDeErro(429, "rate_limited", { cabecalhos: { "Retry-After": "900" } }),
    );

    await rodada(HORA);
    expect(await rodada(HORA + 899)).toMatchObject({ resultado: "adiada" });
    await rodada(HORA + 901);
    expect(servidor.pedidos).toHaveLength(2);
  });

  it("sucesso zera a espera", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() => respostaDeErro(500, "internal_error"));
    await rodada(HORA);

    servidorRenova(HORA + 301);
    await rodada(HORA + 301);

    servidor.atender(() => respostaDeErro(500, "internal_error"));
    await rodada(HORA + 301 + HORA + 1); // 1ª falha de novo → 5 min, não 10
    expect(await rodada(HORA + 301 + HORA + 1 + 301)).toMatchObject({ resultado: "falhou" });
  });

  it("`forcar` não vira martelo: no máximo uma conversa a cada 15 segundos", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() => respostaDeErro(500, "internal_error"));

    await rodada(HORA, { forcar: true });
    const logoDepois = await rodada(HORA + 5, { forcar: true });
    expect(logoDepois).toMatchObject({ resultado: "adiada" });
    expect(servidor.pedidos).toHaveLength(1);

    await rodada(HORA + 16, { forcar: true });
    expect(servidor.pedidos).toHaveLength(2);
  });

  it("`forcar` ignora a espera", async () => {
    await instalacaoAtivada({ proximaEmS: HORA });
    servidor.atender(() => respostaDeErro(500, "internal_error"));
    await rodada(HORA);
    servidorRenova(HORA + 10);
    expect(await rodada(HORA + 10, { forcar: true })).toMatchObject({ resultado: "renovada" });
  });
});

describe("renovação: o selo do servidor só vale depois de conferido", () => {
  const selosRuins: Array<[string, (iat: number) => Promise<string>, string]> = [
    [
      "assinatura adulterada",
      async (iat) => {
        const selo = await emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat });
        const [a, b, c] = selo.split(".");
        return `${a}.${b}.${c!.slice(0, -2)}${c!.endsWith("AA") ? "BB" : "AA"}`;
      },
      "assinatura_invalida",
    ],
    [
      "selo de OUTRA instalação",
      (iat) => emitirSelo({ instalacaoId: OUTRA_INSTALACAO, tipo: "temporario", iat }),
      "instalacao_diferente",
    ],
    [
      "selo já vencido",
      (iat) => emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: iat - 3 * DIA }),
      "expirado",
    ],
    [
      "emitido no futuro",
      (iat) => emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: iat + HORA }),
      "emitido_no_futuro",
    ],
    [
      "campo extra no conteúdo",
      (iat) =>
        emitirSelo({
          instalacaoId: INSTALACAO,
          tipo: "temporario",
          iat,
          mudancas: { plano: "ilimitado" },
        }),
      "payload_invalido",
    ],
  ];

  it.each(selosRuins)("%s é recusado e NADA é gravado", async (_nome, fabricar, motivoDoSelo) => {
    await instalacaoAtivada();
    const antes = linha();
    const aviso = vi.spyOn(logger, "warn");
    const iat = T0 + HORA;
    const seloRuim = await fabricar(iat);
    servidor.atender(() => ({
      status: 200,
      corpo: { data: { selo: seloRuim, tipo: "temporario", janela_termina_em: null } },
    }));

    const r = await rodada(HORA);

    expect(r).toEqual({ resultado: "falhou", motivo: "selo_rejeitado" });
    expect(linha()).toEqual(antes);
    expect(JSON.stringify(aviso.mock.calls)).toContain(motivoDoSelo);
  });

  it("selo assinado por chave que a imagem não conhece (`kid` desconhecido) é recusado", async () => {
    await instalacaoAtivada();
    const antes = linha();
    servidorRenova(HORA);
    // Quem chama configura outra lista: a do servidor de mentira não está nela.
    const r = await rodada(HORA, { chaves: [] });
    expect(r).toEqual({ resultado: "falhou", motivo: "selo_rejeitado" });
    expect(linha()).toEqual(antes);
  });

  it("resposta que diz `permanente` mas traz selo temporário é recusada inteira", async () => {
    await instalacaoAtivada();
    const antes = linha();
    const selo = await emitirSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0 + HORA });
    servidor.atender(() => ({
      status: 200,
      corpo: { data: { selo, tipo: "permanente", janela_termina_em: null } },
    }));

    expect(await rodada(HORA)).toEqual({ resultado: "falhou", motivo: "selo_rejeitado" });
    expect(linha()).toEqual(antes);
  });
});

describe("renovação: o que nem tenta", () => {
  it("instalação nunca ativada (sem credencial) não fala com ninguém", async () => {
    banco = bancoFalso({ inicial: linhaBase() });
    servidorRenova(HORA);
    expect(await rodada(HORA)).toEqual({ resultado: "nada_a_fazer", motivo: "nao_ativada" });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it("endereço do servidor inseguro (http fora de loopback) não é usado — a credencial não viaja em texto puro", async () => {
    await instalacaoAtivada();
    const r = await rodada(HORA, { servidor: "http://licencas.exemplo.com/api/v1" });
    expect(r).toEqual({ resultado: "falhou", motivo: "servidor_invalido" });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it("estado ilegível (banco fora do ar) é falha, sem rede e sem lançar", async () => {
    banco = bancoFalso({ lanca: true });
    servidorRenova(HORA);
    expect(await rodada(HORA)).toEqual({ resultado: "falhou", motivo: "estado_ilegivel" });
    expect(servidor.pedidos).toHaveLength(0);
  });

  it("duas rodadas simultâneas no mesmo processo viram uma só conversa", async () => {
    await instalacaoAtivada({ proximaEmS: 0 });
    servidor.atender(async () => ({
      ...(await respostaDeSelo({ instalacaoId: INSTALACAO, tipo: "temporario", iat: T0 })),
      atrasoMs: 50,
    }));

    const [a, b] = await Promise.all([rodada(1), rodada(1)]);

    expect(servidor.pedidos).toHaveLength(1);
    expect(a).toEqual(b);
  });
});

describe("renovação: o segredo não vaza", () => {
  it("nem a credencial nem o selo aparecem em log, em nenhum desfecho", async () => {
    const espioes = [
      vi.spyOn(logger, "warn"),
      vi.spyOn(logger, "info"),
      vi.spyOn(logger, "error"),
      vi.spyOn(logger, "debug"),
    ];
    const seloVigente = await instalacaoAtivada();

    servidor.atender(() => respostaDeErro(500, "internal_error"));
    await rodada(HORA);
    esquecerFalhasDaRenovacao();
    servidor.atender(() => respostaDeErro(403, "licenca_bloqueada"));
    await rodada(HORA);
    esquecerFalhasDaRenovacao();
    const novo = await emitirSelo({
      instalacaoId: OUTRA_INSTALACAO,
      tipo: "temporario",
      iat: T0 + HORA,
    });
    servidor.atender(() => ({ status: 200, corpo: { data: { selo: novo, tipo: "temporario" } } }));
    await rodada(3 * HORA, { forcar: true });

    const tudo = JSON.stringify(espioes.flatMap((e) => e.mock.calls));
    expect(tudo.length).toBeGreaterThan(10);
    expect(tudo).not.toContain(CREDENCIAL);
    expect(tudo).not.toContain("zpl_");
    expect(tudo).not.toContain(seloVigente);
    expect(tudo).not.toContain(novo);
  });
});

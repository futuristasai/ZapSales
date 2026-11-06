// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  respostaDeErro,
  subirServidorFalso,
  type ServidorFalso,
} from "../../tests/support/servidor-de-licencas-falso";
import {
  SERVIDOR_OFICIAL,
  TAMANHO_MAXIMO_DA_RESPOSTA,
  baseDoServidor,
  chamarServidor,
} from "./servidor";

let servidor: ServidorFalso;
beforeAll(async () => {
  servidor = await subirServidorFalso();
});
afterAll(async () => {
  await servidor.fechar();
});
beforeEach(() => {
  servidor.pedidos.length = 0;
});

const esquema = z.object({ x: z.number() });
const chamar = (extra: Partial<Parameters<typeof chamarServidor>[0]> = {}) =>
  chamarServidor({
    base: servidor.base,
    rota: "/licenca/renovar",
    corpo: { versao: "1.2.3", dominio: "crm.exemplo.com" },
    esquema,
    ...extra,
  });

describe("baseDoServidor — só endereço seguro", () => {
  it("vazio usa o endereço oficial, sem barra no fim", () => {
    expect(baseDoServidor("")).toBe(SERVIDOR_OFICIAL);
    expect(baseDoServidor("   ")).toBe(SERVIDOR_OFICIAL);
    expect(baseDoServidor("https://licencas.exemplo.com/api/v1/")).toBe(
      "https://licencas.exemplo.com/api/v1",
    );
  });

  it("http só em loopback: a credencial não viaja em texto puro pela internet", () => {
    expect(baseDoServidor("http://127.0.0.1:4000/api/v1")).toBe("http://127.0.0.1:4000/api/v1");
    expect(baseDoServidor("http://localhost:4000/api/v1")).toBe("http://localhost:4000/api/v1");
    expect(baseDoServidor("http://[::1]:4000/api/v1")).toBe("http://[::1]:4000/api/v1");
    expect(baseDoServidor("http://licencas.exemplo.com/api/v1")).toBeNull();
    expect(baseDoServidor("http://127.0.0.1.exemplo.com/api/v1")).toBeNull();
  });

  it.each([
    ["não é URL", "isto nao e uma url"],
    ["esquema estranho", "ftp://licencas.exemplo.com/"],
    ["credencial na URL", "https://usuario:senha@licencas.exemplo.com/"],
    ["parâmetros na URL", "https://licencas.exemplo.com/api/v1?chave=1"],
    ["fragmento", "https://licencas.exemplo.com/api/v1#x"],
  ])("recusa: %s", (_nome, bruta) => {
    expect(baseDoServidor(bruta)).toBeNull();
  });
});

describe("chamarServidor — o que SAI pela rede", () => {
  it("manda POST com a credencial no cabeçalho e o corpo do contrato, e NADA na URL", async () => {
    servidor.atender(() => ({ status: 200, corpo: { data: { x: 1 } } }));
    const r = await chamar({ credencial: "zpl_segredo-de-teste" });
    expect(r).toEqual({ ok: true, dados: { x: 1 } });

    const pedido = servidor.pedidos[0]!;
    expect(pedido.metodo).toBe("POST");
    expect(pedido.caminho).toBe("/api/v1/licenca/renovar");
    expect(pedido.query).toBe("");
    expect(pedido.cabecalhos.authorization).toBe("Bearer zpl_segredo-de-teste");
    expect(pedido.corpo).toEqual({ versao: "1.2.3", dominio: "crm.exemplo.com" });
    // A credencial NUNCA vai na URL nem no corpo (doutrina de API key).
    expect(pedido.caminho + pedido.query).not.toContain("zpl_");
    expect(pedido.corpoBruto).not.toContain("zpl_");
  });

  it("sem credencial não manda Authorization; com chave de idempotência, manda o cabeçalho", async () => {
    servidor.atender(() => ({ status: 200, corpo: { data: { x: 1 } } }));
    await chamar({ idempotencyKey: "chave-1" });
    const pedido = servidor.pedidos[0]!;
    expect(pedido.cabecalhos.authorization).toBeUndefined();
    expect(pedido.cabecalhos["idempotency-key"]).toBe("chave-1");
  });
});

describe("chamarServidor — o que ENTRA", () => {
  it("ignora campos desconhecidos na resposta (contrato, seção 7)", async () => {
    servidor.atender(() => ({
      status: 200,
      corpo: { data: { x: 7, campo_novo: "v2" }, meta: { qualquer: "coisa" } },
    }));
    const r = await chamar();
    expect(r).toEqual({ ok: true, dados: { x: 7 } });
  });

  it("recusa de contrato vira { tipo: recusa } com o CÓDIGO, nunca o texto livre do servidor", async () => {
    servidor.atender(() =>
      respostaDeErro(403, "instalacao_bloqueada", { motivoCodigo: "reembolso" }),
    );
    const r = await chamar();
    expect(r).toEqual({
      ok: false,
      falha: {
        tipo: "recusa",
        status: 403,
        codigo: "instalacao_bloqueada",
        motivoCodigo: "reembolso",
        retryAfterS: null,
      },
    });
    expect(JSON.stringify(r)).not.toContain("mensagem do servidor");
  });

  it("código fora do formato vira `desconhecido` — o servidor não injeta texto no estado local", async () => {
    servidor.atender(() => ({
      status: 403,
      corpo: { error: { code: "Reembolso Negado!! <script>", motivo_codigo: "x y" } },
    }));
    const r = await chamar();
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "recusa", codigo: "desconhecido", motivoCodigo: null },
    });
  });

  it("lê o Retry-After de um 429", async () => {
    servidor.atender(() =>
      respostaDeErro(429, "rate_limited", { cabecalhos: { "Retry-After": "900" } }),
    );
    const r = await chamar();
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "recusa", status: 429, retryAfterS: 900 },
    });
  });

  it.each([
    ["JSON torto", { status: 200, bruto: "{isto nao e json" }],
    ["sucesso sem o envelope data", { status: 200, corpo: { outra: "coisa" } }],
    ["data que não confere com o esquema", { status: 200, corpo: { data: { x: "texto" } } }],
    ["corpo vazio", { status: 200, bruto: "" }],
  ])("resposta fora do contrato (%s) vira resposta_invalida", async (_nome, resposta) => {
    servidor.atender(() => resposta);
    expect(await chamar()).toEqual({
      ok: false,
      falha: { tipo: "resposta_invalida", status: 200 },
    });
  });

  it("erro sem corpo no formato do contrato (HTML de proxy, por exemplo) é recusa `desconhecido`", async () => {
    servidor.atender(() => ({ status: 502, bruto: "<html>Bad gateway</html>" }));
    expect(await chamar()).toMatchObject({
      ok: false,
      falha: { tipo: "recusa", status: 502, codigo: "desconhecido" },
    });
  });
});

describe("chamarServidor — o servidor é de fora", () => {
  it("não segue redirecionamento (a credencial não vai para outro endereço)", async () => {
    // O destino do redirecionamento TAMBÉM atende com sucesso: se o cliente o seguisse, a chamada daria certo
    // e levaria a credencial junto. Seguir só falharia por acaso (porta fechada) e esconderia o defeito.
    servidor.atender((pedido) =>
      pedido.caminho.endsWith("/renovar")
        ? { status: 302, cabecalhos: { location: `${servidor.base}/outro-destino` } }
        : { status: 200, corpo: { data: { x: 1 } } },
    );
    expect(await chamar({ credencial: "zpl_x" })).toEqual({ ok: false, falha: { tipo: "rede" } });
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(["/api/v1/licenca/renovar"]);
  });

  it("corpo acima do teto é descartado, sem encher a memória", async () => {
    servidor.atender(() => ({
      status: 200,
      bruto: JSON.stringify({ data: { x: 1, lixo: "a".repeat(TAMANHO_MAXIMO_DA_RESPOSTA + 10) } }),
    }));
    expect(await chamar()).toEqual({ ok: false, falha: { tipo: "rede" } });
  });

  it("desiste depois do tempo limite", async () => {
    servidor.atender(() => ({ status: 200, corpo: { data: { x: 1 } }, atrasoMs: 600 }));
    const antes = Date.now();
    expect(await chamar({ tempoLimiteMs: 100 })).toEqual({ ok: false, falha: { tipo: "rede" } });
    expect(Date.now() - antes).toBeLessThan(550);
  });

  it("servidor fora do ar (conexão recusada) é falha de rede, nunca exceção", async () => {
    const r = await chamarServidor({
      base: "http://127.0.0.1:1/api/v1",
      rota: "/licenca/renovar",
      corpo: {},
      esquema,
      tempoLimiteMs: 1000,
    });
    expect(r).toEqual({ ok: false, falha: { tipo: "rede" } });
  });
});

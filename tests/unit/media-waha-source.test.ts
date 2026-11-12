import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { destinoDaMidiaNoWaha, fetchWahaMedia } from "@/lib/messaging/media/waha-source";
import { MediaTooLargeError } from "@/lib/messaging/media/types";

const WAHA_BASE = "http://localhost:3030";
const SESSAO = "org_abc_1";
const RECUSADO = "waha_media_untrusted_host";

const respostaOk = (mime = "image/jpeg") =>
  new Response(new ArrayBuffer(2), { status: 200, headers: { "content-type": mime } });

describe("fetchWahaMedia", () => {
  beforeEach(() => {
    vi.stubEnv("WAHA_API_BASE_URL", WAHA_BASE);
    vi.stubEnv("WAHA_API_KEY", "hash123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("baixa a mídia com X-Api-Key e retorna buffer + mime", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const media = await fetchWahaMedia(`${WAHA_BASE}/api/files/${SESSAO}/abc.jpg`, null, SESSAO);
    expect(media.mime).toBe("image/jpeg");
    expect(media.buffer.byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/${SESSAO}/abc.jpg`,
      expect.objectContaining({ headers: { "X-Api-Key": "hash123" } }),
    );
  });

  it("reescreve host arbitrário p/ a base do WAHA", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia(`http://evil.example.com/api/files/${SESSAO}/x.jpg?q=1`, null, SESSAO);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/${SESSAO}/x.jpg?q=1`,
      expect.anything(),
    );
  });

  it("reescreve a porta interna anunciada pelo WAHA p/ a base real", async () => {
    // WAHA anuncia localhost:3000 (porta interna do container); no host é 3030.
    const fetchMock = vi.fn().mockResolvedValue(respostaOk("image/webp"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia(`http://localhost:3000/api/files/${SESSAO}/sticker.webp`, null, SESSAO);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/${SESSAO}/sticker.webp`,
      expect.anything(),
    );
  });

  it("descarta usuário e senha escritos na URL anunciada", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia(`http://fulano:segredo@x.example/api/files/${SESSAO}/a.jpg`, null, SESSAO);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/${SESSAO}/a.jpg`,
      expect.anything(),
    );
  });

  it("não segue redirecionamento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia(`${WAHA_BASE}/api/files/${SESSAO}/a.jpg`, null, SESSAO);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("propaga status HTTP de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      fetchWahaMedia(`${WAHA_BASE}/api/files/${SESSAO}/gone.jpg`, null, SESSAO),
    ).rejects.toThrow("waha_media_404");
  });

  it("rejeita mídia acima de 50MB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(60 * 1024 * 1024) },
        }),
      ),
    );
    await expect(
      fetchWahaMedia(`${WAHA_BASE}/api/files/${SESSAO}/big.mp4`, null, SESSAO),
    ).rejects.toThrow(MediaTooLargeError);
  });

  it("usa hintMime quando o content-type vem vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new ArrayBuffer(2), { status: 200 })),
    );
    const media = await fetchWahaMedia(
      `${WAHA_BASE}/api/files/${SESSAO}/x`,
      "audio/ogg; codecs=opus",
      SESSAO,
    );
    expect(media.mime).toBe("audio/ogg; codecs=opus");
  });

  it("mapeia mediaUrl malformada p/ waha_media_untrusted_host", async () => {
    await expect(fetchWahaMedia("not-a-url", null, SESSAO)).rejects.toThrow(RECUSADO);
  });
});

/**
 * O pedido de mídia leva a credencial da instalação. Cada caso abaixo é uma
 * URL anunciada que NÃO pode produzir pedido de rede nenhum.
 */
describe("o pedido só sai para a pasta de arquivos da sessão, na origem do WAHA", () => {
  beforeEach(() => {
    vi.stubEnv("WAHA_API_BASE_URL", WAHA_BASE);
    vi.stubEnv("WAHA_API_KEY", "hash123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const ARQ = `api/files/${SESSAO}/x.jpg`;
  const RECUSADAS: Array<[string, string]> = [
    ["caminho iniciado por duas barras", `http://localhost:3000//outro.example/${ARQ}`],
    ["barra seguida de barra invertida", `http://localhost:3000/\\outro.example/${ARQ}`],
    ["duas barras invertidas", `http://localhost:3000\\\\outro.example/${ARQ}`],
    ["três barras", `http://localhost:3000///outro.example/${ARQ}`],
    ["duas barras em percent-encoding", `http://localhost:3000/%2f%2foutro.example/${ARQ}`],
    ["barra invertida em percent-encoding", `http://localhost:3000/%5c%5coutro.example/${ARQ}`],
    ["outro endpoint da API", "http://localhost:3000/api/sessions"],
    ["endpoint de outra área com o nome da sessão", `http://localhost:3000/api/${SESSAO}/chats`],
    ["a pasta de arquivos sem sessão", "http://localhost:3000/api/files/x.jpg"],
    ["a pasta da sessão sem arquivo", `http://localhost:3000/api/files/${SESSAO}`],
    ["a pasta da sessão com arquivo vazio", `http://localhost:3000/api/files/${SESSAO}/`],
    ["arquivo de outra sessão", "http://localhost:3000/api/files/outra_sessao/x.jpg"],
    ["subida de pasta", `http://localhost:3000/api/files/${SESSAO}/../outra_sessao/x.jpg`],
    [
      "subida de pasta em percent-encoding",
      `http://localhost:3000/api/files/${SESSAO}/%2e%2e/outra_sessao/x.jpg`,
    ],
    [
      "subida de pasta com barra disfarçada",
      `http://localhost:3000/api/files/${SESSAO}/..%2foutra_sessao%2fx.jpg`,
    ],
    ["segmento vazio no meio", `http://localhost:3000/api/files/${SESSAO}/sub//x.jpg`],
    ["prefixo parecido", `http://localhost:3000/api/filesystem/${SESSAO}/x.jpg`],
    ["esquema que não é http", `ftp://localhost:3000/${ARQ}`],
    ["esquema sem servidor", "data:text/plain,oi"],
    ["texto que não é URL", "//outro.example/x"],
  ];

  it.each(RECUSADAS)("recusa %s sem fazer pedido de rede", async (_nome, url) => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWahaMedia(url, null, SESSAO)).rejects.toThrow(RECUSADO);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa quando a base do WAHA não está configurada", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWahaMedia(`http://localhost:3000/${ARQ}`, null, SESSAO),
    ).rejects.toThrow(RECUSADO);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa base que não é http nem https", () => {
    expect(() =>
      destinoDaMidiaNoWaha(`http://localhost:3000/${ARQ}`, SESSAO, "file:///etc/passwd"),
    ).toThrow(RECUSADO);
  });

  it("recusa sessão vazia", () => {
    expect(() => destinoDaMidiaNoWaha("http://localhost:3000/api/files//x.jpg", "")).toThrow(
      RECUSADO,
    );
  });

  it("aceita subpasta dentro da pasta da sessão e preserva a query", () => {
    const destino = destinoDaMidiaNoWaha(
      `http://localhost:3000/api/files/${SESSAO}/2026/a%20b.jpg?v=1`,
      SESSAO,
    );
    expect(destino.toString()).toBe(`${WAHA_BASE}/api/files/${SESSAO}/2026/a%20b.jpg?v=1`);
  });

  it("ignora o caminho da base: o destino é a origem dela", () => {
    const destino = destinoDaMidiaNoWaha(
      `http://localhost:3000/${ARQ}`,
      SESSAO,
      "https://waha.interno:8443/prefixo/",
    );
    expect(destino.toString()).toBe(`https://waha.interno:8443/${ARQ}`);
  });

  /**
   * A propriedade que importa, dita de uma vez: seja qual for a URL anunciada,
   * ou a função recusa, ou o destino é a origem do WAHA dentro da pasta da
   * sessão. Não existe terceira saída.
   */
  it("toda URL anunciada ou é recusada, ou aponta para a pasta da sessão no WAHA", () => {
    const hosts = ["localhost:3000", "outro.example", "u:p@outro.example", "[::1]:9", "127.0.0.1"];
    const prefixos = ["", "/", "//", "/\\", "\\\\", "/%2f", "/./", "/../", "/x/../", "/;/"];
    const caminhos = [
      ARQ,
      `outro.example/${ARQ}`,
      `api/files/${SESSAO}/a/b/c.ogg`,
      "api/sessions",
      `api/files/${SESSAO}/..`,
      `api/files/${SESSAO}/.`,
      "api/files/outra/x.jpg",
      "",
    ];
    const sufixos = ["", "?a=1", "#frag", "?u=http://outro.example/"];
    const origem = new URL(WAHA_BASE).origin;
    let aceitas = 0;

    for (const h of hosts)
      for (const p of prefixos)
        for (const c of caminhos)
          for (const s of sufixos) {
            const anunciada = `http://${h}${p}${c}${s}`;
            let destino: URL;
            try {
              destino = destinoDaMidiaNoWaha(anunciada, SESSAO, WAHA_BASE);
            } catch (err) {
              expect((err as Error).message, anunciada).toBe(RECUSADO);
              continue;
            }
            aceitas += 1;
            expect(destino.origin, anunciada).toBe(origem);
            expect(destino.username + destino.password, anunciada).toBe("");
            expect(destino.pathname.startsWith(`/api/files/${SESSAO}/`), anunciada).toBe(true);
            expect(destino.pathname, anunciada).not.toMatch(/\/\.{1,2}(\/|$)|\/\/|\\/);
          }

    // Controle: a varredura não pode passar por ter recusado tudo.
    expect(aceitas).toBeGreaterThan(20);
  });
});

/**
 * Receptores de verdade, sem mock de `fetch`: o que conta é o que CHEGA em
 * cada servidor. "outro" faz o papel de qualquer destino que não é o WAHA.
 */
describe("com servidores HTTP de verdade", () => {
  let waha: Server;
  let outro: Server;
  let baseWaha: string;
  let portaOutro: number;
  const chegouNoWaha: Array<{ url: string; headers: IncomingHttpHeaders }> = [];
  const chegouNoOutro: Array<{ url: string; headers: IncomingHttpHeaders }> = [];

  const escutar = (s: Server) =>
    new Promise<number>((resolve) =>
      s.listen(0, "127.0.0.1", () => resolve((s.address() as AddressInfo).port)),
    );

  beforeAll(async () => {
    outro = createServer((req, res) => {
      chegouNoOutro.push({ url: req.url ?? "", headers: req.headers });
      res.writeHead(200, { "content-type": "image/jpeg" }).end("xx");
    });
    portaOutro = await escutar(outro);

    waha = createServer((req, res) => {
      chegouNoWaha.push({ url: req.url ?? "", headers: req.headers });
      if (req.url === `/api/files/${SESSAO}/pula.jpg`) {
        res
          .writeHead(302, { location: `http://127.0.0.1:${portaOutro}/api/files/${SESSAO}/x.jpg` })
          .end();
        return;
      }
      res.writeHead(200, { "content-type": "image/jpeg" }).end("ok");
    });
    baseWaha = `http://127.0.0.1:${await escutar(waha)}`;
  });

  afterAll(async () => {
    await Promise.all(
      [waha, outro].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
    );
  });

  beforeEach(() => {
    chegouNoWaha.length = 0;
    chegouNoOutro.length = 0;
    vi.stubEnv("WAHA_API_BASE_URL", baseWaha);
    vi.stubEnv("WAHA_API_KEY", "chave-da-instalacao");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("o download legítimo chega ao WAHA com a credencial", async () => {
    const media = await fetchWahaMedia(
      `http://localhost:3000/api/files/${SESSAO}/foto.jpg`,
      null,
      SESSAO,
    );
    expect(media.buffer.toString()).toBe("ok");
    expect(chegouNoWaha).toHaveLength(1);
    expect(chegouNoWaha[0]?.headers["x-api-key"]).toBe("chave-da-instalacao");
    expect(chegouNoOutro).toHaveLength(0);
  });

  it.each([
    ["duas barras", (p: number) => `http://localhost:3000//127.0.0.1:${p}/api/files/${SESSAO}/x.jpg`],
    ["barra invertida", (p: number) => `http://localhost:3000/\\127.0.0.1:${p}/api/files/${SESSAO}/x.jpg`],
  ])("caminho com %s: nada chega ao outro servidor", async (_nome, montar) => {
    await expect(fetchWahaMedia(montar(portaOutro), null, SESSAO)).rejects.toThrow(RECUSADO);
    expect(chegouNoOutro).toHaveLength(0);
    expect(chegouNoWaha).toHaveLength(0);
  });

  it("redirecionamento do WAHA para fora: o download falha e nada chega ao outro servidor", async () => {
    await expect(
      fetchWahaMedia(`http://localhost:3000/api/files/${SESSAO}/pula.jpg`, null, SESSAO),
    ).rejects.toThrow();
    expect(chegouNoWaha).toHaveLength(1);
    expect(chegouNoOutro).toHaveLength(0);
  });
});

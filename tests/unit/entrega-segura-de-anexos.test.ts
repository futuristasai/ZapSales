import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  abreNaTela,
  cabecalhosDoAnexo,
  caminhoAbreNaTela,
  nomeParaBaixar,
  objetoAbreNaTela,
  tipoSeguro,
} from "@/lib/messaging/media/entrega-segura";
import { extFromMime, storagePathFor } from "@/lib/messaging/media/types";
import { DOCUMENT_MIMES } from "@/lib/messaging/media/upload-validation";

/**
 * O tipo de um anexo é escrito por quem o enviou, e o arquivo é servido no
 * endereço do app. Estes testes fixam a regra única de entrega (#266): abre na
 * tela o que o navegador só exibe ou toca; o resto é download.
 */

const ABREM = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/webm",
  "video/mp4",
  "video/3gpp",
  "video/webm",
  "application/mp4",
  "application/pdf",
  "IMAGE/JPEG",
  " image/png ",
];

const ATIVOS = [
  "text/html",
  "text/html; charset=utf-8",
  "TEXT/HTML",
  "application/xhtml+xml",
  "image/svg+xml",
  "IMAGE/SVG+XML",
  "text/xml",
  "application/xml",
  "application/javascript",
  "text/javascript",
  "application/x-shockwave-flash",
  "multipart/x-mixed-replace",
  "text/html\u0000image/png",
  "image/png, text/html",
  "audio/../text/html",
  "video/",
  "audio",
  "/",
  "",
];

describe("o que abre na tela", () => {
  it.each(ABREM)("%j abre", (mime) => {
    expect(abreNaTela(mime)).toBe(true);
  });

  it.each(ATIVOS)("%j NÃO abre", (mime) => {
    expect(abreNaTela(mime)).toBe(false);
  });

  it.each([null, undefined])("%j NÃO abre", (mime) => {
    expect(abreNaTela(mime)).toBe(false);
  });

  it.each([...DOCUMENT_MIMES].filter((m) => m !== "application/pdf"))(
    "documento %j NÃO abre: é baixado",
    (mime) => {
      expect(abreNaTela(mime)).toBe(false);
    },
  );
});

describe("o tipo que é gravado e respondido", () => {
  it.each(ATIVOS)("%j vira genérico", (mime) => {
    expect(tipoSeguro(mime)).toBe("application/octet-stream");
  });

  it("o que abre mantém o tipo base, sem os parâmetros do remetente", () => {
    expect(tipoSeguro("image/jpeg; name=x.html")).toBe("image/jpeg");
    expect(tipoSeguro("IMAGE/PNG")).toBe("image/png");
    expect(tipoSeguro("application/pdf; charset=binary")).toBe("application/pdf");
  });

  it("áudio mantém `codecs`: é o que o canal oficial lê para tratar como nota de voz", () => {
    expect(tipoSeguro("audio/ogg;codecs=opus")).toBe("audio/ogg; codecs=opus");
    expect(tipoSeguro('audio/ogg; codecs="opus"')).toBe("audio/ogg; codecs=opus");
  });

  it("`codecs` com conteúdo estranho é descartado, não repetido", () => {
    expect(tipoSeguro('audio/ogg; codecs=opus\r\nX-Outro: 1')).toBe("audio/ogg; codecs=opus");
    expect(tipoSeguro("audio/ogg; codecs=<script>")).toBe("audio/ogg");
  });

  it.each([...DOCUMENT_MIMES])("documento aceito no upload %j mantém o tipo", (mime) => {
    // O canal de envio lê o tipo do arquivo guardado; trocar por genérico
    // quebraria o envio de Word, Excel e afins.
    expect(tipoSeguro(mime)).toBe(mime);
  });

  it("nunca devolve um tipo que o navegador interpreta como documento ativo", () => {
    const perigosos = /html|svg|xml|javascript|ecmascript|flash/;
    for (const mime of [...ABREM, ...ATIVOS, ...DOCUMENT_MIMES]) {
      const tipo = tipoSeguro(mime);
      // Os formatos do Office têm "xml" no NOME do tipo e não são XML servido.
      if (DOCUMENT_MIMES.has(tipo)) continue;
      expect(tipo, mime).not.toMatch(perigosos);
    }
  });
});

describe("objeto já guardado", () => {
  it("todo tipo que `storagePathFor` conhece e que abre na tela tem extensão que abre", () => {
    // As duas listas vivem em arquivos diferentes; esta é a costura.
    for (const mime of ABREM) {
      const caminho = storagePathFor("org", "conv", "msg", mime);
      if (extFromMime(mime) === "bin") continue;
      expect(objetoAbreNaTela(mime, caminho), mime).toBe(true);
    }
  });

  it("objeto antigo gravado com tipo ativo tem extensão `bin` e é baixado", () => {
    for (const mime of ["text/html", "image/svg+xml", "application/xhtml+xml"]) {
      const caminho = storagePathFor("org", "conv", "msg", mime);
      expect(caminho.endsWith(".bin"), mime).toBe(true);
      expect(caminhoAbreNaTela(caminho), mime).toBe(false);
    }
  });

  it("o tipo anotado na linha não basta: a extensão precisa concordar", () => {
    expect(objetoAbreNaTela("image/jpeg", "org/conv/msg.bin")).toBe(false);
    expect(objetoAbreNaTela("image/jpeg", "org/conv/msg.html")).toBe(false);
    expect(objetoAbreNaTela("image/jpeg", "org/conv/msg")).toBe(false);
  });

  it("a extensão não basta: o tipo anotado precisa concordar", () => {
    expect(objetoAbreNaTela("text/html", "org/conv/msg.jpg")).toBe(false);
    expect(objetoAbreNaTela(null, "org/conv/msg.jpg")).toBe(false);
  });

  it("extensão em maiúsculas vale; ponto no nome da pasta não confunde", () => {
    expect(caminhoAbreNaTela("org/conv/FOTO.JPG")).toBe(true);
    expect(caminhoAbreNaTela("org.jpg/conv/msg")).toBe(false);
    expect(caminhoAbreNaTela("org/conv/.jpg")).toBe(false);
  });
});

describe("cabeçalhos da resposta com os bytes", () => {
  it("tipo ativo sai como download, genérico e isolado", () => {
    const h = cabecalhosDoAnexo("text/html", "anexo-1");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toBe('attachment; filename="anexo-1"');
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  it("imagem sai para a tela, sem adivinhação de tipo", () => {
    const h = cabecalhosDoAnexo("image/jpeg", "anexo-1");
    expect(h["Content-Type"]).toBe("image/jpeg");
    expect(h["Content-Disposition"]).toBe("inline");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("PDF e vídeo não levam `sandbox`: o leitor embutido do navegador não roda nela", () => {
    expect(cabecalhosDoAnexo("application/pdf")["Content-Security-Policy"]).toBeUndefined();
    expect(cabecalhosDoAnexo("video/mp4")["Content-Security-Policy"]).toBeUndefined();
  });

  it("documento do Office é download com o tipo dele", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const h = cabecalhosDoAnexo(docx, "contrato.docx");
    expect(h["Content-Type"]).toBe(docx);
    expect(h["Content-Disposition"]).toBe('attachment; filename="contrato.docx"');
  });

  it("o nome do arquivo não consegue quebrar o cabeçalho", () => {
    expect(nomeParaBaixar('a"\r\nX-Outro: 1.html')).toBe("a___X-Outro__1.html");
    expect(nomeParaBaixar("org/conv/../../x.bin")).toBe("x.bin");
    expect(nomeParaBaixar("..")).toBe("arquivo");
    expect(nomeParaBaixar("")).toBe("arquivo");
    expect(nomeParaBaixar(null)).toBe("arquivo");
    expect(nomeParaBaixar("a".repeat(500)).length).toBe(120);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * As rotas, rodando de verdade com o client falsificado.
 * ──────────────────────────────────────────────────────────────────────────── */

type Linha = Record<string, unknown> | null;
let linhaDaMensagem: Linha = null;
let linhaDaNota: Linha = null;
let midiaDoCanal: { buffer: Buffer; mime: string } = { buffer: Buffer.from("x"), mime: "image/jpeg" };

const createSignedUrl = vi.fn(
  async (caminho: string, _ttl: number, opcoes?: { download?: string | boolean }) => ({
    data: {
      signedUrl: `https://app.example/storage/v1/object/sign/${caminho}?token=t${
        opcoes?.download ? `&download=${String(opcoes.download)}` : ""
      }`,
    },
    error: null,
  }),
);

function consulta(resolver: (tabela: string) => Linha) {
  return (tabela: string) => {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "maybeSingle") return async () => ({ data: resolver(tabela), error: null });
          return () => proxy;
        },
      },
    ) as Record<string, unknown>;
    return proxy;
  };
}

const linhaDe = (tabela: string): Linha => {
  if (tabela === "messages") return linhaDaMensagem;
  if (tabela === "conversation_notes") return linhaDaNota;
  if (tabela === "conversations") return { id: "conv-1" };
  if (tabela === "channel_sessions") return { provider: "waha", waha_session_name: "sessao" };
  return null;
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: consulta(linhaDe),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: consulta(linhaDe),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

vi.mock("@/lib/auth/server", async () => ({
  ...(await vi.importActual<object>("@/lib/auth/server")),
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: async () => ({ id: "user-1", idioma: "pt-BR" }),
  orgAtivaSemPortao: async () => ({ orgId: "org-1", org_status: "active", role: "agent" }),
}));

vi.mock("@/lib/auth/require-role", async () => ({
  ...(await vi.importActual<object>("@/lib/auth/require-role")),
  orgAtivaDaApi: async () => ({ ok: true, org: { orgId: "org-1", role: "agent" } }),
  requireRole: async () => ({
    ok: true,
    user: { id: "user-1", idioma: "pt-BR" },
    org: { orgId: "org-1", role: "agent" },
  }),
}));

vi.mock("@/lib/channels", async () => ({
  ...(await vi.importActual<object>("@/lib/channels")),
  getAdapter: () => ({ fetchInboundMedia: async () => midiaDoCanal }),
  resolveSessionRef: () => "sessao",
}));

const rotaDaMensagem = await import("@/app/api/v1/messages/[id]/media/route");
const rotaDaNota = await import("@/app/api/v1/conversations/[id]/notes/[noteId]/media/route");

const abrirMensagem = () =>
  rotaDaMensagem.GET({} as never, { params: Promise.resolve({ id: "msg-1" }) });
const abrirNota = () =>
  rotaDaNota.GET({} as never, {
    params: Promise.resolve({ id: "conv-1", noteId: "nota-1" }),
  } as never);

describe("GET /api/v1/messages/{id}/media", () => {
  beforeEach(() => {
    createSignedUrl.mockClear();
    midiaDoCanal = { buffer: Buffer.from("x"), mime: "image/jpeg" };
  });

  it("ainda não guardado, declarado como página: sai como download, nunca como página", async () => {
    linhaDaMensagem = {
      id: "msg-1",
      media_url: "http://localhost:3000/api/files/sessao/a.html",
      media_mime: "text/html",
      media_storage_path: null,
      channel_session_id: "canal-1",
    };
    midiaDoCanal = { buffer: Buffer.from("<script>1</script>"), mime: "text/html" };

    const res = await abrirMensagem();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it.each(["image/svg+xml", "application/xhtml+xml", "text/xml", "TEXT/HTML; charset=utf-8"])(
    "ainda não guardado, %s: download",
    async (mime) => {
      linhaDaMensagem = {
        id: "msg-1",
        media_url: "http://localhost:3000/api/files/sessao/a",
        media_mime: mime,
        media_storage_path: null,
        channel_session_id: "canal-1",
      };
      midiaDoCanal = { buffer: Buffer.from("x"), mime };

      const res = await abrirMensagem();
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
    },
  );

  it("ainda não guardado, foto: abre na tela como antes", async () => {
    linhaDaMensagem = {
      id: "msg-1",
      media_url: "http://localhost:3000/api/files/sessao/a.jpg",
      media_mime: "image/jpeg",
      media_storage_path: null,
      channel_session_id: "canal-1",
    };
    const res = await abrirMensagem();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
  });

  it("o tipo que decide é o dos bytes, não o anotado na linha", async () => {
    linhaDaMensagem = {
      id: "msg-1",
      media_url: "http://localhost:3000/api/files/sessao/a.jpg",
      media_mime: "image/jpeg",
      media_storage_path: null,
      channel_session_id: "canal-1",
    };
    midiaDoCanal = { buffer: Buffer.from("<svg/>"), mime: "image/svg+xml" };

    const res = await abrirMensagem();
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
  });

  it.each([
    ["foto", "image/jpeg", "org-1/conv-1/msg-1.jpg"],
    ["áudio", "audio/ogg; codecs=opus", "org-1/conv-1/msg-1.ogg"],
    ["vídeo", "video/mp4", "org-1/conv-1/msg-1.mp4"],
    ["PDF", "application/pdf", "org-1/conv-1/msg-1.pdf"],
  ])("guardado, %s: redireciona para abrir na tela", async (_nome, mime, caminho) => {
    linhaDaMensagem = { id: "msg-1", media_url: null, media_mime: mime, media_storage_path: caminho };

    const res = await abrirMensagem();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).not.toContain("download=");
    expect(createSignedUrl.mock.calls[0]?.[2]).toBeUndefined();
  });

  it.each([
    ["página gravada antes desta regra", "text/html", "org-1/conv-1/msg-1.bin"],
    ["imagem vetorial", "image/svg+xml", "org-1/conv-1/msg-1.bin"],
    [
      "Word",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "org-1/conv-1/msg-1.docx",
    ],
    ["tipo desconhecido", "application/x-qualquer", "org-1/conv-1/msg-1.bin"],
    ["linha diz foto, arquivo não", "image/jpeg", "org-1/conv-1/msg-1.bin"],
    ["sem tipo anotado", null, "org-1/conv-1/msg-1.jpg"],
  ])("guardado, %s: redireciona como download", async (_nome, mime, caminho) => {
    linhaDaMensagem = { id: "msg-1", media_url: null, media_mime: mime, media_storage_path: caminho };

    const res = await abrirMensagem();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("download=");
    expect(createSignedUrl.mock.calls[0]?.[2]).toEqual({ download: expect.any(String) });
  });
});

describe("GET /api/v1/conversations/{id}/notes/{noteId}/media", () => {
  beforeEach(() => createSignedUrl.mockClear());

  it("foto de nota: abre na tela", async () => {
    linhaDaNota = {
      id: "nota-1",
      conversation_id: "conv-1",
      media_storage_path: "org-1/conv-1/note-1.png",
    };
    const res = await abrirNota();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).not.toContain("download=");
  });

  it.each(["org-1/conv-1/note-1.bin", "org-1/conv-1/note-1.docx", "org-1/conv-1/note-1"])(
    "%s: download",
    async (caminho) => {
      linhaDaNota = { id: "nota-1", conversation_id: "conv-1", media_storage_path: caminho };
      const res = await abrirNota();
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("download=");
    },
  );
});

/**
 * Cerca: arquivo de mensagem e de nota só entra no Storage com o tipo seguro.
 * Um upload novo nesses dois buckets que grave o tipo cru reabre a porta sem
 * que nenhum teste de comportamento perceba.
 */
describe("todo upload de anexo de mensagem ou nota grava o tipo seguro", () => {
  const PONTOS = [
    "workers/media-persist-worker.ts",
    "app/api/v1/conversations/[id]/media/route.ts",
    "app/api/v1/conversations/[id]/notes/media/route.ts",
    "app/api/v1/messages/_handler.ts",
  ];

  it.each(PONTOS)("%s", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    const uploads = fonte.match(/\.upload\([^;]*?contentType:[^;]*?\);/gs) ?? [];
    expect(uploads.length, "o arquivo deixou de ter upload: atualize esta lista").toBeGreaterThan(0);
    for (const chamada of uploads) {
      expect(chamada, arquivo).toMatch(/contentType:\s*tipoSeguro\(/);
    }
  });
});

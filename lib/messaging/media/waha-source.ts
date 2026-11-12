/**
 * MediaSource do WAHA: baixa o binário hospedado pelo container WAHA.
 *
 * A URL anunciada no webhook NÃO é confiável nem correta: o HMAC é
 * best-effort (payload forjado é possível) e o WAHA anuncia seu endereço
 * INTERNO (ex.: localhost:3000 dentro do container, mapeado p/ 3030 no
 * host). Da URL anunciada só se aproveitam caminho e query; o destino é
 * sempre a origem de WAHA_API_BASE_URL.
 *
 * O destino é MONTADO sobre a origem, nunca RESOLVIDO contra ela. Resolver um
 * caminho como referência relativa deixa o próprio caminho escolher o host:
 * um caminho iniciado por duas barras é, para o parser de URL, "outro
 * servidor", e o pedido — que leva a credencial da instalação — sairia para
 * lá. Montar por partes não tem essa leitura. Mesmo assim a origem final é
 * conferida antes do fetch: a credencial só viaja se a conferência passar.
 *
 * O caminho também é fechado: só a pasta de arquivos DA SESSÃO desta
 * mensagem. A credencial do WAHA vale para a API inteira e para todas as
 * sessões da instalação, então um caminho livre faria desta função uma porta
 * de leitura para o que é de outro canal.
 *
 * Redirecionamento é recusado: seguir um 3xx reabriria a escolha de destino
 * depois da conferência.
 */
import {
  MAX_MEDIA_BYTES,
  MediaTooLargeError,
  type FetchedMedia,
} from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

/** Onde o WAHA serve o que baixou: `/api/files/<sessão>/<arquivo>`. */
const PASTA_DE_ARQUIVOS = ["api", "files"] as const;

/** Barra, barra invertida ou ponto escritos em percent-encoding. */
const SEPARADOR_DISFARCADO = /%(?:2f|5c|2e)/i;

const RECUSADO = "waha_media_untrusted_host";

const ehHttp = (url: URL) => url.protocol === "http:" || url.protocol === "https:";

/**
 * Devolve o endereço que será pedido, ou lança `waha_media_untrusted_host`.
 * Exportada para que a regra seja testável sem rede.
 */
export function destinoDaMidiaNoWaha(
  mediaUrl: string,
  sessionRef: string,
  base: string | undefined = process.env.WAHA_API_BASE_URL,
): URL {
  if (!base || !sessionRef) throw new Error(RECUSADO);

  let origem: URL;
  let anunciada: URL;
  try {
    origem = new URL(base);
    anunciada = new URL(mediaUrl);
  } catch {
    throw new Error(RECUSADO);
  }
  if (!ehHttp(origem) || !ehHttp(anunciada)) throw new Error(RECUSADO);

  const caminho = anunciada.pathname;
  if (caminho.includes("\\") || SEPARADOR_DISFARCADO.test(caminho)) throw new Error(RECUSADO);

  // "/api/files/<sessão>/<arquivo…>" → ["", "api", "files", "<sessão>", "<arquivo>", …]
  const [vazio, api, files, sessao, ...arquivo] = caminho.split("/");
  const naPasta = vazio === "" && api === PASTA_DE_ARQUIVOS[0] && files === PASTA_DE_ARQUIVOS[1];
  const daSessao = sessao === sessionRef || sessao === encodeURIComponent(sessionRef);
  const temArquivo =
    arquivo.length > 0 && arquivo.every((parte) => parte !== "" && parte !== "." && parte !== "..");
  if (!naPasta || !daSessao || !temArquivo) throw new Error(RECUSADO);

  const destino = new URL(origem.origin);
  destino.pathname = caminho;
  destino.search = anunciada.search;

  // A conferência que decide: a credencial só sai para a origem configurada.
  if (destino.origin !== origem.origin) throw new Error(RECUSADO);
  return destino;
}

export async function fetchWahaMedia(
  mediaUrl: string,
  hintMime: string | null | undefined,
  sessionRef: string,
): Promise<FetchedMedia> {
  const url = destinoDaMidiaNoWaha(mediaUrl, sessionRef);

  const apiKey = process.env.WAHA_API_KEY;
  const res = await fetch(url.toString(), {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`waha_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const mime = res.headers.get("content-type") || hintMime || "application/octet-stream";
  return { buffer, mime };
}

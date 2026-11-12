/**
 * Como um anexo chega ao navegador — a regra, num lugar só.
 *
 * O tipo de um anexo é DECLARADO por quem o enviou (o contato, do outro lado
 * do WhatsApp, ou quem fez o upload). O arquivo é servido no mesmo endereço do
 * app. Entregar "o tipo que veio" deixaria o remetente escolher como o
 * navegador de quem atende trata o arquivo — e um tipo que o navegador
 * interpreta como documento ativo (página, imagem vetorial, XML) rodaria com a
 * sessão de quem abriu.
 *
 * Por isso a lista é FECHADA e POSITIVA: abre na tela o que o navegador só
 * exibe ou toca. Todo o resto é download, com tipo genérico. Tipo novo entra
 * aqui por decisão, nunca por omissão.
 */
import { DOCUMENT_MIMES } from "@/lib/messaging/media/upload-validation";

/** Imagens rasterizadas. `image/svg+xml` fica de fora de propósito: é documento ativo. */
const IMAGENS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Tipos fora de `audio/` e `video/` que são mídia tocável ou documento só de leitura. */
const OUTROS = new Set([
  "application/pdf",
  "application/mp4", // o canal por QR anuncia vídeo do WhatsApp assim
  "application/ogg",
]);

/** Extensões que `storagePathFor` produz para os tipos acima. */
const EXTENSOES_QUE_ABREM = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "3gp",
  "ogg",
  "mp3",
  "m4a",
  "aac",
  "amr",
  "webm",
  "wav",
  "mov",
  "pdf",
]);

const TIPO_GENERICO = "application/octet-stream";
const SUBTIPO = /^[a-z0-9][a-z0-9.+-]*$/;
const CODECS = /;\s*codecs\s*=\s*("?)([a-z0-9., -]+)\1/i;

/** `"Text/HTML; charset=utf-8"` → `"text/html"`. Vazio quando não é um tipo. */
export function tipoBase(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

/** O navegador pode exibir ou tocar este tipo no próprio app? */
export function abreNaTela(mime: string | null | undefined): boolean {
  const base = tipoBase(mime);
  if (IMAGENS.has(base) || OUTROS.has(base)) return true;
  const [familia, subtipo, ...sobra] = base.split("/");
  if (sobra.length > 0 || !subtipo || !SUBTIPO.test(subtipo)) return false;
  return familia === "audio" || familia === "video";
}

/**
 * O `Content-Type` que vai para o Storage e para a resposta.
 *
 * Três saídas: o que abre na tela mantém o tipo base (e `codecs`, se houver —
 * nenhum outro parâmetro escrito pelo remetente é repetido); documento que o
 * upload já aceita (Word, Excel, texto, zip…) mantém o tipo base, porque o
 * canal de envio lê esse tipo e nenhum deles é documento ativo; qualquer outro
 * vira genérico.
 */
export function tipoSeguro(mime: string | null | undefined): string {
  const base = tipoBase(mime);
  if (abreNaTela(mime)) {
    const codecs = CODECS.exec(mime ?? "")?.[2]?.trim();
    return codecs ? `${base}; codecs=${codecs}` : base;
  }
  return DOCUMENT_MIMES.has(base) ? base : TIPO_GENERICO;
}

/**
 * Um objeto JÁ GUARDADO abre na tela? Exige as duas provas: o tipo anotado na
 * linha e a extensão do caminho (que nasce do tipo com que o arquivo foi
 * gravado). Objeto antigo, gravado antes desta regra com um tipo ativo, tem
 * extensão `bin` ou nenhuma das listadas — e cai em download.
 */
export function objetoAbreNaTela(mime: string | null | undefined, caminho: string): boolean {
  return abreNaTela(mime) && caminhoAbreNaTela(caminho);
}

/** Só a prova da extensão — para quem guarda o caminho e não o tipo (nota interna). */
export function caminhoAbreNaTela(caminho: string): boolean {
  const nome = caminho.split("/").pop() ?? "";
  const ponto = nome.lastIndexOf(".");
  const ext = ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : "";
  return EXTENSOES_QUE_ABREM.has(ext);
}

/** Nome de arquivo para download: só o último segmento, sem nada que quebre o cabeçalho. */
export function nomeParaBaixar(caminho: string | null | undefined, reserva = "arquivo"): string {
  const nome = (caminho ?? "").split(/[\\/]/).pop() ?? "";
  const limpo = nome.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return limpo || reserva;
}

/**
 * Cabeçalhos de uma resposta que carrega os bytes de um anexo.
 *
 * `nosniff` impede o navegador de adivinhar um tipo diferente do declarado. No
 * que é download, a política `sandbox` isola o conteúdo caso ele ainda assim
 * seja aberto como página. Ela NÃO vai no que abre na tela: o leitor de PDF e
 * o tocador de vídeo embutidos do navegador não funcionam dentro dela, e esses
 * tipos não executam nada.
 */
export function cabecalhosDoAnexo(
  mime: string | null | undefined,
  nome?: string | null,
): Record<string, string> {
  const abre = abreNaTela(mime);
  const cabecalhos: Record<string, string> = {
    "Content-Type": tipoSeguro(mime),
    "Content-Disposition": abre ? "inline" : `attachment; filename="${nomeParaBaixar(nome)}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (!abre) cabecalhos["Content-Security-Policy"] = "sandbox; default-src 'none'";
  return cabecalhos;
}

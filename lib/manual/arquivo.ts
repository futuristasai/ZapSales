import path from "node:path";

/**
 * Qual arquivo do manual do usuário a rota `/manual` pode entregar.
 *
 * O manual é `docs/manual/index.html` + `docs/manual/img/*.png` (gerado por
 * `docs/manual/ferramentas/montar.mjs`). A imagem de produção leva só esses dois
 * caminhos — ver o `Dockerfile` e o `.dockerignore`.
 *
 * É uma LISTA DO QUE PODE, não uma checagem do que não pode: o segmento da URL
 * vira nome de arquivo no disco, então só passa o formato exato `index.html` ou
 * `img/<nome>.<extensão de imagem>`, com nome sem ponto na frente e sem barra.
 * `..` não casa com o padrão, e o `path.join` ainda é conferido contra a pasta.
 */

const NOME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const TIPO_DA_IMAGEM: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface ArquivoDoManual {
  caminho: string;
  tipo: string;
  /** A página pode mudar a cada versão; as imagens trazem o nome do que mostram. */
  segundosDeCache: number;
}

export function pastaDoManual(): string {
  return path.join(process.cwd(), "docs", "manual");
}

export function resolverArquivoDoManual(
  segmentos: readonly string[] | undefined,
  raiz: string = pastaDoManual(),
): ArquivoDoManual | null {
  if (!segmentos || segmentos.length === 0) return null;
  if (!segmentos.every((s) => NOME.test(s))) return null;

  let tipo: string | undefined;
  let segundosDeCache: number;
  if (segmentos.length === 1 && segmentos[0] === "index.html") {
    tipo = "text/html; charset=utf-8";
    segundosDeCache = 300;
  } else if (segmentos.length === 2 && segmentos[0] === "img") {
    tipo = TIPO_DA_IMAGEM[path.extname(segmentos[1] ?? "").toLowerCase()];
    segundosDeCache = 3600;
  } else {
    return null;
  }
  if (!tipo) return null;

  const caminho = path.join(raiz, ...segmentos);
  // Cinto e suspensório: nada do que o padrão deixou passar pode sair da pasta.
  if (!caminho.startsWith(raiz + path.sep)) return null;
  return { caminho, tipo, segundosDeCache };
}

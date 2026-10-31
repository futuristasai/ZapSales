import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolverArquivoDoManual } from "@/lib/manual/arquivo";

const RAIZ = path.join(path.sep, "app", "docs", "manual");

describe("resolverArquivoDoManual", () => {
  it("entrega a página e as imagens, com o tipo certo", () => {
    const pagina = resolverArquivoDoManual(["index.html"], RAIZ);
    expect(pagina?.tipo).toBe("text/html; charset=utf-8");
    expect(pagina?.caminho).toBe(path.join(RAIZ, "index.html"));

    const print = resolverArquivoDoManual(["img", "ia-agentes-lista.png"], RAIZ);
    expect(print?.tipo).toBe("image/png");
    expect(print?.caminho).toBe(path.join(RAIZ, "img", "ia-agentes-lista.png"));
  });

  it("a extensão da imagem não distingue maiúscula", () => {
    expect(resolverArquivoDoManual(["img", "FOTO.PNG"], RAIZ)?.tipo).toBe("image/png");
  });

  it.each([
    ["sem caminho", undefined],
    ["caminho vazio", []],
    ["só a pasta de imagens", ["img"]],
    ["o modelo", ["modelo.html"]],
    ["o conteúdo-fonte", ["conteudo", "ia", "agentes.html"]],
    ["as ferramentas", ["ferramentas", "montar.mjs"]],
    ["o README", ["README.md"]],
    ["uma imagem que não é imagem", ["img", "script.js"]],
    ["SVG, que pode carregar script", ["img", "x.svg"]],
    ["subpasta de imagens", ["img", "a", "b.png"]],
    ["subida de pasta", ["img", "..", "index.html"]],
    ["subida de pasta fora de img", ["..", "..", ".env"]],
    ["arquivo oculto", ["img", ".env.png"]],
    ["barra dentro do segmento", ["img", "a/../../index.html"]],
    ["barra invertida dentro do segmento", ["img", "..\\index.html"]],
    ["byte nulo", ["img", "x.png\0.html"]],
    ["nome codificado", ["img", "%2e%2e%2findex.html"]],
  ])("recusa %s", (_nome, segmentos) => {
    expect(resolverArquivoDoManual(segmentos as string[] | undefined, RAIZ)).toBeNull();
  });
});

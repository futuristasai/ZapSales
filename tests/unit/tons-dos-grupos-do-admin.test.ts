/**
 * OS TONS DOS GRUPOS DO MENU DO ADMIN TÊM CONTRASTE NOS DOIS TEMAS (issue #308, história 20).
 *
 * Cada grupo do menu da administração tem um tom (`--color-grupo-*`), que pinta só o
 * ícone. Ícone é elemento gráfico: o mínimo da WCAG (1.4.11) é 3:1 contra o fundo. Aqui
 * o contraste é CALCULADO dos tokens de `app/globals.css`, nos blocos claro (`:root`) e
 * escuro (`[data-theme="dark"]`), contra a superfície (`--color-surface`) e o fundo
 * (`--color-bg`) — os dois lugares onde o ícone aparece (barra lateral e cabeçalho).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GRUPOS_DO_ADMIN } from "@/lib/admin/catalogo";

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function bloco(seletor: string): string {
  const ini = CSS.indexOf(`${seletor} {`);
  expect(ini, `bloco ${seletor} não achado`).toBeGreaterThanOrEqual(0);
  return CSS.slice(ini, CSS.indexOf("\n}", ini));
}

function token(css: string, nome: string): string {
  const m = new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  expect(m, `--${nome} sem cor hexadecimal`).not.toBeNull();
  return m![1]!;
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe("tons dos grupos do admin", () => {
  it("todo grupo usa um token --color-grupo-* (sem cor crua do Tailwind)", () => {
    for (const g of GRUPOS_DO_ADMIN) expect(g.tom).toMatch(/^text-grupo-[a-z]+$/);
  });

  it.each([
    ["claro", ":root"],
    ["escuro", '[data-theme="dark"]'],
  ])("tema %s: cada tom tem pelo menos 3:1 contra a superfície e o fundo", (_tema, seletor) => {
    const css = bloco(seletor);
    const superficie = token(css, "color-surface");
    const fundo = token(css, "color-bg");
    for (const g of GRUPOS_DO_ADMIN) {
      const cor = token(css, `color-${g.tom.replace(/^text-/, "")}`);
      expect(contraste(cor, superficie), `${g.id} sobre a superfície`).toBeGreaterThanOrEqual(3);
      expect(contraste(cor, fundo), `${g.id} sobre o fundo`).toBeGreaterThanOrEqual(3);
    }
  });

  it("os cinco tons são diferentes entre si (um tom por assunto)", () => {
    const tons = GRUPOS_DO_ADMIN.map((g) =>
      token(bloco(":root"), `color-${g.tom.replace(/^text-/, "")}`),
    );
    expect(new Set(tons).size).toBe(tons.length);
  });
});

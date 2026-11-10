import localFont from "next/font/local";

/**
 * O CARREGADOR DA FONTE DOS TÍTULOS DO ASSISTENTE.
 *
 * Mora fora de `_components/` de propósito: `next/font` só funciona dentro do build do Next, e os
 * componentes do assistente são importados também pelos testes de unidade, que não passam por ele.
 * Só o layout importa este arquivo; os componentes usam a classe `TITULO` (`_components/fonte.ts`), que
 * lê a variável CSS que o layout aplica.
 *
 * Não é fonte nova no repositório — o arquivo já está em `app/fonts/` (origem e licença no README de lá),
 * é o mesmo da vitrine de design. Carrega SÓ nas telas do onboarding, então o resto do app não paga por
 * ela. Corpo de texto, formulários e rótulos continuam em Atkinson Hyperlegible.
 */
export const fonteDeTitulo = localFont({
  src: "../fonts/bricolage-grotesque-200-800-latin.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-titulo",
});

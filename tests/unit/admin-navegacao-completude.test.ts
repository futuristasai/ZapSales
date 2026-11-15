/**
 * TODA TELA DO ADMINISTRADOR DA INSTALAÇÃO TEM PORTA NO MENU DELE — E O MENU SE EXPLICA.
 *
 * `navegacao-completude.test.ts` cobre só `app/app/**` (a navegação do tenant). O menu
 * do administrador é o catálogo próprio da área de plataforma, `lib/admin/catalogo.ts`
 * (issue #308): barra lateral, gaveta do celular, cabeçalho de cada tela e título da
 * aba leem dali. Foi sem esta cerca que `/admin/modulos` nasceu sem porta no PR #1578.
 *
 * O recorte é o primeiro nível de `app/admin/(protected)/`: é ali que mora cada tela
 * do menu. Subpáginas (`tenants/new`, `audit/[entryId]`) são alcançadas de dentro da
 * tela-mãe, não do menu.
 *
 * O que a issue #308 acrescentou: um leigo precisa entender o item ANTES de abrir.
 * Por isso todo item tem rótulo, dica curta (menu), "para que serve" e "quando usar"
 * (cabeçalho) e ícone — sem repetir entre itens, porque dois assuntos com a mesma
 * frase ou o mesmo desenho são um assunto para quem lê.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOGO_DO_ADMIN,
  GRUPOS_DO_ADMIN,
  ICONE_DA_TARJA,
  REDIRECIONAMENTOS_DO_ADMIN,
  itemDoAdmin,
} from "@/lib/admin/catalogo";

const RAIZ = join(process.cwd(), "app", "admin", "(protected)");

function telasDoPrimeiroNivel(): string[] {
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
    .filter((d) => existsSync(join(RAIZ, d.name, "page.tsx")))
    .map((d) => `/admin/${d.name}`)
    .sort();
}

const lerPagina = (href: string) =>
  readFileSync(join(RAIZ, href.replace("/admin/", ""), "page.tsx"), "utf8");

describe("menu do administrador da instalação", () => {
  it("o instrumento enxerga as telas (controle: /admin/dashboard existe e tem porta)", () => {
    expect(telasDoPrimeiroNivel()).toContain("/admin/dashboard");
    expect(itemDoAdmin("/admin/dashboard")?.label).toBe("Painel");
  });

  it("toda tela de primeiro nível tem uma entrada no catálogo — ou é redirecionamento declarado", () => {
    const comPorta = new Set(CATALOGO_DO_ADMIN.map((i) => i.href));
    const redirecionadas = new Set(REDIRECIONAMENTOS_DO_ADMIN.map((r) => r.de));
    const semPorta = telasDoPrimeiroNivel().filter(
      (href) => !comPorta.has(href) && !redirecionadas.has(href),
    );
    expect(
      semPorta,
      "tela do administrador sem porta no menu: acrescente-a a CATALOGO_DO_ADMIN em lib/admin/catalogo.ts",
    ).toEqual([]);
  });

  it("todo item do catálogo aponta para uma tela que existe", () => {
    const telas = new Set(telasDoPrimeiroNivel());
    expect(CATALOGO_DO_ADMIN.map((i) => i.href).filter((h) => !telas.has(h))).toEqual([]);
  });

  it("a exceção de redirecionamento tem motivo escrito e a página só redireciona", () => {
    for (const r of REDIRECIONAMENTOS_DO_ADMIN) {
      expect(r.motivo.length, `${r.de}: escreva o motivo`).toBeGreaterThan(20);
      const fonte = lerPagina(r.de);
      expect(fonte, `${r.de} deveria só redirecionar para ${r.para}`).toMatch(
        /permanentRedirect\(|redirect\(/,
      );
      expect(fonte).toContain(r.para);
      expect(fonte, `${r.de} não pode desenhar tela`).not.toMatch(/<h1|<div/);
    }
  });

  it("os grupos são os cinco da issue #308, nesta ordem, e todo item cai num deles", () => {
    expect(GRUPOS_DO_ADMIN.map((g) => g.label)).toEqual([
      "Visão geral",
      "Empresas e pessoas",
      "Acompanhar e proteger",
      "Configurar a instalação",
      "Integrações",
    ]);
    const ids = new Set(GRUPOS_DO_ADMIN.map((g) => g.id));
    expect(CATALOGO_DO_ADMIN.filter((i) => !ids.has(i.grupo)).map((i) => i.href)).toEqual([]);
    for (const g of GRUPOS_DO_ADMIN) {
      expect(
        CATALOGO_DO_ADMIN.some((i) => i.grupo === g.id),
        `grupo ${g.id} vazio`,
      ).toBe(true);
    }
  });

  it("os itens do mesmo grupo ficam juntos (o menu não salta de assunto e volta)", () => {
    const ordem = CATALOGO_DO_ADMIN.map((i) => i.grupo);
    const vistos: string[] = [];
    for (const g of ordem) if (vistos.at(-1) !== g) vistos.push(g);
    expect(vistos).toEqual(GRUPOS_DO_ADMIN.map((g) => g.id));
  });

  it("todo item se explica: rótulo, dica, para que serve, quando usar e ícone", () => {
    for (const item of CATALOGO_DO_ADMIN) {
      for (const campo of ["label", "dica", "paraQueServe", "quandoUsar", "icone"] as const) {
        expect(item[campo].trim().length, `${item.href} sem ${campo}`).toBeGreaterThan(0);
      }
      expect(item.dica, `${item.href}: a dica é frase, termina com ponto`).toMatch(/\.$/);
    }
  });

  it("nada se repete entre itens: rótulo, dica, ajuda e ícone (nem o ícone da tarja)", () => {
    for (const campo of ["label", "dica", "paraQueServe", "quandoUsar", "icone"] as const) {
      const valores = CATALOGO_DO_ADMIN.map((i) => i[campo]);
      const repetidos = valores.filter((v, i) => valores.indexOf(v) !== i);
      expect(repetidos, `${campo} repetido`).toEqual([]);
    }
    expect(CATALOGO_DO_ADMIN.map((i) => i.icone)).not.toContain(ICONE_DA_TARJA);
  });

  it("o jargão que a issue #308 tirou do menu não volta", () => {
    const proibidos =
      /\b(tenants?|cross-tenant|audit|incidents|usage|users|platform admins|inbox|dashboard|budgets?)\b/i;
    const textos = CATALOGO_DO_ADMIN.flatMap((i) => [
      i.label,
      i.dica,
      i.paraQueServe,
      i.quandoUsar,
    ]);
    expect(textos.filter((t) => proibidos.test(t))).toEqual([]);
  });

  it("toda tela do catálogo desenha o cabeçalho padrão e põe o título da aba pelo catálogo", () => {
    const faltando: string[] = [];
    for (const item of CATALOGO_DO_ADMIN) {
      const fonte = lerPagina(item.href);
      if (!fonte.includes(`metadadosDaTelaDoAdmin("${item.href}")`))
        faltando.push(`${item.href}: título da aba`);
      // O cabeçalho pode morar na página ou no componente de cliente que ela desenha.
      const pasta = join(RAIZ, item.href.replace("/admin/", ""));
      const fontes = readdirSync(pasta)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => readFileSync(join(pasta, f), "utf8"))
        .join("\n");
      // `\s+`: o Prettier quebra a linha entre o nome e o primeiro atributo quando há vários.
      if (!new RegExp(`<CabecalhoDaPlataforma\\s+href="${item.href}"`).test(fontes)) {
        faltando.push(`${item.href}: cabeçalho`);
      }
    }
    expect(faltando).toEqual([]);
  });
});

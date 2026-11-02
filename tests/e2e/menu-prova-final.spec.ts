/**
 * O MENU NOVO, PROVA FINAL (issue #193, fecha o #183) — pela tela, no banco fresco do `e2e`.
 *
 * As specs de `navegacao.spec.ts` provam o desenho (largura da faixa, gaveta, folha, 44 px) com
 * o Dono e o Atendente, em português e no tema claro. Esta varre o que faltava na matriz da
 * issue: PAPEL × APARELHO × TEMA × IDIOMA × RECURSOS OPCIONAIS, medindo por ferramenta
 * (`getBoundingClientRect`, `getComputedStyle`) e nunca a olho, e deixando uma captura de cada
 * cenário em `evidence/menu-prova-final/` (o `e2e.yml` publica a pasta como artefato).
 *
 * O que se afirma em CADA cenário, e a régua de cada afirmação:
 *
 *   1. Nenhum bloco some abaixo da dobra: todo botão da faixa está dentro da janela, todo título
 *      de grupo está dentro da gaveta/folha que o contém.
 *   2. Nada estoura na horizontal (`body.scrollWidth <= clientWidth`), nem a gaveta nem a folha.
 *   3. O tema pedido é o tema pintado (`data-theme`), e o texto dos links do menu tem contraste
 *      mínimo contra o fundo que realmente o pinta (piso 3:1 — pega o ilegível, não o feio).
 *   4. Em espanhol e inglês nenhum nome do menu fica em português (lista de vazamento) e, em
 *      inglês, o nome traduzido está lá — o menu não mistura idiomas.
 *   5. O menu é monótono por papel: leitor ≤ atendente ≤ dono, e o atendente não vê «Agente».
 *
 * E o eixo dos recursos opcionais, num caso à parte: com Propostas desligada o menu não tem a
 * tela; ligada (módulo da instalação + chave da empresa), ela aparece em «Se a sua empresa usa».
 *
 * O idioma de quem está logado vem de `user_metadata.locale` (`lib/auth/server.ts`), e não do
 * `Accept-Language` — então a spec o grava pelo service role e o RESTAURA no fim, junto com o
 * que mais tocar (configuração da empresa e do módulo). O `e2e` roda com um worker só.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";
import { menuExpandido } from "./helpers/menu-expandido";
import { expect, test, type Locator, type Page } from "./helpers/test";

const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EVIDENCIA = path.join(process.cwd(), "evidence", "menu-prova-final");
fs.mkdirSync(EVIDENCIA, { recursive: true });

// O login anônimo segue o `Accept-Language`; o botão é «Entrar» em português.
test.use({ locale: "pt-BR" });
test.describe.configure({ mode: "serial", timeout: 240_000 });

type Papel = "admin" | "agent" | "viewer";
type Idioma = "pt-BR" | "es" | "en";
type Tema = "light" | "dark";

/** Nomes que só existem em português: se aparecem em es/en, o menu misturou idiomas. */
const SO_EM_PORTUGUES = [
  "Gestão de Clientes CRM",
  "Riscos de Perda",
  "Aguardando Humano",
  "Disparo em massa",
  "Quem atende cada conversa",
  "Avisar outros sistemas",
];

let creds: CredsE2E;
let orgId = "";

// ── Estado que a spec toca, e como volta ─────────────────────────────────────
const localeOriginal = new Map<string, unknown>();
let settingsOriginal: Record<string, unknown> | null = null;
let moduloPropostasOriginal: { valor: string | null } | null | undefined;

async function usuarioPorEmail(
  email: string,
): Promise<{ id: string; meta: Record<string, unknown> }> {
  for (let pagina = 1; pagina <= 5; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const achado = data.users.find((u) => u.email === email);
    if (achado)
      return { id: achado.id, meta: (achado.user_metadata ?? {}) as Record<string, unknown> };
    if (data.users.length < 200) break;
  }
  throw new Error(`usuário de teste não encontrado: ${email}`);
}

async function definirIdioma(papel: Papel, idioma: Idioma): Promise<void> {
  const email = creds.users[papel]!.email;
  const { id, meta } = await usuarioPorEmail(email);
  if (!localeOriginal.has(email)) localeOriginal.set(email, meta.locale ?? null);
  const novo = { ...meta };
  if (idioma === "pt-BR") delete novo.locale;
  else novo.locale = idioma;
  const { error } = await db.auth.admin.updateUserById(id, { user_metadata: novo });
  if (error) throw error;
}

test.beforeAll(async () => {
  creds = lerCreds();
  orgId = (creds as unknown as { org_id: string }).org_id;
  const { data } = await db.from("organizations").select("settings").eq("id", orgId).single();
  settingsOriginal = ((data as { settings?: Record<string, unknown> } | null)?.settings ??
    {}) as Record<string, unknown>;
  const { data: modulo } = await db
    .from("platform_config")
    .select("valor")
    .eq("chave", "MODULO_PROPOSTAS")
    .maybeSingle();
  moduloPropostasOriginal = (modulo as { valor: string | null } | null) ?? null;
});

test.afterAll(async () => {
  for (const [email, original] of localeOriginal) {
    const { id, meta } = await usuarioPorEmail(email);
    const volta = { ...meta };
    if (original === null || original === undefined) delete volta.locale;
    else volta.locale = original;
    await db.auth.admin.updateUserById(id, { user_metadata: volta });
  }
  if (settingsOriginal) {
    await db.from("organizations").update({ settings: settingsOriginal }).eq("id", orgId);
  }
  if (moduloPropostasOriginal === null) {
    await db.from("platform_config").delete().eq("chave", "MODULO_PROPOSTAS");
  } else if (moduloPropostasOriginal) {
    await db
      .from("platform_config")
      .upsert(
        { chave: "MODULO_PROPOSTAS", valor: moduloPropostasOriginal.valor },
        { onConflict: "chave" },
      );
  }
});

// ── Entrar e medir ───────────────────────────────────────────────────────────
async function entrarComo(
  page: Page,
  baseURL: string | undefined,
  papel: Papel,
  tema: Tema,
): Promise<void> {
  await menuExpandido(page.context(), baseURL);
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("zapsales-theme", t);
    } catch {
      /* sem armazenamento: o tema cai no padrão e a asserção de tema acusa */
    }
  }, tema);

  if (papel === "admin") {
    creds = await loginComoAdmin(page, creds);
  } else {
    await page.goto("/login");
    await page.locator("#email").fill(creds.users[papel]!.email);
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/app\//);
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

const faixa = (page: Page) => page.getByTestId("faixa-do-menu");
const barra = (page: Page) => page.getByTestId("barra-de-baixo");

async function semEstouroHorizontal(page: Page, onde: string): Promise<void> {
  // `body`, e não `documentElement`: o `html` tem `overflow-x: clip` e grampeia a medida.
  const m = await page.evaluate(() => ({
    corpo: document.body.scrollWidth,
    janela: document.documentElement.clientWidth,
  }));
  expect(m.corpo, `${onde}: a página não pode passar da largura da janela`).toBeLessThanOrEqual(
    m.janela + 1,
  );
}

/** Contraste WCAG do menor contraste entre o texto dos links e o fundo que o pinta. */
async function menorContraste(page: Page, raizSeletor: string): Promise<number> {
  return page.evaluate((seletor) => {
    const analisa = (css: string): [number, number, number, number] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(css);
      if (!m) return null;
      const p = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 1 : p[3]!];
    };
    const lum = (c: [number, number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const fundoDe = (el: Element): [number, number, number, number] => {
      let atual: Element | null = el;
      while (atual) {
        const c = analisa(getComputedStyle(atual).backgroundColor);
        if (c && c[3] > 0.95) return c;
        atual = atual.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const raiz = document.querySelector(seletor);
    if (!raiz) return 0;
    const textos = [...raiz.querySelectorAll("a, button")].filter(
      (e) => (e.textContent ?? "").trim().length > 0 && e.getBoundingClientRect().width > 0,
    );
    let menor = 21;
    for (const e of textos) {
      const frente = analisa(getComputedStyle(e).color);
      if (!frente) continue;
      const a = lum(frente);
      const b = lum(fundoDe(e));
      const razao = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (razao < menor) menor = razao;
    }
    return textos.length === 0 ? 0 : menor;
  }, raizSeletor);
}

function afirmarIdioma(texto: string, idioma: Idioma, onde: string): void {
  if (idioma === "pt-BR") return;
  for (const nome of SO_EM_PORTUGUES) {
    expect(
      texto,
      `${onde}: «${nome}» ficou em português com a interface em ${idioma}`,
    ).not.toContain(nome);
  }
  if (idioma === "en") {
    expect(texto, `${onde}: o nome traduzido de «Todo dia» tem de estar à vista`).toContain(
      "Every day",
    );
  }
}

/** `textContent`, e não `innerText`: este aplica `text-transform` e entregaria «EVERY DAY». */
const textoDe = (l: Locator) => l.evaluate((e) => e.textContent ?? "");

const botoesDaFaixa = (page: Page) => faixa(page).getByRole("button");

// ── Computador ───────────────────────────────────────────────────────────────
const CONTAGEM_DA_FAIXA: Partial<Record<Papel, number>> = {};

async function provarComputador(
  page: Page,
  baseURL: string | undefined,
  papel: Papel,
  idioma: Idioma,
  tema: Tema,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await definirIdioma(papel, idioma);
  await entrarComo(page, baseURL, papel, tema);

  await expect(faixa(page)).toBeVisible();
  const total = await botoesDaFaixa(page).count();
  expect(
    total,
    "guarda de vacuidade: a faixa tem ao menos Todo dia, Buscar e Você",
  ).toBeGreaterThanOrEqual(3);
  CONTAGEM_DA_FAIXA[papel] = total;
  if (papel === "admin") expect(total, "o dono vê as 8 entradas da faixa").toBe(8);
  if (papel === "agent") {
    expect(total, "o atendente não vê a área Agente").toBeLessThan(CONTAGEM_DA_FAIXA.admin ?? 8);
  }
  if (papel === "viewer" && CONTAGEM_DA_FAIXA.agent !== undefined) {
    expect(total, "o leitor vê no máximo o que o atendente vê").toBeLessThanOrEqual(
      CONTAGEM_DA_FAIXA.agent,
    );
  }

  const mesa = page.getByTestId("mesa-de-trabalho");
  await expect(mesa).toBeVisible();
  let texto = (await faixa(page).innerText()) + "\n" + (await mesa.innerText());

  const fora = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="faixa-do-menu"] button')].filter(
        (b) => b.getBoundingClientRect().bottom > window.innerHeight,
      ).length,
  );
  expect(fora, "botão da faixa abaixo da dobra").toBe(0);
  await semEstouroHorizontal(page, "painel de Todo dia");

  const contrasteDoPainel = await menorContraste(page, '[data-testid="mesa-de-trabalho"]');
  expect(contrasteDoPainel, "texto do painel legível (piso 3:1)").toBeGreaterThanOrEqual(3);
  const contrasteDaFaixa = await menorContraste(page, '[data-testid="faixa-do-menu"]');
  expect(contrasteDaFaixa, "texto da faixa legível (piso 3:1)").toBeGreaterThanOrEqual(3);

  // Cada área da faixa (entre Todo dia e Buscar/Você) abre a gaveta, que cabe e fecha com Esc.
  const botoes = botoesDaFaixa(page);
  const nAreas = total - 3;
  for (let i = 1; i <= nAreas; i++) {
    await botoes.nth(i).click();
    const gaveta = page.getByRole("dialog");
    await expect(gaveta).toBeVisible();
    const m = await gaveta.evaluate((d) => {
      const r = d.getBoundingClientRect();
      const h3 = [...d.querySelectorAll("h3")];
      return {
        titulos: h3.length,
        titulosFora: h3.filter((h) => h.getBoundingClientRect().bottom > r.bottom + 1).length,
        links: d.querySelectorAll("a").length,
        transborda: d.scrollWidth > d.clientWidth + 1,
      };
    });
    expect(m.links, `área ${i}: guarda de vacuidade`).toBeGreaterThan(0);
    expect(m.titulosFora, `área ${i}: grupo inteiro abaixo da dobra`).toBe(0);
    expect(m.transborda, `área ${i}: a gaveta não rola na horizontal`).toBe(false);
    texto += "\n" + (await textoDe(gaveta));
    if (i === 1) {
      await page.screenshot({
        path: path.join(EVIDENCIA, `computador-${papel}-${idioma}-${tema}-gaveta.png`),
      });
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  afirmarIdioma(texto, idioma, `computador/${papel}/${idioma}/${tema}`);
  await page.screenshot({
    path: path.join(EVIDENCIA, `computador-${papel}-${idioma}-${tema}.png`),
  });
}

// ── Celular ──────────────────────────────────────────────────────────────────
async function provarCelular(
  page: Page,
  baseURL: string | undefined,
  papel: Papel,
  idioma: Idioma,
  tema: Tema,
): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await definirIdioma(papel, idioma);
  await entrarComo(page, baseURL, papel, tema);

  await expect(barra(page)).toBeVisible();
  await expect(faixa(page), "a faixa do computador fica fora da árvore no celular").toHaveCount(0);
  await semEstouroHorizontal(page, "celular após o login");

  const abas = await barra(page).evaluate((nav) => {
    const r = nav.getBoundingClientRect();
    return {
      base: r.bottom,
      vh: window.innerHeight,
      alvos: [...nav.querySelectorAll("a, button")].map((e) => e.getBoundingClientRect().height),
    };
  });
  expect(abas.base, "a barra encosta no fundo da janela").toBeCloseTo(abas.vh, 0);
  expect(
    abas.alvos.length,
    "guarda de vacuidade: ao menos Conversas e uma folha",
  ).toBeGreaterThanOrEqual(2);
  for (const h of abas.alvos) expect(h, "alvo de toque").toBeGreaterThanOrEqual(44);

  let texto = await textoDe(barra(page));
  const gatilhos = barra(page).getByRole("button");
  const nFolhas = await gatilhos.count();
  expect(nFolhas, "guarda de vacuidade: há ao menos uma folha").toBeGreaterThan(0);
  if (papel !== "viewer") expect(nFolhas, "Todo dia, Configurar e Resultados").toBe(3);
  for (let i = 0; i < nFolhas; i++) {
    await gatilhos.nth(i).click();
    const folha = page.getByRole("dialog");
    await expect(folha).toBeVisible();
    const m = await folha.evaluate((d) => {
      const r = d.getBoundingClientRect();
      const corpo = d.querySelector<HTMLElement>(".overflow-y-auto")!;
      const links = [...corpo.querySelectorAll("a")];
      corpo.scrollTop = corpo.scrollHeight;
      const rodape = d.querySelector("footer");
      const ultimo = links[links.length - 1]?.getBoundingClientRect();
      return {
        base: r.bottom,
        vh: window.innerHeight,
        links: links.length,
        menorAlvo: Math.min(
          ...[...d.querySelectorAll("a, button")].map((e) => e.getBoundingClientRect().height),
        ),
        ultimoAcimaDoRodape:
          ultimo && rodape ? ultimo.bottom <= rodape.getBoundingClientRect().top + 1 : true,
        semRolagemH: corpo.scrollWidth <= corpo.clientWidth + 1,
      };
    });
    expect(m.links, `folha ${i}: guarda de vacuidade`).toBeGreaterThan(0);
    expect(m.base, `folha ${i}: termina dentro da janela`).toBeLessThanOrEqual(m.vh + 1);
    expect(m.menorAlvo, `folha ${i}: alvo de toque`).toBeGreaterThanOrEqual(44);
    expect(m.ultimoAcimaDoRodape, `folha ${i}: o último link fica à vista depois de rolar`).toBe(
      true,
    );
    expect(m.semRolagemH, `folha ${i}: sem rolagem horizontal`).toBe(true);
    await semEstouroHorizontal(page, `folha ${i}`);
    texto += "\n" + (await textoDe(folha));
    if (i === nFolhas - 2) {
      await page.screenshot({
        path: path.join(EVIDENCIA, `celular-${papel}-${idioma}-${tema}-configurar.png`),
      });
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  afirmarIdioma(texto, idioma, `celular/${papel}/${idioma}/${tema}`);
  await page.screenshot({ path: path.join(EVIDENCIA, `celular-${papel}-${idioma}-${tema}.png`) });
}

// ── A matriz ─────────────────────────────────────────────────────────────────
// Do mais barato (sem MFA) ao mais caro (o Dono espera a virada da janela TOTP em cada login).
// A ORDEM importa: a monotonia por papel compara com a contagem dos anteriores, e o Dono
// precisa vir antes do Atendente.
test.describe("computador", () => {
  test("Dono · português · claro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "admin", "pt-BR", "light"));
  test("Dono · inglês · escuro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "admin", "en", "dark"));
  test("Atendente · português · escuro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "agent", "pt-BR", "dark"));
  test("Atendente · espanhol · claro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "agent", "es", "light"));
  test("Leitor · inglês · claro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "viewer", "en", "light"));
  test("Leitor · espanhol · escuro", async ({ page, baseURL }) =>
    provarComputador(page, baseURL, "viewer", "es", "dark"));
});

test.describe("celular", () => {
  test.use({ hasTouch: true });
  test("Dono · espanhol · claro", async ({ page, baseURL }) =>
    provarCelular(page, baseURL, "admin", "es", "light"));
  test("Atendente · português · escuro", async ({ page, baseURL }) =>
    provarCelular(page, baseURL, "agent", "pt-BR", "dark"));
  test("Atendente · inglês · claro", async ({ page, baseURL }) =>
    provarCelular(page, baseURL, "agent", "en", "light"));
  test("Leitor · português · claro", async ({ page, baseURL }) =>
    provarCelular(page, baseURL, "viewer", "pt-BR", "light"));
  test("Leitor · espanhol · escuro", async ({ page, baseURL }) =>
    provarCelular(page, baseURL, "viewer", "es", "dark"));
});

// ── Recursos opcionais, desligados e ligados ─────────────────────────────────
test.describe("recursos opcionais", () => {
  const propostasNaMesa = (page: Page) =>
    page.getByTestId("mesa-de-trabalho").locator('a[href="/app/proposals"]');

  test("Propostas só aparece em «Se a sua empresa usa» quando a instalação e a empresa a ligam", async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await definirIdioma("agent", "pt-BR");

    // DESLIGADO: nem o módulo nem a chave da empresa.
    await db.from("platform_config").delete().eq("chave", "MODULO_PROPOSTAS");
    const semPropostas = { ...(settingsOriginal ?? {}) } as Record<string, unknown>;
    delete semPropostas.proposals;
    await db.from("organizations").update({ settings: semPropostas }).eq("id", orgId);

    await entrarComo(page, baseURL, "agent", "light");
    await expect(page.getByTestId("mesa-de-trabalho")).toBeVisible();
    await expect(propostasNaMesa(page), "desligado: a mesa não tem Propostas").toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCIA, "opcionais-desligados-atendente.png") });

    // SÓ A EMPRESA liga: o módulo da instalação, desligado, vence.
    await db
      .from("organizations")
      .update({ settings: { ...semPropostas, proposals: { enabled: true } } })
      .eq("id", orgId);
    await page.reload();
    await expect(
      propostasNaMesa(page),
      "sem o módulo da instalação, a chave da empresa não liga",
    ).toHaveCount(0);

    // LIGADO: módulo da instalação e chave da empresa.
    await db
      .from("platform_config")
      .upsert({ chave: "MODULO_PROPOSTAS", valor: "ligado" }, { onConflict: "chave" });
    await page.reload();
    await expect(propostasNaMesa(page), "ligado: a mesa passa a ter Propostas").toHaveCount(1);
    await page.screenshot({ path: path.join(EVIDENCIA, "opcionais-ligados-atendente.png") });
  });
});

/**
 * Navegação agrupada — prova pela TELA (DoD item 12).
 *
 * Os testes unitários provam que o registro e os componentes fazem o que
 * dizem. Isto prova o que o usuário reclamou: que dá para *achar* as coisas.
 * O caso que originou a mudança é o primeiro — chegar em Funis sem saber que
 * ele morava em Configurações.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { menuExpandido, menuRecolhido } from "./helpers/menu-expandido";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");

mkdirSync(EVIDENCE, { recursive: true });

// ── Precondição de identidade ────────────────────────────────────────────────
// O menu é `menuDoPapel(isPlatformAdmin, role)` (`lib/navigation/menu.ts`), então a suspeita natural
// é que promover o `e2e-admin` a dono do servidor inflasse o menu que esta spec mede item a item.
//
// ⚠️ MEDIDO, e a suspeita não se confirma: `canSee` (`lib/navigation/interface.ts`) é
// `isPlatformAdmin || ROLE_RANK[role] >= ROLE_RANK[minRole]`; `ROLE_RANK.admin` é 5, o TETO, e o
// maior `minRole` do catálogo é `"admin"`. Para um admin de tenant o menu é IDÊNTICO promovido ou
// não — as asserções de `toHaveText` abaixo não mudariam. Guardar a identidade aqui continua
// valendo (é a spec de navegação; qualquer destino futuro exclusivo do dono apareceria primeiro
// nela), mas registrar a diferença entre "muda" e "poderia mudar" é o ponto.
test.beforeAll(async () => {
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

async function loginAdmin(page: Page): Promise<void> {
  creds = await loginComoAdmin(page, creds);
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });

async function expectSemOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const m = await page.evaluate(() => ({
    // ⚠️ `body.scrollWidth`, NÃO `documentElement`. `app/globals.css` põe
    // `overflow-x: clip` em `html` E em `body` (é `clip` e não `hidden` porque
    // `hidden` derruba o sticky da barra — ver barra-lateral-nao-flutua).
    // Com `hidden`, o `scrollWidth` do `documentElement` era GRAMPEADO no
    // `clientWidth`: a conta dava zero mesmo com um filho de 3000px dentro.
    // Medido com o chromium do repo, viewport 390x844, filho de 3000px —
    // `visible` → 2610, `hidden` → 0, e `body.scrollWidth` = 3000 nos DOIS
    // casos. A medida fica no `body` para não voltar a ser incapaz de falhar.
    //
    // A asserção existia e era incapaz de falhar. Trocar a medida é o conserto;
    // o caso de sabotagem ao lado é o que prova que a nova consegue.
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    m.scrollWidth,
    `${contexto}: documentElement.scrollWidth (${m.scrollWidth}) não pode passar do clientWidth (${m.clientWidth})`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
}

// `loginComoAdmin` espera a virada da janela TOTP entre logins consecutivos
// (o servidor recusa código repetido), e essa espera sozinha pode consumir os
// 30 s do teto global do playwright.config.ts. Toda spec da casa que usa o
// helper sobe o teto — 240 s em `agente-novo-e-uso`, `agente-papeis-operador`,
// `escopo-de-funil-do-agente` e `capacidades-do-agente`; 90 s em
// `prova-painel-provedores`. Esta era a única que faltava, e por isso dois
// testes que já estavam verdes passaram a estourar 30 s.
test.describe.configure({ timeout: 120_000 });

// ── O padrão é a faixa com o painel aberto em Todo dia ───────────────────────
// Desde a issue #188 o computador não tem mais a barra lateral de 240px: tem a FAIXA (80px, com as
// entradas Todo dia, as quatro áreas de Configurar e Resultados) e, ao lado dela, o PAINEL, que
// abre em Todo dia. Quem nunca mexeu vê os dois; recolher o painel é escolha da pessoa e fica
// gravada no cookie `sidebar_collapsed` ("1"), que o servidor lê para a primeira pintura.
const faixa = (page: Page) => page.getByRole("navigation", { name: "Áreas do menu" });
const entrada = (page: Page, nome: string) =>
  faixa(page).getByRole("button", { name: new RegExp(`^${nome}`) });
// As áreas de Configurar e Resultados abrem a GAVETA (issue #189): um diálogo por cima da tela.
const gaveta = (page: Page) => page.getByRole("dialog");

test.describe("a faixa e o painel nascem abertos", () => {
  test("sem preferência salva, há a faixa de 80px e o painel em Todo dia", async ({ page }) => {
    await loginAdmin(page);
    await expect(faixa(page)).toBeVisible();
    await expect(sidebar(page)).toBeVisible();

    const m = await page.evaluate(() => {
      const rail = document.querySelector('nav[aria-label="Áreas do menu"]')!;
      const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
      return {
        faixa: rail.getBoundingClientRect().width,
        links: nav.querySelectorAll("a").length,
        semTexto: [...nav.querySelectorAll("a")].filter((a) => !a.textContent?.trim()).length,
        titulo: document.querySelector("section[aria-label] h2")?.textContent?.trim(),
      };
    });
    expect(m.faixa, "a faixa tem 80px (w-20)").toBeGreaterThanOrEqual(76);
    expect(m.faixa, "a faixa tem 80px (w-20)").toBeLessThanOrEqual(84);
    expect(m.links, "guarda de vacuidade: o painel tem destinos").toBeGreaterThan(4);
    expect(m.semTexto, "toda tela mostra o próprio nome").toBe(0);
    expect(m.titulo).toBe("Todo dia");
    await expect(page.getByRole("button", { name: "Recolher o painel" })).toBeVisible();
  });

  test("a faixa tem Todo dia, as quatro áreas de Configurar, Resultados, Buscar e Você", async ({
    page,
  }) => {
    await loginAdmin(page);
    const nomes = await faixa(page).getByRole("button").allTextContents();
    // O número da fila (quando há) vem colado ao nome do botão de Todo dia: «Todo dia6».
    expect(nomes.map((n) => n.trim().replace(/\d+$/, ""))).toEqual([
      "Todo dia",
      "Vender",
      "Agente",
      "Conexões",
      "Empresa",
      "Resultados",
      "Buscar",
      "Você",
    ]);
  });
});

test.describe("o painel recolhido, por escolha da pessoa", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await menuRecolhido(context, baseURL);
  });

  test("sobra só a faixa; escolher uma entrada abre o painel por cima, e Esc o fecha", async ({
    page,
  }) => {
    await loginAdmin(page);
    await expect(faixa(page)).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Recolher o painel" })).toHaveCount(0);

    await entrada(page, "Todo dia").click();
    await expect(sidebar(page)).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: /Conversas/ })).toBeVisible();

    // Por cima da tela, e não empurrando: a faixa segue com 80px de largura de coluna.
    const largura = await page.evaluate(
      () => document.querySelector("aside")!.getBoundingClientRect().width,
    );
    expect(largura, "o painel por cima não ocupa lugar na linha").toBeLessThanOrEqual(84);

    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toHaveCount(0);
    await expect(entrada(page, "Todo dia")).toBeFocused();

    // Recolhido, uma área de Configurar abre a gaveta (issue #189), e não o painel.
    await entrada(page, "Agente").click();
    await expect(gaveta(page).getByRole("link", { name: /Agentes/ })).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("«Fixar o painel ao lado» devolve o painel, e a escolha vale no próximo acesso", async ({
    page,
    context,
  }) => {
    await loginAdmin(page);
    await entrada(page, "Todo dia").click();
    await page.getByRole("button", { name: "Fixar o painel ao lado" }).click();
    await expect(sidebar(page)).toBeVisible();
    // A preferência é gravada por uma ação do servidor, em segundo plano: recarregar antes dela
    // terminar mediria o cookie de ANTES. Espera-se o estado (o cookie), não um relógio.
    await expect
      .poll(
        async () => (await context.cookies()).find((c) => c.name === "sidebar_collapsed")?.value,
      )
      .toBe("0");
    await page.reload();
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Recolher o painel" })).toBeVisible();
  });
});

test.describe("navegação agrupada", () => {
  // O painel ABERTO é o que estes casos medem: a preferência gravada por
  // `toggleSidebar` ("0" = aberto) vem antes do login.
  test.beforeEach(async ({ context, baseURL }) => {
    await menuExpandido(context, baseURL);
  });

  test("Todo dia é uma mesa: Leads e Gestão de Clientes CRM, nessa ordem", async ({ page }) => {
    await loginAdmin(page);

    const titulos = sidebar(page).getByRole("heading", { level: 3 });
    await expect(titulos.first()).toHaveText("Leads");
    await expect(titulos.nth(1)).toHaveText("Gestão de Clientes CRM");
    await expect(sidebar(page).getByRole("link", { name: /Conversas/ })).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE, "nav-sidebar-agrupado.png"),
      fullPage: true,
    });
  });

  test("chega nas Etapas do funil por Vender, sem passar por Configurações", async ({ page }) => {
    await loginAdmin(page);

    // O caso que originou tudo: o usuário não sabia que esta tela existia.
    //
    // ⚠️ "Funis" é o VIZINHO — a lista de funis, em /app/kanban. Um teste que clicasse
    // em "Funis" seguiria verde medindo a outra tela; por isso a asserção de URL é
    // específica (`settings/tenant/pipelines`).
    await entrada(page, "Vender").click();
    await expect(gaveta(page).getByRole("heading", { level: 2, name: "Vender" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "nav-area-vender.png"), fullPage: true });

    await gaveta(page)
      .getByRole("link", { name: /Etapas do funil/ })
      .click();
    await page.waitForURL(/settings\/tenant\/pipelines/);
    await expect(page.getByRole("heading", { name: "Etapas do funil", level: 1 })).toBeVisible();
  });

  test("Produtos, que não está na mesa, continua alcançável por Vender", async ({ page }) => {
    // Tirar da mesa não pode virar tela órfã: DoD 14 cobra porta.
    await loginAdmin(page);

    await expect(sidebar(page).getByRole("link", { name: "Produtos" })).toHaveCount(0);

    await entrada(page, "Vender").click();
    await gaveta(page)
      .getByRole("link", { name: /Produtos/ })
      .click();
    await page.waitForURL(/\/app\/products/);
  });

  test("e a lista de funis é a tela da mesa, com nome próprio", async ({ page }) => {
    await loginAdmin(page);
    await sidebar(page).getByRole("link", { name: "Funis", exact: true }).click();
    await page.waitForURL(/\/app\/kanban/);
    await expect(page.getByRole("heading", { name: "Funis", level: 1 })).toBeVisible();
  });

  test("chega em Conhecimento, que só existia atrás das abas de IA, pela área Agente", async ({
    page,
  }) => {
    await loginAdmin(page);

    await entrada(page, "Agente").click();
    await expect(gaveta(page).getByRole("heading", { name: "Montar o agente" })).toBeVisible();
    await expect(gaveta(page).getByRole("heading", { name: "Ensinar o agente" })).toBeVisible();
    await expect(gaveta(page).getByRole("heading", { name: "Conectar a IA" })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-area-agente.png"), fullPage: true });

    await gaveta(page)
      .getByRole("link", { name: /Conhecimento/ })
      .click();
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * O canal oficial saiu de Configurações no PR #105 e virou aba de Conexões.
   * A porta, portanto, é Conexões — que agora vive na área Conexões da faixa.
   */
  test("chega ao canal oficial pela área Conexões, não por Configurações", async ({ page }) => {
    await loginAdmin(page);

    await entrada(page, "Conexões").click();
    await gaveta(page)
      .getByRole("link", { name: /^Conexões/ })
      .click();
    await page.waitForURL(/\/app\/connections/);
    await expect(page.getByRole("tab", { name: /oficial/i })).toBeVisible();
  });

  test("o ⌘K acha o canal oficial por nome, mesmo sem tela própria", async ({ page }) => {
    await loginAdmin(page);

    // Ninguém procura por "Conexões" quando quer o número oficial da Meta —
    // procura por "oficial". A busca varre a descrição além do rótulo.
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("oficial");
    await expect(page.getByRole("option", { name: /Conexões/ })).toBeVisible();
  });

  test("⌘K abre, filtra e navega", async ({ page }) => {
    await loginAdmin(page);

    await page.keyboard.press("ControlOrMeta+k");
    const busca = page.getByRole("combobox");
    await expect(busca).toBeVisible();

    await busca.fill("conhec");
    await expect(page.getByRole("option", { name: /Conhecimento/ })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-command-palette.png") });

    await page.keyboard.press("Enter");
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * A garantia que SUBSTITUI "o menu cabe em 900px sem rolar, no máximo 15 itens" (issues #188 e #189).
   *
   * O menu agora cresce: o painel lista a mesa de Todo dia e cada área abre a sua gaveta, que pode
   * rolar. O que não pode acontecer é um bloco inteiro — um título de grupo, um botão da faixa —
   * ficar abaixo da dobra, indistinguível de um bloco que não existe. É isso que se mede, por
   * ferramenta e nunca a olho: em Todo dia, todo título de grupo está dentro da área visível do
   * painel; em cada área, o mesmo na gaveta; e todo botão da faixa está dentro da janela.
   */
  test("nenhum bloco some abaixo da dobra, em nenhuma entrada da faixa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const entradas = ["Todo dia", "Vender", "Agente", "Conexões", "Empresa", "Resultados"];
    for (const nome of entradas) {
      if (nome !== "Todo dia") await entrada(page, nome).click();
      const m = await page.evaluate((nomeDaEntrada) => {
        const raiz =
          nomeDaEntrada === "Todo dia"
            ? document.querySelector('nav[aria-label="Navegação principal"]')!
            : document.querySelector('[role="dialog"]')!;
        const r = raiz.getBoundingClientRect();
        const botoes = [...document.querySelectorAll('nav[aria-label="Áreas do menu"] button')];
        return {
          titulos: raiz.querySelectorAll("h3").length,
          titulosFora: [...raiz.querySelectorAll("h3")].filter(
            (h) => h.getBoundingClientRect().bottom > r.bottom + 1,
          ).length,
          botoesFora: botoes.filter((b) => b.getBoundingClientRect().bottom > window.innerHeight)
            .length,
        };
      }, nome);
      expect(m.titulos, `${nome}: guarda de vacuidade`).toBeGreaterThan(0);
      expect(
        m.titulosFora,
        `${nome}: grupo inteiro invisível é o problema que viemos resolver`,
      ).toBe(0);
      expect(m.botoesFora, `${nome}: botão da faixa abaixo da dobra`).toBe(0);
      if (nome !== "Todo dia") {
        await page.keyboard.press("Escape");
        await expect(gaveta(page)).toHaveCount(0);
      }
    }
  });

  test("em 768px a faixa inteira continua à vista", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await loginAdmin(page);
    const fora = await page.evaluate(
      () =>
        [...document.querySelectorAll('nav[aria-label="Áreas do menu"] button')].filter(
          (b) => b.getBoundingClientRect().bottom > window.innerHeight,
        ).length,
    );
    expect(fora, "botão da faixa abaixo da dobra em 1280x768").toBe(0);
  });

  /**
   * O CELULAR (issue #190): a barra de baixo e as folhas substituem a gaveta lateral.
   *
   * O que só o navegador mede: que a barra é a única navegação (sem o botão antigo), que cada
   * folha cabe na janela e se deixa rolar, que todo alvo de toque tem 44 px, que nada estoura na
   * horizontal e que a última linha da tela não fica por baixo das abas. Tudo por
   * `getBoundingClientRect`, nunca a olho.
   *
   * Poucos testes e longos de propósito: cada `loginAdmin` espera a virada da janela TOTP e custa
   * até ~30 s, e a parte do CI que roda esta spec já anda perto do teto de tempo.
   */
  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    const barra = (page: Page) => page.getByRole("navigation", { name: "Menu do celular" });
    const aba = (page: Page, nome: string) =>
      barra(page).getByRole("button", { name: new RegExp(`^${nome}`) });

    test("em 390px o menu é a barra de baixo; Todo dia abre a folha, escolher uma tela a fecha, e Conversas vai direto", async ({
      page,
    }) => {
      await loginAdmin(page);

      await expect(page.getByRole("button", { name: "Abrir navegação" })).toHaveCount(0);
      await expect(faixa(page), "a faixa do computador fica fora da árvore no celular").toHaveCount(
        0,
      );
      await expect(barra(page)).toBeVisible();
      await expect(barra(page).getByRole("link", { name: /^Conversas/ })).toBeVisible();
      for (const nome of ["Todo dia", "Configurar", "Resultados"]) {
        await expect(aba(page, nome)).toBeVisible();
      }
      await expectSemOverflowHorizontal(page, "shell mobile após login");

      // A barra está dentro da janela, ocupa a largura toda e cada aba tem alvo de 44 px.
      const m = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Menu do celular"]')!;
        const r = nav.getBoundingClientRect();
        return {
          base: r.bottom,
          largura: r.width,
          vh: window.innerHeight,
          // `clientWidth`, e não `innerWidth`: a janela de teste tem barra de rolagem, e a barra
          // fixa vai até a borda do que é conteúdo.
          vw: document.documentElement.clientWidth,
          alvos: [...nav.querySelectorAll("a, button")].map(
            (e) => e.getBoundingClientRect().height,
          ),
        };
      });
      expect(m.base, "a barra encosta no fundo da janela").toBeCloseTo(m.vh, 0);
      expect(m.largura).toBeCloseTo(m.vw, 0);
      expect(m.alvos.length, "guarda de vacuidade: as quatro abas").toBe(4);
      for (const h of m.alvos) expect(h).toBeGreaterThanOrEqual(44);

      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-barra-de-baixo.png"),
        fullPage: true,
      });

      await aba(page, "Todo dia").click();
      const folha = page.getByRole("dialog", { name: "Todo dia" });
      await expect(folha).toBeVisible();
      await expect(folha.getByTestId("mesa-de-trabalho")).toBeVisible();
      await expectSemOverflowHorizontal(page, "folha de Todo dia aberta");
      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-folha-todo-dia.png"),
        fullPage: true,
      });

      await folha.getByRole("link", { name: "Funis", exact: true }).click();
      await page.waitForURL(/\/app\/kanban/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após navegar pela folha");

      // Conversas não abre folha: leva direto, e a aba da tela atual é marcada.
      await barra(page)
        .getByRole("link", { name: /^Conversas/ })
        .click();
      await page.waitForURL(/\/app\/inbox/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(barra(page).getByRole("link", { name: /^Conversas/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    /**
     * A garantia que SUBSTITUI «o menu cabe em 900 px sem rolar» no celular: nenhum bloco some
     * abaixo da dobra. Cada folha cabe na janela, rola por dentro, e o último link — depois de
     * rolar até o fim — fica acima do rodapé dela.
     */
    test("nenhum bloco some: cada folha cabe na janela, tem alvos de 44 px e chega ao último link; Esc devolve o foco", async ({
      page,
    }) => {
      await loginAdmin(page);
      for (const nome of ["Todo dia", "Configurar", "Resultados"]) {
        await aba(page, nome).click();
        const folha = page.getByRole("dialog", { name: nome });
        await expect(folha).toBeVisible();
        const m = await folha.evaluate((d) => {
          const r = d.getBoundingClientRect();
          const corpo = d.querySelector<HTMLElement>(".overflow-y-auto")!;
          const links = [...corpo.querySelectorAll("a")];
          corpo.scrollTop = corpo.scrollHeight;
          const ultimo = links[links.length - 1]!.getBoundingClientRect();
          const rodape = d.querySelector("footer")!.getBoundingClientRect();
          return {
            topo: r.top,
            base: r.bottom,
            vh: window.innerHeight,
            links: links.length,
            h3: corpo.querySelectorAll("h3").length,
            menorAlvo: Math.min(
              ...[...d.querySelectorAll("a, button")].map((e) => e.getBoundingClientRect().height),
            ),
            ultimoAcimaDoRodape: ultimo.bottom <= rodape.top + 1,
            semRolagemH: corpo.scrollWidth <= corpo.clientWidth + 1,
          };
        });
        expect(m.links, `${nome}: guarda de vacuidade`).toBeGreaterThan(5);
        expect(m.h3, `${nome}: grupos`).toBeGreaterThan(0);
        expect(m.topo, `${nome}: a folha começa dentro da janela`).toBeGreaterThanOrEqual(0);
        expect(m.base, `${nome}: a folha termina na janela`).toBeLessThanOrEqual(m.vh + 1);
        expect(m.menorAlvo, `${nome}: alvo de toque`).toBeGreaterThanOrEqual(44);
        expect(m.ultimoAcimaDoRodape, `${nome}: o último link fica à vista depois de rolar`).toBe(
          true,
        );
        expect(m.semRolagemH, `${nome}: sem rolagem horizontal`).toBe(true);
        await expectSemOverflowHorizontal(page, `folha de ${nome}`);

        if (nome === "Configurar") {
          for (const area of ["Vender", "Agente", "Conexões", "Empresa"]) {
            await expect(folha.getByRole("heading", { name: area, exact: true })).toBeVisible();
          }
          await page.screenshot({
            path: path.join(EVIDENCE, "nav-mobile-390-folha-configurar.png"),
            fullPage: true,
          });
        }

        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(aba(page, nome), `${nome}: o foco volta à aba`).toBeFocused();
      }
    });

    test("a última linha da tela não fica por baixo da barra, e o menu da conta leva Perfil, Segurança e Notificações", async ({
      page,
    }) => {
      await loginAdmin(page);
      await page.goto("/app/settings/profile");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const m = await page.evaluate(() => {
        const nav = document
          .querySelector('nav[aria-label="Menu do celular"]')!
          .getBoundingClientRect();
        const ultimo = document.querySelector("main")!.lastElementChild!.getBoundingClientRect();
        return { barraTopo: nav.top, ultimoBase: ultimo.bottom };
      });
      expect(m.ultimoBase, "o fim do conteúdo fica acima da barra").toBeLessThanOrEqual(
        m.barraTopo + 1,
      );

      await page.getByRole("button", { name: /Menu do usuário/ }).click();
      const menu = page.getByRole("menu");
      for (const nome of ["Perfil", "Segurança", "Notificações"]) {
        const item = menu.getByRole("menuitem", { name: nome });
        await expect(item).toBeVisible();
        const h = await item.evaluate((e) => e.getBoundingClientRect().height);
        expect(h, `${nome}: alvo de toque`).toBeGreaterThanOrEqual(44);
      }
    });

    test("um atendente não vê a área Agente na folha de Configurar", async ({ page }) => {
      await login(page, creds.users.agent!.email);
      await expect(barra(page).getByRole("link", { name: /^Conversas/ })).toBeVisible();
      await aba(page, "Configurar").click();
      const folha = page.getByRole("dialog", { name: "Configurar" });
      await expect(folha.getByRole("heading", { name: "Vender", exact: true })).toBeVisible();
      await expect(folha.getByRole("heading", { name: "Agente", exact: true })).toHaveCount(0);
    });
  });

  test("as telas de Empresa continuam alcançáveis: Dados da empresa, Equipe e Plano", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await loginAdmin(page);

    await entrada(page, "Empresa").click();
    for (const nome of [/Dados da empresa/, /Equipe/, /Plano e cobrança/]) {
      await expect(gaveta(page).getByRole("link", { name: nome }).first()).toBeVisible();
    }
  });

  test("um agent não vê a entrada Agente nem um grupo que a permissão esvaziou", async ({
    page,
  }) => {
    await login(page, creds.users.agent!.email);

    await expect(faixa(page)).toBeVisible();
    await expect(faixa(page).getByRole("button", { name: /^Agente/ })).toHaveCount(0);
    await expect(sidebar(page).getByRole("heading", { name: "Leads" })).toBeVisible();
  });
});

/**
 * A GAVETA das áreas de Configurar e Resultados (issue #189), pela tela.
 *
 * O jsdom não faz layout, então largura, colunas e o escurecimento do fundo só se provam aqui,
 * com `getBoundingClientRect`/`getComputedStyle`, e nunca a olho.
 */
test.describe("a gaveta das áreas", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await menuExpandido(context, baseURL);
  });

  const medirTiles = (page: Page) =>
    page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')!;
      const r = d.getBoundingClientRect();
      const tiles = [...d.querySelectorAll("li > a")];
      return {
        largura: r.width,
        esquerda: r.left,
        colunas: new Set(tiles.map((a) => Math.round(a.getBoundingClientRect().left))).size,
        tiles: tiles.length,
        // Texto cortado na horizontal: a caixa do tile é menor que o conteúdo dele.
        cortados: tiles.filter((a) => a.scrollWidth > a.clientWidth + 1).length,
        transbordaGaveta: d.scrollWidth > d.clientWidth + 1,
      };
    });

  test("abre com ~700px, duas colunas e o fundo escurecido, ao lado da faixa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);
    await entrada(page, "Agente").click();
    await expect(gaveta(page)).toBeVisible();

    const m = await medirTiles(page);
    expect(m.largura, "a gaveta tem cerca de 700px").toBeGreaterThanOrEqual(690);
    expect(m.largura, "a gaveta tem cerca de 700px").toBeLessThanOrEqual(710);
    expect(m.esquerda, "ela nasce encostada na faixa de 80px").toBeGreaterThanOrEqual(78);
    expect(m.esquerda).toBeLessThanOrEqual(82);
    expect(m.tiles, "guarda de vacuidade").toBeGreaterThan(3);
    expect(m.colunas, "duas colunas").toBe(2);
    expect(m.cortados, "nenhuma tela com texto cortado").toBe(0);

    const fundo = await gaveta(page).evaluate(
      (d) => getComputedStyle(d.previousElementSibling!).backgroundColor,
    );
    expect(fundo, "o fundo atrás da gaveta é escurecido (translúcido, não transparente)").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    await page.screenshot({ path: path.join(EVIDENCE, "gaveta-agente-1280.png") });
  });

  test("fecha com o ×, com Esc e com um clique fora; e o foco volta ao botão da faixa", async ({
    page,
  }) => {
    await loginAdmin(page);

    await entrada(page, "Vender").click();
    await gaveta(page).getByRole("button", { name: "Fechar" }).click();
    await expect(gaveta(page)).toHaveCount(0);
    await expect(entrada(page, "Vender")).toBeFocused();

    await entrada(page, "Conexões").click();
    await page.keyboard.press("Escape");
    await expect(gaveta(page)).toHaveCount(0);
    await expect(entrada(page, "Conexões")).toBeFocused();

    await entrada(page, "Resultados").click();
    await page.mouse.click(1200, 450);
    await expect(gaveta(page)).toHaveCount(0);
  });

  test("escolher uma tela fecha a gaveta, e o painel continua em Todo dia", async ({ page }) => {
    await loginAdmin(page);
    await entrada(page, "Vender").click();
    await gaveta(page)
      .getByRole("link", { name: /Produtos/ })
      .click();
    await page.waitForURL(/\/app\/products/);
    await expect(gaveta(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Todo dia" })).toBeVisible();
    await expect(entrada(page, "Vender")).toHaveAttribute("aria-current", "true");
  });

  test("prende o foco dentro dela enquanto aberta", async ({ page }) => {
    await loginAdmin(page);
    await entrada(page, "Empresa").click();
    const voltas = (await gaveta(page).getByRole("link").count()) + 3;
    for (let i = 0; i < voltas; i++) {
      await page.keyboard.press("Tab");
      const dentro = await page.evaluate(() =>
        document.querySelector('[role="dialog"]')!.contains(document.activeElement),
      );
      expect(dentro, `Tab ${i + 1} saiu da gaveta`).toBe(true);
    }
  });

  test("com movimento reduzido ela aparece sem animação", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAdmin(page);
    await entrada(page, "Resultados").click();
    const animacao = await gaveta(page).evaluate((d) => getComputedStyle(d).animationName);
    expect(animacao).toBe("none");
  });

  test("em janela estreita (768px) vira uma coluna, sem cortar texto", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await loginAdmin(page);
    await entrada(page, "Agente").click();
    const m = await medirTiles(page);
    expect(m.tiles, "guarda de vacuidade").toBeGreaterThan(3);
    expect(m.colunas, "uma coluna").toBe(1);
    expect(m.cortados, "nenhuma tela com texto cortado").toBe(0);
    expect(m.transbordaGaveta, "a gaveta não rola na horizontal").toBe(false);
    await page.screenshot({ path: path.join(EVIDENCE, "gaveta-agente-768.png") });
  });
});

/**
 * O manual do usuário, dentro do próprio sistema: o link no rodapé do painel (e no menu
 * «Você»), e a rota `/manual` por trás dele.
 *
 * Duas coisas só se provam no navegador contra o servidor de verdade: que o link abre o
 * manual numa aba nova, e que a imagem do manual — que o `proxy` deixa passar por terminar
 * em `.png` — não é pública.
 */
test.describe("o manual dentro do sistema", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await menuExpandido(context, baseURL);
  });

  test("o link 'Manual' fica no rodapé do painel e abre o manual numa aba nova", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const manual = sidebar(page)
      .locator("xpath=..")
      .getByRole("link", { name: "Manual", exact: true });
    await expect(manual).toBeVisible();
    await expect(manual).toHaveAttribute("href", "/manual/index.html");
    await expect(manual).toHaveAttribute("target", "_blank");

    const [aba] = await Promise.all([context.waitForEvent("page"), manual.click()]);
    await aba.waitForLoadState("domcontentloaded");
    expect(new URL(aba.url()).pathname).toBe("/manual/index.html");
    // O título muda com a página em que o manual abre; "Manual" está em todas.
    await expect(aba).toHaveTitle(/Manual/);
    await aba.close();
  });

  test("logado, a página e um print do manual chegam; sem login, nenhum dos dois", async ({
    page,
    browser,
    baseURL,
  }) => {
    await loginAdmin(page);

    const pagina = await page.request.get("/manual/index.html");
    expect(pagina.status()).toBe(200);
    expect(pagina.headers()["content-type"]).toContain("text/html");
    const html = await pagina.text();
    expect(html).toContain("Manual do usuário");

    const print = /src="(img\/[^"]+\.png)"/.exec(html)?.[1];
    expect(print, "o manual tem ao menos um print").toBeTruthy();
    const imagem = await page.request.get(`/manual/${print}`);
    expect(imagem.status()).toBe(200);
    expect(imagem.headers()["content-type"]).toBe("image/png");
    expect((await imagem.body()).byteLength).toBeGreaterThan(1000);

    const semLogin = await browser.newContext({ baseURL });
    try {
      const paginaSemLogin = await semLogin.request.get("/manual/index.html", { maxRedirects: 0 });
      expect([307, 308], "sem sessão a página manda para o login").toContain(
        paginaSemLogin.status(),
      );
      expect(paginaSemLogin.headers()["location"] ?? "").toContain("/login");

      // O caminho que o proxy NÃO guarda: é a rota que tem de recusar.
      const imagemSemLogin = await semLogin.request.get(`/manual/${print}`, { maxRedirects: 0 });
      expect(imagemSemLogin.status()).toBe(401);
    } finally {
      await semLogin.close();
    }
  });

  test("o que não é a página nem um print não sai de lá", async ({ page }) => {
    await loginAdmin(page);
    for (const caminho of [
      "/manual/README.md",
      "/manual/modelo.html",
      "/manual/conteudo/ia/agentes.html",
    ]) {
      const r = await page.request.get(caminho);
      expect(r.status(), caminho).toBe(404);
    }
  });
});

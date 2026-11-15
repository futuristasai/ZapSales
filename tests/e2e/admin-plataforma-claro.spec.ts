/**
 * A ADMINISTRAÇÃO DA INSTALAÇÃO QUE UM LEIGO ENTENDE (issue #308, Entrega 1), PELA TELA.
 *
 * O dono da VPS abria `/admin` e via 21 itens soltos, metade em inglês ("Tenants",
 * "Audit", "Usage"), nenhum explicando o que fazia, e um painel de cinco números que
 * não se clicavam. Esta spec prova, como o dono faria:
 *
 *   1. o menu tem cinco grupos com título, e cada item mostra uma frase de ajuda ao
 *      passar o mouse E ao receber foco do teclado; numa tela de notebook (900 px) o
 *      título do grupo continua visível ao rolar;
 *   2. toda tela do catálogo abre com o MESMO cabeçalho (título = nome do menu, para
 *      que serve, quando usar), o item fica marcado no menu — inclusive numa subpágina —
 *      e a aba do navegador diz o nome da tela;
 *   3. o Painel tem o checklist "Sua instalação está pronta?" e cartões que levam à lista;
 *   4. o endereço antigo `/admin/modulos` leva ao bloco Módulos de Recursos opcionais;
 *   5. no celular, a gaveta mostra os mesmos grupos, e a ajuda está no topo da tela.
 *
 * Medidas por ferramenta (`getBoundingClientRect`/`getComputedStyle`), nunca a olho.
 * As capturas vão para `evidence/admin-plataforma-claro/`, publicadas pelo CI.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { CATALOGO_DO_ADMIN, GRUPOS_DO_ADMIN } from "@/lib/admin/catalogo";

import { expect, test } from "./helpers/test";

import { lerCreds, loginComoDono } from "./helpers/login-admin";
import { afirmarDonoDoServidor } from "./utils/precondicao";

const EVIDENCIA = path.join(process.cwd(), "evidence", "admin-plataforma-claro");
function evidencia(nome: string): string {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  return path.join(EVIDENCIA, nome);
}

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  await afirmarDonoDoServidor(lerCreds().users.dono!.email);
});

test("o menu tem cinco grupos e cada item se explica no mouse e no teclado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginComoDono(page, lerCreds());
  await page.goto("/admin/dashboard");

  const menu = page.getByRole("navigation", { name: "Navegação da administração" });
  for (const grupo of GRUPOS_DO_ADMIN) {
    await expect(menu.getByRole("heading", { name: grupo.label, exact: true })).toBeVisible();
  }
  // Nenhum nome antigo voltou ao menu.
  for (const antigo of [
    "Tenants",
    "Audit",
    "Usage",
    "Users",
    "Platform Admins",
    "Inbox",
    "Módulos",
  ]) {
    await expect(menu.getByRole("link", { name: antigo, exact: true })).toHaveCount(0);
  }

  // Mouse: a dica de "Empresas" aparece.
  const empresas = menu.getByRole("link", { name: "Empresas", exact: true });
  await empresas.hover();
  const dicaEmpresas = CATALOGO_DO_ADMIN.find((i) => i.href === "/admin/tenants")!.dica;
  await expect(page.getByRole("tooltip")).toContainText(dicaEmpresas);
  await page.screenshot({ path: evidencia("menu-dica-no-mouse.png") });

  // Teclado: o foco num item abre a dica dele, sem mouse.
  await page.mouse.move(900, 600);
  await page.keyboard.press("Escape");
  const registro = menu.getByRole("link", { name: "Registro de ações", exact: true });
  await registro.focus();
  const dicaRegistro = CATALOGO_DO_ADMIN.find((i) => i.href === "/admin/audit")!.dica;
  await expect(page.getByRole("tooltip")).toContainText(dicaRegistro);

  // 900 px: ou o menu cabe inteiro, ou o título do grupo gruda no topo ao rolar.
  const medida = await menu.evaluate((nav) => ({
    rola: nav.scrollHeight > nav.clientHeight + 1,
    posicaoDoTitulo: getComputedStyle(nav.querySelector("h2")!).position,
  }));
  if (medida.rola) {
    expect(medida.posicaoDoTitulo).toBe("sticky");
    await menu.evaluate((nav) => nav.scrollTo(0, nav.scrollHeight));
    const titulo = menu.getByRole("heading", { name: "Integrações", exact: true });
    const [caixaDoTitulo, caixaDoMenu] = await Promise.all([
      titulo.evaluate((el) => el.getBoundingClientRect().toJSON()),
      menu.evaluate((el) => el.getBoundingClientRect().toJSON()),
    ]);
    expect(caixaDoTitulo.top).toBeGreaterThanOrEqual(caixaDoMenu.top - 1);
    expect(caixaDoTitulo.bottom).toBeLessThanOrEqual(caixaDoMenu.bottom + 1);
  }
  await page.screenshot({ path: evidencia("menu-900px.png") });
});

test("toda tela abre com o cabeçalho padrão, marcada no menu e com o nome na aba", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginComoDono(page, lerCreds());

  for (const item of CATALOGO_DO_ADMIN) {
    await page.goto(item.href);
    const cabecalho = page.getByTestId("cabecalho-da-plataforma").first();
    await expect(cabecalho, `${item.href} sem o cabeçalho padrão`).toBeVisible();
    await expect(cabecalho.getByRole("heading", { level: 1 })).toHaveText(item.label);
    await expect(cabecalho).toContainText(item.paraQueServe);
    await expect(cabecalho).toContainText(item.quandoUsar);
    await expect(
      page
        .getByRole("navigation", { name: "Navegação da administração" })
        .locator(`a[aria-current="page"]`),
    ).toHaveAttribute("href", item.href);
    expect(await page.title(), `${item.href}: aba do navegador`).toContain(item.label);
  }
  await page.goto("/admin/tenants");
  await page.screenshot({ path: evidencia("empresas.png"), fullPage: true });

  // Subpágina: o item da tela-mãe continua marcado.
  await page.goto("/admin/tenants/new");
  await expect(
    page
      .getByRole("navigation", { name: "Navegação da administração" })
      .locator(`a[aria-current="page"]`),
  ).toHaveAttribute("href", "/admin/tenants");
  // ...e ela abre com a ajuda da tela-mãe, com o título do próprio registro.
  const contexto = page.getByTestId("contexto-da-subpagina");
  await expect(contexto).toContainText("Empresas e pessoas");
  await expect(contexto.getByRole("link", { name: "Empresas", exact: true })).toHaveAttribute(
    "href",
    "/admin/tenants",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nova empresa");
  expect(await page.title()).toContain("Nova empresa · Empresas · Administração");
});

test("o Painel diz o que falta configurar e os cartões levam à lista", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginComoDono(page, lerCreds());
  await page.goto("/admin/dashboard");

  const checklist = page.getByTestId("checklist-da-instalacao");
  await expect(
    checklist.getByRole("heading", { name: "Sua instalação está pronta?" }),
  ).toBeVisible();
  // Recolhido ou aberto, os cinco itens estão lá; abrir pelo resumo é um clique.
  const aberto = await checklist.locator("details").evaluate((d) => (d as HTMLDetailsElement).open);
  if (!aberto) await checklist.locator("summary").click();
  for (const id of ["email", "marca", "cadastro", "meta", "google_agenda"]) {
    await expect(checklist.getByTestId(`checklist-${id}`)).toBeVisible();
  }
  await expect(checklist.getByTestId("checklist-email")).toContainText("Obrigatório");
  await expect(checklist.getByTestId("checklist-google_agenda")).toContainText("Opcional");

  // Cada cartão diz em palavras o que o número quer dizer, e leva à lista.
  const cartaoLgpd = page.getByTestId("cartao-lgpd");
  await expect(cartaoLgpd).toBeVisible({ timeout: 30_000 });
  await expect(cartaoLgpd).toContainText(/prazo/);
  await page.screenshot({ path: evidencia("painel.png"), fullPage: true });
  await cartaoLgpd.click();
  await expect(page).toHaveURL(/\/admin\/lgpd$/);

  // O "Configurar"/"Revisar" do checklist leva à tela do recurso.
  await page.goto("/admin/dashboard");
  if (!(await checklist.locator("details").evaluate((d) => (d as HTMLDetailsElement).open))) {
    await checklist.locator("summary").click();
  }
  await checklist.getByTestId("checklist-email").getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/email$/);
});

test("o endereço antigo de Módulos leva ao bloco de módulos de Recursos opcionais", async ({
  page,
}) => {
  await loginComoDono(page, lerCreds());
  await page.goto("/admin/modulos");
  await expect(page).toHaveURL(/\/admin\/sistema#modulos$/);
  await expect(page.getByRole("heading", { name: "Módulos", exact: true })).toBeVisible();
});

test("no celular, a gaveta mostra os mesmos grupos e a ajuda está no topo da tela", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginComoDono(page, lerCreds());
  await page.goto("/admin/audit");

  // A ajuda da tela está visível sem passar o mouse (no toque não existe hover).
  const item = CATALOGO_DO_ADMIN.find((i) => i.href === "/admin/audit")!;
  await expect(page.getByTestId("cabecalho-da-plataforma")).toContainText(item.paraQueServe);

  await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
  const gaveta = page.getByRole("dialog");
  for (const grupo of GRUPOS_DO_ADMIN) {
    await expect(gaveta.getByRole("heading", { name: grupo.label, exact: true })).toBeVisible();
  }
  // Sem rolagem lateral da página no celular.
  const larguras = await page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    tela: window.innerWidth,
  }));
  expect(larguras.pagina).toBeLessThanOrEqual(larguras.tela);
  await page.screenshot({ path: evidencia("celular-gaveta.png") });
});

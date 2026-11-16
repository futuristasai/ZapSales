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
 *   5. no celular, a gaveta mostra os mesmos grupos, e a ajuda está no topo da tela;
 *   6. o Painel diz se está tudo bem (issue #310): banco, WhatsApp por QR code, Redis e
 *      fila em verde/vermelho com a frase do que fazer, e o cartão da licença — sem
 *      segredo nem endereço interno na página.
 *
 * Medidas por ferramenta (`getBoundingClientRect`/`getComputedStyle`), nunca a olho.
 * As capturas vão para `evidence/admin-plataforma-claro/`, publicadas pelo CI.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { CATALOGO_DO_ADMIN, GRUPOS_DO_ADMIN } from "@/lib/admin/catalogo";
import { traduzir } from "@/lib/i18n/dicionario";
import type { EstadoDaLicenca } from "@/lib/licenca/decidir";
import { textoDaLicenca } from "@/lib/licenca/textos";

import { expect, test } from "./helpers/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
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

/**
 * "ESTÁ TUDO BEM?" (issue #310). A régua de cada serviço é o ALCANCE REAL deste ambiente,
 * medido pela própria spec com o mesmo endereço que o app recebe (`.env.e2e`): no CI, o
 * gerador aponta WAHA e Redis para portas onde nada escuta — o serviço está fora do ar de
 * verdade, e o Painel tem de dizer isso com a frase e o comando. A fila é parada de
 * propósito: um evento sem consumidor, vencido há 20 minutos, apagado no fim.
 */
test("o Painel diz se a instalação está saudável e mostra a licença, sem segredo", async ({
  page,
}) => {
  const c = credenciaisSupabaseDeTeste();
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const { data: org, error: erroOrg } = await db
    .from("organizations")
    .select("id")
    .limit(1)
    .single();
  if (erroOrg) throw erroOrg;
  const { data: evento, error: erroEvento } = await db
    .from("event_log")
    .insert({
      organization_id: org.id,
      event_type: "teste_e2e.fila_parada",
      entity_kind: "teste_e2e",
      status: "pending",
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (erroEvento) throw erroEvento;

  const alcanca = async (url: string | undefined, init?: RequestInit) => {
    if (!url) return null; // não configurado
    try {
      await fetch(url, { ...init, signal: AbortSignal.timeout(3_000) });
      return true;
    } catch {
      return false;
    }
  };
  const qrNoAr = await alcanca(process.env.WAHA_API_BASE_URL);
  const redisNoAr = await alcanca(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    body: JSON.stringify(["PING"]),
  });

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginComoDono(page, lerCreds());
    await page.goto("/admin/dashboard");

    const saude = page.getByTestId("saude-da-instalacao");
    await expect(saude.getByRole("heading", { name: "Saúde da instalação" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(saude.getByTestId("saude-banco")).toHaveAttribute("data-estado", "ok");
    await expect(saude.getByTestId("saude-banco")).toContainText("Funcionando");

    // A fila parada: vermelha, com a frase e o comando que a resolve.
    const fila = saude.getByTestId("saude-fila");
    await expect(fila).toHaveAttribute("data-estado", "fora");
    await expect(fila).toContainText("Fora do ar");
    await expect(fila).toContainText("O agendador pode estar parado");
    await expect(saude.getByTestId("saude-fila-comando")).toHaveText(
      "sudo docker compose up -d scheduler worker",
    );
    await expect(saude.getByTestId("saude-resumo")).toHaveText("Algo precisa de atenção.");

    for (const [id, noAr, frase] of [
      ["whatsapp", qrNoAr, "O serviço que conecta os números por QR code não respondeu"],
      ["redis", redisNoAr, "O Redis não respondeu"],
    ] as const) {
      const item = saude.getByTestId(`saude-${id}`);
      if (noAr === false) {
        await expect(item, `${id} está fora do ar neste ambiente`).toHaveAttribute(
          "data-estado",
          "fora",
        );
        await expect(item).toContainText(frase);
        await expect(saude.getByTestId(`saude-${id}-comando`)).toContainText(
          "sudo docker compose up -d",
        );
      } else if (noAr === null) {
        await expect(item).toHaveAttribute("data-estado", "nao_configurado");
      } else {
        // Alcançável não garante credencial certa; só garante que não é "fora do ar".
        await expect(item).not.toContainText(frase);
      }
    }

    // A licença: a situação real, com as mesmas frases da tela de licença.
    const licenca = page.getByTestId("cartao-licenca");
    await expect(licenca).toBeVisible();
    const estado = (await licenca.getAttribute("data-licenca-estado")) as EstadoDaLicenca;
    expect(estado).not.toBe("ilegivel");
    await expect(licenca).toContainText(textoDaLicenca(estado, null, (t) => t).titulo);

    // Nenhum segredo nem endereço interno na página — HTML e o payload do servidor juntos.
    const html = await page.content();
    const segredos = Object.entries({
      WAHA_API_KEY: process.env.WAHA_API_KEY,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: c.serviceRole,
      INTERNAL_CRON_SECRET: process.env.INTERNAL_CRON_SECRET,
      WAHA_API_BASE_URL: process.env.WAHA_API_BASE_URL,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    }).filter(([, v]) => typeof v === "string" && v.length >= 8);
    expect(segredos.length, "a varredura precisa ter o que procurar").toBeGreaterThan(1);
    for (const [nome, valor] of segredos) {
      expect(html.includes(valor!), `${nome} apareceu no Painel`).toBe(false);
    }
    await saude.scrollIntoViewIfNeeded();
    await page.screenshot({ path: evidencia("painel-saude-e-licenca.png"), fullPage: true });

    // Resolvida a causa, "Conferir de novo" lê de novo e a fila volta ao verde. Mas o e2e
    // não tem agendador: eventos que OUTRAS specs emitiram também podem estar parados de
    // verdade. O verde só é exigido quando nenhum outro está atrasado — senão o vermelho
    // continua sendo a resposta certa, e é ela que se afirma.
    await db.from("event_log").delete().eq("id", evento.id);
    const limite = new Date(Date.now() - 9 * 60_000).toISOString();
    const { count: outrosParados, error: erroOutros } = await db
      .from("event_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .or(`and(next_attempt_at.is.null,created_at.lt.${limite}),next_attempt_at.lt.${limite}`);
    if (erroOutros) throw erroOutros;
    await saude.getByRole("button", { name: "Conferir de novo" }).click();
    if ((outrosParados ?? 0) === 0) {
      await expect(fila).toHaveAttribute("data-estado", "ok", { timeout: 30_000 });
      await expect(saude.getByTestId("saude-fila-comando")).toHaveCount(0);
    } else {
      test.info().annotations.push({
        type: "fila",
        description: `${outrosParados} evento(s) de outras specs parados (o e2e não tem agendador): a fila segue vermelha, como deve`,
      });
      await expect(fila).toHaveAttribute("data-estado", "fora");
    }

    // No celular: um bloco embaixo do outro, sem rolagem lateral.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard");
    await expect(saude.getByTestId("saude-banco")).toBeVisible({ timeout: 30_000 });
    await expect(licenca).toBeVisible();
    const medidas = await page.evaluate(() => {
      const s = document
        .querySelector('[data-testid="saude-da-instalacao"]')!
        .getBoundingClientRect();
      const l = document.querySelector('[data-testid="cartao-licenca"]')!.getBoundingClientRect();
      return {
        pagina: document.documentElement.scrollWidth,
        tela: window.innerWidth,
        licencaAbaixo: l.top >= s.bottom - 1,
      };
    });
    expect(medidas.pagina).toBeLessThanOrEqual(medidas.tela);
    expect(medidas.licencaAbaixo).toBe(true);
    await page.screenshot({
      path: evidencia("celular-painel-saude-e-licenca.png"),
      fullPage: true,
    });

    // "Ver a licença" leva à tela da licença.
    await licenca.getByRole("link", { name: "Ver a licença" }).click();
    await expect(page).toHaveURL(/\/app\/licenca$/);
  } finally {
    await db.from("event_log").delete().eq("id", evento.id);
  }
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

/**
 * Pt e MAIS UM idioma (issue #309): o menu, o cabeçalho, a aba e a gaveta do celular
 * saem do catálogo traduzido. O idioma é o do próprio dono (`user_metadata.locale`,
 * primeiro elo de `lib/auth/server.ts`), trocado pela service role e devolvido no fim —
 * o Playwright roda com um worker só, então nenhuma outra spec vê o dono em inglês.
 */
test("em inglês, o menu, o cabeçalho, a aba e a gaveta saem do catálogo traduzido", async ({
  page,
}) => {
  const c = credenciaisSupabaseDeTeste();
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const email = lerCreds().users.dono!.email;
  let dono: { id: string; user_metadata: Record<string, unknown> } | undefined;
  for (let pagina = 1; pagina <= 5 && !dono; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    dono = data.users.find((u) => u.email === email);
    if (data.users.length < 200) break;
  }
  if (!dono) throw new Error(`o dono ${email} não existe neste banco`);
  const localeAntes = dono.user_metadata?.locale ?? null;

  const en = (texto: string) => traduzir(texto, "en");
  // Controle: se o catálogo não tivesse inglês, a spec passaria medindo português.
  for (const grupo of GRUPOS_DO_ADMIN) expect(en(grupo.label)).not.toBe(grupo.label);

  // Entra ANTES de trocar o idioma: a verificação em duas etapas também é traduzida, e o
  // ajudante de login procura os campos pelo nome em português ("Dígito 1").
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginComoDono(page, lerCreds());
  const trocar = await db.auth.admin.updateUserById(dono.id, {
    user_metadata: { ...dono.user_metadata, locale: "en" },
  });
  if (trocar.error) throw trocar.error;
  try {
    const item = CATALOGO_DO_ADMIN.find((i) => i.href === "/admin/audit")!;
    const menu = page.getByRole("navigation", { name: en("Navegação da administração") });
    // O usuário repassado pelo proxy vale até 30 s (`lib/auth/sessao-repassada.ts`):
    // recarrega até o idioma novo chegar, como em central-avisos-destino.spec.ts.
    await expect(async () => {
      await page.goto(item.href);
      await expect(menu.getByRole("heading", { name: en(GRUPOS_DO_ADMIN[0]!.label) })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 60_000 });

    for (const grupo of GRUPOS_DO_ADMIN) {
      await expect(menu.getByRole("heading", { name: en(grupo.label), exact: true })).toBeVisible();
      await expect(menu.getByRole("heading", { name: grupo.label, exact: true })).toHaveCount(0);
    }
    for (const i of CATALOGO_DO_ADMIN) {
      await expect(menu.getByRole("link", { name: en(i.label), exact: true })).toBeVisible();
    }
    const cabecalho = page.getByTestId("cabecalho-da-plataforma").first();
    await expect(cabecalho.getByRole("heading", { level: 1 })).toHaveText(en(item.label));
    await expect(cabecalho).toContainText(en(item.paraQueServe));
    await expect(cabecalho).toContainText(en(item.quandoUsar));
    expect(await page.title()).toContain(en(item.label));
    await page.screenshot({ path: evidencia("ingles-registro-de-acoes.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: en("Abrir menu de navegação") }).click();
    const gaveta = page.getByRole("dialog");
    for (const grupo of GRUPOS_DO_ADMIN) {
      await expect(gaveta.getByRole("heading", { name: en(grupo.label), exact: true })).toBeVisible();
    }
    await page.screenshot({ path: evidencia("ingles-celular-gaveta.png") });
  } finally {
    // `locale: null` é como o GoTrue apaga a chave (ele MESCLA o user_metadata). Uma falha
    // aqui não pode esconder a do teste: vira anotação, e a próxima spec do dono a vê.
    const { error } = await db.auth.admin.updateUserById(dono.id, {
      user_metadata: { ...dono.user_metadata, locale: localeAntes },
    });
    if (error) {
      test.info().annotations.push({
        type: "aviso",
        description: `não devolveu o idioma do dono: ${error.message}`,
      });
    }
  }
});

/**
 * A coluna de conversas não estica a página (issue #309): medido na produção, com 30
 * conversas a coluna passava de 1.900 px e o aviso "Selecione uma conversa" caía
 * abaixo da dobra. A medida não depende de quantas conversas o banco tem: a lista
 * cabe na janela e o aviso está à vista.
 */
test("Conversas de todas as empresas cabe na janela e mostra o aviso sem rolar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginComoDono(page, lerCreds());
  await page.goto("/admin/inbox");
  const aviso = page.getByText("Selecione uma conversa para visualizar", { exact: true });
  await expect(aviso).toBeInViewport();
  const medida = await page.evaluate(() => ({
    coluna: document.querySelector("main aside")!.getBoundingClientRect().bottom,
    janela: window.innerHeight,
    pagina: document.documentElement.scrollHeight,
  }));
  expect(medida.coluna).toBeLessThanOrEqual(medida.janela + 1);
  expect(medida.pagina).toBeLessThanOrEqual(medida.janela + 1);
});

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { expect, test, type Page } from "./helpers/test";

/**
 * A FAIXA E A TELA DE LICENÇA, PELA TELA — o que uma instalação vê e o que o administrador faz (#222, ADR-0005).
 *
 * Ambiente: o mesmo da instalação fresca estilo VPS. O app roda em PRODUÇÃO (`next start`), cuja lista de chaves
 * públicas do selo é VAZIA — então nenhum selo é aceito, e os estados que se alcançam aqui são os que não
 * dependem de um selo válido: **sem licença** (toda instalação nova), **bloqueada** (um bloqueio registrado) e,
 * pelo modo, **observação** (`sombra`) e **em vigor** (`valendo`). Selo temporário e permanente válidos estão
 * provados em testes de unidade, com a chave de teste.
 *
 * O estado da licença é DA INSTALAÇÃO, não de uma organização: esta spec o altera e o restaura, e espera a
 * memória de 30 s do app expirar antes de devolver o ambiente (a próxima spec não pode herdar uma faixa vermelha).
 * Os workers são um só (`workers: 1`), então nenhuma outra spec roda enquanto isto acontece.
 *
 * Três provas:
 *  1. **Primeira impressão**: a instalação nova mostra "Uso não comercial" ao administrador, numa linha, sem
 *     cobrir o menu nem a primeira tela — e quem atende não vê faixa nenhuma.
 *  2. **A tela de licença**: a faixa leva a ela, ela mostra o identificador, e "tentar renovar agora" numa
 *     instalação que nunca foi ativada responde com a verdade, sem mexer em nada.
 *  3. **Bloqueio**: observação (a faixa diz que segue funcionando) e depois em vigor (toda navegação vai para a tela
 *     de licença, a API responde 403 `license_blocked`, o cron 503, e a saúde, a exportação e a tela de licença
 *     seguem abertas).
 */

const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { persistSession: false },
});
const senha = `Local-${randomUUID()}!`;
const SUFIXO = randomUUID().slice(0, 8);
const EMAIL_ADMIN = `licenca-admin-${SUFIXO}@invariant.test`;
const EMAIL_ATENDENTE = `licenca-atendente-${SUFIXO}@invariant.test`;

let orgId = "";

async function criarUsuario(email: string, papel: "admin" | "agent"): Promise<void> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw error;
  const { error: erroVinculo } = await db.from("user_organizations").insert({
    organization_id: orgId,
    user_id: data.user.id,
    role: papel,
    accepted_at: new Date().toISOString(),
  });
  if (erroVinculo) throw erroVinculo;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
}

const faixaDeAviso = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Uso não comercial" });
const faixaDeBloqueio = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Licença bloqueada." });

async function restaurarEstado(): Promise<void> {
  await db
    .from("platform_licenca")
    .update({ modo: "sombra", bloqueio_codigo: null, bloqueio_em: null })
    .eq("id", 1);
}

test.describe("a faixa e a tela de licença", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.beforeAll(async () => {
    const { data, error } = await db
      .from("organizations")
      .insert({
        slug: `licenca-${SUFIXO}`,
        legal_name: `Licenca ${SUFIXO}`,
        display_name: `Licenca ${SUFIXO}`,
        onboarded_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    orgId = (data as { id: string }).id;
    await criarUsuario(EMAIL_ADMIN, "admin");
    await criarUsuario(EMAIL_ATENDENTE, "agent");
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    await restaurarEstado();
    if (orgId) await db.from("organizations").delete().eq("id", orgId);
    // O app lembra a decisão por 30 s: espera passar, para a próxima spec não herdar a faixa.
    await new Promise((resolver) => setTimeout(resolver, 35_000));
  });

  test("primeira impressão: o administrador vê o aviso numa linha, sem cobrir o menu; o atendente não vê nada", async ({
    page,
    browser,
  }) => {
    await restaurarEstado();
    await login(page, EMAIL_ADMIN);

    const faixa = faixaDeAviso(page);
    await expect(faixa).toBeVisible({ timeout: 60_000 });
    await expect(faixa).toContainText("Uso não comercial: uso em empresa exige licença.");
    // Informativa: `status`, nunca `alert` — não interrompe leitor de tela nem disputa com o aviso de conexão.
    await expect(page.getByRole("alert").filter({ hasText: /licen/i })).toHaveCount(0);

    // Medido por ferramenta, nunca a olho: uma linha, em fluxo normal, e a barra lateral inteira dentro da janela.
    const medidas = await page.evaluate(() => {
      const barra = document.querySelector('[role="status"][data-licenca-estado]') as HTMLElement;
      const lateral = document.querySelector("aside") as HTMLElement | null;
      const r = barra.getBoundingClientRect();
      return {
        altura: r.height,
        posicao: getComputedStyle(barra).position,
        lateralAbaixo: lateral ? lateral.getBoundingClientRect().bottom : null,
        janela: window.innerHeight,
      };
    });
    expect(medidas.altura).toBeLessThan(56);
    expect(medidas.posicao).toBe("static");
    // A faixa mora na coluna de conteúdo: a barra lateral não passa da borda (senão "Buscar" e a conta somem).
    if (medidas.lateralAbaixo !== null) {
      expect(medidas.lateralAbaixo).toBeLessThanOrEqual(medidas.janela + 1);
    }
    await page.screenshot({ path: "evidence/licenca/e2e-01-primeira-tela.png" });

    // Quem atende não tem o que fazer com o aviso: não vê faixa nenhuma.
    const contexto = await browser.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    const outra = await contexto.newPage();
    await login(outra, EMAIL_ATENDENTE);
    await outra.locator("aside").first().waitFor({ state: "attached", timeout: 60_000 });
    await expect(faixaDeAviso(outra)).toHaveCount(0);
    await expect(outra.getByRole("alert").filter({ hasText: /licen/i })).toHaveCount(0);
    await contexto.close();
  });

  test("a faixa leva à tela de licença, que mostra a verdade — e renovar sem ter ativado não mexe em nada", async ({
    page,
  }) => {
    await restaurarEstado();
    await login(page, EMAIL_ADMIN);
    await faixaDeAviso(page).getByRole("link", { name: "Ver licença" }).click();
    await page.waitForURL(/\/app\/licenca$/, { timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Uso não comercial" })).toBeVisible();
    await expect(page.getByText("Funcionando", { exact: true })).toBeVisible();
    await expect(page.getByText(/nada é restringido/)).toBeVisible();

    // O identificador mostrado é o do banco (o que o suporte vai pedir).
    const { data: linha } = await db
      .from("platform_licenca")
      .select("instalacao_id")
      .eq("id", 1)
      .single();
    const instalacaoId = (linha as { instalacao_id: string }).instalacao_id;
    await expect(page.getByText(instalacaoId)).toBeVisible();

    await page.getByRole("button", { name: "Tentar renovar agora" }).click();
    const resultado = page.getByTestId("licenca-resultado");
    await expect(resultado).toContainText("ainda não foi ativada", { timeout: 30_000 });
    await page.screenshot({ path: "evidence/licenca/e2e-02-tela-de-licenca.png" });

    // Nada foi alterado: continua sem ativação e sem bloqueio.
    const { data: depois } = await db
      .from("platform_licenca")
      .select("ativada_em, bloqueio_codigo, selo_atual")
      .eq("id", 1)
      .single();
    expect(depois).toEqual({ ativada_em: null, bloqueio_codigo: null, selo_atual: null });

    // A porta pelo menu: Configurações › Plano e regras.
    await page.goto("/app/settings");
    await expect(page.getByRole("link", { name: /^Licença/ }).first()).toHaveAttribute(
      "href",
      "/app/licenca",
    );
  });

  test("bloqueio: em observação a faixa diz que segue funcionando; em vigor, toda navegação vai à tela de licença e a saída continua aberta", async ({
    page,
    browser,
  }) => {
    await login(page, EMAIL_ADMIN);
    await expect(faixaDeAviso(page)).toBeVisible({ timeout: 60_000 });

    // ── Observação (sombra) + bloqueio registrado ───────────────────────────
    // Só o bloqueio, sem `ativada_em`: o gatilho do banco não deixa desfazer a ativação, e o ambiente tem de voltar.
    await db
      .from("platform_licenca")
      .update({ bloqueio_codigo: "reembolso", bloqueio_em: new Date().toISOString() })
      .eq("id", 1);
    // O app lembra a decisão por 30 s: recarrega até ela mudar.
    await expect
      .poll(
        async () => {
          await page.goto("/app/settings");
          return faixaDeBloqueio(page).count();
        },
        { timeout: 75_000, intervals: [5_000] },
      )
      .toBe(1);
    await expect(faixaDeBloqueio(page)).toContainText("O sistema segue funcionando por enquanto.");
    expect(new URL(page.url()).pathname).toBe("/app/settings");

    // Quem atende também vê: quando o produto para, ninguém fica sem saber por quê.
    const contexto = await browser.newContext({
      baseURL: test.info().project.use.baseURL as string,
    });
    const atendente = await contexto.newPage();
    await login(atendente, EMAIL_ATENDENTE);
    await expect(faixaDeBloqueio(atendente)).toBeVisible({ timeout: 60_000 });
    await contexto.close();

    // ── Em vigor (valendo) ──────────────────────────────────────────────────
    await db.from("platform_licenca").update({ modo: "valendo" }).eq("id", 1);
    await expect
      .poll(
        async () => {
          await page.goto("/app/settings");
          return new URL(page.url()).pathname;
        },
        { timeout: 75_000, intervals: [5_000] },
      )
      .toBe("/app/licenca");

    await expect(page.getByRole("heading", { name: "Licença bloqueada" })).toBeVisible();
    await expect(page.getByText("Os seus dados estão preservados.")).toBeVisible();
    await expect(page.getByTestId("licenca-motivo")).toHaveText("reembolso");
    await expect(page.getByText(/deixa de funcionar/)).toBeVisible();
    await page.screenshot({ path: "evidence/licenca/e2e-03-bloqueada-em-vigor.png" });

    // Qualquer outra tela do produto também vai parar aqui.
    await page.goto("/app/contacts");
    expect(new URL(page.url()).pathname).toBe("/app/licenca");

    // A exportação dos próprios dados continua aberta: o link da tela leva ao centro de privacidade.
    await page.getByRole("link", { name: "Exportar os dados" }).click();
    await page.waitForURL(/\/app\/lgpd/, { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/app\/lgpd/);

    // API de sessão: 403 license_blocked. Saúde: aberta.
    const api = await page.request.get("/api/v1/contacts");
    expect(api.status()).toBe(403);
    expect(((await api.json()) as { error: { code: string } }).error.code).toBe("license_blocked");
    const saude = await page.request.get("/api/v1/health");
    expect(saude.status()).not.toBe(403);
    expect(await saude.text()).not.toContain("license_blocked");

    // Cron: 503 com Retry-After (o agendador tenta de novo; nada se perde).
    const segredo = process.env.INTERNAL_CRON_SECRET || process.env.INTERNAL_SECRET;
    expect(segredo, "sem segredo interno não dá para chamar o cron").toBeTruthy();
    const cron = await page.request.post("/api/v1/cron/snooze-watcher", {
      headers: { authorization: `Bearer ${segredo}` },
    });
    expect(cron.status()).toBe(503);
    expect(cron.headers()["retry-after"]).toBe("300");
    // E o cron que renova a licença NÃO é recusado: é por ele que uma instalação barrada se destrava.
    const renovar = await page.request.get("/api/v1/cron/licenca-renovar", {
      headers: { authorization: `Bearer ${segredo}` },
    });
    expect(renovar.status()).toBe(200);

    // ── Volta ao normal ─────────────────────────────────────────────────────
    await restaurarEstado();
    await expect
      .poll(
        async () => {
          await page.goto("/app/settings");
          return new URL(page.url()).pathname;
        },
        { timeout: 75_000, intervals: [5_000] },
      )
      .toBe("/app/settings");
    await expect(faixaDeBloqueio(page)).toHaveCount(0);
  });
});

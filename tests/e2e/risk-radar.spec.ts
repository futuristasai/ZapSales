/**
 * Radar de Risco (C1 — desilhamento da doutrina do sistema vivo). Prova, na
 * perspectiva do usuário real: (1) o atendente entra no Radar e VÊ a demanda
 * aberta que esfriou (5 dias sem atividade, sem próximo passo) — o que antes
 * morria invisível no engine; (2) ele ASSUME a demanda direto da linha e a
 * responsabilidade passa a ser dele. Login como manager (sem MFA).
 *
 * O seed do radar roda a cada execução (reseta a conversa para "sem dono"), então
 * o teste de assumir é repetível.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
  radar?: { at_risk_title: string };
}

function loadCreds(): Creds {
  const needsBase = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    return !c.users?.manager;
  };
  if (needsBase()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  // Sempre reseta o fixture do radar (conversa volta a ficar sem dono).
  execFileSync("npx", ["tsx", "scripts/seed-e2e-radar.ts"], { stdio: "inherit" });
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
}

const creds = loadCreds();

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

async function gotoRadar(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Riscos de Perda" }).click();
  await page.waitForURL(/\/app\/radar/);
  await expect(page.getByRole("heading", { name: "Riscos de Perda" })).toBeVisible();
}

function radarItem(page: Page) {
  return page.locator('[data-testid="radar-item"]', { hasText: creds.radar!.at_risk_title });
}

test("o atendente vê no Radar a demanda aberta que esfriou sem próximo passo", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await gotoRadar(page);

  const item = radarItem(page);
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-risk", "critico");
  await expect(item.getByText("Crítico")).toBeVisible();
  await expect(item.getByText("Sem retorno agendado")).toBeVisible();
});

test("os contadores filtram: “Em voo” esconde o crítico, “Crítico” o traz de volta", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await gotoRadar(page);
  await expect(radarItem(page)).toBeVisible();

  // Antes eram etiquetas: tinham cara de filtro e o clique não fazia nada.
  const emVoo = page.getByTestId("radar-filtro-em_voo");
  await emVoo.click();
  await expect(emVoo).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]ver=em_voo/);
  await expect(radarItem(page)).toHaveCount(0);
  await expect(page.locator('[data-testid="radar-item"]:not([data-risk="em_voo"])')).toHaveCount(0);

  const critico = page.getByTestId("radar-filtro-critico");
  await critico.click();
  await expect(critico).toHaveAttribute("aria-pressed", "true");
  await expect(emVoo).toHaveAttribute("aria-pressed", "false");
  await expect(radarItem(page)).toBeVisible();
  await expect(page.locator('[data-testid="radar-item"]:not([data-risk="critico"])')).toHaveCount(0);

  // A escolha mora no endereço: recarregar (ou voltar de uma conversa) mantém a lista.
  await page.reload();
  await expect(page.getByTestId("radar-filtro-critico")).toHaveAttribute("aria-pressed", "true");
  await expect(radarItem(page)).toBeVisible();
});

test("a linha diz para onde leva: a conversa do cliente e o cartão no funil", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await gotoRadar(page);

  const item = radarItem(page);
  await expect(item).toBeVisible();
  // O nome da pessoa é o destaque da linha.
  await expect(item.getByTestId("radar-nome")).toHaveText("Cliente Radar E2E");

  // O funil abre o CARTÃO do negócio (`?lead=`), não o quadro solto.
  await expect(item.getByTestId("radar-ver-no-funil")).toHaveAttribute(
    "href",
    /\/app\/pipelines\/[0-9a-f-]+\?lead=[0-9a-f-]+$/,
  );

  // O clique principal leva sempre à conversa.
  const conversa = item.getByTestId("radar-abrir-conversa");
  await expect(conversa).toHaveAttribute("href", /\/app\/inbox\?id=[0-9a-f-]+$/);
  await conversa.click();
  await page.waitForURL(/\/app\/inbox\?id=/);
});

test("o atendente assume a demanda direto do Radar e vira o responsável", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await gotoRadar(page);

  const item = radarItem(page);
  await expect(item).toBeVisible();
  await expect(item.getByTestId("radar-assignee")).toHaveText("Sem dono");

  await item.getByTestId("radar-claim").click();

  // Após assumir, o radar recarrega: a demanda passa a ter atendente e o botão some.
  await expect(radarItem(page).getByTestId("radar-assignee")).toHaveText("Com atendente");
  await expect(radarItem(page).getByTestId("radar-claim")).toHaveCount(0);
});

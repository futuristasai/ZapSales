/**
 * QUEM NÃO ADMINISTRA E CAI NUMA EMPRESA AINDA NÃO CONFIGURADA — pela tela.
 *
 * A configuração inicial é de quem administra a organização (#273). Um membro
 * de outro papel que entra antes de ela terminar não pode ver o assistente
 * (todo botão dele falharia) nem ficar num vai-e-vem entre `/app` e
 * `/onboarding`. Este spec cria a situação de verdade e mede:
 *
 *   1. o login leva à tela de espera, e a URL PARA nela;
 *   2. pedir `/app` e `/onboarding` à mão devolve para a mesma tela — é a
 *      prova de que não há laço, feita como o laço apareceria;
 *   3. quando a configuração termina, "Conferir de novo" entra no app.
 *
 * Pré-requisitos (banco local, app buildada):
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3021 pnpm exec playwright test tests/e2e/aguardando-administrador.spec.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { expect, test } from "./helpers/test";

const EVIDENCIA = path.join(process.cwd(), "evidence/aguardando-administrador");

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUFIXO = `${Date.now()}`;
const EMAIL = `espera-${SUFIXO}@e2e.local`;
const SENHA = `Espera-${SUFIXO}-aA1!`;
const NOME_DA_ORG = `Empresa em Configuração ${SUFIXO}`;

let orgId = "";
let userId = "";

test.describe("Membro que não administra, em empresa ainda não configurada", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    const { data: org, error: erroOrg } = await admin
      .from("organizations")
      .insert({
        slug: `espera-${SUFIXO}`,
        display_name: NOME_DA_ORG,
        legal_name: `${NOME_DA_ORG} LTDA`,
        // `onboarded_at` nulo de propósito: é o estado que o spec mede.
      })
      .select("id")
      .single();
    if (erroOrg) throw new Error(`organizations: ${erroOrg.message}`);
    orgId = (org as { id: string }).id;

    const { data: criado, error: erroUser } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: SENHA,
      email_confirm: true,
      user_metadata: { full_name: "Atendente em Espera" },
    });
    if (erroUser || !criado.user) throw new Error(`auth user: ${erroUser?.message}`);
    userId = criado.user.id;

    const { error: erroVinculo } = await admin.from("user_organizations").insert({
      user_id: userId,
      organization_id: orgId,
      role: "agent",
      accepted_at: new Date().toISOString(),
    });
    if (erroVinculo) throw new Error(`user_organizations: ${erroVinculo.message}`);
  });

  test.afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("vê a tela de espera, sem laço, e entra quando a configuração termina", async ({ page }) => {
    // ── (1) o login para na tela de espera ───────────────────────────────────
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/aguardando-administrador$/, { timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Configuração em andamento" })).toBeVisible();
    await expect(page.getByText(NOME_DA_ORG, { exact: true })).toBeVisible();
    // O assistente não aparece para quem não pode concluí-lo.
    await expect(page.getByRole("link", { name: /Conferir de novo/ })).toBeVisible();

    fs.mkdirSync(EVIDENCIA, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCIA, "1-tela-de-espera.png"), fullPage: true });

    // ── (2) sem laço: os dois endereços que mandam para cá devolvem para cá ──
    for (const destino of ["/app", "/onboarding", "/app/inbox"]) {
      const resposta = await page.goto(destino);
      await page.waitForURL(/\/aguardando-administrador$/, { timeout: 30_000 });
      expect(resposta?.status(), `${destino} terminou em erro`).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: "Configuração em andamento" })).toBeVisible();
    }

    // ── (3) a configuração termina; o botão entra no app ─────────────────────
    const { error } = await admin
      .from("organizations")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", orgId);
    if (error) throw new Error(`onboarded_at: ${error.message}`);

    await page.getByRole("link", { name: /Conferir de novo/ }).click();
    await page.waitForURL(/\/app\//, { timeout: 60_000 });
    expect(page.url()).not.toContain("aguardando-administrador");
    await page.screenshot({ path: path.join(EVIDENCIA, "2-entrou-no-app.png"), fullPage: true });
  });
});

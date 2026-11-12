/**
 * O LIMITE DE RESPOSTAS AUTOMÁTICAS POR CONTATO — pela tela, como o dono faria (#271).
 *
 * O limite nasce LIGADO com o padrão do produto (50 por hora, 150 por dia) e é
 * ajustado em Uso de IA. Este spec mede o que só a tela real prova:
 *
 *   1. o cartão existe, diz o que acontece ao estourar e mostra o padrão;
 *   2. o admin muda os dois números, salva, e o valor SOBREVIVE a recarregar a
 *      página (leu do banco, não do estado do componente);
 *   3. número inválido não é salvo, e a tela diz o que se espera;
 *   4. "Voltar ao padrão" devolve os dois números de uma vez.
 *
 * O desvio em si (a IA parar e a conversa ir para uma pessoa) é medido sem
 * tela: a regra em `tests/unit/teto-de-ia-por-contato.test.ts` e a contagem num
 * Postgres real em `tests/invariants/teto-de-ia-por-contato.test.ts`.
 *
 * Pré-requisitos (banco local, app buildada):
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3021 pnpm exec playwright test tests/e2e/teto-de-ia-por-contato.spec.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { test, expect } from "./helpers/test";
import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "teto-de-ia-por-contato");

const env = carregarEnvLocal();
const banco = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let creds: CredsE2E = lerCreds();

/**
 * A organização do teste, lida do arquivo de credenciais A CADA uso: o login
 * re-semeia as credenciais quando outra sessão rotaciona o fator TOTP, e o
 * arquivo é a fonte que acompanha essa troca.
 */
function orgDoTeste(): string {
  const bruto = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as {
    org_id?: string;
  };
  if (!bruto.org_id) throw new Error(".e2e-creds.json sem org_id — rode scripts/seed-e2e-credentials.ts");
  return bruto.org_id;
}

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

/** O que está gravado para a organização do teste — lido direto do banco. */
async function gravado(): Promise<{ hora: number | null; dia: number | null }> {
  const { data, error } = await banco
    .from("ai_budgets")
    .select("teto_por_contato_hora, teto_por_contato_dia")
    .eq("organization_id", orgDoTeste())
    .maybeSingle();
  if (error) throw new Error(`ai_budgets: ${error.message}`);
  const linha = data as { teto_por_contato_hora: number; teto_por_contato_dia: number } | null;
  return { hora: linha?.teto_por_contato_hora ?? null, dia: linha?.teto_por_contato_dia ?? null };
}

async function voltarAoPadraoNoBanco(): Promise<void> {
  // Só as duas colunas deste teste: a linha é de outras specs também.
  await banco
    .from("ai_budgets")
    .update({ teto_por_contato_hora: 50, teto_por_contato_dia: 150 })
    .eq("organization_id", orgDoTeste());
}

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
  await voltarAoPadraoNoBanco();
});

test.afterAll(async () => {
  await voltarAoPadraoNoBanco();
});

test("o admin vê o padrão, ajusta, e o valor sobrevive a recarregar a página", async ({ page }) => {
  await page.goto("/app/ai/usage");
  const cartao = page.getByTestId("cartao-teto-por-contato");
  await expect(cartao.getByRole("heading", { name: "Limite de respostas automáticas por contato" })).toBeVisible();

  // A frase diz o que ACONTECE ao estourar e como se volta ao automático.
  await expect(cartao).toContainText("a conversa passa para uma pessoa");
  await expect(cartao).toContainText('"Devolver ao automático"');

  const porHora = cartao.getByLabel("Respostas por hora, por contato");
  const porDia = cartao.getByLabel("Respostas por dia, por contato");
  await expect(porHora).toHaveValue("50");
  await expect(porDia).toHaveValue("150");
  // Nada mudou ainda: não há o que salvar, nem "voltar ao padrão" a oferecer.
  const salvar = cartao.getByRole("button", { name: "Salvar limite por contato" });
  await expect(salvar).toBeDisabled();
  await expect(cartao.getByRole("button", { name: "Voltar ao padrão" })).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCIA, "1-padrao.png"), fullPage: true });

  await porHora.fill("20");
  await porDia.fill("60");
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(page.getByText("Limite por contato salvo.")).toBeVisible();

  // O que decide é o banco — é de lá que o motor lê.
  await expect.poll(gravado).toEqual({ hora: 20, dia: 60 });

  await page.reload();
  const depois = page.getByTestId("cartao-teto-por-contato");
  await expect(depois.getByLabel("Respostas por hora, por contato")).toHaveValue("20");
  await expect(depois.getByLabel("Respostas por dia, por contato")).toHaveValue("60");
  await page.screenshot({ path: path.join(EVIDENCIA, "2-ajustado.png"), fullPage: true });

  // "Voltar ao padrão" devolve os dois de uma vez.
  await depois.getByRole("button", { name: "Voltar ao padrão" }).click();
  await expect.poll(gravado).toEqual({ hora: 50, dia: 150 });
  await expect(depois.getByLabel("Respostas por hora, por contato")).toHaveValue("50");
  await expect(depois.getByLabel("Respostas por dia, por contato")).toHaveValue("150");
});

test("número inválido não é salvo, e a tela diz o que se espera", async ({ page }) => {
  await page.goto("/app/ai/usage");
  const cartao = page.getByTestId("cartao-teto-por-contato");
  const porHora = cartao.getByLabel("Respostas por hora, por contato");
  const salvar = cartao.getByRole("button", { name: "Salvar limite por contato" });

  for (const invalido of ["", "-5", "2,5", "10001", "muito"]) {
    await porHora.fill(invalido);
    await expect(cartao.getByText("Informe um número inteiro entre 0 e 10.000.")).toBeVisible();
    await expect(salvar, `"${invalido}" deixou salvar`).toBeDisabled();
  }
  expect(await gravado()).toMatchObject({ hora: 50 });

  // Zero é escolha válida: desliga aquela janela.
  await porHora.fill("0");
  await expect(cartao.getByText("Informe um número inteiro entre 0 e 10.000.")).toHaveCount(0);
  await salvar.click();
  await expect.poll(gravado).toMatchObject({ hora: 0, dia: 150 });
  await page.screenshot({ path: path.join(EVIDENCIA, "3-sem-limite-por-hora.png"), fullPage: true });
});

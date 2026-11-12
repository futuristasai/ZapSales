/**
 * REGRA ANOTADA PELO AGENTE VIRA PROPOSTA — pela tela, como o gestor faria (#272).
 *
 * O agente pode sugerir uma regra para a memória da organização, mas ela só
 * passa a valer depois que alguém com papel de gestor aprova. Este spec semeia
 * duas propostas do jeito que a ferramenta do agente as grava (origem `agent`,
 * situação `proposed`) e mede o que só a tela real prova:
 *
 *   1. as propostas aparecem num cartão PRÓPRIO, com o aviso de que não valem —
 *      e NÃO aparecem na lista de aprendizados;
 *   2. "Aprovar regra" leva a regra para os aprendizados, marcada como anotada
 *      pelo agente, e o banco passa a dizer `active`;
 *   3. "Recusar" tira a proposta da tela sem que ela entre nos aprendizados;
 *   4. decidida a última, o cartão de propostas some.
 *
 * O que o agente LÊ (a proposta fora das instruções até ser aprovada) é medido
 * num Postgres real em `tests/invariants/regra-do-agente-nasce-proposta.test.ts`.
 *
 * Pré-requisitos (banco local, app buildada):
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3021 pnpm exec playwright test tests/e2e/regra-do-agente-vira-proposta.spec.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { test, expect } from "./helpers/test";
import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "regra-do-agente-vira-proposta");

const env = carregarEnvLocal();
const banco = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUFIXO = `${Date.now()}`;
const APROVADA = `Regra a aprovar ${SUFIXO}`;
const RECUSADA = `Regra a recusar ${SUFIXO}`;

let creds: CredsE2E = lerCreds();

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

function orgDoTeste(): string {
  const bruto = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as {
    org_id?: string;
  };
  if (!bruto.org_id) throw new Error(".e2e-creds.json sem org_id — rode scripts/seed-e2e-credentials.ts");
  return bruto.org_id;
}

async function situacao(titulo: string): Promise<string | null> {
  const { data, error } = await banco
    .from("org_memory_entries")
    .select("status")
    .eq("organization_id", orgDoTeste())
    .eq("title", titulo)
    .maybeSingle();
  if (error) throw new Error(`org_memory_entries: ${error.message}`);
  return (data as { status: string } | null)?.status ?? null;
}

async function limpar(): Promise<void> {
  await banco
    .from("org_memory_entries")
    .delete()
    .eq("organization_id", orgDoTeste())
    .in("title", [APROVADA, RECUSADA]);
}

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
  await limpar();
  // Como a ferramenta do agente grava: origem `agent`, situação `proposed`.
  const { error } = await banco.from("org_memory_entries").insert([
    {
      organization_id: orgDoTeste(),
      title: APROVADA,
      body: "Quando o cliente perguntar o prazo, diga que a entrega leva até 5 dias úteis.",
      source: "agent",
      status: "proposed",
    },
    {
      organization_id: orgDoTeste(),
      title: RECUSADA,
      body: "Ofereça frete grátis a todo cliente, sem perguntar o valor da compra.",
      source: "agent",
      status: "proposed",
    },
  ]);
  if (error) throw new Error(`semente: ${error.message}`);
});

test.afterAll(async () => {
  await limpar();
});

test("o gestor vê as propostas à parte, aprova uma, recusa a outra, e só a aprovada passa a valer", async ({
  page,
}) => {
  await page.goto("/app/ai/memory");

  const cartao = page.getByTestId("propostas-do-agente");
  await expect(cartao.getByText("Propostas do agente", { exact: true })).toBeVisible();
  // A tela diz que nada ali está valendo — é a frase que impede ler proposta como regra.
  await expect(cartao).toContainText("Nenhuma delas está valendo");

  const paraAprovar = cartao.getByTestId("proposta-do-agente").filter({ hasText: APROVADA });
  const paraRecusar = cartao.getByTestId("proposta-do-agente").filter({ hasText: RECUSADA });
  await expect(paraAprovar).toBeVisible();
  await expect(paraRecusar).toBeVisible();
  await expect(paraAprovar.getByText("aguardando aprovação")).toBeVisible();

  // Fora do cartão de propostas, nenhuma das duas aparece: não são aprendizados.
  const fora = page.locator("li").filter({ hasText: APROVADA }).and(page.locator(":not([data-testid='proposta-do-agente'])"));
  await expect(fora).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCIA, "1-propostas-pendentes.png"), fullPage: true });

  // ── aprovar ────────────────────────────────────────────────────────────────
  await paraAprovar.getByRole("button", { name: "Aprovar regra" }).click();
  await expect(page.getByText("Proposta aprovada. A regra passa a valer no próximo atendimento.")).toBeVisible();
  await expect.poll(() => situacao(APROVADA)).toBe("active");
  await expect(cartao.getByTestId("proposta-do-agente").filter({ hasText: APROVADA })).toHaveCount(0);

  // Ela passou para os aprendizados, e a tela diz QUEM a escreveu.
  const aprendizado = page.locator("li").filter({ hasText: APROVADA });
  await expect(aprendizado).toBeVisible();
  await expect(aprendizado.getByText("anotado pelo agente")).toBeVisible();

  // A outra continua esperando: aprovar uma não decide a outra.
  expect(await situacao(RECUSADA)).toBe("proposed");

  // ── recusar ────────────────────────────────────────────────────────────────
  await page
    .getByTestId("proposta-do-agente")
    .filter({ hasText: RECUSADA })
    .getByRole("button", { name: "Recusar" })
    .click();
  await expect(page.getByText("Proposta recusada. Ela não entra na memória.")).toBeVisible();
  await expect.poll(() => situacao(RECUSADA)).toBe("archived");

  // Decidida a última proposta DESTE teste, ela some da lista de pendentes.
  await expect(page.getByTestId("proposta-do-agente").filter({ hasText: RECUSADA })).toHaveCount(0);
  // …e não virou aprendizado ativo.
  await expect(page.locator("li").filter({ hasText: RECUSADA })).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCIA, "2-decididas.png"), fullPage: true });

  // Recarregar não ressuscita nada: o que a tela mostrou veio do banco.
  await page.reload();
  await expect(page.locator("li").filter({ hasText: APROVADA })).toBeVisible();
  await expect(page.getByTestId("proposta-do-agente").filter({ hasText: APROVADA })).toHaveCount(0);
  await expect(page.getByTestId("proposta-do-agente").filter({ hasText: RECUSADA })).toHaveCount(0);
});

/**
 * ANEXO: ABRE NA TELA OU É BAIXADO — provado pela tela, como o atendente faz.
 *
 * O tipo de um anexo é escrito por quem o enviou. Este spec semeia três anexos
 * recebidos numa conversa e mede o que acontece quando quem atende clica:
 *
 *   - uma foto            → aparece na conversa;
 *   - um PDF              → abre no navegador, como sempre;
 *   - um arquivo ATIVO    → é baixado. Não vira página do sistema.
 *
 * O arquivo ativo é semeado no pior estado possível: já guardado no Storage
 * com o tipo de página, como ficaria um objeto gravado antes da regra de
 * entrega (`lib/messaging/media/entrega-segura.ts`, #266). Dentro dele há um
 * script que troca o título da aba e chama a API com uma marca na URL. O spec
 * escuta o contexto inteiro do navegador: a marca não pode aparecer.
 *
 * Pré-requisitos (banco local, app buildada):
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3021 pnpm exec playwright test tests/e2e/anexo-abre-ou-baixa.spec.ts
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { expect, test, type Page } from "./helpers/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), "evidence/anexo-abre-ou-baixa");
const BUCKET = "whatsapp-media";
const MARCA = "marca=anexo-executou";

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGINA_ATIVA = `<!doctype html><html><head><title>pagina</title></head><body>
<script>document.title = "EXECUTOU"; fetch("/api/v1/health?${MARCA}");</script>
conteudo</body></html>`;

// PNG 1×1 e um PDF mínimo: bytes de verdade, para o navegador decodificar.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
);

let creds: Creds;
let contatoId = "";
let conversaId = "";
const ids = { ativo: randomUUID(), foto: randomUUID(), pdf: randomUUID() };
const caminhos: string[] = [];

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), fullPage: true });
}

test.describe("Inbox — anexo abre na tela ou é baixado", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;

    const { data: sessaoExistente } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", creds.org_id)
      .limit(1)
      .maybeSingle();
    let sessaoId = (sessaoExistente as { id: string } | null)?.id ?? null;
    if (!sessaoId) {
      const { data, error } = await admin
        .from("channel_sessions")
        .insert({
          organization_id: creds.org_id,
          waha_session_name: `e2e-anexo-${Date.now()}`,
          webhook_secret_encrypted: "e2e",
        })
        .select("id")
        .single();
      if (error) throw new Error(`channel_sessions: ${error.message}`);
      sessaoId = (data as { id: string }).id;
    }

    const { data: contato, error: erroContato } = await admin
      .from("contacts")
      .insert({
        organization_id: creds.org_id,
        display_name: `Anexo ${Date.now()}`,
        phone_number: `+55119${String(Date.now()).slice(-8)}`,
      })
      .select("id")
      .single();
    if (erroContato) throw new Error(`contacts: ${erroContato.message}`);
    contatoId = (contato as { id: string }).id;

    const { data: conversa, error: erroConversa } = await admin
      .from("conversations")
      .insert({
        organization_id: creds.org_id,
        contact_id: contatoId,
        channel_session_id: sessaoId,
        status: "open",
        last_message_preview: "Segue o arquivo",
        last_message_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (erroConversa) throw new Error(`conversations: ${erroConversa.message}`);
    conversaId = (conversa as { id: string }).id;

    const pasta = `${creds.org_id}/${conversaId}`;
    const anexos = [
      // Gravado COM o tipo de página, como um objeto anterior à regra.
      { id: ids.ativo, arquivo: `${ids.ativo}.bin`, bytes: Buffer.from(PAGINA_ATIVA), mime: "text/html", type: "document" },
      { id: ids.foto, arquivo: `${ids.foto}.png`, bytes: PNG, mime: "image/png", type: "image" },
      { id: ids.pdf, arquivo: `${ids.pdf}.pdf`, bytes: PDF, mime: "application/pdf", type: "document" },
    ];
    for (const [i, a] of anexos.entries()) {
      const caminho = `${pasta}/${a.arquivo}`;
      const { error: erroUp } = await admin.storage
        .from(BUCKET)
        .upload(caminho, a.bytes, { contentType: a.mime, upsert: true });
      if (erroUp) throw new Error(`upload ${a.arquivo}: ${erroUp.message}`);
      caminhos.push(caminho);

      const { error: erroMsg } = await admin.from("messages").insert({
        id: a.id,
        organization_id: creds.org_id,
        conversation_id: conversaId,
        contact_id: contatoId,
        channel_session_id: sessaoId,
        direction: "inbound",
        type: a.type,
        media_mime: a.mime,
        media_storage_path: caminho,
        media_size_bytes: a.bytes.byteLength,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      });
      if (erroMsg) throw new Error(`messages ${a.arquivo}: ${erroMsg.message}`);
    }
  });

  test.afterAll(async () => {
    if (caminhos.length > 0) await admin.storage.from(BUCKET).remove(caminhos);
    if (conversaId) {
      await admin.from("messages").delete().eq("conversation_id", conversaId);
      await admin.from("conversations").delete().eq("id", conversaId);
    }
    if (contatoId) await admin.from("contacts").delete().eq("id", contatoId);
  });

  test("foto aparece, PDF abre, arquivo ativo é baixado e não executa", async ({ page, context }) => {
    // Tudo o que QUALQUER aba deste navegador pedir passa por aqui.
    const pedidosComMarca: string[] = [];
    context.on("request", (r) => {
      if (r.url().includes(MARCA)) pedidosComMarca.push(r.url());
    });
    const baixados: string[] = [];
    context.on("page", (aba) => {
      aba.on("download", (d) => baixados.push(d.suggestedFilename()));
    });
    page.on("download", (d) => baixados.push(d.suggestedFilename()));

    await login(page, creds.users.agent!.email, creds.password);
    await page.goto(`/app/inbox/${conversaId}`);

    // ── (1) A foto aparece — medido, não olhado ──────────────────────────────
    const foto = page.locator(`img[src*="${ids.foto}"]`).first();
    await expect(foto).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => foto.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30_000 })
      .toBeGreaterThan(0);

    // ── (2) Os cabeçalhos de cada anexo, lidos pela mesma sessão do atendente ─
    const ativo = await page.request.get(`/api/v1/messages/${ids.ativo}/media`);
    expect(ativo.status()).toBe(200);
    expect(ativo.headers()["content-disposition"] ?? "").toMatch(/^attachment/i);

    const pdf = await page.request.get(`/api/v1/messages/${ids.pdf}/media`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(pdf.headers()["content-disposition"] ?? "").not.toMatch(/^attachment/i);

    const png = await page.request.get(`/api/v1/messages/${ids.foto}/media`);
    expect(png.headers()["content-type"]).toContain("image/png");
    expect(png.headers()["content-disposition"] ?? "").not.toMatch(/^attachment/i);

    await captura(page, "1-conversa-com-os-tres-anexos");

    // ── (3) O clique, como o atendente faz ───────────────────────────────────
    const cartaoAtivo = page.locator(`a[href="/api/v1/messages/${ids.ativo}/media"]`);
    await expect(cartaoAtivo).toBeVisible();
    await cartaoAtivo.click();

    await expect.poll(() => baixados.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Tempo para um script que tivesse rodado conseguir fazer o pedido dele.
    await page.waitForTimeout(2_000);

    expect(pedidosComMarca, "o arquivo ativo executou e chamou a API").toEqual([]);
    for (const aba of context.pages()) {
      const titulo = await aba.title().catch(() => "");
      expect(titulo, `aba ${aba.url()}`).not.toBe("EXECUTOU");
    }
    await captura(page, "2-depois-do-clique-no-arquivo-ativo");
  });
});

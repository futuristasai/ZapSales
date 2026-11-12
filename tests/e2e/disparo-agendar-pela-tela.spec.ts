/**
 * Disparo em massa — AGENDAR o envio, provado pela TELA (issue #292).
 *
 * O motor de agendamento existia e a tela não oferecia a ação: a campanha pronta
 * só tinha "Iniciar envio". Esta spec faz o que o operador faz — marca dia e
 * hora, muda de ideia, e vê a campanha começar sozinha — sem tocar na API de
 * ação nem no banco no meio do caminho.
 *
 *  1. campanha pronta: o botão **Agendar** está ao lado de **Iniciar envio**;
 *  2. número de QR code: antes do dia e da hora vem o aviso de risco de banimento;
 *  3. horário que já passou não agenda, e a tela diz por quê;
 *  4. horário fora do horário de envio agenda, e a tela avisa quando o primeiro
 *     envio sai de verdade;
 *  5. a agendada mostra para quando está marcada, na página dela e na lista;
 *  6. **Mudar horário** abre com o horário atual e troca a data;
 *  7. chegada a hora, a campanha passa a "Enviando" sozinha, com a tela aberta.
 *
 * ═══ Por que NADA é enviado aqui ═══
 *
 * A campanha chega a "Enviando", e uma campanha enviando manda mensagem. Duas
 * travas independentes garantem que nenhuma sai, em qualquer máquina:
 *
 *  - o número é uma fixture PARADA (`STOPPED`), e número fora do ar não entra no
 *    rodízio da rodada;
 *  - a campanha tem horário próprio de uma hora só, escolhido para NÃO conter a
 *    hora atual — o ritmo veta todo envio com "fora do horário". É também o que
 *    produz o aviso do passo 4, sem depender da hora em que o CI roda.
 *
 * O telefone do contato é inventado; com as duas travas ele nunca é discado.
 *
 * Banco novo, como o de uma instalação recém-feita. Tudo o que a spec cria, ela
 * apaga no fim. Pré-requisito: `.e2e-creds.json`.
 */
import { mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { randomInt, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { test, expect, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { campoDoInstante } from "../../lib/campanhas/agenda";
import { horaNoFuso } from "../../lib/campanhas/relogio";
import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence", "disparo-agendar");
mkdirSync(EVIDENCE, { recursive: true });

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUFIXO = `${Date.now()}`.slice(-7);
const NOME = `Agendada pela tela ${SUFIXO}`;
const ETIQUETA = `agenda-e2e-${SUFIXO}`;

let canal = "";
let contato = "";
let campanha = "";

function orgDoSeed(): string {
  const bruto = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as { org_id?: string };
  if (!bruto.org_id) throw new Error("`.e2e-creds.json` sem org_id — rode scripts/seed-e2e-credentials.ts");
  return bruto.org_id;
}

async function foto(page: Page, nome: string): Promise<void> {
  await page.screenshot({ path: path.join(EVIDENCE, `${nome}.png`), fullPage: true, animations: "disabled" });
}

/** A hora cheia, dentro do horário de envio padrão (7h–22h), que NÃO contém `agora` nem os minutos seguintes. */
function horaFechada(horaAtual: number): number {
  return horaAtual >= 7 && horaAtual <= 19 ? horaAtual + 2 : 8;
}

test.afterAll(async () => {
  // Campanha antes do canal: a campanha aponta para ele.
  if (campanha) await admin.from("campaigns").delete().eq("id", campanha);
  if (contato) await admin.from("contacts").delete().eq("id", contato);
  if (canal) await admin.from("channel_sessions").delete().eq("id", canal);
});

test("Disparo em massa: agendar, mudar o horário e ver a campanha começar sozinha", async ({ page }) => {
  test.setTimeout(300_000);
  const org = orgDoSeed();

  // ─── O cenário: um número de QR code parado e uma pessoa com a etiqueta ───
  const { data: c, error: erroDoCanal } = await admin
    .from("channel_sessions")
    .insert({
      organization_id: org,
      waha_session_name: `e2e-agenda-${randomUUID()}`,
      webhook_secret_encrypted: "\\x00",
      status: "STOPPED",
      phone_number: `+5511${randomInt(100000000, 1000000000)}`,
      display_name: `Número da agenda ${SUFIXO}`,
    })
    .select("id")
    .single();
  expect(erroDoCanal, erroDoCanal?.message).toBeNull();
  canal = (c as { id: string }).id;

  const { data: p, error: erroDoContato } = await admin
    .from("contacts")
    .insert({
      organization_id: org,
      name: `Pessoa da Agenda ${SUFIXO}`,
      phone_number: `+5511${randomInt(100000000, 1000000000)}`,
      tags: [ETIQUETA],
      source: "manual",
    })
    .select("id")
    .single();
  expect(erroDoContato, erroDoContato?.message).toBeNull();
  contato = (p as { id: string }).id;

  creds = await loginComoAdmin(page, creds);

  // A campanha nasce pela mesma rota que a tela de Nova campanha usa.
  const criada = await page.request.post("/api/v1/campaigns", {
    data: {
      name: NOME,
      channel_session_id: canal,
      message_body: "Oi {{primeiro_nome}}, tudo bem?",
      base_legal: "consent",
      audience_filter: { com_alguma_tag: [ETIQUETA], limite: 10 },
    },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  campanha = ((await criada.json()) as { data: { id: string } }).data.id;

  // ─── 1. Pronta para iniciar: Agendar ao lado de Iniciar envio ───
  await page.goto(`/app/campaigns/${campanha}`);
  await expect(page.getByRole("heading", { name: NOME })).toBeVisible();
  // O selo de estado mora no cabeçalho, ao lado do nome. Procurá-lo pela página
  // inteira acharia também o estado de cada destinatário ("Cancelada").
  const cabecalho = page.locator("header").filter({ has: page.getByRole("heading", { name: NOME }) });
  await page.getByRole("button", { name: "Preparar lista" }).click();
  await expect(cabecalho).toContainText("Pronta para iniciar");
  await expect(page.getByRole("button", { name: "Iniciar envio" })).toBeVisible();
  const agendar = page.getByRole("button", { name: "Agendar", exact: true });
  await expect(agendar).toBeVisible();

  // O fuso em que o campo vale é o do número — a tela recebe e a spec lê o mesmo.
  const lida = await page.request.get(`/api/v1/campaigns/${campanha}`);
  const { janela_de_envio: janela } = ((await lida.json()) as {
    data: { janela_de_envio: { fuso: string; inicio_hora: number; fim_hora: number } };
  }).data;
  expect(janela.inicio_hora).toBe(7);
  expect(janela.fim_hora).toBe(22);

  // O horário próprio da campanha: uma hora só, que não é a de agora (ver o cabeçalho).
  const abre = horaFechada(horaNoFuso(new Date(), janela.fuso));
  await page.getByLabel("Enviar só a partir das (hora)").fill(String(abre));
  await page.getByLabel("Parar de enviar às (hora)").fill(String(abre + 1));
  await page.getByRole("button", { name: "Salvar ritmo" }).click();
  await expect(page.getByText("Ritmo salvo.")).toBeVisible();

  // ─── 2. Número de QR code: o aviso de risco vem antes do dia e da hora ───
  await agendar.click();
  const aviso = page.getByTestId("aviso-risco-de-banimento");
  await expect(aviso).toBeVisible();
  await expect(page.getByTestId("agendamento-da-campanha")).toHaveCount(0);
  await aviso.getByRole("checkbox").check();
  await aviso.getByRole("button", { name: "Aceitar o risco e continuar" }).click();

  const cartao = page.getByTestId("agendamento-da-campanha");
  await expect(cartao).toBeVisible();
  await expect(cartao.getByRole("heading", { name: "Agendar o envio" })).toBeVisible();
  await expect(cartao).toContainText("1 pessoa");
  await expect(cartao.getByTestId("fuso-do-agendamento")).toContainText("Vale o horário do número");
  const campo = cartao.getByLabel("Dia e hora do início");
  const confirmar = cartao.getByRole("button", { name: "Agendar envio" });
  // Em branco, sem chute: nada a confirmar ainda.
  await expect(campo).toHaveValue("");
  await expect(confirmar).toBeDisabled();

  // ─── 3. Horário que já passou não agenda ───
  await campo.fill(campoDoInstante(new Date(Date.now() - 60 * 60_000), janela.fuso));
  await expect(cartao.getByTestId("resultado-do-agendamento")).toContainText("Esse horário já passou");
  await expect(confirmar).toBeDisabled();

  // ─── 4. Fora do horário de envio: agenda, e a tela avisa quando sai ───
  const amanha = new Date(Date.now() + 24 * 60 * 60_000);
  await campo.fill(campoDoInstante(amanha, janela.fuso));
  const resultado = cartao.getByTestId("resultado-do-agendamento");
  await expect(resultado).toContainText(`fora do horário de envio (${abre}h–${abre + 1}h)`);
  await expect(resultado).toContainText("só começa a enviar");
  await foto(page, "1-agendar-fora-do-horario");
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  // ─── 5. Agendada: a página e a lista dizem para quando ───
  await expect(cabecalho).toContainText("Agendada");
  const agendada = page.getByTestId("campanha-agendada");
  await expect(agendada).toBeVisible();
  await expect(agendada).toContainText("Começa sozinha");
  await expect(agendada).toContainText("só começa a enviar");
  await expect(page.getByTestId("agendamento-da-campanha")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar agora" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mudar horário" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar campanha" })).toBeVisible();
  // "Iniciar envio" e "Agendar" não cabem mais com esses nomes: a ação mudou de sentido.
  await expect(page.getByRole("button", { name: "Iniciar envio" })).toHaveCount(0);
  await foto(page, "2-campanha-agendada");

  await page.goto("/app/campaigns");
  const linha = page.getByRole("link", { name: new RegExp(NOME) });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Agendada");
  await expect(linha).toContainText("começa");
  await foto(page, "3-lista-com-a-agendada");

  // ─── 6. Mudar horário: abre com o horário atual e troca ───
  await page.goto(`/app/campaigns/${campanha}`);
  await page.getByRole("button", { name: "Mudar horário" }).click();
  const mudar = page.getByTestId("agendamento-da-campanha");
  await expect(mudar.getByRole("heading", { name: "Mudar o horário do envio" })).toBeVisible();
  const campoDeMudar = mudar.getByLabel("Dia e hora do início");
  await expect(campoDeMudar).toHaveValue(campoDoInstante(amanha, janela.fuso));

  // O novo horário é o próximo minuto cheio com pelo menos 20 s de folga: é o
  // que a spec espera chegar no passo 7.
  const alvo = new Date(Math.ceil((Date.now() + 20_000) / 60_000) * 60_000);
  await campoDeMudar.fill(campoDoInstante(alvo, janela.fuso));
  await mudar.getByRole("button", { name: "Salvar novo horário" }).click();
  await expect(page.getByTestId("agendamento-da-campanha")).toHaveCount(0);
  const lidaDeNovo = await page.request.get(`/api/v1/campaigns/${campanha}`);
  const depois = ((await lidaDeNovo.json()) as { data: { status: string; scheduled_at: string } }).data;
  expect(depois.status).toBe("scheduled");
  expect(new Date(depois.scheduled_at).getTime()).toBe(alvo.getTime());

  // ─── 7. Chegada a hora, a campanha começa sozinha — com a tela aberta ───
  await page.waitForTimeout(Math.max(0, alvo.getTime() - Date.now()) + 1_500);
  // A rodada de campanha é o que o agendador do servidor chama a cada minuto.
  const segredo = env.INTERNAL_SECRET?.trim();
  expect(segredo, "INTERNAL_SECRET ausente no ambiente de teste").toBeTruthy();
  const rodada = await page.request.post("/api/v1/cron/campaign-worker", {
    headers: { Authorization: `Bearer ${segredo}` },
    timeout: 60_000,
  });
  expect(rodada.ok(), await rodada.text()).toBeTruthy();

  // Sem recarregar: a página se reconsulta sozinha enquanto a campanha está agendada.
  await expect(cabecalho).toContainText("Enviando", { timeout: 30_000 });
  await expect(page.getByTestId("campanha-agendada")).toHaveCount(0);
  await foto(page, "4-comecou-sozinha");

  // Nada saiu: o número está parado e a hora atual está fora do horário da campanha.
  const { data: destinatarios } = await admin
    .from("campaign_recipients")
    .select("sent_at")
    .eq("campaign_id", campanha);
  expect((destinatarios ?? []).filter((d) => (d as { sent_at: string | null }).sent_at !== null)).toHaveLength(0);

  // Encerra pela tela, como quem desiste.
  await page.getByRole("button", { name: "Cancelar campanha" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(cabecalho).toContainText("Cancelada");
});

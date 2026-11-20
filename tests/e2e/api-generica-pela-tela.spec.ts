/**
 * A API GENÉRICA, PELA TELA (Agente de IA › Ferramentas externas › APIs).
 *
 * Issue #372. O caminho de quem acabou de instalar e NÃO ligou nada: a aba abre dizendo o que é
 * uma API, que o sistema funciona sem isto e que ligar exige um aceite; o administrador liga e a
 * segurança nasce no nível «Mais seguro», com o resumo dizendo que tudo está na posição
 * recomendada; cada opção mostra o que faz, um exemplo, a recomendação e o risco; cadastrar um
 * endereço da rede interna é RECUSADO; uma API que altera dados não pode ser cadastrada enquanto a
 * organização está em «somente consulta»; a consulta é salva com a chave CIFRADA no banco e a tela
 * só guarda os 4 últimos; sair da posição recomendada mostra o risco ANTES de salvar («Manter como
 * está» não muda nada), deixa o selo «Fora do recomendado», avisa o administrador na Central e
 * fica na auditoria; a trava ligada depois tira do agente a API gravada antes dela; a API chega ao
 * seletor do agente com o selo «API»; e desligar o recurso não apaga nada.
 *
 * A chamada de verdade (método, caminho, credencial, corpo, dado do contato, limite, pausa) é
 * provada contra um receptor HTTP real em `lib/ai/ferramentas-externas/api/chamar.test.ts` e
 * `tests/invariants/api-generica-no-turno.test.ts`: a organização nunca alcança 127.0.0.1 (rede
 * segura única), então esta spec usa um IPv4 público por literal — que não responde de dentro do
 * CI — e o que se mede aqui é a TELA.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";
import { admin, captura, creds, registra } from "./qa-l12-comum";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
/** Um IPv4 público por literal: passa pela rede segura sem depender de DNS (e não responde daqui). */
const ENDERECO_PUBLICO = "https://93.184.216.34/pedidos/{{numero}}";
const CREDENCIAL = "chave_e2e_da_loja_secreta_5566";

async function loginComTotp(page: import("@playwright/test").Page, email: string, senha: string): Promise<void> {
  const segredo = (JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as { admin_totp?: { secret: string } }).admin_totp
    ?.secret;
  if (!segredo) throw new Error("sem admin_totp em .e2e-creds.json");

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click({ timeout: 15_000 });
  await page.waitForURL(/\/login\/mfa/, { timeout: 90_000 });

  const digito1 = page.locator('input[aria-label="Dígito 1"]');
  const recusa = page.locator("form").getByRole("alert");
  for (let i = 0; i < 3; i++) {
    if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    await digito1.click({ timeout: 15_000 });
    await page.keyboard.type(generateTotp(segredo), { delay: 40 });
    const desfecho = await Promise.race([
      page.waitForURL(/\/app\//, { timeout: 60_000 }).then(() => "entrou" as const, () => "nada" as const),
      recusa.waitFor({ state: "visible", timeout: 60_000 }).then(() => "recusado" as const, () => "nada" as const),
    ]);
    if (desfecho === "entrou") return;
    registra(`[ambiente] MFA de ${email}: tentativa ${i + 1} = ${desfecho}`);
    await page.waitForTimeout(msUntilNextTotpWindow() + 200);
  }
  throw new Error(`MFA falhou para ${email} (url=${page.url()})`);
}

/** Estado fresco de instalação: recurso desligado, nenhuma API, nenhum aviso das APIs. */
async function instalacaoNova(orgId: string): Promise<void> {
  await admin.from("agent_external_tools").delete().eq("organization_id", orgId).eq("kind", "api");
  await admin.from("agent_inbox_items").delete().eq("organization_id", orgId).eq("kind", "external_api_notice");
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = { ...((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) };
  delete settings.api_externa;
  await admin.from("organizations").update({ settings }).eq("id", orgId);
}

type SegurancaGravada = {
  ligado: boolean;
  aceite: { por: string } | null;
  somente_consulta: boolean;
  aprovacao_obrigatoria: boolean;
  quem_cadastra: string;
};

async function segurancaNoBanco(orgId: string): Promise<SegurancaGravada | undefined> {
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  return (data as { settings: { api_externa?: SegurancaGravada } }).settings.api_externa;
}

/** Abre as opções uma a uma, se ainda não estão abertas (em «Personalizado» o painel já nasce aberto). */
async function abrirOpcoes(page: import("@playwright/test").Page): Promise<void> {
  const opcoes = page.getByTestId("opcoes-de-seguranca");
  await expect(page.getByTestId("ver-opcoes-de-seguranca")).toBeVisible({ timeout: 60_000 });
  if (!(await opcoes.isVisible())) await page.getByTestId("ver-opcoes-de-seguranca").click();
  await expect(opcoes).toBeVisible({ timeout: 15_000 });
}

test.describe("API genérica pela tela", () => {
  test.describe.configure({ timeout: 420_000 });

  test("instalação nova: explica e exige o aceite; nasce no nível mais seguro; recusa endereço interno e ação que altera; guarda a chave cifrada; sair do recomendado mostra o risco antes, deixa o selo e avisa; a trava tira a API do agente; desligar não apaga", async ({
    page,
  }) => {
    const c = creds();
    await instalacaoNova(c.org_id);

    try {
      await loginComTotp(page, c.users.admin!.email, c.password);

      // 1 · Instalação nova: a aba das APIs está desligada e explica o que é, sem jargão.
      await page.goto("/app/ai/external-tools?aba=apis");
      const desligado = page.getByTestId("apis-desligado");
      await expect(desligado).toBeVisible({ timeout: 60_000 });
      await expect(desligado).toContainText("Uma API é a porta que um sistema abre para outros sistemas");
      await expect(desligado).toContainText("funciona normalmente sem isto");
      await expect(desligado).toContainText("a segurança nasce no nível mais seguro");
      await captura(page, "api-01-instalacao-nova-desligado");

      // 2 · Ligar exige o aceite: sem marcar, o botão não funciona.
      const ligar = page.getByTestId("apis-ligar");
      await expect(ligar).toBeDisabled();
      await page.getByTestId("apis-aceite").check();
      await expect(ligar).toBeEnabled();
      await ligar.click();
      await expect(page.getByTestId("apis-ligado")).toBeVisible({ timeout: 30_000 });
      const aoLigar = await segurancaNoBanco(c.org_id);
      expect(aoLigar?.ligado).toBe(true);
      expect(aoLigar?.aceite?.por).toBeTruthy();

      // 3 · Nasce na posição recomendada: o resumo diz, e o nível é «Mais seguro».
      const resumo = page.getByTestId("resumo-da-seguranca");
      await expect(resumo).toHaveAttribute("data-fora", "0");
      await expect(resumo).toContainText("Todas as opções estão na posição recomendada");
      await expect(page.getByTestId("nivel-de-seguranca")).toHaveAttribute("data-nivel", "mais_seguro");
      await expect(page.getByTestId("apis-vazio")).toContainText("tenha em mãos a documentação da API");
      await captura(page, "api-02-ligado-nivel-mais-seguro");

      // 4 · Cada opção diz o que faz, dá um exemplo, a recomendação e — fora dela — o risco.
      await abrirOpcoes(page);
      const somenteConsulta = page.getByTestId("opcao-somente_consulta");
      await expect(somenteConsulta).toBeVisible();
      await expect(somenteConsulta).toContainText("Impede o agente de alterar qualquer coisa em outro sistema");
      await expect(somenteConsulta).toContainText("Exemplo:");
      await expect(somenteConsulta).toContainText("Recomendação:");
      await expect(page.getByTestId("selo-recomendado-somente_consulta")).toBeVisible();
      for (const id of ["aprovacao_obrigatoria", "quem_cadastra", "quem_aprova", "avisar_administrador", "dados_do_contato", "dominios_permitidos"]) {
        await expect(page.getByTestId(`opcao-${id}`)).toBeVisible();
      }
      await captura(page, "api-03-opcoes-explicadas");

      // 5 · Nova API: endereço da rede interna é recusado por segurança, nada é gravado.
      await page.getByTestId("nova-api").click();
      const formulario = page.getByTestId("formulario-da-api");
      await formulario.locator("#api-nome").fill("Consultar pedido na loja");
      await formulario.locator("#api-quando").fill("Quando o cliente perguntar onde está o pedido dele.");
      await formulario.getByTestId("api-adicionar-campo").click();
      await formulario.locator("#api-c-nome-0").fill("numero");
      await formulario.locator("#api-c-desc-0").fill("Número do pedido que o cliente informou");
      await formulario.getByTestId("api-url").fill("https://localhost/pedidos/{{numero}}");
      await formulario.getByTestId("api-credencial").fill(CREDENCIAL);
      await formulario.getByTestId("salvar-api").click();
      await expect(page.getByText("Este endereço não pode ser usado", { exact: false })).toBeVisible({ timeout: 30_000 });
      const { count: gravadasAposRecusa } = await admin
        .from("agent_external_tools")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id)
        .eq("kind", "api");
      expect(gravadasAposRecusa).toBe(0);
      await captura(page, "api-04-endereco-interno-recusado");

      // 6 · O host nunca é campo: a tela recusa antes de enviar.
      await formulario.getByTestId("api-url").fill("https://{{numero}}.loja.example.com/pedidos");
      await formulario.getByTestId("salvar-api").click();
      await expect(formulario.getByTestId("erro-do-formulario-da-api")).toContainText("só pode ter campos depois do nome do site");

      // 7 · «Somente consulta»: a opção «altera dados» está travada, e a tela diz por quê.
      await expect(formulario.getByTestId("api-efeito-altera")).toBeDisabled();
      await expect(formulario.getByTestId("api-aviso-somente-consulta")).toContainText("somente consulta");
      await captura(page, "api-05-somente-consulta-trava-o-que-altera");

      // 8 · A consulta com endereço público é salva; a chave vai CIFRADA para o banco.
      await formulario.getByTestId("api-url").fill(ENDERECO_PUBLICO);
      await captura(page, "api-06-formulario-preenchido");
      await formulario.getByTestId("salvar-api").click();
      await expect(formulario).toBeHidden({ timeout: 60_000 });
      const { data: linha } = await admin
        .from("agent_external_tools")
        .select("id, kind, url, effect, api_config, signing_secret_encrypted, signing_secret_last4, active")
        .eq("organization_id", c.org_id)
        .eq("kind", "api")
        .single();
      const api = linha as {
        id: string;
        url: string;
        effect: string;
        api_config: { metodo: string; limite_por_conversa: number | null; pausa_apos_falhas: number | null; credencial: { tipo: string } };
        signing_secret_encrypted: string | null;
        signing_secret_last4: string | null;
      };
      expect(api.url).toBe(ENDERECO_PUBLICO);
      expect(api.effect).toBe("consulta");
      expect(api.api_config.metodo).toBe("GET");
      expect(api.api_config.credencial.tipo).toBe("bearer");
      // Nasce com o limite de uso e a pausa automática recomendados.
      expect(api.api_config.limite_por_conversa).toBe(5);
      expect(api.api_config.pausa_apos_falhas).toBe(5);
      expect(api.signing_secret_last4).toBe(CREDENCIAL.slice(-4));
      expect(String(api.signing_secret_encrypted)).not.toContain(CREDENCIAL);

      // A lista mostra a API e só «…» + 4 últimos; a chave não está na página, nem depois de recarregar.
      const cartao = page.getByTestId(`api-${api.id}`);
      await expect(cartao).toContainText("Consultar pedido na loja");
      await expect(cartao).toContainText(`chave …${CREDENCIAL.slice(-4)}`);
      await expect(cartao).toContainText("Só consulta");
      expect(await page.content()).not.toContain(CREDENCIAL);
      await page.reload();
      await expect(page.getByTestId(`api-${api.id}`)).toBeVisible({ timeout: 60_000 });
      expect(await page.content()).not.toContain(CREDENCIAL);
      await captura(page, "api-07-lista-com-a-api");

      // O cadastro abriu um aviso ao administrador na Central.
      const { data: avisosDoCadastro } = await admin
        .from("agent_inbox_items")
        .select("title")
        .eq("organization_id", c.org_id)
        .eq("kind", "external_api_notice");
      expect((avisosDoCadastro ?? []).map((a) => (a as { title: string }).title)).toContain("A API «Consultar pedido na loja» foi cadastrada");

      // 9 · Sair do recomendado NÃO é um clique só: o risco aparece antes, e «Manter como está» não muda nada.
      await abrirOpcoes(page);
      await page.getByTestId("controle-somente_consulta").click();
      const confirmar = page.getByTestId("confirmar-risco");
      await expect(confirmar).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("risco-da-mudanca")).toContainText("pode criar, mudar ou apagar informações em outro sistema");
      await expect(confirmar).toContainText("Recomendamos manter ligado");
      await captura(page, "api-08-risco-antes-de-salvar");
      await page.getByTestId("manter-recomendado").click();
      await expect(confirmar).toBeHidden();
      expect((await segurancaNoBanco(c.org_id))?.somente_consulta).toBe(true);
      await expect(page.getByTestId("resumo-da-seguranca")).toHaveAttribute("data-fora", "0");

      // 10 · «Mudar mesmo assim»: grava, deixa o selo e o resumo conta a opção fora do recomendado.
      await page.getByTestId("controle-somente_consulta").click();
      await page.getByTestId("mudar-mesmo-assim").click();
      await expect(page.getByTestId("selo-fora-somente_consulta")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("resumo-da-seguranca")).toHaveAttribute("data-fora", "1");
      await expect(page.getByTestId("resumo-da-seguranca")).toContainText("Somente consulta");
      await expect(page.getByTestId("nivel-de-seguranca")).toHaveAttribute("data-nivel", "personalizado");
      expect((await segurancaNoBanco(c.org_id))?.somente_consulta).toBe(false);
      await captura(page, "api-09-fora-do-recomendado-com-selo");

      // A mudança ficou na auditoria com a opção afrouxada, e virou aviso na Central.
      // (A auditoria é gravada em segundo plano: a conferência espera por ela.)
      await expect
        .poll(
          async () => {
            const { data: trilha } = await admin
              .from("api_audit_log")
              .select("metadata")
              .eq("organization_id", c.org_id)
              .eq("action", "ai.api_security_changed")
              .order("created_at", { ascending: false })
              .limit(5);
            return (trilha ?? []).some((t) =>
              ((t as { metadata: { afrouxadas?: string[] } }).metadata.afrouxadas ?? []).includes("somente_consulta"),
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      const { data: avisosDaSeguranca } = await admin
        .from("agent_inbox_items")
        .select("title, body")
        .eq("organization_id", c.org_id)
        .eq("kind", "external_api_notice")
        .like("title", "A segurança das APIs foi alterada — fora do recomendado: Somente consulta%");
      // Ligar e afrouxar aconteceram no mesmo minuto: o aviso de quem tirou a proteção tem título
      // próprio e NÃO foi engolido pelo de «APIs ligadas».
      expect((avisosDaSeguranca ?? []).length).toBe(1);
      expect(JSON.stringify(avisosDaSeguranca)).toContain("Saíram da posição recomendada: Somente consulta");

      // 11 · Agora dá para marcar «altera dados»; salvar SEM aprovação pede outra confirmação de risco.
      await page.getByTestId(`api-editar-${api.id}`).click();
      const edicao = page.getByTestId("formulario-da-api");
      await expect(edicao.getByTestId("api-efeito-altera")).toBeEnabled();
      // A chave gravada não volta para a tela: o campo abre vazio.
      await expect(edicao.getByTestId("api-credencial")).toHaveValue("");
      // A aprovação segue travada pela organização («aprovação sempre obrigatória»).
      await edicao.getByTestId("api-efeito-altera").check();
      await expect(edicao.getByTestId("api-pedir-aprovacao")).toBeDisabled();
      await expect(edicao.getByTestId("api-aprovacao-travada")).toBeVisible();
      // Tirar o limite de uso sai do recomendado: o risco aparece antes de salvar.
      await edicao.getByTestId("api-efeito-consulta").check();
      await edicao.getByTestId("api-sem-limite-conversa").check();
      await expect(edicao.getByTestId("selo-fora-limite_de_uso")).toBeVisible();
      await edicao.getByTestId("salvar-api").click();
      const riscoDaApi = page.getByTestId("confirmar-risco-da-api");
      await expect(riscoDaApi).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("risco-da-api-limite_de_uso")).toContainText("centenas de chamadas");
      await captura(page, "api-10-risco-da-api-antes-de-salvar");
      await page.getByTestId("voltar-e-ajustar").click();
      await expect(riscoDaApi).toBeHidden();
      await edicao.getByTestId("api-sem-limite-conversa").uncheck();
      await edicao.getByTestId("salvar-api").click();
      await expect(edicao).toBeHidden({ timeout: 60_000 });

      // 12 · «Testar de verdade» contra um endereço que não responde: a tela diz que não funcionou.
      await page.getByTestId(`api-testar-${api.id}`).click();
      const teste = page.getByTestId("teste-da-api");
      await teste.locator("#api-teste-numero").fill("4512");
      await teste.getByTestId("api-executar-teste").click();
      const resultado = page.getByTestId("api-resultado-do-teste");
      await expect(resultado).toBeVisible({ timeout: 90_000 });
      await expect(resultado).toHaveAttribute("data-ok", "nao");
      registra(`API genérica · teste contra endereço que não responde = ${await resultado.innerText()}`);
      // O que foi enviado aparece SEM a chave de acesso.
      expect(await teste.innerText()).not.toContain(CREDENCIAL);
      await captura(page, "api-11-testar-de-verdade-explica-a-falha");
      await page.keyboard.press("Escape");
      await expect(teste).toBeHidden({ timeout: 15_000 });

      // 13 · A trava vale na EXECUÇÃO: limitar os endereços tira do agente a API gravada antes da lista.
      await abrirOpcoes(page);
      await page.getByTestId("controle-dominios_permitidos").fill("api.outro-sistema.example.com");
      await page.getByTestId("salvar-dominios").click();
      await expect(page.getByTestId(`api-trava-${api.id}`)).toContainText("não está na lista de endereços permitidos", { timeout: 30_000 });
      await captura(page, "api-12-trava-de-enderecos-barra-a-api");

      // No editor do agente a API aparece com o selo «API», a causa escrita e sem poder ser marcada.
      await page.goto("/app/ai/agents/new");
      const grupo = page.getByTestId("grupo-ferramentas-externas");
      await grupo.scrollIntoViewIfNeeded({ timeout: 60_000 });
      const linhaNoGrupo = page.getByTestId(`ferramenta-externa-${api.id}`);
      await expect(linhaNoGrupo).toContainText("Consultar pedido na loja");
      await expect(page.getByTestId(`ferramenta-api-${api.id}`)).toBeVisible();
      await expect(page.getByTestId(`indisponivel-${api.id}`)).toContainText("endereços permitidos");
      await expect(grupo.getByRole("checkbox", { name: "Consultar pedido na loja" })).toBeDisabled();
      await captura(page, "api-13-no-agente-barrada-pela-trava");

      // 14 · Tirar a lista devolve a API ao agente; voltar ao nível «Mais seguro» é direto, sem confirmação.
      await page.goto("/app/ai/external-tools?aba=apis");
      await expect(page.getByTestId("apis-ligado")).toBeVisible({ timeout: 60_000 });
      await abrirOpcoes(page);
      await page.getByTestId("controle-dominios_permitidos").fill("");
      await page.getByTestId("salvar-dominios").click();
      await expect(page.getByTestId(`api-trava-${api.id}`)).toBeHidden({ timeout: 30_000 });
      await page.getByTestId("nivel-mais_seguro").click();
      await expect(page.getByTestId("nivel-de-seguranca")).toHaveAttribute("data-nivel", "mais_seguro", { timeout: 30_000 });
      await expect(page.getByTestId("resumo-da-seguranca")).toHaveAttribute("data-fora", "0");
      expect((await segurancaNoBanco(c.org_id))?.somente_consulta).toBe(true);

      await page.goto("/app/ai/agents/new");
      const grupo2 = page.getByTestId("grupo-ferramentas-externas");
      await grupo2.scrollIntoViewIfNeeded({ timeout: 60_000 });
      await expect(grupo2.getByRole("checkbox", { name: "Consultar pedido na loja" })).toBeEnabled();
      const consumoAntes = await page.getByTestId("consumo-teto").innerText();
      await grupo2.getByRole("checkbox", { name: "Consultar pedido na loja" }).check();
      const consumoDepois = await page.getByTestId("consumo-teto").innerText();
      expect(Number(consumoDepois.split(" ")[0])).toBe(Number(consumoAntes.split(" ")[0]) + 1);
      await captura(page, "api-14-marcada-no-agente");

      // 15 · Desligar o recurso: nada é apagado, e a API deixa de poder ser marcada no agente.
      await page.goto("/app/ai/external-tools?aba=apis");
      await page.getByTestId("apis-desligar").click();
      await page.getByTestId("confirmar-desligar-apis").click();
      await expect(page.getByTestId("apis-desligado")).toBeVisible({ timeout: 30_000 });
      const { count: aindaGuardadas } = await admin
        .from("agent_external_tools")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id)
        .eq("kind", "api");
      expect(aindaGuardadas).toBe(1);
      await page.goto("/app/ai/agents/new");
      const grupo3 = page.getByTestId("grupo-ferramentas-externas");
      await grupo3.scrollIntoViewIfNeeded({ timeout: 60_000 });
      await expect(page.getByTestId(`indisponivel-${api.id}`)).toContainText("desligadas");
      await expect(grupo3.getByRole("checkbox", { name: "Consultar pedido na loja" })).toBeDisabled();
      await captura(page, "api-15-desligado-some-do-agente");
    } finally {
      await instalacaoNova(c.org_id);
    }
  });
});

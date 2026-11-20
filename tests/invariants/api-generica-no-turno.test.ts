import { randomUUID } from "node:crypto";
import * as http from "node:http";
import type { AddressInfo } from "node:net";

import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  abrirAvisoAoAdministrador,
  carregarFerramentasDoTurno,
  contarUsoDaFerramenta,
  dependenciasDoMotor,
  lerContatoDaConversa,
  registrarDesfechoDaFerramenta,
} from "@/lib/ai/ferramentas-externas/repositorio-do-turno";
import { montarFerramentasExternas } from "@/lib/ai/ferramentas-externas/turno";

/**
 * A API GENÉRICA NO TURNO, CONTRA O BANCO DE VERDADE (issue #372).
 *
 * As regras puras têm teste unitário (`lib/ai/ferramentas-externas/api/*.test.ts`). O que só um
 * banco e uma rede de verdade provam, e é o que este arquivo mede:
 *
 *   1. AS TRAVAS VALEM NA EXECUÇÃO. A organização muda a segurança e a MESMA ferramenta, sem
 *      ninguém editá-la, some do turno (recurso desligado, «somente consulta», endereço fora da
 *      lista, dado do contato que deixou de ser liberado) — e volta quando a trava sai.
 *   2. «APROVAÇÃO SEMPRE OBRIGATÓRIA» vence a chave desligada da ferramenta: o que sairia direto
 *      vira pedido pendente na Central e NADA chega ao outro sistema.
 *   3. O DADO DO CONTATO é o de quem está na conversa, lido do banco — não o que o modelo
 *      preencher —, e a credencial cifrada chega ao outro sistema no cabeçalho cadastrado.
 *   4. O LIMITE DE USO conta por conversa e por dia, e a chamada que passa do limite não sai.
 *   5. A PAUSA AUTOMÁTICA desativa a ferramenta na N-ésima falha seguida, uma vez só, e o sucesso
 *      zera a contagem.
 *   6. ISOLAMENTO: a ferramenta, a contagem de uso e o contato de uma organização não são
 *      alcançados pelo id de outra; e as tabelas novas são só do servidor.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 2 });

const ORG = "a1a1a1a1-0372-4000-8000-000000000001";
const OUTRA_ORG = "a1a1a1a1-0372-4000-8000-000000000002";
const SESSAO = "a1a1a1a1-0372-4000-8000-000000000011";
const CONTATO = "a1a1a1a1-0372-4000-8000-000000000021";
const CONVERSA = "a1a1a1a1-0372-4000-8000-000000000031";
const CONTATO_ALHEIO = "a1a1a1a1-0372-4000-8000-000000000022";
const CONVERSA_ALHEIA = "a1a1a1a1-0372-4000-8000-000000000032";
const SESSAO_ALHEIA = "a1a1a1a1-0372-4000-8000-000000000012";
const TELEFONE = "+5511988887777";
const CREDENCIAL = "chave-da-loja-de-teste-9911";
const ACEITE = { em: "2026-11-20T12:00:00.000Z", por: "11111111-1111-4111-8111-111111111111" };

/** A segurança das APIs da organização: ligada, com o resto na posição recomendada salvo o que o caso mudar. */
async function seguranca(mudanca: Record<string, unknown> | null): Promise<void> {
  const valor = mudanca === null ? {} : { api_externa: { ligado: true, aceite: ACEITE, ...mudanca } };
  await pool.query("update organizations set settings = $2::jsonb where id = $1", [ORG, JSON.stringify(valor)]);
}

interface Recebido {
  metodo: string;
  caminho: string;
  headers: http.IncomingHttpHeaders;
  corpo: string;
}
let servidor: http.Server;
let base = "";
let recebidos: Recebido[] = [];
/** O que o «outro sistema» responde a cada chamada. Cada caso troca. */
let responder: (r: Recebido, res: http.ServerResponse) => void = (_r, res) => res.end(JSON.stringify({ ok: true }));

const LIBERA_LOCAL = { politica: { permitirHttp: true, ipPermitido: () => true }, dormir: async () => {} };

function config(mudanca: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metodo: "GET",
    cabecalhos: [],
    corpo: { modo: "campos", modelo: null },
    credencial: { tipo: "nenhuma", cabecalho: null, usuario: null },
    campos_resposta: [],
    dados_contato: [],
    limite_por_conversa: 5,
    limite_por_dia: 200,
    pausa_apos_falhas: 5,
    ...mudanca,
  };
}

const NUMERO = { nome: "numero", tipo: "texto", descricao: "Número do pedido", obrigatorio: true };

async function criarFerramenta(f: {
  slug: string;
  caminho: string;
  efeito?: "consulta" | "altera";
  requireApproval?: boolean | null;
  config?: Record<string, unknown>;
  credencial?: string;
  parametros?: unknown[];
  org?: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into agent_external_tools
       (id, organization_id, kind, name, slug, when_to_use, url, parameters, effect, require_approval, active, api_config,
        signing_secret_encrypted, signing_secret_last4)
     values ($1, $2, 'api', $3, $4, 'Quando o cliente perguntar pelo pedido dele.', $5, $6::jsonb, $7, $8, true, $9::jsonb,
             case when $10::text is null then null else public.fn_encrypt_oauth($10::text) end,
             case when $10::text is null then null else right($10::text, 4) end)`,
    [
      id,
      f.org ?? ORG,
      `API ${f.slug}`,
      f.slug,
      `${base}${f.caminho}`,
      JSON.stringify(f.parametros ?? [NUMERO]),
      f.efeito ?? "consulta",
      f.requireApproval ?? null,
      JSON.stringify(f.config ?? config()),
      f.credencial ?? null,
    ],
  );
  return id;
}

const semLog = { warn: () => {} };

/** As ferramentas montadas para o turno, com as dependências REAIS do motor (banco) e a rede de teste liberada. */
async function montar(ids: string[], conversa: string | null = CONVERSA) {
  const doMotor = dependenciasDoMotor({ db: pool, organizationId: ORG, agentId: null, jobId: null, conversationId: conversa, log: semLog });
  return montarFerramentasExternas({ ids, modo: "ao_vivo" }, { ...doMotor, ...LIBERA_LOCAL });
}

async function executar(tools: Record<string, unknown>, nome: string, argumentos: unknown): Promise<Record<string, unknown>> {
  const ferramenta = tools[nome] as { execute: (a: unknown, o: unknown) => Promise<unknown> } | undefined;
  if (!ferramenta) throw new Error(`a ferramenta ${nome} não foi montada`);
  return (await ferramenta.execute(argumentos, { toolCallId: randomUUID(), messages: [] })) as Record<string, unknown>;
}

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => partes.push(p));
    req.on("end", () => {
      const r = { metodo: req.method ?? "", caminho: req.url ?? "", headers: req.headers, corpo: Buffer.concat(partes).toString("utf8") };
      recebidos.push(r);
      responder(r, res);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  // A cifra de OAuth levanta quando a chave da instalação não está semeada: aqui a cifra é a REAL.
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-sintetica-do-invariante-com-32-mais-chars')
     on conflict (name) do nothing`,
  );

  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1,'api-generica-a','API Genérica A','API Genérica A'), ($2,'api-generica-b','API Genérica B','API Genérica B')
     on conflict (id) do nothing`,
    [ORG, OUTRA_ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1,$2,'api-gen-a','WORKING','\\x00'::bytea), ($3,$4,'api-gen-b','WORKING','\\x00'::bytea)
     on conflict (id) do nothing`,
    [SESSAO, ORG, SESSAO_ALHEIA, OUTRA_ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number, email)
     values ($1,$2,'Maria da Loja',$3,'maria@example.com'), ($4,$5,'Cliente Alheio','+5511900000000','alheio@example.com')
     on conflict (id) do nothing`,
    [CONTATO, ORG, TELEFONE, CONTATO_ALHEIO, OUTRA_ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1,$2,$3,$4,'ai_handling',false), ($5,$6,$7,$8,'ai_handling',false)
     on conflict (id) do nothing`,
    [CONVERSA, ORG, CONTATO, SESSAO, CONVERSA_ALHEIA, OUTRA_ORG, CONTATO_ALHEIO, SESSAO_ALHEIA],
  );
});

afterEach(async () => {
  recebidos = [];
  responder = (_r, res) => res.end(JSON.stringify({ ok: true }));
  await pool.query("delete from agent_external_tool_requests where organization_id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await pool.query("delete from agent_external_tool_calls where organization_id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await pool.query("delete from agent_inbox_items where organization_id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await pool.query("delete from agent_external_tools where organization_id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await seguranca(null);
});

afterAll(async () => {
  await pool.query("delete from conversations where id = any($1::uuid[])", [[CONVERSA, CONVERSA_ALHEIA]]);
  await pool.query("delete from contacts where id = any($1::uuid[])", [[CONTATO, CONTATO_ALHEIO]]);
  await pool.query("delete from channel_sessions where id = any($1::uuid[])", [[SESSAO, SESSAO_ALHEIA]]);
  await pool.query("delete from organizations where id = any($1::uuid[])", [[ORG, OUTRA_ORG]]);
  await pool.end();
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

describe("as travas da organização valem a cada turno, sem ninguém editar a ferramenta", () => {
  it("recurso desligado (o padrão): a ferramenta não é oferecida; ligado: é", async () => {
    const consulta = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}" });
    expect(await carregarFerramentasDoTurno(pool, ORG, [consulta])).toEqual([]);
    await seguranca({});
    const carregadas = await carregarFerramentasDoTurno(pool, ORG, [consulta]);
    expect(carregadas.map((f) => f.slug)).toEqual(["consultar_pedido"]);
    expect(carregadas[0]?.api?.config.metodo).toBe("GET");
  });

  it("«somente consulta» tira a que altera e deixa a consulta; desligar a trava devolve", async () => {
    const consulta = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}" });
    const altera = await criarFerramenta({ slug: "cancelar_pedido", caminho: "/pedidos/{{numero}}", efeito: "altera", config: config({ metodo: "DELETE" }) });
    await seguranca({});
    expect((await carregarFerramentasDoTurno(pool, ORG, [consulta, altera])).map((f) => f.slug)).toEqual(["consultar_pedido"]);
    await seguranca({ somente_consulta: false });
    expect((await carregarFerramentasDoTurno(pool, ORG, [consulta, altera])).map((f) => f.slug).sort()).toEqual(["cancelar_pedido", "consultar_pedido"]);
  });

  it("endereço fora da lista de permitidos tira a ferramenta gravada ANTES de a lista existir", async () => {
    const consulta = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}" });
    await seguranca({});
    expect(await carregarFerramentasDoTurno(pool, ORG, [consulta])).toHaveLength(1);
    await seguranca({ dominios_permitidos: ["api.outro-sistema.example"] });
    expect(await carregarFerramentasDoTurno(pool, ORG, [consulta])).toEqual([]);
  });

  it("dado do contato que a organização deixou de liberar tira a ferramenta que o usa", async () => {
    const consulta = await criarFerramenta({
      slug: "pedidos_do_cliente",
      caminho: "/clientes/{{contato_telefone}}/pedidos",
      parametros: [],
      config: config({ dados_contato: ["telefone"] }),
    });
    await seguranca({ dados_do_contato: ["telefone"] });
    expect(await carregarFerramentasDoTurno(pool, ORG, [consulta])).toHaveLength(1);
    await seguranca({ dados_do_contato: [] });
    expect(await carregarFerramentasDoTurno(pool, ORG, [consulta])).toEqual([]);
  });

  it("config gravada ilegível deixa a ferramenta FORA do turno", async () => {
    const torta = await criarFerramenta({ slug: "torta", caminho: "/x", parametros: [], config: { metodo: "TRACE" } });
    await seguranca({});
    expect(await carregarFerramentasDoTurno(pool, ORG, [torta])).toEqual([]);
  });
});

describe("a chamada de verdade, com o banco decidindo", () => {
  it("consulta: o telefone é o de quem está na conversa (não o que o modelo mandar) e a credencial cifrada chega no cabeçalho", async () => {
    const id = await criarFerramenta({
      slug: "pedidos_do_cliente",
      caminho: "/clientes/{{contato_telefone}}/pedidos/{{numero}}",
      credencial: CREDENCIAL,
      config: config({
        credencial: { tipo: "cabecalho", cabecalho: "X-API-Key", usuario: null },
        dados_contato: ["telefone"],
        campos_resposta: ["status"],
      }),
    });
    await seguranca({ dados_do_contato: ["telefone"] });
    responder = (_r, res) => res.end(JSON.stringify({ status: "enviado", cpf: "000.000.000-00" }));

    const { tools } = await montar([id]);
    // O modelo só conhece o campo `numero`: um campo a mais (o telefone de outra pessoa) é recusado na borda.
    const intruso = await executar(tools, "ext_pedidos_do_cliente", { numero: "4512", contato_telefone: "+5500000000000" });
    expect(intruso.ok).toBe(false);
    expect(recebidos).toHaveLength(0);

    const r = await executar(tools, "ext_pedidos_do_cliente", { numero: "4512" });
    expect(r.ok).toBe(true);
    expect(r.dado_nao_confiavel).toBe(true);
    expect(JSON.parse(String(r.dado))).toEqual({ status: "enviado" });
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]?.metodo).toBe("GET");
    expect(recebidos[0]?.caminho).toBe(`/clientes/${encodeURIComponent(TELEFONE)}/pedidos/4512`);
    expect(recebidos[0]?.headers["x-api-key"]).toBe(CREDENCIAL);

    // A auditoria diz que é API e não leva credencial, endereço nem o que foi enviado.
    const { rows } = await pool.query<{ metadata: Record<string, unknown> }>(
      "select metadata from api_audit_log where organization_id = $1 and action = 'ai.external_tool_called' and resource_id = $2",
      [ORG, id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({ kind: "api", ok: true });
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain(CREDENCIAL);
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain("4512");
  });

  it("«aprovação sempre obrigatória» vence a chave desligada: vira pedido pendente e NADA sai", async () => {
    const id = await criarFerramenta({
      slug: "cancelar_pedido",
      caminho: "/pedidos/{{numero}}",
      efeito: "altera",
      requireApproval: false,
      config: config({ metodo: "DELETE" }),
    });
    await seguranca({ somente_consulta: false });
    const { tools } = await montar([id]);
    const r = await executar(tools, "ext_cancelar_pedido", { numero: "4512" });
    expect(r.status).toBe("awaiting_approval");
    expect(recebidos).toHaveLength(0);
    const pendentes = await pool.query("select status from agent_external_tool_requests where organization_id = $1 and tool_id = $2", [ORG, id]);
    expect(pendentes.rows).toEqual([{ status: "pending" }]);

    // Sem a trava, a MESMA ferramenta sai direto, uma vez — e o administrador é avisado.
    await pool.query("delete from agent_external_tool_requests where organization_id = $1", [ORG]);
    await seguranca({ somente_consulta: false, aprovacao_obrigatoria: false });
    const livre = await montar([id]);
    const direto = await executar(livre.tools, "ext_cancelar_pedido", { numero: "4512" });
    expect(direto.ok).toBe(true);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]?.metodo).toBe("DELETE");
    const avisos = await pool.query<{ title: string }>(
      "select title from agent_inbox_items where organization_id = $1 and kind = 'external_api_notice'",
      [ORG],
    );
    expect(avisos.rows.map((a) => a.title)).toEqual(["O agente executou «API cancelar_pedido» sem aprovação"]);
  });

  it("limite por conversa: a chamada que passa do limite NÃO sai, o agente é orientado e a Central ganha um aviso", async () => {
    const id = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}", config: config({ limite_por_conversa: 2 }) });
    await seguranca({});
    const { tools } = await montar([id]);
    expect((await executar(tools, "ext_consultar_pedido", { numero: "1" })).ok).toBe(true);
    expect((await executar(tools, "ext_consultar_pedido", { numero: "2" })).ok).toBe(true);
    const terceira = await executar(tools, "ext_consultar_pedido", { numero: "3" });
    expect(terceira.ok).toBe(false);
    expect((terceira.error as { code: string }).code).toBe("external_tool_limit_reached");
    expect(recebidos).toHaveLength(2);
    const avisos = await pool.query("select title from agent_inbox_items where organization_id = $1 and kind = 'external_tool_failed'", [ORG]);
    expect(avisos.rows).toHaveLength(1);
  });

  it("limite por dia soma todas as conversas; sem limite (nulo) nunca barra", async () => {
    const id = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}" });
    const contar = (conversa: string | null, porConversa: number | null, porDia: number | null) =>
      contarUsoDaFerramenta(pool, ORG, { ferramentaId: id, conversationId: conversa, limitePorConversa: porConversa, limitePorDia: porDia });
    expect(await contar(CONVERSA, null, 2)).toEqual({ cabe: true });
    expect(await contar(null, null, 2)).toEqual({ cabe: true });
    expect(await contar(CONVERSA, null, 2)).toEqual({ cabe: false, limite: "dia" });
    expect(await contar(CONVERSA, null, null)).toEqual({ cabe: true });
  });

  it("pausa automática: desativa na N-ésima falha seguida, UMA vez, e o sucesso zera a contagem", async () => {
    const id = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}", config: config({ pausa_apos_falhas: 3 }) });
    const registrar = (ok: boolean) => registrarDesfechoDaFerramenta(pool, ORG, { ferramentaId: id, ok, pausaAposFalhas: 3 });
    const estado = async () =>
      (await pool.query<{ active: boolean; consecutive_failures: number; pausada: boolean }>(
        "select active, consecutive_failures, auto_paused_at is not null as pausada from agent_external_tools where id = $1",
        [id],
      )).rows[0];

    expect(await registrar(false)).toBe(false);
    expect(await registrar(false)).toBe(false);
    expect(await registrar(true)).toBe(false);
    expect(await estado()).toEqual({ active: true, consecutive_failures: 0, pausada: false });

    expect(await registrar(false)).toBe(false);
    expect(await registrar(false)).toBe(false);
    expect(await registrar(false)).toBe(true);
    expect(await estado()).toEqual({ active: false, consecutive_failures: 3, pausada: true });
    // Outra falha depois de pausada não «pausa de novo» (não abre segundo aviso).
    expect(await registrar(false)).toBe(false);
    // Sem pausa configurada, nunca desativa.
    await pool.query("update agent_external_tools set active = true, consecutive_failures = 0, auto_paused_at = null where id = $1", [id]);
    for (let i = 0; i < 6; i++) {
      expect(await registrarDesfechoDaFerramenta(pool, ORG, { ferramentaId: id, ok: false, pausaAposFalhas: null })).toBe(false);
    }
    expect((await estado())?.active).toBe(true);
  });

  it("no turno: a ferramenta que falha seguidas vezes é pausada e some do turno seguinte, com aviso na Central", async () => {
    const id = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}", config: config({ pausa_apos_falhas: 2, limite_por_conversa: 50 }) });
    await seguranca({});
    responder = (_r, res) => {
      res.statusCode = 404;
      res.end("{}");
    };
    const { tools } = await montar([id]);
    await executar(tools, "ext_consultar_pedido", { numero: "1" });
    await executar(tools, "ext_consultar_pedido", { numero: "2" });
    expect(await carregarFerramentasDoTurno(pool, ORG, [id])).toEqual([]);
    const avisos = await pool.query<{ title: string }>(
      "select title from agent_inbox_items where organization_id = $1 and kind = 'external_tool_failed' and title like '%pausada%'",
      [ORG],
    );
    expect(avisos.rows).toHaveLength(1);
  });
});

describe("isolamento entre organizações e tabelas só do servidor", () => {
  it("a ferramenta, a contagem e o contato de uma organização não são alcançados pelo id de outra", async () => {
    await seguranca({});
    await pool.query("update organizations set settings = $2::jsonb where id = $1", [
      OUTRA_ORG,
      JSON.stringify({ api_externa: { ligado: true, aceite: ACEITE } }),
    ]);
    const alheia = await criarFerramenta({ slug: "consultar_pedido", caminho: "/pedidos/{{numero}}", org: OUTRA_ORG });
    // O id é da OUTRA organização: para esta, a ferramenta não existe.
    expect(await carregarFerramentasDoTurno(pool, ORG, [alheia])).toEqual([]);
    expect(await carregarFerramentasDoTurno(pool, OUTRA_ORG, [alheia])).toHaveLength(1);
    // A conversa é da outra organização: nenhum dado de contato sai.
    expect(await lerContatoDaConversa(pool, ORG, CONVERSA_ALHEIA)).toEqual({});
    expect(await lerContatoDaConversa(pool, OUTRA_ORG, CONVERSA_ALHEIA)).toMatchObject({ telefone: "+5511900000000" });
    // A pausa automática de uma organização não toca a ferramenta de outra.
    expect(await registrarDesfechoDaFerramenta(pool, ORG, { ferramentaId: alheia, ok: false, pausaAposFalhas: 1 })).toBe(false);
    const { rows } = await pool.query<{ active: boolean; consecutive_failures: number }>(
      "select active, consecutive_failures from agent_external_tools where id = $1",
      [alheia],
    );
    expect(rows[0]).toEqual({ active: true, consecutive_failures: 0 });
    // A contagem de uso não grava linha ligando ESTA organização à ferramenta de outra.
    await contarUsoDaFerramenta(pool, ORG, { ferramentaId: alheia, conversationId: null, limitePorConversa: 5, limitePorDia: 5 });
    const cruzadas = await pool.query("select 1 from agent_external_tool_calls where tool_id = $1", [alheia]);
    expect(cruzadas.rows).toHaveLength(0);
    await pool.query("update organizations set settings = '{}'::jsonb where id = $1", [OUTRA_ORG]);
  });

  it("contato anonimizado (LGPD) não tem dado para enviar", async () => {
    expect(await lerContatoDaConversa(pool, ORG, CONVERSA)).toEqual({ telefone: TELEFONE, nome: "Maria da Loja", email: "maria@example.com" });
    await pool.query("update contacts set is_anonymized = true, anonymized_at = now() where id = $1", [CONTATO]);
    expect(await lerContatoDaConversa(pool, ORG, CONVERSA)).toEqual({});
    await pool.query("update contacts set is_anonymized = false, anonymized_at = null where id = $1", [CONTATO]);
  });

  it("«avisar o administrador» desligado cala o aviso; ligado (ou nunca configurado) avisa uma vez por título", async () => {
    const aviso = { titulo: "Aviso de teste da API", corpo: "corpo" };
    const contar = async () =>
      Number((await pool.query("select count(*) as n from agent_inbox_items where organization_id = $1 and kind = 'external_api_notice'", [ORG])).rows[0].n);
    await seguranca({ avisar_administrador: false });
    await abrirAvisoAoAdministrador(pool, ORG, aviso);
    expect(await contar()).toBe(0);
    await seguranca({});
    await abrirAvisoAoAdministrador(pool, ORG, aviso);
    await abrirAvisoAoAdministrador(pool, ORG, aviso);
    expect(await contar()).toBe(1);
  });

  it("a contagem de uso é só do servidor: RLS ligada, nenhuma policy, sem acesso de anon e authenticated", async () => {
    const { rows } = await pool.query<Record<string, unknown>>(`
      select
        has_table_privilege('anon', 'public.agent_external_tool_calls', 'select') as anon_le,
        has_table_privilege('authenticated', 'public.agent_external_tool_calls', 'select') as auth_le,
        has_table_privilege('authenticated', 'public.agent_external_tool_calls', 'insert') as auth_grava,
        has_table_privilege('service_role', 'public.agent_external_tool_calls', 'insert') as service_grava,
        (select relrowsecurity from pg_class where oid = 'public.agent_external_tool_calls'::regclass) as rls,
        (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'agent_external_tool_calls') as policies`);
    expect(rows[0]).toEqual({ anon_le: false, auth_le: false, auth_grava: false, service_grava: true, rls: true, policies: 0 });

    // `organization_id` é obrigatório e apaga em cascata com a organização.
    const coluna = await pool.query<{ is_nullable: string; cascata: boolean }>(`
      select
        (select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'agent_external_tool_calls' and column_name = 'organization_id') as is_nullable,
        exists (
          select 1 from pg_constraint
           where conrelid = 'public.agent_external_tool_calls'::regclass
             and confrelid = 'public.organizations'::regclass
             and contype = 'f' and confdeltype = 'c'
        ) as cascata`);
    expect(coluna.rows[0]).toEqual({ is_nullable: "NO", cascata: true });
  });
});

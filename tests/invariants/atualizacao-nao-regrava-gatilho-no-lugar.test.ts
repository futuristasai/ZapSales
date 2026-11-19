/**
 * A ATUALIZAÇÃO NÃO REGRAVA GATILHO NEM POLICY "NO LUGAR" — e o ajuste de dados
 * da 0222 só pausa o gatilho de `messages` quando há o que carimbar.
 *
 * ## O defeito que este arquivo previne
 *
 * `tests/invariants/atualizacao-nao-recria-policy-nem-gatilho.test.ts` mede o
 * `oid`: objeto derrubado e recriado. Sobrava uma classe que o `oid` não vê — o
 * objeto ALTERADO no lugar. O passo 4 do backfill da 0222 fazia, em TODA
 * aplicação do `baseline.sql`:
 *
 *     alter table public.messages disable trigger trg_appointment_inbound;
 *     update public.messages … where direction = 'inbound' and service_revision is null;
 *     alter table public.messages enable trigger trg_appointment_inbound;
 *
 * sem perguntar se havia mensagem a carimbar. Cada `alter table` pede SHARE ROW
 * EXCLUSIVE em `messages`: barra toda escrita na tabela de mensagens enquanto
 * espera e enquanto dura, com a equipe atendendo. Medido em 19/11/2026 nas três
 * instalações do projeto: zero mensagem a carimbar em todas. O bloco não fazia
 * nada além de travar a tabela — e era o único gatilho que a segunda aplicação
 * do arquivo ainda regravava (a linha de `pg_trigger` mudava de `xmin`).
 *
 * ## O que se guarda
 *
 * 1. O ARQUIVO INTEIRO: o par (`oid`, `xmin`) de todo gatilho e de toda policy é
 *    o mesmo no molde de UMA aplicação e no de DUAS. `xmin` igual prova que a
 *    linha do catálogo não foi reescrita: nem `enable`/`disable`, nem `alter
 *    policy`, nem `create or replace trigger`. Vale para qualquer bloco.
 * 2. O BLOCO, extraído do próprio `baseline.sql` e executado como ele é:
 *    - sem mensagem a carimbar, não regrava o gatilho e não pede trava forte em
 *      `messages` (a sonda é provada viva antes);
 *    - saída sem carimbo (que é o normal de toda saída) NÃO conta como trabalho;
 *    - mensagem de GRUPO também não: quem carimba a entrada é
 *      `fn_service_inbound`, que sai cedo em conversa de grupo — mensagem de
 *      grupo nunca tem carimbo, por desenho. O bloco antigo não excluía grupo:
 *      carimbava, na atualização seguinte, o que a ingestão tinha deixado sem
 *      carimbo de propósito, e pausava o gatilho em toda atualização de quem
 *      usa grupos. O caso mede as duas pontas: a ingestão deixa sem carimbo, e
 *      o bloco não mexe;
 *    - com uma entrada legada sem carimbo, carimba com o atendimento da conversa,
 *      e o gatilho estava PAUSADO durante o carimbo (o aviso do próprio bloco
 *      diz) e volta LIGADO.
 *
 * O último caso é o que impede o conserto de virar "nunca mais pausa": sem a
 * pausa, o carimbo de uma mensagem antiga dispararia a recuperação de agenda
 * como se a mensagem tivesse acabado de chegar.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { criarOrigemDeFollowup } from "./followup-service-origin";
import { sql } from "./psql-transporte";

const moldeDuasAplicacoes = process.env.TEST_DB_TEMPLATE;
const moldeUmaAplicacao = process.env.TEST_DB_TEMPLATE_UMA_APLICACAO;
if (!moldeDuasAplicacoes || !moldeUmaAplicacao) {
  throw new Error(
    "TEST_DB_TEMPLATE/TEST_DB_TEMPLATE_UMA_APLICACAO ausentes — rode via `pnpm test:db` (scripts/test-db.sh), " +
      "que tira o molde de aplicação única entre o install e o update.",
  );
}

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});
afterAll(() => pool.end());

/** O bloco `do $$ … end $$;` do passo 4, como está no arquivo que a instalação aplica. */
function blocoDoPasso4(): string {
  const baseline = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");
  const marca = "-- 4 · Mensagem legada pertence ao atendimento vigente da sua conversa.";
  const ocorrencias = baseline.split(marca).length - 1;
  if (ocorrencias !== 1) throw new Error(`o marcador do passo 4 aparece ${ocorrencias} vezes no baseline (esperava 1)`);
  const inicio = baseline.indexOf("\ndo $$\n", baseline.indexOf(marca)) + 1;
  const fim = baseline.indexOf("\nend $$;\n", inicio) + "\nend $$;\n".length;
  if (inicio <= 0 || fim <= inicio) throw new Error("não achei o bloco `do $$ … end $$;` do passo 4");
  return baseline.slice(inicio, fim);
}

const BLOCO = blocoDoPasso4();

/** Uma linha por objeto: `schema.tabela/nome/oid/xmin`. */
const GATILHOS = `
  select coalesce(string_agg(n.nspname || '.' || c.relname || '/' || t.tgname || '/' || t.oid || '/' || t.xmin::text, E'\\n'
                             order by n.nspname, c.relname, t.tgname), '')
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal`;
const POLICIES = `
  select coalesce(string_agg(n.nspname || '.' || c.relname || '/' || p.polname || '/' || p.oid || '/' || p.xmin::text, E'\\n'
                             order by n.nspname, c.relname, p.polname), '')
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace`;

function listar(banco: string, consulta: string): string[] {
  return sql(`\\c ${banco}\n${consulta};`)
    .split("\n")
    .filter((l) => /^[a-z_]+\.[^/]+\/[^/]+\/\d+\/\d+$/.test(l));
}

/** Os objetos cuja linha mudou (`oid` ou `xmin`) entre os dois moldes. */
function mexidos(uma: string[], duas: string[]): string[] {
  const depois = new Set(duas);
  const nome = (l: string) => l.split("/").slice(0, 2).join("/");
  return [...new Set(uma.filter((l) => !depois.has(l)).map(nome))].sort();
}

/** O estado do gatilho que o bloco pausa, e as travas fortes que ESTA sessão segura em `messages`. */
const ESTADO = `
  select t.xmin::text as xmin, t.tgenabled::text as ligado,
         (select count(*)::int from pg_locks l
           where l.pid = pg_backend_pid() and l.locktype = 'relation'
             and l.relation = 'public.messages'::regclass
             and l.mode in ('ShareRowExclusiveLock', 'AccessExclusiveLock')) as travas_fortes
    from pg_trigger t
   where t.tgrelid = 'public.messages'::regclass and t.tgname = 'trg_appointment_inbound'`;

interface Estado {
  xmin: string;
  ligado: string;
  travas_fortes: number;
}

/**
 * Uma conversa com atendimento em curso e uma entrada, numa transação que o
 * caso desfaz. `legada` apaga o carimbo da entrada sem disparar gatilho — é o
 * estado de uma mensagem anterior à 0222.
 */
async function comConversa<T>(
  opcoes: { legada: boolean; comSaida?: boolean; grupo?: boolean },
  medir: (cliente: pg.PoolClient, ids: { mensagem: string; conversa: string }) => Promise<T>,
): Promise<T> {
  const org = randomUUID();
  // A organização, o contato e a origem do atendimento nascem FORA da transação
  // do caso (o helper usa o pool); a organização é apagada no fim.
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Backfill 0222','Backfill 0222')",
    [org],
  );
  const cliente = await pool.connect();
  try {
    const contato = (
      await pool.query("insert into contacts(organization_id,display_name) values($1,'Cliente') returning id", [org])
    ).rows[0].id as string;
    const origem = await criarOrigemDeFollowup(pool, org, contato);
    const canal = (
      await pool.query("select id from channel_sessions where organization_id=$1 order by id limit 1", [org])
    ).rows[0].id as string;

    await cliente.query("begin");
    if (opcoes.grupo) {
      // A conversa vira grupo ANTES de a mensagem chegar: é a ingestão de verdade
      // (`fn_service_inbound`) que decide não carimbar, e não o teste.
      await cliente.query(
        "update conversations set is_group = true, group_chat_id = '120363000000000000@g.us' where id = $1",
        [origem.conversation_id],
      );
    }
    const mensagem = (
      await cliente.query(
        "insert into messages(organization_id,contact_id,conversation_id,channel_session_id,direction,type,status,body,sent_at) values($1,$2,$3,$4,'inbound','text','received','entrada',now()) returning id",
        [org, contato, origem.conversation_id, canal],
      )
    ).rows[0].id as string;
    if (opcoes.comSaida) {
      await cliente.query(
        "insert into messages(organization_id,contact_id,conversation_id,channel_session_id,direction,type,status,body,sent_at) values($1,$2,$3,$4,'outbound','text','sent','saída',now())",
        [org, contato, origem.conversation_id, canal],
      );
    }
    if (opcoes.legada) {
      // `replica` pula os gatilhos só neste UPDATE, sem tocar `pg_trigger` — o
      // `xmin` do gatilho continua sendo o de antes da transação.
      await cliente.query("set local session_replication_role = replica");
      await cliente.query(
        "update messages set service_revision = null, demanda_id = null, demanda_revision = null where id = $1",
        [mensagem],
      );
      await cliente.query("set local session_replication_role = origin");
    }
    return await medir(cliente, { mensagem, conversa: origem.conversation_id as string });
  } finally {
    await cliente.query("rollback").catch(() => undefined);
    cliente.release();
    await pool.query("delete from organizations where id = $1", [org]).catch(() => undefined);
  }
}

describe("a atualização não regrava gatilho nem policy no lugar", () => {
  describe("o baseline inteiro: mesmo (oid, xmin) com uma e com duas aplicações", () => {
    it("gatilhos", () => {
      const uma = listar(moldeUmaAplicacao, GATILHOS);
      const duas = listar(moldeDuasAplicacoes, GATILHOS);

      expect(uma.length, "nenhum gatilho no molde de uma aplicação: a medição não leu nada").toBeGreaterThan(150);
      expect(
        mexidos(uma, duas),
        "gatilhos cuja linha em pg_trigger a SEGUNDA aplicação do baseline reescreveu (mudou o oid ou o xmin): " +
          "um `enable`/`disable trigger`, um `create or replace trigger` ou um drop + create que roda em toda " +
          "atualização. Cada um trava a tabela dele com a equipe em uso.",
      ).toEqual([]);
    });

    it("policies", () => {
      const uma = listar(moldeUmaAplicacao, POLICIES);
      const duas = listar(moldeDuasAplicacoes, POLICIES);

      expect(uma.length, "nenhuma policy no molde de uma aplicação: a medição não leu nada").toBeGreaterThan(500);
      expect(
        mexidos(uma, duas),
        "policies cuja linha em pg_policy a SEGUNDA aplicação do baseline reescreveu (`alter policy`, ou drop + create).",
      ).toEqual([]);
    });
  });

  describe("o passo 4 do backfill da 0222", () => {
    it("o bloco extraído do baseline é o que pausa o gatilho de messages", () => {
      // Se o marcador mudar de lugar, os casos abaixo executariam outro bloco e
      // ficariam verdes medindo coisa nenhuma.
      expect(BLOCO).toContain("alter table public.messages disable trigger trg_appointment_inbound");
      expect(BLOCO).toContain("alter table public.messages enable trigger trg_appointment_inbound");
      expect(BLOCO).toContain("update public.messages m");
    });

    it("a sonda enxerga a pausa quando ela acontece (controle)", async () => {
      const cliente = await pool.connect();
      try {
        await cliente.query("begin");
        const antes = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        await cliente.query("alter table public.messages disable trigger trg_appointment_inbound");
        const depois = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        expect(depois.xmin, "o xmin do gatilho não mudou depois de um disable").not.toBe(antes.xmin);
        expect(depois.ligado).toBe("D");
        expect(depois.travas_fortes, "a sonda não viu a trava de um alter table").toBeGreaterThan(0);
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        cliente.release();
      }
    });

    it("sem mensagem a carimbar: não regrava o gatilho nem trava messages", async () => {
      const cliente = await pool.connect();
      try {
        await cliente.query("begin");
        // Guarda de vacuidade: o caso só mede "sem trabalho" se não houver trabalho.
        const pendentes = (
          await cliente.query<{ n: number }>(
            "select count(*)::int n from messages m join conversations c on c.id = m.conversation_id and c.organization_id = m.organization_id where m.direction = 'inbound' and m.service_revision is null",
          )
        ).rows[0]!.n;
        expect(pendentes, "o banco de teste tem entrada sem carimbo: este caso mediria o caminho com trabalho").toBe(0);

        const antes = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        await cliente.query(BLOCO);
        const depois = (await cliente.query<Estado>(ESTADO)).rows[0]!;

        expect(depois.xmin, "o bloco reescreveu o gatilho sem ter o que carimbar").toBe(antes.xmin);
        expect(depois.ligado).toBe("O");
        expect(depois.travas_fortes, "o bloco travou messages sem ter o que carimbar").toBe(0);
      } finally {
        await cliente.query("rollback").catch(() => undefined);
        cliente.release();
      }
    });

    it("entrada já carimbada e saída sem carimbo (o normal): continua sem trabalho", async () => {
      await comConversa({ legada: false, comSaida: true }, async (cliente, { mensagem }) => {
        const carimbada = (
          await cliente.query<{ ok: boolean }>("select service_revision is not null ok from messages where id = $1", [mensagem])
        ).rows[0]!.ok;
        expect(carimbada, "a entrada nova não nasceu carimbada: o caso não mede o estado normal").toBe(true);

        const antes = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        await cliente.query(BLOCO);
        const depois = (await cliente.query<Estado>(ESTADO)).rows[0]!;

        expect(depois.xmin, "saída sem carimbo foi tratada como trabalho: o bloco pausaria o gatilho em toda atualização").toBe(antes.xmin);
        expect(depois.travas_fortes).toBe(0);
      });
    });

    it("mensagem de grupo: a ingestão não carimba, e o bloco também não — nem pausa o gatilho por ela", async () => {
      await comConversa({ legada: false, grupo: true }, async (cliente, { mensagem }) => {
        const aoChegar = (
          await cliente.query<{ sem: boolean }>("select service_revision is null sem from messages where id = $1", [mensagem])
        ).rows[0]!.sem;
        expect(
          aoChegar,
          "a ingestão carimbou uma mensagem de grupo: a premissa deste caso (e da exclusão no bloco) deixou de valer",
        ).toBe(true);

        const antes = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        await cliente.query(BLOCO);
        const depois = (await cliente.query<Estado>(ESTADO)).rows[0]!;

        const continuaSem = (
          await cliente.query<{ sem: boolean }>("select service_revision is null sem from messages where id = $1", [mensagem])
        ).rows[0]!.sem;
        expect(continuaSem, "o bloco carimbou mensagem de grupo — estado que a ingestão nunca produz").toBe(true);
        expect(depois.xmin, "o bloco pausou o gatilho por causa de mensagem de grupo").toBe(antes.xmin);
        expect(depois.travas_fortes).toBe(0);
      });
    });

    it("entrada legada sem carimbo: carimba com o atendimento da conversa, com o gatilho PAUSADO, e religa", async () => {
      await comConversa({ legada: true }, async (cliente, { mensagem, conversa }) => {
        const semCarimbo = (
          await cliente.query<{ ok: boolean }>("select service_revision is null ok from messages where id = $1", [mensagem])
        ).rows[0]!.ok;
        expect(semCarimbo, "a mensagem não ficou legada: o caso não tem trabalho a medir").toBe(true);

        const avisos: string[] = [];
        const ouvir = (aviso: { message?: string }) => avisos.push(aviso.message ?? "");
        cliente.on("notice", ouvir);
        const antes = (await cliente.query<Estado>(ESTADO)).rows[0]!;
        try {
          await cliente.query(BLOCO);
        } finally {
          cliente.off("notice", ouvir);
        }
        const depois = (await cliente.query<Estado>(ESTADO)).rows[0]!;

        const linha = (
          await cliente.query<{ igual: boolean; demanda_igual: boolean }>(
            `select m.service_revision = c.service_revision as igual,
                    m.demanda_id is not distinct from c.current_demanda_id as demanda_igual
               from messages m join conversations c on c.id = m.conversation_id
              where m.id = $1 and c.id = $2`,
            [mensagem, conversa],
          )
        ).rows[0]!;
        expect(linha, "a mensagem legada não recebeu o atendimento vigente da conversa").toEqual({
          igual: true,
          demanda_igual: true,
        });

        // O aviso do próprio bloco é o controle positivo de que o gatilho estava
        // pausado DURANTE o carimbo; o xmin novo confirma que houve o alter.
        expect(
          avisos.some((a) => /mensagem\(ns\) carimbada\(s\) \(gatilho de agenda pausado: t\)/.test(a)),
          `o bloco carimbou sem pausar o gatilho de agenda. Avisos: ${JSON.stringify(avisos)}`,
        ).toBe(true);
        expect(depois.xmin, "o gatilho não foi pausado (a linha dele não mudou)").not.toBe(antes.xmin);
        expect(depois.ligado, "o gatilho não voltou ligado depois do carimbo").toBe("O");
      });
    });
  });
});

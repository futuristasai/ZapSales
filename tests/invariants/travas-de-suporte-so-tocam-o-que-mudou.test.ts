/**
 * AS TRAVAS DO SUPORTE SÓ TOCAM A TABELA QUE MUDOU (migration 0571, issue #359).
 *
 * ## O defeito que este arquivo previne
 *
 * `public.fn_aplicar_travas_de_suporte()` é chamada cinco vezes por aplicação do
 * `baseline.sql`, e a atualização de uma instalação roda com a equipe logada. O
 * corpo antigo fazia `drop policy` + `create policy` em TODA tabela de
 * organização, numa transação só: ACCESS EXCLUSIVE em quase todo o banco até o
 * fim da chamada. Medido num banco com o schema de uma instalação real (pg17 do
 * Supabase): 198 tabelas travadas e 336 policies recriadas por chamada. Em
 * 19/11/2026 uma requisição do app fechou o ciclo com essa varredura, o Postgres
 * derrubou a sessão do kit com `deadlock detected`, o baseline parou no meio e a
 * tela de Conversas respondeu "Erro interno" por dez horas (issue #355).
 *
 * ## O que se guarda — e por que cada caso tem o seu controle
 *
 * 1. NÃO TOCAR: num banco em dia a função não pede trava de tabela nenhuma e não
 *    recria policy nenhuma. A sonda de travas é provada viva ANTES (um
 *    `drop policy` à mão aparece nela): sonda cega também devolve vazio.
 * 2. A ATUALIZAÇÃO INTEIRA: o `oid` de cada trava de `public` é o mesmo no molde
 *    de UMA aplicação do baseline e no de DUAS. `oid` igual é a prova de que a
 *    segunda aplicação não derrubou e recriou a policy — conteúdo igual não
 *    provaria, porque a policy recriada tem o mesmo conteúdo.
 * 3. CONTINUAR CONVERGINDO: pular o que está certo não pode virar "pular". Trava
 *    ausente, permissiva, de outro papel, com outra expressão, com o comando
 *    trocado ou sobrando numa tabela que virou só do servidor é refeita ou
 *    retirada — e, nesses casos, só a tabela adulterada é travada.
 *
 * ## A régua de "certa" é mais estreita que a do arquivo irmão
 *
 * `travas-de-suporte-cobrem-toda-tabela-na-instalacao.test.ts` aceita a guarda
 * com `like '%fn_support_write_allowed(%'`. Aqui a comparação é por IGUALDADE e
 * exige que o lado sem expressão esteja vazio: é a mesma régua do corpo da
 * função, e um caso que aceitasse mais do que a função aceita ficaria verde com
 * a função recriando a trava a cada chamada.
 *
 * A cobaia é do teste (tabela criada e desfeita na transação de cada caso), pelo
 * mesmo motivo do arquivo irmão: uma proteção não pode depender da forma de uma
 * tabela do produto.
 */
import { describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

const moldeDuasAplicacoes = process.env.TEST_DB_TEMPLATE;
const moldeUmaAplicacao = process.env.TEST_DB_TEMPLATE_UMA_APLICACAO;
if (!moldeDuasAplicacoes || !moldeUmaAplicacao) {
  throw new Error(
    "TEST_DB_TEMPLATE/TEST_DB_TEMPLATE_UMA_APLICACAO ausentes — rode via `pnpm test:db` (scripts/test-db.sh), " +
      "que tira o molde de aplicação única entre o install e o update.",
  );
}

const COBAIA = "inv_cobaia_travas_359";
const MARCA = "R359|";

/** Como o baseline chama a função: sem linha de resultado na saída. */
const CHAMAR = "do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;";

/** Tabelas de `public` em que ESTA sessão segura ACCESS EXCLUSIVE agora. */
const TRAVADAS = `
  (select coalesce(string_agg(distinct k.relname::text, ',' order by k.relname::text), '')
     from pg_locks l
     join pg_class k on k.oid = l.relation
     join pg_namespace s on s.oid = k.relnamespace
    where l.pid = pg_backend_pid() and l.locktype = 'relation'
      and l.mode = 'AccessExclusiveLock' and s.nspname = 'public' and k.relkind = 'r')`;

/** As travas de `public`, com o `oid`: recriar uma policy troca o `oid` dela. */
const TRAVAS_COM_OID = `
  (select count(*) || ':' || coalesce(md5(string_agg(c.relname || '/' || p.polname || '/' || p.oid, ',' order by c.relname, p.polname)), '')
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and p.polname like 'support_write\\_%')`;

/** Quantas das três travas da tabela estão EXATAMENTE como a função as cria. */
const CERTAS = (tabela: string, coluna = "organization_id") => `
  (select count(*) from pg_policy p
    where p.polrelid = 'public.${tabela}'::regclass
      and not p.polpermissive
      and p.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
      and (   (p.polname = 'support_write_insert' and p.polcmd = 'a' and p.polqual is null
               and replace(pg_get_expr(p.polwithcheck, p.polrelid), 'public.', '') = 'fn_support_write_allowed(${coluna})')
           or (p.polname = 'support_write_update' and p.polcmd = 'w'
               and replace(pg_get_expr(p.polqual, p.polrelid), 'public.', '') = 'fn_support_write_allowed(${coluna})'
               and replace(pg_get_expr(p.polwithcheck, p.polrelid), 'public.', '') = 'fn_support_write_allowed(${coluna})')
           or (p.polname = 'support_write_delete' and p.polcmd = 'd' and p.polwithcheck is null
               and replace(pg_get_expr(p.polqual, p.polrelid), 'public.', '') = 'fn_support_write_allowed(${coluna})')))`;

/** Todas as `support_write_*` da tabela, certas ou não. */
const TODAS = (tabela: string) => `
  (select count(*) from pg_policy p
    where p.polrelid = 'public.${tabela}'::regclass and p.polname like 'support_write\\_%')`;

/** A cobaia: o mínimo que a regra de seleção alcança, já com as três travas. */
const CRIAR_COBAIA = `
create table public.${COBAIA} (
  organization_id uuid not null references public.organizations(id) on delete cascade
);
alter table public.${COBAIA} enable row level security;
grant select, insert, update, delete on public.${COBAIA} to authenticated;
${CHAMAR}`;

/** A linha marcada da saída: o psql imprime também BEGIN, CREATE TABLE, ROLLBACK… */
function medir(script: string): string {
  const linha = sql(script)
    .split("\n")
    .find((l) => l.startsWith(MARCA));
  if (linha === undefined) throw new Error(`a medição não devolveu a linha marcada:\n${script}`);
  return linha.slice(MARCA.length);
}

describe("travas do suporte — só tocam o que mudou (0571)", () => {
  describe("o instrumento", () => {
    it("há travas de public para medir", () => {
      const quantas = Number(medir(`select '${MARCA}' || split_part(${TRAVAS_COM_OID}, ':', 1);`));
      expect(quantas, "nenhuma trava support_write em public: os casos abaixo passariam por falta de dado").toBeGreaterThan(0);
    });

    it("a sonda de travas enxerga uma trava de tabela quando ela existe", () => {
      // Controle da sonda: `drop policy` pede ACCESS EXCLUSIVE na tabela. Se isto
      // devolvesse vazio, o "nenhuma tabela travada" dos casos abaixo não valeria.
      // A tabela é uma que JÁ existe: a cobaia nasce travada pelo próprio
      // `create table`, e apareceria na sonda sem `drop policy` nenhum.
      const travadas = medir(`begin;
drop policy support_write_update on public.organizations;
select '${MARCA}' || ${TRAVADAS};
rollback;`);
      expect(travadas).toBe("organizations");
    });
  });

  describe("banco em dia", () => {
    it("a função não pede trava de tabela nenhuma e não recria policy nenhuma", () => {
      const saida = medir(`begin;
select set_config('inv.antes', ${TRAVAS_COM_OID}, true);
${CHAMAR}
select '${MARCA}' || ${TRAVADAS} || '|' || (current_setting('inv.antes') = ${TRAVAS_COM_OID})::text;
rollback;`);
      const [travadas, mesmasPolicies] = saida.split("|");

      expect(
        travadas,
        `fn_aplicar_travas_de_suporte() segurou ACCESS EXCLUSIVE em: ${travadas}. Num banco em dia ela só lê o ` +
          "catálogo — travar tabela aqui é o desenho que parou o baseline da produção num deadlock (#355).",
      ).toBe("");
      expect(mesmasPolicies, "alguma trava foi derrubada e recriada (o oid mudou) num banco em dia").toBe("true");
    });

    it("a segunda aplicação do baseline não recria trava de public (mesmo oid nos dois moldes)", () => {
      const uma = medir(`\\c ${moldeUmaAplicacao}\nselect '${MARCA}' || ${TRAVAS_COM_OID};`);
      const duas = medir(`\\c ${moldeDuasAplicacoes}\nselect '${MARCA}' || ${TRAVAS_COM_OID};`);

      expect(Number(uma.split(":")[0]), "nenhuma trava no molde de uma aplicação").toBeGreaterThan(0);
      expect(
        duas,
        "o conjunto (tabela, trava, oid) mudou entre a primeira e a segunda aplicação do baseline: a atualização " +
          "derrubou e recriou trava de suporte. Cada recriação é ACCESS EXCLUSIVE numa tabela com o app em uso.",
      ).toBe(uma);
    });
  });

  describe("continua convergindo: a trava errada é refeita, e só a tabela dela é travada", () => {
    const adulteracoes: Array<{ nome: string; sql: string }> = [
      { nome: "falta uma das três", sql: `drop policy support_write_delete on public.${COBAIA};` },
      {
        nome: "permissiva em vez de restritiva",
        sql: `drop policy support_write_insert on public.${COBAIA};
create policy support_write_insert on public.${COBAIA} as permissive for insert to authenticated
  with check (public.fn_support_write_allowed(organization_id));`,
      },
      {
        nome: "expressão que não é a guarda",
        sql: `drop policy support_write_update on public.${COBAIA};
create policy support_write_update on public.${COBAIA} as restrictive for update to authenticated
  using (true) with check (true);`,
      },
      {
        nome: "guarda só de um lado do update",
        sql: `drop policy support_write_update on public.${COBAIA};
create policy support_write_update on public.${COBAIA} as restrictive for update to authenticated
  using (public.fn_support_write_allowed(organization_id));`,
      },
      {
        nome: "para outro papel",
        sql: `drop policy support_write_delete on public.${COBAIA};
create policy support_write_delete on public.${COBAIA} as restrictive for delete to public
  using (public.fn_support_write_allowed(organization_id));`,
      },
      {
        nome: "nome de insert com comando de delete",
        sql: `drop policy support_write_insert on public.${COBAIA};
create policy support_write_insert on public.${COBAIA} as restrictive for delete to authenticated
  using (public.fn_support_write_allowed(organization_id));`,
      },
    ];

    it("controle: a cobaia recém-criada sai da função com as três travas certas", () => {
      expect(
        medir(`begin;\n${CRIAR_COBAIA}\nselect '${MARCA}' || ${CERTAS(COBAIA)} || '|' || ${TODAS(COBAIA)};\nrollback;`),
        "certas | todas",
      ).toBe("3|3");
    });

    for (const caso of adulteracoes) {
      it(caso.nome, () => {
        const saida = medir(`begin;
${CRIAR_COBAIA}
${caso.sql}
select set_config('inv.adulterada', ${CERTAS(COBAIA)}::text, true);
${CHAMAR}
select '${MARCA}' || current_setting('inv.adulterada') || '|' || ${CERTAS(COBAIA)} || '|' || ${TODAS(COBAIA)} || '|' || ${TRAVADAS};
rollback;`);
        const [certasAntes, certasDepois, todas, travadas] = saida.split("|");

        // A adulteração tem de ter estragado alguma coisa, senão o caso não mede nada.
        expect(Number(certasAntes), "a adulteração não tirou nenhuma trava do lugar").toBeLessThan(3);
        expect(`${certasDepois}|${todas}`, "certas | todas, depois da função").toBe("3|3");
        expect(travadas, "tabelas de public com ACCESS EXCLUSIVE (só a cobaia pode estar aqui)").toBe(COBAIA);
      });
    }

    it("tabela que virou só do servidor perde as três", () => {
      const saida = medir(`begin;
${CRIAR_COBAIA}
revoke insert, update, delete on public.${COBAIA} from authenticated;
${CHAMAR}
select '${MARCA}' || ${TODAS(COBAIA)} || '|' || ${TRAVADAS};
rollback;`);
      expect(saida, "travas restantes | tabelas travadas").toBe(`0|${COBAIA}`);
    });

    it("tabela só do servidor com uma trava sobrando: a sobra sai", () => {
      const saida = medir(`begin;
create table public.${COBAIA} (
  organization_id uuid not null references public.organizations(id) on delete cascade
);
alter table public.${COBAIA} enable row level security;
revoke all on public.${COBAIA} from authenticated;
create policy support_write_delete on public.${COBAIA} as restrictive for delete to authenticated
  using (public.fn_support_write_allowed(organization_id));
${CHAMAR}
select '${MARCA}' || ${TODAS(COBAIA)};
rollback;`);
      expect(saida).toBe("0");
    });

    it("organizations: a guarda é pela coluna id, e só ela é travada", () => {
      const saida = medir(`begin;
drop policy support_write_update on public.organizations;
${CHAMAR}
select '${MARCA}' || ${CERTAS("organizations", "id")} || '|' || ${TODAS("organizations")} || '|' || ${TRAVADAS};
rollback;`);
      expect(saida, "certas | todas | tabelas travadas").toBe("3|3|organizations");
    });
  });
});

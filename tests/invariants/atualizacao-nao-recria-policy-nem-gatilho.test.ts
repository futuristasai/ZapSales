/**
 * A ATUALIZAÇÃO NÃO DERRUBA NEM RECRIA POLICY OU GATILHO QUE NÃO MUDOU
 * (migration 0572, issue #361).
 *
 * ## O defeito que este arquivo previne
 *
 * O `baseline.sql` é reaplicado inteiro em toda atualização, com a equipe logada.
 * Até a 0572 ele fazia `drop … if exists` + `create …` em toda policy e todo
 * gatilho: medido num banco com o schema de uma instalação real, 228 policies e
 * 169 gatilhos derrubados e recriados por atualização. Cada `drop` pede ACCESS
 * EXCLUSIVE na tabela, e, no Supabase, todo comando de policy do papel `postgres`
 * ainda trava as tabelas de login (o `supautils`).
 *
 * ## O que se guarda — e o controle de cada caso
 *
 * 1. A ATUALIZAÇÃO INTEIRA: o `oid` de TODA policy e de TODO gatilho é o mesmo no
 *    molde de UMA aplicação do baseline e no de DUAS. `oid` igual prova que a
 *    segunda aplicação não derrubou e recriou o objeto; conteúdo igual não
 *    provaria, porque o objeto recriado tem o mesmo conteúdo. Vale para qualquer
 *    bloco do arquivo, escrito de qualquer jeito — é a medida, não a forma.
 * 2. `fn_garantir_policy` / `fn_garantir_gatilho`, numa cobaia do próprio teste:
 *    - sem mudança: não pede trava de tabela e não troca o `oid` (a sonda de
 *      travas é provada viva antes);
 *    - o TEXTO mudou: refaz, com a forma nova;
 *    - alguém MEXEU por fora (`alter policy`, gatilho desligado): refaz;
 *    - o objeto sumiu: recria;
 *    - `p_so_se_ausente`: cria quando falta, e não toca quando existe — nem para
 *      "consertar";
 *    - o texto não cria o objeto dos argumentos, ou não é um CREATE: recusa.
 * 3. As funções executam texto: nenhum papel da REST as alcança.
 *
 * `tests/unit/baseline-garante-em-vez-de-recriar.test.ts` cobra a FORMA dos blocos
 * no arquivo; este mede o banco depois de aplicá-lo.
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

const MARCA = "R361|";
const COBAIA = "inv_cobaia_garantir_361";

/** A linha marcada da saída: o psql imprime também BEGIN, CREATE TABLE, ROLLBACK… */
function medir(script: string): string {
  const linha = sql(script)
    .split("\n")
    .find((l) => l.startsWith(MARCA));
  if (linha === undefined) throw new Error(`a medição não devolveu a linha marcada:\n${script}`);
  return linha.slice(MARCA.length);
}

/** Uma linha por objeto, com o `oid`: `schema.tabela/nome/oid`. */
const POLICIES_COM_OID = `
  select coalesce(string_agg(n.nspname || '.' || c.relname || '/' || p.polname || '/' || p.oid, E'\\n'
                             order by n.nspname, c.relname, p.polname), '')
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace`;
const GATILHOS_COM_OID = `
  select coalesce(string_agg(n.nspname || '.' || c.relname || '/' || t.tgname || '/' || t.oid, E'\\n'
                             order by n.nspname, c.relname, t.tgname), '')
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal`;

function listar(banco: string, consulta: string): string[] {
  // Sem marca: a lista tem uma linha por objeto. `\c` troca de banco na sessão.
  return sql(`\\c ${banco}\n${consulta};`)
    .split("\n")
    .filter((l) => /^[a-z_]+\.[^/]+\/[^/]+\/\d+$/.test(l));
}

/** Os objetos cujo `oid` mudou (ou que sumiram/apareceram) entre os dois moldes. */
function recriados(uma: string[], duas: string[]): string[] {
  const antes = new Set(uma);
  const depois = new Set(duas);
  const semOid = (l: string) => l.slice(0, l.lastIndexOf("/"));
  return [...new Set([...uma.filter((l) => !depois.has(l)), ...duas.filter((l) => !antes.has(l))].map(semOid))].sort();
}

/** Tabelas de `public` em que ESTA sessão segura ACCESS EXCLUSIVE agora. */
const TRAVADAS = `
  (select coalesce(string_agg(distinct k.relname::text, ',' order by k.relname::text), '')
     from pg_locks l
     join pg_class k on k.oid = l.relation
     join pg_namespace s on s.oid = k.relnamespace
    where l.pid = pg_backend_pid() and l.locktype = 'relation'
      and l.mode = 'AccessExclusiveLock' and s.nspname = 'public' and k.relkind = 'r')`;

const OID_DA_POLICY = `(select oid::text from pg_policy where polrelid = 'public.${COBAIA}'::regclass and polname = 'p_cobaia')`;
const USING_DA_POLICY = `(select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.${COBAIA}'::regclass and polname = 'p_cobaia')`;
const OID_DO_GATILHO = `(select oid::text from pg_trigger where tgrelid = 'public.${COBAIA}'::regclass and tgname = 'g_cobaia')`;
const LIGADO = `(select tgenabled::text from pg_trigger where tgrelid = 'public.${COBAIA}'::regclass and tgname = 'g_cobaia')`;

const DEF_POLICY = `create policy p_cobaia on public.${COBAIA} for select using (n > 0);`;
const DEF_POLICY_NOVA = `create policy p_cobaia on public.${COBAIA} for select using (n > 10);`;
const DEF_GATILHO = `create trigger g_cobaia before update on public.${COBAIA} for each row execute function public.fn_set_updated_at();`;

const garantirPolicy = (def: string, extra = "") =>
  `do $t$ begin perform public.fn_garantir_policy('public.${COBAIA}', 'p_cobaia', $d$${def}$d$${extra}); end $t$;`;
const garantirGatilho = (def: string, extra = "") =>
  `do $t$ begin perform public.fn_garantir_gatilho('public.${COBAIA}', 'g_cobaia', $d$${def}$d$${extra}); end $t$;`;

/**
 * A cobaia já com a policy e o gatilho GARANTIDOS. O `commit` no meio é o ponto:
 * a criação da tabela segura ACCESS EXCLUSIVE nela até o fim da transação, e a
 * sonda de travas a acusaria sem que função nenhuma tivesse travado nada. O que
 * se mede vem numa transação nova, e a cobaia é apagada no fim de cada caso.
 */
const PREPARAR = `
drop table if exists public.${COBAIA};
create table public.${COBAIA} (n int, updated_at timestamptz);
alter table public.${COBAIA} enable row level security;
${garantirPolicy(DEF_POLICY)}
${garantirGatilho(DEF_GATILHO)}`;
const LIMPAR = `
drop table if exists public.${COBAIA};
delete from private.baseline_objetos where tabela = 'public.${COBAIA}';`;

function caso(corpo: string): string {
  try {
    return medir(`${PREPARAR}\nbegin;\n${corpo}\nrollback;`);
  } finally {
    sql(LIMPAR);
  }
}

describe("a atualização não recria policy nem gatilho que não mudou (0572)", () => {
  describe("o baseline inteiro: mesmo oid com uma e com duas aplicações", () => {
    it("policies", () => {
      const uma = listar(moldeUmaAplicacao, POLICIES_COM_OID);
      const duas = listar(moldeDuasAplicacoes, POLICIES_COM_OID);

      expect(uma.length, "nenhuma policy no molde de uma aplicação: a medição não leu nada").toBeGreaterThan(500);
      expect(
        recriados(uma, duas),
        "policies que a SEGUNDA aplicação do baseline derrubou e recriou (o oid mudou). Cada uma é um ACCESS " +
          "EXCLUSIVE na tabela a cada atualização, com o app em uso. O bloco dela no baseline tem de passar por " +
          "fn_garantir_policy — ou há um `drop policy` solto dela em outro ponto do arquivo.",
      ).toEqual([]);
    });

    it("gatilhos", () => {
      const uma = listar(moldeUmaAplicacao, GATILHOS_COM_OID);
      const duas = listar(moldeDuasAplicacoes, GATILHOS_COM_OID);

      expect(uma.length, "nenhum gatilho no molde de uma aplicação: a medição não leu nada").toBeGreaterThan(150);
      expect(
        recriados(uma, duas),
        "gatilhos que a SEGUNDA aplicação do baseline derrubou e recriou (o oid mudou). O bloco dele no " +
          "baseline tem de passar por fn_garantir_gatilho.",
      ).toEqual([]);
    });

    it("o registro tem uma linha por objeto garantido", () => {
      const [policies, gatilhos] = medir(
        `select '${MARCA}' || (select count(*) from private.baseline_objetos where tipo = 'policy')
                || '|' || (select count(*) from private.baseline_objetos where tipo = 'trigger');`,
      ).split("|");
      expect(Number(policies), "policies anotadas").toBeGreaterThan(200);
      expect(Number(gatilhos), "gatilhos anotados").toBeGreaterThan(150);
    });
  });

  describe("fn_garantir_policy", () => {
    it("a sonda de travas enxerga um `drop policy` (controle)", () => {
      expect(caso(`drop policy p_cobaia on public.${COBAIA};\nselect '${MARCA}' || ${TRAVADAS};`)).toBe(COBAIA);
    });

    it("sem mudança: não pede trava e não troca o oid", () => {
      const saida = caso(`select set_config('inv.antes', ${OID_DA_POLICY}, true);
${garantirPolicy(DEF_POLICY)}
select '${MARCA}' || ${TRAVADAS} || '|' || (current_setting('inv.antes') = ${OID_DA_POLICY})::text;`);
      expect(saida, "tabelas travadas | mesmo oid").toBe("|true");
    });

    it("o texto mudou: refaz com a forma nova", () => {
      const saida = caso(`select set_config('inv.antes', ${OID_DA_POLICY}, true);
${garantirPolicy(DEF_POLICY_NOVA)}
select '${MARCA}' || (current_setting('inv.antes') <> ${OID_DA_POLICY})::text || '|' || ${USING_DA_POLICY};`);
      expect(saida, "oid novo | expressão").toBe("true|(n > 10)");
    });

    it("alguém mexeu por fora: a forma do arquivo volta", () => {
      const saida = caso(`alter policy p_cobaia on public.${COBAIA} using (true);
${garantirPolicy(DEF_POLICY)}
select '${MARCA}' || ${USING_DA_POLICY};`);
      expect(saida).toBe("(n > 0)");
    });

    it("a policy sumiu: recria", () => {
      const saida = caso(`drop policy p_cobaia on public.${COBAIA};
${garantirPolicy(DEF_POLICY)}
select '${MARCA}' || ${USING_DA_POLICY};`);
      expect(saida).toBe("(n > 0)");
    });

    it("`p_so_se_ausente`: existe → não toca, nem para trocar a forma", () => {
      const saida = caso(`select set_config('inv.antes', ${OID_DA_POLICY}, true);
${garantirPolicy(DEF_POLICY_NOVA, ", true")}
select '${MARCA}' || ${TRAVADAS} || '|' || (current_setting('inv.antes') = ${OID_DA_POLICY})::text || '|' || ${USING_DA_POLICY};`);
      expect(saida, "tabelas travadas | mesmo oid | expressão").toBe("|true|(n > 0)");
    });

    it("`p_so_se_ausente`: falta → cria, e a definição final depois a substitui", () => {
      const saida = caso(`drop policy p_cobaia on public.${COBAIA};
${garantirPolicy(DEF_POLICY_NOVA, ", true")}
select set_config('inv.meio', ${USING_DA_POLICY}, true);
${garantirPolicy(DEF_POLICY)}
select '${MARCA}' || current_setting('inv.meio') || '|' || ${USING_DA_POLICY};`);
      expect(saida, "depois da de cima | depois da final").toBe("(n > 10)|(n > 0)");
    });

    it("texto que cria OUTRO objeto é recusado", () => {
      const saida = caso(`do $t$ begin
  begin
    perform public.fn_garantir_policy('public.${COBAIA}', 'p_cobaia', 'create policy outro_nome on public.${COBAIA} for select using (true)');
    raise exception 'a função aceitou um texto que não cria a policy dos argumentos';
  exception when others then
    if sqlerrm not like '%não criou esse objeto%' then raise; end if;
  end;
end $t$;
select '${MARCA}recusou';`);
      expect(saida).toBe("recusou");
    });

    it("texto que não é um CREATE POLICY é recusado, sem executar", () => {
      const saida = caso(`do $t$ begin
  begin
    perform public.fn_garantir_policy('public.${COBAIA}', 'p_cobaia', 'drop table public.${COBAIA}');
    raise exception 'a função executou um texto que não é create policy';
  exception when others then
    if sqlerrm not like '%não é um CREATE POLICY%' then raise; end if;
  end;
end $t$;
select '${MARCA}' || (to_regclass('public.${COBAIA}') is not null)::text;`);
      expect(saida, "a tabela continua lá").toBe("true");
    });
  });

  describe("fn_garantir_gatilho", () => {
    it("sem mudança: não troca o oid", () => {
      const saida = caso(`select set_config('inv.antes', ${OID_DO_GATILHO}, true);
${garantirGatilho(DEF_GATILHO)}
select '${MARCA}' || ${TRAVADAS} || '|' || (current_setting('inv.antes') = ${OID_DO_GATILHO})::text;`);
      expect(saida, "tabelas travadas | mesmo oid").toBe("|true");
    });

    it("gatilho desligado por fora volta ligado", () => {
      const saida = caso(`alter table public.${COBAIA} disable trigger g_cobaia;
select set_config('inv.meio', ${LIGADO}, true);
${garantirGatilho(DEF_GATILHO)}
select '${MARCA}' || current_setting('inv.meio') || '|' || ${LIGADO};`);
      expect(saida, "desligado (D) | ligado (O)").toBe("D|O");
    });

    it("o gatilho sumiu: recria", () => {
      const saida = caso(`drop trigger g_cobaia on public.${COBAIA};
${garantirGatilho(DEF_GATILHO)}
select '${MARCA}' || (${OID_DO_GATILHO} is not null)::text;`);
      expect(saida).toBe("true");
    });

    it("`create or replace trigger` do dump também passa", () => {
      const saida = caso(`drop trigger g_cobaia on public.${COBAIA};
${garantirGatilho(DEF_GATILHO.replace("create trigger", "CREATE OR REPLACE TRIGGER"))}
select '${MARCA}' || (${OID_DO_GATILHO} is not null)::text;`);
      expect(saida).toBe("true");
    });
  });

  it("nenhum papel da REST executa as funções nem lê o registro", () => {
    const saida = medir(`select '${MARCA}' || coalesce(string_agg(r || ':' || f, ',' order by r, f), '')
  from unnest(array['anon', 'authenticated', 'service_role']) as r,
       unnest(array[
         'public.fn_garantir_policy(text, text, text, boolean)',
         'public.fn_garantir_gatilho(text, text, text, boolean)',
         'public.fn_garantir_objeto_do_baseline(text, text, text, text, boolean)',
         'public.fn_forma_no_catalogo(text, oid, text)']) as f
 where has_function_privilege(r, f, 'execute');`);
    expect(saida, "papel:função com EXECUTE").toBe("");

    const tabela = medir(`select '${MARCA}' || coalesce(string_agg(r, ',' order by r), '')
  from unnest(array['anon', 'authenticated', 'service_role']) as r
 where has_table_privilege(r, 'private.baseline_objetos', 'select')
    or has_table_privilege(r, 'private.baseline_objetos', 'insert')
    or has_table_privilege(r, 'private.baseline_objetos', 'delete');`);
    expect(tabela, "papéis com acesso ao registro").toBe("");
  });
});

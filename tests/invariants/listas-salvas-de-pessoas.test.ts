import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * As listas salvas de pessoas do disparo em massa (migration 0555), medidas no banco que o CLONE
 * recebe — o `baseline.sql` aplicado, não a cadeia de migrations.
 *
 * O que está sob prova, e por que cada coisa importa:
 *
 *  1. **O isolamento nas duas direções.** Uma lista guarda QUEM uma organização escolheu para
 *     receber campanha: ver a do vizinho é ver a carteira de clientes dele. A prova usa dois
 *     tenants reais por JWT (papel `authenticated`, RLS ligada) e confere também o controle
 *     positivo — a própria organização lê as suas — para o "zero" não ser só uma tabela vazia.
 *  2. **Escrita é do servidor.** `authenticated` não tem INSERT/UPDATE/DELETE: quem grava é a rota,
 *     depois de `requireRole('manager')` e de filtrar a organização à mão. É provado pelo
 *     catálogo (`has_table_privilege`), não por um INSERT que deveria falhar — um erro dentro de
 *     transação embaralha o protocolo no PGlite e derrubaria os casos seguintes.
 *  3. **As chaves seguram o que a rota promete.** Nome único por organização sem diferenciar
 *     maiúscula; a FK composta impede o membro de apontar para a lista de OUTRA organização,
 *     mesmo com a service key; a chave `(list_id, contact_id)` impede a pessoa repetida.
 *  4. **O ponteiro some quando a coisa some, e só ele.** Apagar a lista leva os membros e deixa as
 *     pessoas; apagar a pessoa leva o ponteiro e deixa a lista.
 *  5. **A junção de contatos duplicados alcança a tabela nova sem código novo**, e a colisão de
 *     quem estava nas duas pontas não derruba a junção.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 1,
});

// Namespace pela MIGRATION: os arquivos de invariante rodam em paralelo contra o mesmo banco.
const ORG_A = "0555aaaa-0000-4000-8000-000000000001";
const ORG_B = "0555bbbb-0000-4000-8000-000000000002";
const USER_A = "0555aaaa-1111-4000-8000-000000000001";
const USER_B = "0555bbbb-1111-4000-8000-000000000002";
const LISTA_A = "0555aaaa-2222-4000-8000-000000000001";
const LISTA_B = "0555bbbb-2222-4000-8000-000000000002";
const contatoA = (n: number) => `0555aaaa-3333-4000-8000-00000000000${n}`;
const contatoB = (n: number) => `0555bbbb-3333-4000-8000-00000000000${n}`;

/** Roda uma consulta como membro de uma organização: papel `authenticated`, claims do JWT, RLS ligada. */
async function comoMembro<T extends Record<string, unknown>>(
  userId: string,
  consulta: string,
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId }),
    ]);
    await client.query("set local row_security = on");
    const { rows } = await client.query<T>(consulta);
    return rows;
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/**
 * O código SQLSTATE que o comando devolve (`passou` quando não falha). O erro é captado DENTRO do
 * banco, num bloco com `exception`: o comando que falha de propósito não chega ao cliente como
 * erro de protocolo, e o efeito de quem passa é desfeito junto (subtransação). Os valores vêm das
 * constantes deste arquivo — nunca de fora — e por isso entram no texto do comando.
 */
async function codigoDoErro(comando: string): Promise<string> {
  await pool.query(
    `create or replace function pg_temp.sonda(comando text) returns text language plpgsql as $f$
     begin
       begin
         execute comando;
         raise exception using errcode = 'P0001', message = 'passou';
       exception when others then
         if sqlerrm = 'passou' and sqlstate = 'P0001' then return 'passou'; end if;
         return sqlstate;
       end;
     end $f$`,
  );
  const { rows } = await pool.query<{ codigo: string }>("select pg_temp.sonda($1) as codigo", [
    comando,
  ]);
  return rows[0]!.codigo;
}

beforeAll(async () => {
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'ls-a@invariant.test'), ($2, 'ls-b@invariant.test')
     on conflict do nothing`,
    [USER_A, USER_B],
  );
  await pool.query(
    `insert into public.organizations (id, slug, legal_name, display_name) values
       ($1, 'ls-inv-a', 'Listas Inv A', 'LS Inv A'),
       ($2, 'ls-inv-b', 'Listas Inv B', 'LS Inv B')
     on conflict do nothing`,
    [ORG_A, ORG_B],
  );
  await pool.query(
    `insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
       ($1, $3, 'manager', now()), ($2, $4, 'manager', now())
     on conflict do nothing`,
    [USER_A, USER_B, ORG_A, ORG_B],
  );
  await pool.query(
    `insert into public.contacts (id, organization_id, name, phone_number) values
       ($1, $5, 'Ana A', '+5511955550001'), ($2, $5, 'Bia A', '+5511955550002'), ($3, $5, 'Caio A', '+5511955550003'),
       ($4, $6, 'Dani B', '+5511955550004')
     on conflict do nothing`,
    [contatoA(1), contatoA(2), contatoA(3), contatoB(1), ORG_A, ORG_B],
  );
  await pool.query(
    `insert into public.campaign_audience_lists (id, organization_id, name) values
       ($1, $3, 'Clientes VIP'), ($2, $4, 'Clientes VIP')
     on conflict do nothing`,
    [LISTA_A, LISTA_B, ORG_A, ORG_B],
  );
  await pool.query(
    `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id) values
       ($1, $3, $4), ($1, $3, $5), ($2, $6, $7)
     on conflict do nothing`,
    [ORG_A, ORG_B, LISTA_A, contatoA(1), contatoA(2), LISTA_B, contatoB(1)],
  );
});

afterAll(async () => {
  await pool.query("delete from public.organizations where id in ($1, $2)", [ORG_A, ORG_B]);
  await pool.query("delete from auth.users where id in ($1, $2)", [USER_A, USER_B]);
  await pool.end();
});

describe("0555 · listas salvas chegam ao clone com a proteção certa", () => {
  it("as duas tabelas nascem com RLS ligada e só policy de SELECT", async () => {
    const { rows } = await pool.query<{ tabela: string; rls: boolean; comandos: string[] }>(
      `select c.relname as tabela, c.relrowsecurity as rls,
              coalesce(array_agg(p.cmd order by p.cmd) filter (where p.cmd is not null), '{}') as comandos
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
        where c.relname in ('campaign_audience_lists', 'campaign_audience_list_members')
        group by c.relname, c.relrowsecurity
        order by c.relname`,
    );
    expect(rows).toEqual([
      { tabela: "campaign_audience_list_members", rls: true, comandos: ["SELECT"] },
      { tabela: "campaign_audience_lists", rls: true, comandos: ["SELECT"] },
    ]);
  });

  it("authenticated só lê, anon não vê nada, e o servidor (service_role) grava", async () => {
    const { rows } = await pool.query<{
      t: string;
      papel: string;
      privilegio: string;
      tem: boolean;
    }>(
      `select t.t, r.papel, p.privilegio, has_table_privilege(r.papel, 'public.' || t.t, p.privilegio) as tem
         from (values ('campaign_audience_lists'), ('campaign_audience_list_members')) t(t),
              (values ('authenticated'), ('anon'), ('service_role')) r(papel),
              (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilegio)`,
    );
    const tem = (t: string, papel: string, privilegio: string) =>
      rows.find((r) => r.t === t && r.papel === papel && r.privilegio === privilegio)!.tem;
    for (const tabela of ["campaign_audience_lists", "campaign_audience_list_members"]) {
      expect(tem(tabela, "authenticated", "SELECT")).toBe(true);
      for (const escrita of ["INSERT", "UPDATE", "DELETE"]) {
        expect(tem(tabela, "authenticated", escrita)).toBe(false);
        expect(tem(tabela, "service_role", escrita)).toBe(true);
      }
      expect(tem(tabela, "anon", "SELECT")).toBe(false);
    }
  });

  it("o membro da organização A lê as listas e as pessoas dela (controle positivo)", async () => {
    const listas = await comoMembro(USER_A, "select id from public.campaign_audience_lists");
    expect(listas.map((l) => l.id)).toEqual([LISTA_A]);
    const membros = await comoMembro(
      USER_A,
      "select contact_id from public.campaign_audience_list_members",
    );
    expect(membros).toHaveLength(2);
  });

  it("e o da organização B não vê NADA da A, nos dois sentidos", async () => {
    const listasDeB = await comoMembro(USER_B, "select id from public.campaign_audience_lists");
    expect(listasDeB.map((l) => l.id)).toEqual([LISTA_B]);
    const membrosDeB = await comoMembro(
      USER_B,
      "select contact_id from public.campaign_audience_list_members",
    );
    expect(membrosDeB.map((m) => m.contact_id)).toEqual([contatoB(1)]);
    // Pedindo a lista da A pelo id: zero linhas, não "negado" — a RLS filtra.
    const alheia = await comoMembro(
      USER_B,
      `select id from public.campaign_audience_lists where id = '${LISTA_A}'`,
    );
    expect(alheia).toHaveLength(0);
    const alheiaDeA = await comoMembro(
      USER_A,
      `select id from public.campaign_audience_lists where id = '${LISTA_B}'`,
    );
    expect(alheiaDeA).toHaveLength(0);
  });
});

describe("0555 · as chaves seguram o que a rota promete", () => {
  it("o nome é único por organização sem diferenciar maiúscula; outra organização pode repetir", async () => {
    expect(
      await codigoDoErro(
        `insert into public.campaign_audience_lists (organization_id, name) values ('${ORG_A}', 'clientes vip')`,
      ),
    ).toBe("23505");
    expect(
      await codigoDoErro(
        `insert into public.campaign_audience_lists (organization_id, name) values ('${ORG_A}', 'Outro nome')`,
      ),
    ).toBe("passou");
  });

  it("o nome tem de 2 a 80 letras", async () => {
    expect(
      await codigoDoErro(
        `insert into public.campaign_audience_lists (organization_id, name) values ('${ORG_A}', 'A')`,
      ),
    ).toBe("23514");
  });

  it("o membro não aponta para a lista de OUTRA organização, nem com a service key", async () => {
    expect(
      await codigoDoErro(
        `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id)
         values ('${ORG_B}', '${LISTA_A}', '${contatoB(1)}')`,
      ),
    ).toBe("23503");
  });

  it("a mesma pessoa não entra duas vezes na mesma lista", async () => {
    expect(
      await codigoDoErro(
        `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id)
         values ('${ORG_A}', '${LISTA_A}', '${contatoA(1)}')`,
      ),
    ).toBe("23505");
  });

  it("apagar a lista leva os ponteiros e deixa as pessoas", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.campaign_audience_lists (organization_id, name) values ($1, 'Descartável')
       returning id`,
      [ORG_A],
    );
    const id = rows[0]!.id;
    await pool.query(
      `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id)
       values ($1, $2, $3), ($1, $2, $4)`,
      [ORG_A, id, contatoA(1), contatoA(3)],
    );
    await pool.query("delete from public.campaign_audience_lists where id = $1", [id]);
    const membros = await pool.query(
      "select 1 from public.campaign_audience_list_members where list_id = $1",
      [id],
    );
    expect(membros.rowCount).toBe(0);
    const pessoas = await pool.query("select 1 from public.contacts where id in ($1, $2)", [
      contatoA(1),
      contatoA(3),
    ]);
    expect(pessoas.rowCount).toBe(2);
  });

  it("apagar a pessoa leva só o ponteiro dela e deixa a lista", async () => {
    await pool.query(
      `insert into public.contacts (id, organization_id, name, phone_number)
       values ($1, $2, 'Efêmera', '+5511955550099')`,
      [contatoA(9), ORG_A],
    );
    await pool.query(
      `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id)
       values ($1, $2, $3)`,
      [ORG_A, LISTA_A, contatoA(9)],
    );
    await pool.query("delete from public.contacts where id = $1", [contatoA(9)]);
    const restantes = await pool.query(
      "select contact_id from public.campaign_audience_list_members where list_id = $1",
      [LISTA_A],
    );
    expect(restantes.rows.map((r) => r.contact_id).sort()).toEqual([contatoA(1), contatoA(2)]);
    const lista = await pool.query("select 1 from public.campaign_audience_lists where id = $1", [
      LISTA_A,
    ]);
    expect(lista.rowCount).toBe(1);
  });
});

describe("0555 · a junção de contatos duplicados alcança a lista", () => {
  async function mesclar(principal: string, secundarios: string[]) {
    const { rows } = await pool.query<{ r: Record<string, unknown> }>(
      "select public.fn_mesclar_contatos($1, $2, $3) as r",
      [ORG_A, principal, secundarios],
    );
    return rows[0]!.r;
  }

  it("o ponteiro do perdedor passa para o vencedor, e quem estava nas duas pontas não derruba a junção", async () => {
    const venc = "0555aaaa-4444-4000-8000-000000000001";
    const perd = "0555aaaa-4444-4000-8000-000000000002";
    await pool.query(
      `insert into public.contacts (id, organization_id, name, phone_number) values
         ($1, $3, 'Fátima', '+5511955550071'), ($2, $3, 'Fátima', '+5511955550072')`,
      [venc, perd, ORG_A],
    );
    // Só o perdedor está em "Só perdedor"; os dois estão em "Nas duas pontas".
    const so = await pool.query<{ id: string }>(
      `insert into public.campaign_audience_lists (organization_id, name) values ($1, 'Só perdedor') returning id`,
      [ORG_A],
    );
    const duas = await pool.query<{ id: string }>(
      `insert into public.campaign_audience_lists (organization_id, name) values ($1, 'Nas duas pontas') returning id`,
      [ORG_A],
    );
    await pool.query(
      `insert into public.campaign_audience_list_members (organization_id, list_id, contact_id) values
         ($1, $2, $4), ($1, $3, $4), ($1, $3, $5)`,
      [ORG_A, so.rows[0]!.id, duas.rows[0]!.id, perd, venc],
    );

    await mesclar(venc, [perd]);

    const naLista = async (lista: string) =>
      (
        await pool.query<{ contact_id: string }>(
          "select contact_id from public.campaign_audience_list_members where list_id = $1 order by contact_id",
          [lista],
        )
      ).rows.map((r) => r.contact_id);
    // O vencedor agora está na lista em que só o perdedor estava.
    expect(await naLista(so.rows[0]!.id)).toEqual([venc]);
    // Na lista das duas pontas, o vencedor continua UMA vez (a colisão foi pulada).
    expect((await naLista(duas.rows[0]!.id)).filter((c) => c === venc)).toHaveLength(1);
  });
});

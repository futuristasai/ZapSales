/**
 * O ESTADO LOCAL DA LICENÇA É SERVER-SIDE, E O BANCO IMPEDE DESFAZER O QUE A DOUTRINA PROMETE.
 *
 * Migration 0556, ADR-0005, contrato `licenca-contrato-entre-as-pontas-v1` seção 2.
 *
 * ## Duas famílias de caso, e por que as duas
 *
 * 1. **Quem alcança a tabela.** O baseline traz `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
 *    TO anon/authenticated/service_role`, e ele vale para toda tabela criada DEPOIS dele — isto é,
 *    para todo apêndice novo. Tabela nova nasce concedida. Aqui se mede **privilégio** (o que sobra
 *    no dia em que alguém acrescentar "só uma policy de leitura"), e não contagem de linhas: com RLS
 *    ligada e zero policies, `anon` recebe zero linha SEM erro, e um teste de contagem passaria mesmo
 *    sem o revoke. Nenhum `statement` que deva falhar entra aqui — erro dentro de transação embaralha
 *    o protocolo do harness local; a negação se prova por `has_table_privilege`.
 *
 * 2. **O que o gatilho garante.** A doutrina diz que instalação já ativada NUNCA volta a `sem_selo`,
 *    que relógio que volta não estende nada e que o UUID não muda. Uma promessa que mora só no
 *    TypeScript some com a primeira versão do app que a esqueça; aqui se prova que ela mora no banco.
 *    Também se prova o furo que o gatilho sozinho não fecha: o DELETE, que reabriria o desfazer —
 *    por isso o `revoke delete, truncate` de `service_role` (mesma lição da 0258).
 *
 * Irmão de `credencial-do-google-e-server-side.test.ts`, que é o molde. A tabela não é tenant-aware
 * e não deve ser: a licença é da INSTALAÇÃO, então fica fora de `rls-isolation.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

const TABELA = "platform_licenca";
const INSTALACAO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";

function privilegio(papel: string, privilegio: string): boolean {
  return (
    sql(`select has_table_privilege('${papel}', 'public.${TABELA}', '${privilegio}');`).trim() === "t"
  );
}

function coluna(nome: string): string {
  return sql(`select coalesce(${nome}::text, 'NULO') from public.${TABELA} where id = 1;`).trim();
}

beforeAll(() => {
  sql(`delete from public.${TABELA};`);
});

afterAll(() => {
  sql(`delete from public.${TABELA};`);
});

describe("o PostgREST não serve o estado da licença", () => {
  it("`anon` não tem privilégio NENHUM", () => {
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(privilegio("anon", p), `anon tem ${p}`).toBe(false);
    }
  });

  it("`authenticated` também não tem — nenhuma tela lê isto pelo client de sessão", () => {
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(privilegio("authenticated", p), `authenticated tem ${p}`).toBe(false);
    }
  });

  it("`service_role` CONTINUA lendo, criando e atualizando — controle positivo da sonda", () => {
    // Sem este caso, uma sonda medindo errado (tabela com outro nome, outro schema) devolveria
    // "não tem" para todo mundo e os dois casos de cima passariam por acidente. E é o privilégio
    // que `lib/licenca/armazem.ts` usa: se sumir, a licença deixa de ser gravável em silêncio.
    expect(privilegio("service_role", "SELECT")).toBe(true);
    expect(privilegio("service_role", "INSERT")).toBe(true);
    expect(privilegio("service_role", "UPDATE")).toBe(true);
  });

  it("`service_role` NÃO apaga a linha nem esvazia a tabela — apagar reabriria o 'volta a sem_selo'", () => {
    // O default ACL do Supabase concede TUDO a `service_role`, e a chave dela está no `.env` de quem
    // instala. O `grant` enumerado só acrescenta; quem retira é o `revoke` explícito do apêndice.
    expect(privilegio("service_role", "DELETE"), "service_role apaga a linha da licença").toBe(false);
    expect(privilegio("service_role", "TRUNCATE"), "service_role esvazia a tabela").toBe(false);
  });

  it("a RLS está LIGADA — o segundo degrau, para o dia em que o grant voltar", () => {
    const ligada = sql(
      `select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`,
    ).trim();
    expect(ligada, "RLS desligada: o revoke vira a única defesa").toBe("t");
  });

  it("não há policy nenhuma — servir esta tabela nunca foi a intenção", () => {
    const quantas = sql(
      `select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`,
    ).trim();
    expect(quantas, "alguém criou policy: a tabela passa a ser SERVIDA").toBe("0");
  });

  it("a função do gatilho não é alcançável como RPC por anon, authenticated nem PUBLIC", () => {
    // Duas origens de EXECUTE (doutrina de migrations, item 9): o grant direto a `anon` do default
    // ACL e o grant a PUBLIC que o Postgres dá ao criar. As duas têm de ter saído.
    const grantees = sql(`
      select coalesce(string_agg(
        case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, ','), 'NENHUM')
        from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = 'public.fn_licenca_guarda_invariantes()'::regprocedure
         and a.privilege_type = 'EXECUTE';
    `).trim();
    expect(grantees).not.toMatch(/PUBLIC|anon|authenticated/);
  });
});

describe("o estado nasce certo", () => {
  it("o UUID da instalação sai do banco, é v4, e o modo padrão é sombra", () => {
    sql(`insert into public.${TABELA} (id) values (1);`);
    expect(coluna("instalacao_id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(coluna("modo")).toBe("sombra");
    expect(coluna("ativada_em")).toBe("NULO");
    expect(coluna("bloqueio_codigo")).toBe("NULO");
  });

  it("o singleton é singleton — não dá para ter duas licenças de instalação", () => {
    const rodou = sql(`
      select count(*) from pg_constraint
       where conrelid = 'public.${TABELA}'::regclass and conname = 'platform_licenca_singleton';
    `).trim();
    expect(rodou, "o CHECK do singleton não está no baseline").toBe("1");
  });

  it("as constraints de forma existem: modo, credencial inteira, bloqueio inteiro, código, selo", () => {
    const nomes = sql(`
      select string_agg(conname, ',' order by conname) from pg_constraint
       where conrelid = 'public.${TABELA}'::regclass and contype = 'c';
    `).trim();
    for (const c of [
      "platform_licenca_modo",
      "platform_licenca_credencial_inteira",
      "platform_licenca_bloqueio_inteiro",
      "platform_licenca_bloqueio_codigo",
      "platform_licenca_selo_tamanho",
      "platform_licenca_singleton",
    ]) {
      expect(nomes, `falta a constraint ${c}`).toContain(c);
    }
  });
});

describe("o gatilho põe no BANCO o que a doutrina promete", () => {
  beforeAll(() => {
    sql(`delete from public.${TABELA};`);
    sql(`insert into public.${TABELA} (id, instalacao_id) values (1, '${INSTALACAO}');`);
  });

  it("o horário visto só avança: um update com horário MENOR não o faz recuar", () => {
    sql(`update public.${TABELA} set maior_horario_visto = '2027-01-15T08:00:00Z' where id = 1;`);
    sql(`update public.${TABELA} set maior_horario_visto = '2027-01-10T08:00:00Z' where id = 1;`);
    expect(coluna("extract(epoch from maior_horario_visto)::bigint")).toBe("1800000000");
  });

  it("um update que não traz o horário o mantém (greatest ignora NULL)", () => {
    sql(`update public.${TABELA} set maior_horario_visto = null where id = 1;`);
    expect(coluna("extract(epoch from maior_horario_visto)::bigint")).toBe("1800000000");
  });

  it("um horário MAIOR avança normalmente", () => {
    sql(`update public.${TABELA} set maior_horario_visto = '2027-01-16T08:00:00Z' where id = 1;`);
    expect(coluna("extract(epoch from maior_horario_visto)::bigint")).toBe(String(1_800_000_000 + 86_400));
  });

  it("ativada_em, uma vez gravada, não se apaga: a instalação nunca volta a sem_selo", () => {
    sql(`update public.${TABELA} set ativada_em = '2027-01-05T08:00:00Z' where id = 1;`);
    sql(`update public.${TABELA} set ativada_em = null where id = 1;`);
    expect(coluna("extract(epoch from ativada_em)::bigint")).toBe(String(1_800_000_000 - 10 * 86_400));
  });

  it("ativada_em também não se TROCA por outro instante — vale a primeira ativação", () => {
    sql(`update public.${TABELA} set ativada_em = '2027-02-01T00:00:00Z' where id = 1;`);
    expect(coluna("extract(epoch from ativada_em)::bigint")).toBe(String(1_800_000_000 - 10 * 86_400));
  });

  it("o UUID da instalação não muda — trocar de VPS é ação administrativa no servidor", () => {
    sql(`update public.${TABELA} set instalacao_id = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' where id = 1;`);
    expect(coluna("instalacao_id")).toBe(INSTALACAO);
  });

  it("o bloqueio, o selo e a credencial PODEM mudar — o gatilho não prende o que é do fluxo normal", () => {
    // Controle positivo: um gatilho que travasse a linha inteira passaria em todos os casos acima.
    sql(`
      update public.${TABELA}
         set selo_atual = 'cab.carga.assin', bloqueio_codigo = 'reembolso', bloqueio_em = '2027-01-15T07:00:00Z'
       where id = 1;
    `);
    expect(coluna("selo_atual")).toBe("cab.carga.assin");
    expect(coluna("bloqueio_codigo")).toBe("reembolso");
    sql(`update public.${TABELA} set bloqueio_codigo = null, bloqueio_em = null where id = 1;`);
    expect(coluna("bloqueio_codigo")).toBe("NULO");
  });

  it("updated_at acompanha a escrita", () => {
    const antes = sql(`select updated_at from public.${TABELA} where id = 1;`).trim();
    sql(`select pg_sleep(0.05); update public.${TABELA} set modo = 'valendo' where id = 1;`);
    const depois = sql(`select updated_at from public.${TABELA} where id = 1;`).trim();
    expect(depois).not.toBe(antes);
    sql(`update public.${TABELA} set modo = 'sombra' where id = 1;`);
  });
});

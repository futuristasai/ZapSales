/**
 * O TETO DE ATENDIMENTOS AUTOMÁTICOS POR CONTATO — medido num Postgres de verdade (#271).
 *
 * `tests/unit/teto-de-ia-por-contato.test.ts` prova a regra e o desvio com um
 * banco de mentira. O que só um banco real responde é a CONSULTA: se ela conta
 * o que diz contar, na janela que diz contar. O texto executado aqui é o MESMO
 * que o motor executa — `SQL_TETO_POR_CONTATO`, importado, com os `$n` trocados
 * por literais (o psql não tem bind). Reescrever a consulta aqui mediria a
 * minha cópia.
 *
 * O que fica provado:
 *   1. o padrão do produto vale para a organização sem linha em `ai_budgets`;
 *   2. um turno é um turno, com uma ou com dez chamadas de modelo;
 *   3. só conta o turno em que o modelo de ATENDIMENTO rodou e respondeu;
 *   4. as janelas andam com o relógio — a hora reabre na hora certa, e a virada
 *      de dia ou de mês não reabre nem trava ninguém;
 *   5. a conta recomeça depois de uma passagem para humano;
 *   6. um contato não paga pelo outro, nem uma organização pela outra;
 *   7. o banco recusa teto fora da faixa e aceita o vocabulário novo da passagem;
 *   8. a sessão do usuário não escreve o teto.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  decidirTetoPorContato,
  normalizarTeto,
  SQL_TETO_POR_CONTATO,
  TETO_POR_CONTATO_PADRAO,
} from "@/lib/agent-engine/agent/teto-por-contato";

import { sql } from "./psql-transporte";

const ORG = "d7100000-0000-4000-8000-0000000000a1";
const ORG_VIZINHA = "d7100000-0000-4000-8000-0000000000a2";
const SESSAO = "d7100000-0000-4000-8000-0000000000b1";
const SESSAO_VIZINHA = "d7100000-0000-4000-8000-0000000000b2";
const CONTATO = "d7100000-0000-4000-8000-0000000000c1";
const OUTRO_CONTATO = "d7100000-0000-4000-8000-0000000000c2";
const CONTATO_VIZINHO = "d7100000-0000-4000-8000-0000000000c3";
const CONVERSA = "d7100000-0000-4000-8000-0000000000d1";

/** O relógio do turno. Fixo: a consulta não lê `now()`. */
const AGORA = "2026-11-12T15:00:00Z";

function emMinutos(base: string, minutos: number): string {
  return new Date(new Date(base).getTime() + minutos * 60_000).toISOString();
}

interface Leitura {
  porHora: number;
  porDia: number;
  naHora: number;
  noDia: number;
}

function consultar(agora = AGORA, contato = CONTATO, org = ORG): Leitura {
  const texto = SQL_TETO_POR_CONTATO.replace(/\$1/g, `'${org}'::uuid`)
    .replace(/\$2/g, `'${contato}'::uuid`)
    .replace(/\$3/g, `'${agora}'`)
    .replace(/\$4/g, String(TETO_POR_CONTATO_PADRAO.porHora))
    .replace(/\$5/g, String(TETO_POR_CONTATO_PADRAO.porDia));
  const [porHora = "", porDia = "", naHora = "", noDia = ""] = sql(`${texto};`).split("|");
  return { porHora: Number(porHora), porDia: Number(porDia), naHora: Number(naHora), noDia: Number(noDia) };
}

/** O veredito que o motor daria com esta leitura — a regra real, não uma cópia. */
function veredito(l: Leitura) {
  return decidirTetoPorContato(normalizarTeto({ porHora: l.porHora, porDia: l.porDia }), {
    naHora: l.naHora,
    noDia: l.noDia,
  });
}

/**
 * Cria `quantos` turnos do contato, cada um com `chamadas` linhas em
 * `llm_calls`, todas no instante `quando`.
 */
function turnos(
  quantos: number,
  quando: string,
  opts: {
    contato?: string;
    org?: string;
    purpose?: string;
    status?: "ok" | "erro";
    chamadas?: number;
    semJob?: boolean;
  } = {},
): void {
  const org = opts.org ?? ORG;
  const contato = opts.contato ?? CONTATO;
  const purpose = opts.purpose ?? "agent_turn";
  const status = opts.status ?? "ok";
  const chamadas = opts.chamadas ?? 1;
  if (opts.semJob) {
    sql(`insert into public.llm_calls
           (organization_id, contact_id, job_id, purpose, provider, model, status, created_at)
         select '${org}', '${contato}', null, '${purpose}', 'anthropic', 'claude-sonnet-5', '${status}', '${quando}'
           from generate_series(1, ${quantos});`);
    return;
  }
  sql(`with j as (
         insert into public.job_queue (organization_id, contact_id, kind, payload)
         select '${org}', '${contato}', 'inbound_turn', '{}'::jsonb from generate_series(1, ${quantos})
         returning id
       )
       insert into public.llm_calls
         (organization_id, contact_id, job_id, purpose, provider, model, status, created_at)
       select '${org}', '${contato}', j.id, '${purpose}', 'anthropic', 'claude-sonnet-5', '${status}', '${quando}'
         from j cross join generate_series(1, ${chamadas});`);
}

function passagem(quando: string): void {
  sql(`insert into public.passagens_de_atendimento
         (organization_id, contact_id, conversation_id, motor, origem, motivo_codigo, body, criado_em)
       values ('${ORG}', '${CONTATO}', '${CONVERSA}', 'engine', 'teto_por_contato',
               'limite_por_contato', 'a narrativa da passagem', '${quando}');`);
}

function limpar(): void {
  sql(`
    delete from public.llm_calls where organization_id in ('${ORG}', '${ORG_VIZINHA}');
    delete from public.job_queue where organization_id in ('${ORG}', '${ORG_VIZINHA}');
    delete from public.passagens_de_atendimento where organization_id = '${ORG}';
    delete from public.ai_budgets where organization_id in ('${ORG}', '${ORG_VIZINHA}');
  `);
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'inv-teto-contato', 'Teto por Contato LTDA', 'Teto por Contato'),
      ('${ORG_VIZINHA}', 'inv-teto-contato-viz', 'Vizinha LTDA', 'Vizinha')
      on conflict do nothing;
    do $seed$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO}', '${ORG}', 'inv-teto-contato', '\\x00'::bytea),
               ('${SESSAO_VIZINHA}', '${ORG_VIZINHA}', 'inv-teto-contato-viz', '\\x00'::bytea);
    exception when unique_violation then null; end $seed$;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO}', '${ORG}', 'Contato Insistente'),
      ('${OUTRO_CONTATO}', '${ORG}', 'Outro Contato'),
      ('${CONTATO_VIZINHO}', '${ORG_VIZINHA}', 'Contato da Vizinha')
      on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status) values
      ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open')
      on conflict do nothing;
  `);
});

beforeEach(() => {
  limpar();
});

describe("o teto que vale", () => {
  it("organização sem linha em ai_budgets usa o padrão do produto, e a conta nasce zerada", () => {
    expect(consultar()).toEqual({ porHora: 50, porDia: 150, naHora: 0, noDia: 0 });
  });

  it("a linha criada sem dizer o teto nasce com o padrão (default da coluna)", () => {
    sql(`insert into public.ai_budgets (organization_id, monthly_limit_cents) values ('${ORG}', 0);`);
    expect(consultar()).toMatchObject({ porHora: 50, porDia: 150 });
  });

  it("o que a organização ajustou é o que a consulta devolve — inclusive zero", () => {
    sql(`insert into public.ai_budgets (organization_id, monthly_limit_cents, teto_por_contato_hora, teto_por_contato_dia)
         values ('${ORG}', 0, 20, 0);`);
    expect(consultar()).toMatchObject({ porHora: 20, porDia: 0 });
  });

  it("o teto de uma organização não vaza para a outra", () => {
    sql(`insert into public.ai_budgets (organization_id, monthly_limit_cents, teto_por_contato_hora, teto_por_contato_dia)
         values ('${ORG_VIZINHA}', 0, 3, 7);`);
    expect(consultar()).toMatchObject({ porHora: 50, porDia: 150 });
    expect(consultar(AGORA, CONTATO_VIZINHO, ORG_VIZINHA)).toMatchObject({ porHora: 3, porDia: 7 });
  });
});

describe("o que é contado", () => {
  it("⭐ o atendimento de número 50 responde, o 51 não", () => {
    turnos(49, emMinutos(AGORA, -10));
    const antes = consultar();
    expect(antes).toMatchObject({ naHora: 49, noDia: 49 });
    expect(veredito(antes), "o 50º atendimento foi recusado").toEqual({ estourou: false });

    turnos(1, emMinutos(AGORA, -1));
    const depois = consultar();
    expect(depois).toMatchObject({ naHora: 50, noDia: 50 });
    expect(veredito(depois)).toEqual({ estourou: true, janela: "hora", contagem: 50, limite: 50 });
  });

  it("⭐ um turno é um turno, com uma ou com dez chamadas de modelo", () => {
    turnos(4, emMinutos(AGORA, -5), { chamadas: 10 });
    expect(consultar()).toMatchObject({ naHora: 4, noDia: 4 });
  });

  it("não conta o que não é atendimento: classificador, chamada que falhou, linha sem turno", () => {
    turnos(30, emMinutos(AGORA, -5), { purpose: "stage_classifier" });
    turnos(30, emMinutos(AGORA, -5), { purpose: "transcricao_de_audio", semJob: true });
    turnos(30, emMinutos(AGORA, -5), { status: "erro" });
    turnos(30, emMinutos(AGORA, -5), { semJob: true });
    expect(consultar()).toMatchObject({ naHora: 0, noDia: 0 });
    // CONTROLE: as 120 linhas existem — a consulta é que as recusou.
    expect(sql(`select count(*) from public.llm_calls where organization_id = '${ORG}';`)).toBe("120");
  });

  it("⭐ um contato não paga pelo outro, nem uma organização pela outra", () => {
    turnos(60, emMinutos(AGORA, -5), { contato: OUTRO_CONTATO });
    turnos(60, emMinutos(AGORA, -5), { contato: CONTATO_VIZINHO, org: ORG_VIZINHA });
    expect(consultar()).toMatchObject({ naHora: 0, noDia: 0 });
    expect(consultar(AGORA, OUTRO_CONTATO)).toMatchObject({ naHora: 60, noDia: 60 });
  });

  it("200 mensagens seguidas param no teto — a contagem não passa despercebida", () => {
    turnos(200, emMinutos(AGORA, -2));
    expect(veredito(consultar())).toMatchObject({ estourou: true, janela: "hora", contagem: 200 });
  });
});

describe("as janelas andam com o relógio", () => {
  it("⭐ a hora reabre na hora certa; o dia continua contando", () => {
    turnos(50, emMinutos(AGORA, -30));
    expect(consultar()).toMatchObject({ naHora: 50, noDia: 50 });

    // 29 minutos depois os turnos têm 59 minutos: ainda são "da última hora".
    expect(consultar(emMinutos(AGORA, 29))).toMatchObject({ naHora: 50, noDia: 50 });
    // 31 minutos depois eles têm 61: a hora reabriu, o dia não esqueceu.
    const depois = consultar(emMinutos(AGORA, 31));
    expect(depois).toMatchObject({ naHora: 0, noDia: 50 });
    expect(veredito(depois)).toEqual({ estourou: false });
  });

  it("⭐ o dia estoura com a hora folgada, e reabre 24 horas depois do turno", () => {
    turnos(150, emMinutos(AGORA, -180));
    const leitura = consultar();
    expect(leitura).toMatchObject({ naHora: 0, noDia: 150 });
    expect(veredito(leitura)).toEqual({ estourou: true, janela: "dia", contagem: 150, limite: 150 });

    expect(consultar(emMinutos(AGORA, 24 * 60 - 181))).toMatchObject({ noDia: 150 });
    expect(consultar(emMinutos(AGORA, 24 * 60 - 179))).toMatchObject({ noDia: 0 });
  });

  it("⭐ a virada de dia e de mês não reabre a conta de quem acabou de estourar", () => {
    // 50 turnos às 23h50 de 31/10 (UTC); o relógio vira para 00h10 de 01/11.
    turnos(50, "2026-10-31T23:50:00Z");
    const naVirada = consultar("2026-11-01T00:10:00Z");
    expect(naVirada).toMatchObject({ naHora: 50, noDia: 50 });
    expect(veredito(naVirada)).toMatchObject({ estourou: true });
  });

  it("…e não prende quem estourou ontem", () => {
    turnos(150, "2026-10-31T23:50:00Z");
    expect(consultar("2026-11-02T00:10:00Z")).toMatchObject({ naHora: 0, noDia: 0 });
  });
});

describe("a conta recomeça quando uma pessoa devolve a conversa", () => {
  it("⭐ só conta o que aconteceu DEPOIS da última passagem para humano", () => {
    turnos(50, emMinutos(AGORA, -40));
    expect(veredito(consultar())).toMatchObject({ estourou: true });

    // A passagem aconteceu (a IA parou). Uma pessoa atendeu e devolveu.
    passagem(emMinutos(AGORA, -20));
    const depoisDaDevolucao = consultar();
    expect(depoisDaDevolucao).toMatchObject({ naHora: 0, noDia: 0 });
    expect(veredito(depoisDaDevolucao)).toEqual({ estourou: false });

    // Dali em diante a conta é nova.
    turnos(7, emMinutos(AGORA, -5));
    expect(consultar()).toMatchObject({ naHora: 7, noDia: 7 });
  });

  it("a passagem de um contato não zera a conta de outro", () => {
    turnos(50, emMinutos(AGORA, -40), { contato: OUTRO_CONTATO });
    passagem(emMinutos(AGORA, -20));
    expect(consultar(AGORA, OUTRO_CONTATO)).toMatchObject({ naHora: 50 });
  });
});

describe("o que o banco garante", () => {
  /** `aceitou` quando o statement passou; `recusou` quando o CHECK o barrou. */
  function tentar(statement: string): string {
    return sql(`
      do $t$ begin
        ${statement}
        raise exception 'ACEITOU';
      exception
        when check_violation then null;
      end $t$;
      select 'recusou';
    `);
  }

  it("teto negativo ou acima de 10.000 é recusado pelo CHECK", () => {
    sql(`insert into public.ai_budgets (organization_id, monthly_limit_cents) values ('${ORG}', 0);`);
    for (const valor of [-1, 10_001]) {
      expect(
        tentar(`update public.ai_budgets set teto_por_contato_hora = ${valor} where organization_id = '${ORG}';`),
      ).toBe("recusou");
      expect(
        tentar(`update public.ai_budgets set teto_por_contato_dia = ${valor} where organization_id = '${ORG}';`),
      ).toBe("recusou");
    }
  });

  it("CONTROLE: 0 e 10.000 são aceitos", () => {
    sql(`insert into public.ai_budgets (organization_id, monthly_limit_cents, teto_por_contato_hora, teto_por_contato_dia)
         values ('${ORG}', 0, 0, 10000);`);
    expect(consultar()).toMatchObject({ porHora: 0, porDia: 10_000 });
  });

  it("a passagem aceita a origem e o motivo novos", () => {
    passagem(emMinutos(AGORA, -1));
    expect(
      sql(`select origem || '|' || motivo_codigo from public.passagens_de_atendimento
            where organization_id = '${ORG}';`),
    ).toBe("teto_por_contato|limite_por_contato");
  });

  it("⭐ a sessão do usuário não escreve o teto — só a rota, pelo servidor", () => {
    for (const papel of ["anon", "authenticated"]) {
      for (const privilegio of ["INSERT", "UPDATE", "DELETE"]) {
        expect(
          sql(`select has_table_privilege('${papel}', 'public.ai_budgets', '${privilegio}');`),
          `${papel} tem ${privilegio} em ai_budgets`,
        ).toBe("f");
      }
    }
    // CONTROLE: o servidor escreve.
    expect(sql(`select has_table_privilege('service_role', 'public.ai_budgets', 'UPDATE');`)).toBe("t");
  });

  it("o índice que serve a contagem existe", () => {
    expect(
      sql(`select count(*) from pg_indexes where schemaname = 'public' and indexname = 'llm_calls_contato_idx';`),
    ).toBe("1");
  });
});

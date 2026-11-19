import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NO BASELINE, POLICY E GATILHO ENTRAM POR `fn_garantir_policy` / `fn_garantir_gatilho`
 * — NUNCA POR `drop … if exists` + `create …` SOLTOS (migration 0572, issue #361).
 *
 * ## O defeito que este arquivo previne
 *
 * O `baseline.sql` é reaplicado inteiro em toda atualização, com a equipe logada.
 * O par solto derruba e recria o objeto TODA vez, mesmo sem mudança nenhuma.
 * Medido num banco com o schema de uma instalação real: 228 policies e 169
 * gatilhos derrubados e recriados por atualização (mais 32 gatilhos regravados no
 * lugar pelo `create or replace trigger` do dump). `drop policy` e `drop trigger`
 * pedem ACCESS EXCLUSIVE na tabela, e, no Supabase, todo comando de policy do papel
 * `postgres` ainda trava `auth.users`, `auth.sessions`, `storage.objects` e mais 20
 * tabelas (o `supautils`).
 *
 * As funções recebem o `create …` como texto e só derrubam e recriam quando a
 * impressão do texto ou a da forma no catálogo mudou. Depois da 0572, a segunda
 * aplicação do baseline recria ZERO policy e ZERO gatilho — nos dois caminhos
 * (atualização de um schema real e instalação num banco vazio), com o conjunto
 * final de policies e gatilhos idêntico ao de antes, linha a linha.
 *
 * ## Por que estático, e o que fica para o banco
 *
 * A forma do bloco é propriedade do ARQUIVO: o PR que cola um `create policy`
 * solto tem de ficar vermelho no `verify`, antes de custar um ciclo de Postgres.
 * Que a segunda aplicação não recria nada (o `oid` de cada objeto é o mesmo) é o
 * job `invariants` quem mede, em
 * tests/invariants/atualizacao-nao-recria-policy-nem-gatilho.test.ts.
 *
 * ## O que conta como "solto"
 *
 * Comando de TOPO, isto é, fora de qualquer corpo entre `$tag$ … $tag$`. O que
 * está dentro de um corpo fica de fora desta régua, e por três motivos diferentes:
 *
 * - `$zps_def$ … $zps_def$` é o TEXTO que a função recebe — a forma nova;
 * - `DO $baseline_guard$` é a guarda `IF NOT EXISTS` do corpo do dump: só cria o
 *   que falta, nunca recria (tests/unit/baseline-reaplicavel.test.ts);
 * - corpo de `create function` roda quando alguém a chama (a provisionadora de um
 *   módulo, as travas de suporte), não a cada aplicação do arquivo.
 *
 * O bloco `do` de topo que monta o comando com `execute format(…)` é coberto à
 * parte: ou é a guarda do dump, ou passa pelas funções.
 */
const SQL = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");

interface Trecho {
  inicio: number;
  fim: number;
  texto: string;
}

/**
 * Os comandos de topo do arquivo. Respeita comentário de linha, comentário de
 * bloco, aspas simples (com `''`), identificador entre aspas e dollar-quote.
 */
function comandosDeTopo(sql: string): Trecho[] {
  const saida: Trecho[] = [];
  let i = 0;
  let inicio = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql.startsWith("--", i)) {
      const j = sql.indexOf("\n", i);
      i = j === -1 ? n : j + 1;
      continue;
    }
    if (c === "/" && sql.startsWith("/*", i)) {
      const j = sql.indexOf("*/", i + 2);
      i = j === -1 ? n : j + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      i += 1;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i, i + 80));
      const antes = i > 0 ? sql[i - 1]! : " ";
      if (m && !/[A-Za-z0-9_]/.test(antes)) {
        const j = sql.indexOf(m[0], i + m[0].length);
        if (j === -1) throw new Error(`dollar-quote sem fim perto da posição ${i}`);
        i = j + m[0].length;
        continue;
      }
    }
    if (c === ";") {
      saida.push({ inicio, fim: i + 1, texto: sql.slice(inicio, i + 1) });
      inicio = i + 1;
    }
    i += 1;
  }
  return saida;
}

/** O comando sem as linhas de comentário e os brancos que o antecedem. */
function semComentarioInicial(texto: string): string {
  let t = texto;
  for (;;) {
    t = t.replace(/^\s+/, "");
    if (!t.startsWith("--")) return t;
    const j = t.indexOf("\n");
    t = j === -1 ? "" : t.slice(j + 1);
  }
}

function linhaDe(pos: number): number {
  return SQL.slice(0, pos).split("\n").length;
}

const COMANDOS = comandosDeTopo(SQL).map((c) => {
  const limpo = semComentarioInicial(c.texto);
  return { ...c, limpo, linha: linhaDe(c.fim - limpo.length) };
});

const CRIA = /^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(policy|trigger)\s/i;
const DERRUBA = /^drop\s+(policy|trigger)\s+if\s+exists\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*)\s+on\s+([^\s;]+)\s*;$/i;

/** As chamadas literais: `do $zps$ begin perform public.fn_garantir_x('t', 'n', $zps_def$ … $zps_def$[, true]); end $zps$;` */
const CHAMADA =
  /^do \$zps\$ begin perform public\.fn_garantir_(policy|gatilho)\('((?:[^']|'')+)', '((?:[^']|'')+)', \$zps_def\$\n([\s\S]*?)\n\$zps_def\$(, true)?\); end \$zps\$;$/;

interface Chamada {
  tipo: "policy" | "gatilho";
  tabela: string;
  nome: string;
  definicao: string;
  soSeAusente: boolean;
  linha: number;
}

const CHAMADAS: Chamada[] = [];
const BLOCOS_ZPS_FORA_DA_FORMA: string[] = [];
for (const c of COMANDOS) {
  if (!c.limpo.startsWith("do $zps$")) continue;
  const m = CHAMADA.exec(c.limpo);
  if (!m) {
    BLOCOS_ZPS_FORA_DA_FORMA.push(`linha ${c.linha}: ${c.limpo.slice(0, 90).replace(/\n/g, " ")}`);
    continue;
  }
  CHAMADAS.push({
    tipo: m[1] as "policy" | "gatilho",
    tabela: m[2]!.replace(/''/g, "'"),
    nome: m[3]!.replace(/''/g, "'"),
    definicao: m[4]!,
    soSeAusente: m[5] !== undefined,
    linha: c.linha,
  });
}

function identificador(bruto: string): string {
  const t = bruto.trim();
  return t.startsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t.toLowerCase();
}

function tabelaQualificada(bruto: string): string {
  const partes = [...bruto.matchAll(/"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*/g)].map((p) => identificador(p[0]));
  return partes.length === 2 ? partes.join(".") : `public.${partes[0]}`;
}

describe("baseline — policy e gatilho por fn_garantir_*, nunca por drop + create soltos (0572)", () => {
  describe("o instrumento", () => {
    it("o divisor de comandos enxerga o arquivo inteiro", () => {
      // Um divisor que se perde num dollar-quote engole o resto do arquivo num
      // comando só, e toda régua abaixo passaria por não ver nada.
      expect(COMANDOS.length, "comandos de topo").toBeGreaterThan(3000);
      const tabelas = COMANDOS.filter((c) => /^create\s+table\s/i.test(c.limpo)).length;
      expect(tabelas, "create table de topo").toBeGreaterThan(100);
      const maior = Math.max(...COMANDOS.map((c) => c.texto.length));
      expect(maior, "o maior comando (um divisor perdido produz um comando gigante)").toBeLessThan(120_000);
    });

    it("a régua acusa um par solto quando ele existe (controle positivo)", () => {
      const amostra = [
        "create table t (id int);",
        "drop policy if exists p on public.t;",
        "create policy p on public.t for select using (true);",
        "drop trigger if exists g on public.t;",
        'CREATE OR REPLACE TRIGGER "g" BEFORE UPDATE ON "public"."t" FOR EACH ROW EXECUTE FUNCTION f();',
        "do $x$ begin create policy dentro on t using (true); end $x$;",
      ].join("\n");
      const soltos = comandosDeTopo(amostra)
        .map((c) => semComentarioInicial(c.texto))
        .filter((t) => CRIA.test(t));
      expect(soltos.length, "os dois CREATE de topo, e não o que está dentro do do").toBe(2);
    });

    it("há chamadas para medir", () => {
      expect(CHAMADAS.filter((c) => c.tipo === "policy").length, "fn_garantir_policy").toBeGreaterThan(200);
      expect(CHAMADAS.filter((c) => c.tipo === "gatilho").length, "fn_garantir_gatilho").toBeGreaterThan(150);
    });
  });

  it("nenhum `create policy` nem `create trigger` solto no arquivo", () => {
    const soltos = COMANDOS.filter((c) => CRIA.test(c.limpo)).map(
      (c) => `linha ${c.linha}: ${c.limpo.slice(0, 100).replace(/\s+/g, " ")}`,
    );
    expect(
      soltos,
      "comando de topo que cria policy ou gatilho sem passar por fn_garantir_policy/fn_garantir_gatilho. " +
        "Solto, ele precisa de um `drop … if exists` antes, e o par derruba e recria o objeto em TODA " +
        "atualização, com ACCESS EXCLUSIVE na tabela. Escreva:\n" +
        "  do $zps$ begin perform public.fn_garantir_policy('public.tabela', 'nome', $zps_def$\n" +
        "  create policy nome on public.tabela …;\n" +
        "  $zps_def$); end $zps$;",
    ).toEqual([]);
  });

  it("todo bloco `do $zps$` tem exatamente a forma da chamada", () => {
    // A régua de cima só vê a forma canônica. Um `$zps$` com outra coisa dentro
    // seria um bloco que nenhuma das duas réguas mede.
    expect(BLOCOS_ZPS_FORA_DA_FORMA).toEqual([]);
  });

  it("o texto de cada chamada cria o objeto que os argumentos dizem", () => {
    const divergentes: string[] = [];
    for (const c of CHAMADAS) {
      const def = semComentarioInicial(c.definicao);
      const m =
        c.tipo === "policy"
          ? /^create\s+policy\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*)\s+on\s+((?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*))?)/i.exec(
              def,
            )
          : /^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*)\s[\s\S]*?\son\s+((?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9]*))?)/i.exec(
              def,
            );
      if (!m) {
        divergentes.push(`linha ${c.linha}: o texto não é um create ${c.tipo}`);
        continue;
      }
      const nome = identificador(m[1]!);
      const tabela = tabelaQualificada(m[2]!);
      if (nome !== c.nome || tabela !== c.tabela) {
        divergentes.push(`linha ${c.linha}: argumentos (${c.tabela}, ${c.nome}) × texto (${tabela}, ${nome})`);
      }
    }
    // A função também recusa em tempo de execução (o objeto dos argumentos tem de
    // existir depois do `create`), mas só na instalação — aqui o PR fica vermelho.
    expect(divergentes).toEqual([]);
  });

  it("cada objeto tem UMA definição que vale, e ela é a última do arquivo", () => {
    // Duas definições "que valem" com textos diferentes se alternam para sempre:
    // a de cima recria com a forma antiga, a de baixo recria com a nova — duas
    // recriações por atualização, e a forma antiga valendo no intervalo. Toda
    // definição que não é a última leva `, true` (só cria se o objeto faltar).
    const porObjeto = new Map<string, Chamada[]>();
    for (const c of CHAMADAS) {
      const chave = `${c.tipo} ${c.tabela} ${c.nome}`;
      porObjeto.set(chave, [...(porObjeto.get(chave) ?? []), c]);
    }
    const problemas: string[] = [];
    for (const [chave, lista] of porObjeto) {
      const ultima = lista[lista.length - 1]!;
      if (ultima.soSeAusente) problemas.push(`${chave}: a última definição (linha ${ultima.linha}) está como "só se ausente"`);
      for (const c of lista.slice(0, -1)) {
        if (!c.soSeAusente) problemas.push(`${chave}: a definição da linha ${c.linha} não é a última e não leva \`, true\``);
      }
    }
    expect(problemas).toEqual([]);
    // Vacuidade: há objeto definido mais de uma vez — é o caso que esta régua mede.
    expect([...porObjeto.values()].filter((l) => l.length > 1).length).toBeGreaterThan(5);
  });

  it("nenhum `drop … if exists` solto de objeto que o arquivo garante", () => {
    // O drop solto de um objeto garantido derruba o que a função acabou de
    // conferir (ou vai recriar): uma recriação por atualização, sem ninguém ver.
    const garantidos = new Set(
      CHAMADAS.filter((c) => !c.soSeAusente).map((c) => `${c.tipo === "policy" ? "policy" : "trigger"} ${c.tabela} ${c.nome}`),
    );
    const soltos: string[] = [];
    for (const c of COMANDOS) {
      const m = DERRUBA.exec(c.limpo);
      if (!m) continue;
      const chave = `${m[1]!.toLowerCase()} ${tabelaQualificada(m[3]!)} ${identificador(m[2]!)}`;
      if (garantidos.has(chave)) soltos.push(`linha ${c.linha}: ${c.limpo.replace(/\s+/g, " ")}`);
    }
    expect(soltos).toEqual([]);
  });

  it("bloco `do` de topo não monta policy nem gatilho por fora das funções", () => {
    // `execute format('create policy …')` num laço é o mesmo par solto, escrito
    // de outro jeito. Ou é a guarda `IF NOT EXISTS` do dump, ou passa pela função.
    const problemas: string[] = [];
    for (const c of COMANDOS) {
      if (!/^do\s/i.test(c.limpo)) continue;
      if (!/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(?:policy|trigger)\s/i.test(c.limpo)) continue;
      const guardaDoDump = /^DO \$baseline_guard\$/.test(c.limpo);
      const pelaFuncao = /fn_garantir_(?:policy|gatilho)\(/.test(c.limpo);
      if (!guardaDoDump && !pelaFuncao) problemas.push(`linha ${c.linha}: ${c.limpo.slice(0, 80).replace(/\s+/g, " ")}`);
    }
    expect(problemas).toEqual([]);
  });

  it("as funções do baseline são as da migration 0572, letra por letra", () => {
    const pasta = join(process.cwd(), "supabase/migrations");
    const arquivo = readdirSync(pasta).find((f) => /_0572_/.test(f));
    expect(arquivo, "a migration 0572 não está em supabase/migrations").toBeDefined();
    const migration = readFileSync(join(pasta, arquivo!), "utf8");
    const corpo = migration.slice(migration.indexOf("create schema if not exists private;"));
    expect(corpo.length, "o corpo da migration").toBeGreaterThan(3000);
    expect(
      SQL.includes(corpo.trimEnd()),
      "o bloco das funções fn_garantir_* do baseline divergiu do da migration 0572: uma instalação nova e um " +
        "banco migrado ficariam com funções diferentes. Mude as duas pontas juntas.",
    ).toBe(true);
  });

  it("as funções são definidas ANTES da primeira chamada", () => {
    // Pela lista de COMANDOS, e não por busca no texto: o cabeçalho do bloco traz
    // um exemplo da chamada dentro de um comentário, antes da definição.
    const definicao = COMANDOS.find((c) =>
      c.limpo.startsWith("create or replace function public.fn_garantir_gatilho("),
    );
    const primeiraChamada = COMANDOS.find((c) => /perform public\.fn_garantir_(?:policy|gatilho)\(/.test(c.limpo));
    expect(definicao, "a última das funções fn_garantir_*").toBeDefined();
    expect(primeiraChamada, "nenhuma chamada no arquivo").toBeDefined();
    expect(primeiraChamada!.linha).toBeGreaterThan(definicao!.linha);
  });
});

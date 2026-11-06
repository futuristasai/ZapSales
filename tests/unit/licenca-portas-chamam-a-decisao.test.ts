/**
 * TODA PORTA DO PRODUTO PERGUNTA À LICENÇA — E PORTA NOVA SEM A PERGUNTA REPROVA.
 *
 * ADR-0005 e contrato `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2: "bloqueada ou vencida
 * = não opera; backend, worker e scheduler recusam o trabalho". Essa frase só é verdadeira enquanto CADA
 * ponto de entrada consulta a decisão. Uma guarda que mora em 38 arquivos e em prosa apodrece pelo
 * mesmo caminho de sempre: alguém cria a rota nova copiando outra que já não tinha a guarda, e o gate
 * continua verde. Este arquivo põe a cobertura sob teste — o desenho da cerca de `requireSupportWrite`
 * (`tests/unit/suporte-cobertura-de-efeitos.test.ts`).
 *
 * ## As portas (e onde a pergunta mora)
 *
 *  - `proxy`      → `proxy.ts` chama `consultarPorta("proxy")`;
 *  - `api_token`  → `lib/mcp/auth.ts` (`validateBearerToken`, o ponto por onde passa todo `zps_`) e o ramo
 *                   de sessão de `lib/api/auth-dual.ts` (rotas que estão em `PUBLIC_PATHS`);
 *  - `cron`       → toda `app/api/v1/cron/<nome>/route.ts`, mais as duas entradas de máquina fora dessa
 *                   pasta (`system/relogio/tick` e `internal/agents/run`);
 *  - `webhook`    → toda `app/api/v1/webhooks/**\/route.ts`;
 *  - `worker`     → `claimar` da fila de jobs em `workers/agent-worker/main.ts` e cada laço que ENVIA ou
 *                   GASTA (event_log, campanha oficial, flywheel, watchdog).
 *
 * ## Exceções declaradas, com razão — e a lista só encolhe
 *
 * Uma exceção que não está aqui, com o porquê, é uma porta sem guarda. Elas são comparadas por IGUALDADE
 * com o conjunto medido: acrescentar uma sem tocar este arquivo reprova, e remover a guarda de uma rota
 * já guardada também.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

import { emBarraNormal } from "./helpers/caminho";

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory() ? arquivos(join(dir, item.name)) : [join(dir, item.name)],
    )
    .map(emBarraNormal);
}

const ler = (p: string) => readFileSync(p, "utf8");

/**
 * Crons que cumprem DEVER LEGAL e por isso rodam MESMO com a licença bloqueada. Decisão registrada
 * para o dono do produto vetar: bloquear a licença não apaga dados (contrato) e também não pode
 * suspender o prazo do titular (LGPD: pedido atendido em D+7, apagamento em D+15) nem a retenção que
 * limita quanto dado pessoal a instalação guarda. Tirar uma linha daqui liga a guarda dessa rota.
 */
const CRONS_DE_DEVER_LEGAL: Record<string, string> = {
  "lgpd-sla-watcher":
    "vigia o prazo dos pedidos do titular (D+7/D+15): bloquear a licença não suspende o direito de quem pediu",
  "data-retention":
    "poda dado vencido pela política de retenção (LGPD: minimização); parar acumularia dado pessoal",
  "storage-redaction": "executa a remoção de mídia pedida pelo titular (cascata de anonimização)",
  "media-retention": "apaga mídia vencida pela retenção; é limpeza, não trabalho comercial",
  "webhook-log-retention":
    "poda o log de webhooks (dado pessoal no corpo); é limpeza, não trabalho comercial",
};

/**
 * Crons que ficam SEM a porta por uma razão que não é dever legal: a porta os impediria de cumprir o próprio
 * papel. Hoje é um só — o que busca a renovação da licença. Uma instalação com a autorização vencida (servidor
 * de licenças fora do ar por dois dias, por exemplo) precisa conseguir pedir o selo novo; se a porta recusasse
 * a rota que o pede, o vencimento viraria definitivo. Tirar o nome daqui liga a guarda e reprova o teste.
 */
const CRONS_SEM_PORTA: Record<string, string> = {
  "licenca-renovar":
    "é a rota que renova a licença: se a porta a recusasse, uma instalação vencida nunca se destravaria",
};

/** Os dois motivos de um cron ficar sem a guarda. */
const CRONS_SEM_GUARDA = { ...CRONS_DE_DEVER_LEGAL, ...CRONS_SEM_PORTA };

/**
 * Laços do worker que NÃO enviam nem gastam, e por isso não consultam a licença. A fila de jobs
 * (`claimar`) é o que impede qualquer envio ou turno de IA: estes só movem estado interno.
 */
const LACOS_SEM_PORTA: Record<string, string> = {
  runDrainLoop:
    "só converte evento em job; quem trabalha é o job, que a fila (`claimar`) não entrega",
  runHealthLoop: "só calcula o circuito de saúde do número e põe/solta retenção; não envia nada",
  runCronLoop: "só enfileira jobs de follow-up; o job é barrado na fila",
  runVoiceCallsBridgeLoop: "só RECEBE eventos de chamada por SSE; não envia nem gasta",
};

describe("a varredura enxerga o que diz cobrir (controle positivo)", () => {
  it("há crons, webhooks e laços para medir", () => {
    const crons = arquivos("app/api/v1/cron").filter((p) => p.endsWith("/route.ts"));
    const webhooks = arquivos("app/api/v1/webhooks").filter((p) => p.endsWith("/route.ts"));
    expect(crons.length).toBeGreaterThan(30);
    expect(webhooks.length).toBeGreaterThanOrEqual(4);
    expect(ler("workers/agent-worker/main.ts")).toContain("rodarLoopDaFila");
  });
});

describe("telas e API", () => {
  it("o proxy consulta a porta antes de seguir, depois de validar o usuário", () => {
    const fonte = ler("proxy.ts");
    expect(fonte).toContain('consultarPorta("proxy")');
    expect(fonte).toContain("caminhoLiberadoDaLicenca(");
    // Depois do `getUser`: quem não está logado segue para o login, que é a saída de quem está sem licença.
    expect(fonte.indexOf('consultarPorta("proxy")')).toBeGreaterThan(
      fonte.indexOf("supabase.auth.getUser()"),
    );
  });

  it("todo token zps_ passa pela porta (validateBearerToken) e a sessão das rotas públicas também", () => {
    expect(ler("lib/mcp/auth.ts")).toContain('consultarPorta("api_token")');
    expect(ler("lib/api/auth-dual.ts")).toContain('guardaDeLicenca("proxy"');
  });
});

describe("cron", () => {
  const rotas = () =>
    arquivos("app/api/v1/cron")
      .filter((p) => p.endsWith("/route.ts"))
      .map((p) => ({ caminho: p, nome: p.split("/").at(-2) as string }));

  it("toda rota de cron guarda a licença, ou é exceção de dever legal declarada", () => {
    const semGuarda = rotas()
      .filter(({ caminho }) => !ler(caminho).includes('guardaDeLicenca("cron"'))
      .map(({ nome }) => nome)
      .sort();
    expect(
      semGuarda,
      "Rota de cron SEM a guarda da licença: com o modo `valendo`, uma instalação bloqueada continuaria " +
        'trabalhando por ela. Acrescente `await guardaDeLicenca("cron")` depois da autenticação ' +
        "(lib/licenca/recusa.ts) ou, se cumpre dever legal, declare em CRONS_DE_DEVER_LEGAL com a razão " +
        "(e em CRONS_SEM_PORTA só se a porta a impediria de cumprir o próprio papel).",
    ).toEqual(Object.keys(CRONS_SEM_GUARDA).sort());
  });

  it("as exceções existem, e ainda seguem sem a guarda (a lista só encolhe)", () => {
    for (const nome of Object.keys(CRONS_SEM_GUARDA)) {
      const caminho = `app/api/v1/cron/${nome}/route.ts`;
      expect(existsSync(caminho), `exceção cita rota inexistente: ${nome}`).toBe(true);
      expect(
        ler(caminho),
        `${nome} já chama a guarda: tire-o de CRONS_DE_DEVER_LEGAL / CRONS_SEM_PORTA, ele não é mais exceção`,
      ).not.toContain('guardaDeLicenca("cron"');
    }
  });

  it("a rota que renova a licença não depende da porta nem a consulta (ela é quem destrava)", () => {
    const fonte = ler("app/api/v1/cron/licenca-renovar/route.ts");
    expect(fonte).not.toContain("guardaDeLicenca(");
    expect(fonte).not.toContain("consultarPorta(");
    expect(fonte).toContain("renovarLicenca(");
  });

  it("as duas entradas de máquina fora da pasta de cron também guardam", () => {
    expect(ler("app/api/v1/system/relogio/tick/route.ts")).toContain('guardaDeLicenca("cron"');
    expect(ler("app/api/internal/agents/run/route.ts")).toContain('guardaDeLicenca("cron"');
  });

  it("a guarda vem DEPOIS da autenticação do cron (recusa de licença não revela o estado a quem não tem o segredo)", () => {
    for (const { caminho } of rotas()) {
      const fonte = ler(caminho);
      if (!fonte.includes('guardaDeLicenca("cron"')) continue;
      expect(fonte.indexOf('guardaDeLicenca("cron"'), caminho).toBeGreaterThan(
        fonte.indexOf("autorizaCron("),
      );
    }
  });
});

describe("webhooks", () => {
  it("toda entrada de webhook guarda a licença no POST", () => {
    const semGuarda = arquivos("app/api/v1/webhooks")
      .filter((p) => p.endsWith("/route.ts"))
      .filter((p) => !ler(p).includes('guardaDeLicenca("webhook"'));
    expect(
      semGuarda,
      'Webhook SEM a guarda da licença. Acrescente `await guardaDeLicenca("webhook", requestId)` no início do POST ' +
        "(a recusa é 503 com Retry-After: o remetente tenta de novo e nada se perde).",
    ).toEqual([]);
  });
});

describe("worker", () => {
  const main = () => ler("workers/agent-worker/main.ts");

  it("a fila de jobs não claima com a licença recusando", () => {
    expect(main()).toMatch(/claimar:\s*async \(\) =>\s*\(await licencaRecusaOLaco\(\)\)/);
  });

  it("todo laço do worker consulta a licença no seu módulo, ou é exceção declarada com razão", () => {
    // `const x = runYLoop(` / `rodarLacoZ(` em main.ts → o arquivo que o define, pelo import.
    const fonte = main();
    const chamadas = [...fonte.matchAll(/\b(run[A-Z]\w*Loop|rodarLaco\w+)\(/g)].map(
      (m) => m[1] as string,
    );
    expect([...new Set(chamadas)].length).toBeGreaterThanOrEqual(7);

    const semPorta: string[] = [];
    for (const nome of new Set(chamadas)) {
      const importacao = new RegExp(
        `import\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}\\s*from\\s*["']@/([^"']+)["']`,
      ).exec(fonte);
      expect(importacao, `main.ts chama ${nome} mas não o importa por @/…`).not.toBeNull();
      const modulo = `${importacao![1]}.ts`;
      expect(existsSync(modulo), `${nome} vem de ${modulo}, que não existe`).toBe(true);
      if (!ler(modulo).includes("licencaRecusaOLaco(")) semPorta.push(nome);
    }
    expect(
      semPorta.sort(),
      "Laço do worker SEM a porta da licença. Se ele envia ou gasta (LLM, canal), chame " +
        "`await licencaRecusaOLaco()` no começo de cada rodada (lib/licenca/laco.ts); se só move estado " +
        "interno, declare em LACOS_SEM_PORTA com a razão.",
    ).toEqual(Object.keys(LACOS_SEM_PORTA).sort());
  });
});

describe("rota pública para o proxy que também aceita sessão", () => {
  /**
   * O `proxy` pergunta à licença por TODA requisição de sessão — menos as que estão em `PUBLIC_PATHS`, que ele nem
   * alcança (Bearer, cron, webhook). Rota que é pública para o proxy e MESMO ASSIM autentica sessão por conta
   * própria (`requireRole`) fica sem a porta: foi o que a prova pela tela achou em `GET /api/v1/contacts`, que
   * respondeu 200 com a licença em vigor e bloqueada. A rota que usa `resolveAuthDual` já pergunta lá dentro.
   *
   * Excluídas, por terem a PRÓPRIA porta ou nenhum trabalho comercial: cron e webhook (guardas dedicadas), saúde,
   * `system/*`, provisionamento, retornos de OAuth, `internal/*` e `mcp` (pela `validateBearerToken`).
   */
  const COM_PORTA_PROPRIA =
    /^\/api\/(v1\/(cron|webhooks|system|tenants|health|anuncios|plataformas-de-anuncio)(\/|$)|v1\/agenda\/google\/callback$|internal\/|mcp)/;
  const UUID = "00000000-0000-4000-8000-000000000000";

  const publicas = () =>
    arquivos("app/api")
      .filter((p) => p.endsWith("/route.ts"))
      .map((p) => ({
        caminho: p,
        url: p
          .replace(/^app/, "")
          .replace(/\/route\.ts$/, "")
          .replace(/\[[^\]]+\]/g, UUID),
      }))
      .filter(({ url }) => isPublicPath(url) && !COM_PORTA_PROPRIA.test(url));

  it("a varredura enxerga rotas públicas com sessão (controle positivo)", () => {
    const urls = publicas().map((r) => r.url);
    expect(urls).toContain("/api/v1/contacts");
    expect(urls).toContain("/api/v1/agenda/agendamentos");
  });

  it("toda rota assim que usa `requireRole`/`requireAuth` pergunta à licença no ramo de sessão", () => {
    const semGuarda = publicas()
      .filter(({ caminho }) => /(requireRole|requireAuth)\(/.test(ler(caminho)))
      .filter(({ caminho }) => !ler(caminho).includes('guardaDeLicenca("proxy"'))
      .map(({ caminho }) => caminho);
    expect(
      semGuarda,
      'Rota pública para o proxy que autentica sessão com `requireRole` e NÃO pergunta à licença. Acrescente `await guardaDeLicenca("proxy", requestId)` depois do `requireRole` (lib/licenca/recusa.ts), como em `app/api/v1/contacts/route.ts`.',
    ).toEqual([]);
  });
});

describe("a decisão é uma só", () => {
  it("só lib/licenca importa a regra e a conferência do selo — ninguém reimplementa a pergunta", () => {
    const donos = ["lib/licenca/", "tests/", "docs/", "scripts/"];
    const intrusos: string[] = [];
    for (const raiz of ["app", "lib", "components", "hooks", "workers"]) {
      for (const p of arquivos(raiz)) {
        if (!/\.(ts|tsx)$/.test(p) || donos.some((d) => p.startsWith(d))) continue;
        const fonte = ler(p);
        if (/from\s+["']@\/lib\/licenca\/(decidir|selo)["']/.test(fonte)) intrusos.push(p);
      }
    }
    if (existsSync("proxy.ts") && /@\/lib\/licenca\/(decidir|selo)/.test(ler("proxy.ts")))
      intrusos.push("proxy.ts");
    expect(
      intrusos,
      "Estes arquivos importam `decidir`/`selo` direto: a pergunta 'esta instalação opera?' tem UMA resposta, " +
        "`consultarPorta` (lib/licenca/porta.ts). Peça a ela.",
    ).toEqual([]);
  });
});

/**
 * A ESPERA DA REVELAÇÃO COBRE TODA A NAVEGAÇÃO — e o sintoma da #884 é nominal.
 *
 * ═══ O defeito ══════════════════════════════════════════════════════════════
 *
 * O sintoma reportado na #884 é: "depois de navegar para a Agenda e voltar, o
 * DOM fica com uma segunda cópia oculta de `tela-agenda`", e o `getByTestId`
 * passa a casar dois. A tela da Agenda foi absolvida por MEDIÇÃO, e este
 * arquivo registra como:
 *
 *   · jsdom, `AgendaClient` real, montar → `unmount()` → remontar:
 *     **1 → 0 → 1**. Nenhum componente da Agenda monta sem desmontar;
 *   · nenhum `Activity`/`unstable_Activity`/`keep-alive`/`Offscreen` no app,
 *     nenhuma rota paralela ou interceptada sob `/app/agenda`, e o `AppShell`
 *     renderiza `{children}` uma vez.
 *
 * A cópia é a **caixa do streaming SSR** (`<div hidden id="S:N">`) que o
 * servidor manda e o React esvazia no cliente — já descrita na issue #1374,
 * cujo conserto (PR #1706) entrou em 2026-09-26, onze dias depois da #884.
 *
 * ─── O buraco que sobrou, e que este arquivo fecha ══════════════════════════
 *
 * O `test` da suíte embrulhava `page.goto` e `page.reload` (PR #1706) para só
 * devolverem quando a revelação termina. A spec vermelha citada na #884
 * (`agenda-ocupacao-do-google-no-historico`) navega só por `goto` e `reload`, e
 * esse vermelho o #1706 já fechou. O que sobrou foi `page.goBack()` e
 * `page.goForward()` — NÃO embrulhados: uma spec que volta ou avança por ali
 * (hoje, `central-avisos-destino`) lia o documento no meio da revelação.
 *
 * ⚠️ O PORQUÊ DE UM TESTE DE HARNESS E NÃO DE e2e. A cerca que existia
 * (`e2e-specs-usam-o-test-da-suite.test.ts`) só confere o IMPORT da spec — foi
 * por isso que a lacuna de `goBack` passou. Um e2e aqui exigiria navegador,
 * banco e duas contas para provar uma propriedade que é uma lista de nomes. O
 * que se prova aqui é a COBERTURA, e ela é o que quebrou — pelo embrulho REAL
 * (`embrulharANavegacao`, o mesmo que `test.ts` chama), mais uma cerca de texto
 * que reprova `test.ts` embrulhando algum método à mão, por fora dele.
 *
 * ⚠️ O dublê não é uma página de verdade. Ele existe para observar QUANTAS vezes
 * a espera foi exigida e se veio DEPOIS da navegação — as duas propriedades que
 * o embrulho promete. A revelação em página de verdade é de `goBack` na browser;
 * o dublê prova a ligação, e a spec `buffer-ssr-caixa-orfa` continua sendo a
 * que mede o streaming de fato.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
  embrulharANavegacao,
  embrulharONavegador,
  METODOS_DE_NAVEGACAO_REVELADOS,
  METODOS_QUE_ABREM_PAGINA_POR_FORA,
} from "../e2e/helpers/revelacao-nas-cargas";

/** O que o dublê registra: a ordem das navegações e das esperas. */
class PaginaFalsa {
  /** Ordem dos eventos, para provar que a espera vem DEPOIS da navegação. */
  readonly registro: string[] = [];
  /** Quantas vezes a espera foi cobrada. */
  esperas = 0;

  async goto(url: string, opcoes?: { waitUntil?: string }): Promise<{ url: string }> {
    void opcoes;
    this.registro.push(`goto:${url}`);
    return { url };
  }

  async reload(opcoes?: { waitUntil?: string }): Promise<{ url: string }> {
    void opcoes;
    this.registro.push("reload");
    return { url: "" };
  }

  async goBack(opcoes?: { waitUntil?: string }): Promise<{ url: string }> {
    void opcoes;
    this.registro.push("goBack");
    return { url: "" };
  }

  async goForward(opcoes?: { waitUntil?: string }): Promise<{ url: string }> {
    void opcoes;
    this.registro.push("goForward");
    return { url: "" };
  }
}

/** Um dublê já embrulhado pelo embrulho REAL, com a espera observável. */
function paginaEmbrulhada(): PaginaFalsa {
  const pagina = new PaginaFalsa();
  embrulharANavegacao(pagina as unknown as Page, async () => {
    pagina.esperas += 1;
    pagina.registro.push("espera");
  });
  return pagina;
}

describe("a espera da revelação cobre toda a navegação (issue #884)", () => {
  it("a lista nomeia goto, reload, goBack e goForward — nenhum método de fora", () => {
    expect([...METODOS_DE_NAVEGACAO_REVELADOS].sort()).toEqual([
      "goBack",
      "goForward",
      "goto",
      "reload",
    ]);
  });

  it("goBack espera a revelação — é por ele que uma spec 'volta para a Agenda'", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goBack().then(() => {
      expect(pagina.esperas).toBe(1);
      expect(pagina.registro).toEqual(["goBack", "espera"]);
    });
  });

  it("goForward espera a revelação", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goForward().then(() => {
      expect(pagina.esperas).toBe(1);
    });
  });

  it("goto espera a revelação", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goto("/app/agenda").then(() => {
      expect(pagina.esperas).toBe(1);
    });
  });

  it("reload espera a revelação", () => {
    const pagina = paginaEmbrulhada();
    return pagina.reload().then(() => {
      expect(pagina.esperas).toBe(1);
    });
  });

  it("a espera vem DEPOIS da navegação, nunca antes", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goBack().then(() => {
      expect(pagina.registro.indexOf("goBack")).toBeLessThan(pagina.registro.indexOf("espera"));
    });
  });

  it("waitUntil: commit não espera — a caixa não existe ainda", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goto("/app/agenda", { waitUntil: "commit" }).then(() => {
      expect(pagina.esperas).toBe(0);
    });
  });

  it("a volta de ida e volta cobre os DOIS sentidos da pilha de navegação", () => {
    const pagina = paginaEmbrulhada();
    return pagina
      .goForward()
      .then(() => pagina.goBack())
      .then(() => {
        expect(pagina.esperas).toBe(2);
        expect(pagina.registro).toEqual(["goForward", "espera", "goBack", "espera"]);
      });
  });

  it("goBack com waitUntil: commit também não espera — o guarda é do argumento", () => {
    const pagina = paginaEmbrulhada();
    return pagina.goBack({ waitUntil: "commit" }).then(() => {
      expect(pagina.esperas).toBe(0);
    });
  });
});

/**
 * A metade que nenhum caso acima vê: `test.ts` tem de PASSAR pelo embrulho
 * provado. Se ele voltar a embrulhar `goto`/`reload` à mão, com a lista intacta,
 * todos os casos acima seguem verdes e o `goBack` volta a ler a revelação pela
 * metade — exatamente a lacuna da #884.
 */
describe("o test da suíte usa o embrulho provado (issue #884)", () => {
  const fonte = readFileSync(join(__dirname, "../e2e/helpers/test.ts"), "utf8");

  it("test.ts chama embrulharANavegacao com a página", () => {
    expect(fonte).toMatch(/embrulharANavegacao\(\s*page\s*,/);
  });

  it("test.ts não embrulha método de navegação à mão", () => {
    const aMao = /\.(goto|reload|goBack|goForward)\s*=(?!=)|\[\s*metodo\s*\]\s*=(?!=)/;
    expect(
      fonte.match(aMao)?.[0] ?? null,
      "embrulhe só por `embrulharANavegacao` (revelacao-nas-cargas.ts) — é ele que este teste prova",
    ).toBeNull();
  });
});

/**
 * ═══ O TERCEIRO BURACO: A PÁGINA ABERTA POR FORA DAS FIXTURES (19/11/2026) ═══
 *
 * As duas correções anteriores cobriram os MÉTODOS de navegação e ligaram o
 * embrulho pelas fixtures `page` e `context`. A página que a spec ABRE —
 * `browser.newPage()`, `browser.newContext().newPage()` — não passa por fixture
 * nenhuma e nascia sem a espera. Medido no run 44525673231:
 * `menu-por-empresa-e-a-porta-de-volta` falhou no `afterAll`, que abre
 * `browser.newPage()`, com dois `<h2>Menu lateral</h2>` — um deles fora da
 * árvore de acessibilidade, a cópia do servidor ainda na caixa do streaming.
 *
 * O dublê abaixo imita o que o Playwright faz e que importa aqui: o contexto
 * avisa `page` a cada página nova, e `newPage` do navegador cria um contexto
 * por dentro chamando `this.newContext` — por isso a página de `newPage` chega
 * DUAS vezes a `aoAbrirPagina`, e a idempotência por página é de quem recebe.
 */
class ContextoFalso {
  private ouvintes: Array<(pagina: Page) => void> = [];

  on(evento: "page", ouvinte: (pagina: Page) => void): this {
    void evento;
    this.ouvintes.push(ouvinte);
    return this;
  }

  async newPage(): Promise<Page> {
    const pagina = new PaginaFalsa() as unknown as Page;
    for (const ouvinte of this.ouvintes) ouvinte(pagina);
    return pagina;
  }
}

class NavegadorFalso {
  contextosCriados = 0;

  async newContext(opcoes?: { javaScriptEnabled?: boolean }): Promise<ContextoFalso> {
    void opcoes;
    this.contextosCriados += 1;
    return new ContextoFalso();
  }

  // Como o Playwright: `newPage` do navegador passa por `this.newContext`.
  async newPage(opcoes?: { javaScriptEnabled?: boolean }): Promise<Page> {
    const contexto = await this.newContext(opcoes);
    return contexto.newPage();
  }
}

/** Um navegador embrulhado pelo embrulho REAL, e as páginas que ele entregou a quem instala a espera. */
function navegadorEmbrulhado(): { navegador: NavegadorFalso; avisadas: Page[] } {
  const navegador = new NavegadorFalso();
  const avisadas: Page[] = [];
  embrulharONavegador(navegador, (pagina) => avisadas.push(pagina));
  return { navegador, avisadas };
}

describe("a página aberta por fora das fixtures também espera a revelação", () => {
  it("a lista nomeia newContext e newPage — os dois jeitos de o navegador abrir página", () => {
    expect([...METODOS_QUE_ABREM_PAGINA_POR_FORA].sort()).toEqual(["newContext", "newPage"]);
  });

  it("browser.newContext().newPage(): a página chega a quem instala a espera", async () => {
    const { navegador, avisadas } = navegadorEmbrulhado();
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    expect(avisadas).toContain(pagina);
  });

  it("toda página do mesmo contexto chega — a segunda aba e a de window.open também", async () => {
    const { navegador, avisadas } = navegadorEmbrulhado();
    const contexto = await navegador.newContext();
    const primeira = await contexto.newPage();
    const segunda = await contexto.newPage();
    expect(new Set(avisadas)).toEqual(new Set([primeira, segunda]));
  });

  it("browser.newPage(): a página chega — é o caso do afterAll que ficou vermelho", async () => {
    const { navegador, avisadas } = navegadorEmbrulhado();
    const pagina = await navegador.newPage();
    expect(avisadas).toContain(pagina);
  });

  it("javaScriptEnabled: false fica de fora — sem JavaScript a caixa nunca é revelada", async () => {
    const { navegador, avisadas } = navegadorEmbrulhado();
    const contexto = await navegador.newContext({ javaScriptEnabled: false });
    await contexto.newPage();
    await navegador.newPage({ javaScriptEnabled: false });
    expect(avisadas).toEqual([]);
  });

  it("embrulhar duas vezes o mesmo navegador não dobra o aviso — o worker reusa o navegador", async () => {
    const navegador = new NavegadorFalso();
    const avisadas: Page[] = [];
    embrulharONavegador(navegador, (pagina) => avisadas.push(pagina));
    embrulharONavegador(navegador, (pagina) => avisadas.push(pagina));
    const contexto = await navegador.newContext();
    await contexto.newPage();
    expect(avisadas).toHaveLength(1);
  });

  it("ponta a ponta com o embrulho de navegação: o goto da página aberta por fora ESPERA", async () => {
    // As duas metades reais juntas, como `test.ts` as liga: o navegador avisa a
    // página, e quem recebe instala a espera nela.
    const navegador = new NavegadorFalso();
    let esperas = 0;
    const jaEmbrulhadas = new WeakSet<object>();
    embrulharONavegador(navegador, (pagina) => {
      if (jaEmbrulhadas.has(pagina)) return;
      jaEmbrulhadas.add(pagina);
      embrulharANavegacao(pagina, async () => {
        esperas += 1;
      });
    });

    const deContexto = await (await navegador.newContext()).newPage();
    await deContexto.goto("/app/settings/tenant");
    expect(esperas, "página de browser.newContext().newPage()").toBe(1);

    // `newPage` do navegador avisa a mesma página duas vezes (pelo contexto e
    // pelo próprio método): a espera continua sendo UMA por navegação.
    const direta = await navegador.newPage();
    await direta.goto("/app/settings/tenant");
    expect(esperas, "página de browser.newPage()").toBe(2);
  });
});

/**
 * E a ligação: `test.ts` tem de embrulhar o NAVEGADOR, por worker. Sem isto os
 * casos acima provam uma função que ninguém chama.
 */
describe("o test da suíte embrulha o navegador", () => {
  const fonte = readFileSync(join(__dirname, "../e2e/helpers/test.ts"), "utf8");

  it("a fixture `browser` é sobreposta e chama embrulharONavegador com a espera da suíte", () => {
    expect(fonte).toMatch(/browser:\s*\[\s*async\s*\(\{\s*browser\s*\}/);
    expect(fonte).toMatch(/embrulharONavegador\(\s*browser\s*,\s*esperarARevelacaoNasCargas\s*\)/);
    expect(fonte, "o navegador é do worker: embrulhar por teste repetiria o trabalho a cada caso").toMatch(
      /scope:\s*"worker"/,
    );
  });

  it("quem recebe a página é idempotente por página", () => {
    // `browser.newPage()` avisa a mesma página duas vezes; sem a guarda, o `goto`
    // dela esperaria a revelação duas vezes — e um embrulho por cima do outro.
    expect(fonte).toMatch(/if \(comEspera\.has\(page\)\) return;/);
  });

  it("test.ts não embrulha newContext nem newPage à mão", () => {
    const aMao = /\.(newContext|newPage)\s*=(?!=)/;
    expect(
      fonte.match(aMao)?.[0] ?? null,
      "embrulhe só por `embrulharONavegador` (revelacao-nas-cargas.ts) — é ele que este teste prova",
    ).toBeNull();
  });
});

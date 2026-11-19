import type { Page } from "@playwright/test";

/**
 * Quais métodos de navegação a espera da revelação DEVE envolver — e o embrulho
 * que os envolve, em função pura, para o `verify` provar o embrulho REAL sem
 * navegador (no mesmo padrão de `caixa-ssr.ts` e `instrumento-da-pagina.ts`).
 *
 * ═══ O defeito que este arquivo existe para fechar (issue #884) ═════════════
 *
 * `tests/e2e/helpers/test.ts` embrulha `page.goto` e `page.reload` para que
 * só devolvam quando o streaming SSR terminou de revelar a página
 * (issue #1374). O cenário da #884 é, palavra por palavra, "depois de navegar
 * para a Agenda e voltar" — e "voltar" em Playwright é `page.goBack()`, que
 * NÃO era embrulhado. A spec que volta por ali lia o documento no meio da
 * revelação e o `getByTestId("tela-agenda")` casava com DOIS elementos
 * (`strict mode violation`), o vermelho INTERMITENTE do PR #873.
 *
 * A tela da Agenda não era a culpada: medida em jsdom, `AgendaClient` monta 1,
 * desmonta para 0 e remonta para 1. A cópia é a caixa do streaming SSR
 * (`<div hidden id="S:N">`) do servidor, que o React esvazia no cliente.
 *
 * ─── Por que uma LISTA, e não o embrulho em si ═════════════════════════════
 *
 * A lista é o que se prova, e o embrulho sai dela. A falha anterior foi a
 * mesma deste arquivo: a cobertura vivia espalhada dentro do `page.goto`, e a
 * cobertura esquecida (`goBack`) não tinha onde aparecer. Com a lista aqui, a
 * omissão de um método vira uma linha a mais nesta constante — e um teste que
 * a lê.
 *
 * ⚠️ `reload` e `goForward` entram pelo mesmo motivo de `goBack`: são navegação
 * de verdade, e uma spec que volta pela barra do navegador ou pelo botão
 * "avançar" tem o mesmo defeito. `goForward` não é usado hoje — e é por isso
 * que ele precisa entrar: a próxima spec que usar vai herdar a espera, em vez
 * de descobrir a lacuna.
 *
 * ⚠️ `setContent` NÃO entra: ele troca o documento inteiro e não produz caixa
 * de streaming. Incluí-lo seria uma espera que nunca passa, e um teste que
 * estufa a cobertura sem medir nada.
 */
export const METODOS_DE_NAVEGACAO_REVELADOS: readonly string[] = [
  "goto",
  "reload",
  "goBack",
  "goForward",
];

/**
 * Embrulha em `pagina` cada método de `METODOS_DE_NAVEGACAO_REVELADOS` para só
 * devolver depois de `esperar()`. É o que `test.ts` chama; o teste unit chama a
 * MESMA função com um dublê — e a cerca de texto de lá reprova `test.ts` que
 * volte a embrulhar algum método à mão, fora desta função.
 */
export function embrulharANavegacao(pagina: Page, esperar: () => Promise<void>): void {
  const alvo = pagina as unknown as Record<string, unknown>;
  for (const metodo of METODOS_DE_NAVEGACAO_REVELADOS) {
    const original = alvo[metodo];
    if (typeof original !== "function") continue;
    const ligado = (original as (...args: unknown[]) => unknown).bind(pagina);
    alvo[metodo] = async (...args: unknown[]): Promise<unknown> => {
      const resposta = await ligado(...args);
      // `commit` pede de propósito a página antes de ela existir — esperar a
      // revelação ali seria esperar por uma caixa que ninguém vai fechar.
      // `goBack`/`goForward` também aceitam `waitUntil`; o guarda é sobre o
      // ARGUMENTO e não sobre o método, e por isso vale para os quatro.
      const opcoes = args[args.length - 1];
      const pediuCommit =
        typeof opcoes === "object" && opcoes !== null && (opcoes as { waitUntil?: string }).waitUntil === "commit";
      if (!pediuCommit) await esperar();
      return resposta;
    };
  }
}

/**
 * Os métodos do NAVEGADOR que abrem página por fora das fixtures — e que, por
 * isso, entregavam página SEM a espera da revelação.
 *
 * ═══ O terceiro buraco da mesma família (19/11/2026) ═══════════════════════
 *
 * A #1374 embrulhou `goto`/`reload`; a #884, `goBack`/`goForward`. As duas
 * cobriram os MÉTODOS, e as duas ligaram o embrulho pelas fixtures `page` e
 * `context` de `test.ts`. Página aberta com `browser.newPage()` ou
 * `browser.newContext().newPage()` não passa por fixture nenhuma: nascia sem o
 * embrulho, e o `goto` dela devolvia no `load`, no meio da revelação.
 *
 * Medido no run 44525673231: `menu-por-empresa-e-a-porta-de-volta` fecha com um
 * `afterAll` que abre `browser.newPage()`, vai a Configurações › Organização e
 * procura o título «Menu lateral» — e o `getByText` casou DOIS `<h2>` idênticos,
 * um deles fora da árvore de acessibilidade (a cópia do servidor, ainda na
 * caixa `<div hidden id="S:N">`). O corpo do teste, que usa a `page` da fixture,
 * tinha passado pelas mesmas telas sem erro, sempre com a espera no rastro.
 *
 * Não era um caso: na data, 29 specs abriam página por um destes dois métodos,
 * em 50 pontos. A lista abaixo é o que se prova (o mesmo desenho da lista de
 * métodos de navegação): método novo do navegador que abra página entra aqui.
 */
export const METODOS_QUE_ABREM_PAGINA_POR_FORA: readonly string[] = ["newContext", "newPage"];

/** Marca posta no navegador já embrulhado: o worker reusa o mesmo navegador. */
const NAVEGADOR_EMBRULHADO = Symbol("navegador com a espera da revelação");

/** `javaScriptEnabled: false` nas opções: sem JavaScript os reveladores não rodam. */
function pediuSemJavaScript(opcoes: unknown): boolean {
  return (
    typeof opcoes === "object" && opcoes !== null && (opcoes as { javaScriptEnabled?: boolean }).javaScriptEnabled === false
  );
}

/**
 * Embrulha `navegador.newContext` e `navegador.newPage` para que TODA página
 * aberta por eles passe por `aoAbrirPagina` — que é quem instala a espera da
 * revelação (`test.ts`). Idempotente por navegador.
 *
 * - `newContext`: a página ainda não existe; o contexto devolvido avisa por
 *   `on("page")` cada página que nascer nele, inclusive a de `window.open`.
 * - `newPage`: no Playwright ela cria um contexto por dentro e chamaria o
 *   `newContext` já embrulhado — mas isso é detalhe de implementação de lá, e a
 *   página devolvida é entregue a `aoAbrirPagina` aqui também. `aoAbrirPagina`
 *   tem de ser idempotente por página (a de `test.ts` é).
 * - contexto pedido com `javaScriptEnabled: false` fica de fora, pelo mesmo
 *   motivo das fixtures: sem JavaScript a caixa não é revelada nunca.
 */
export function embrulharONavegador(navegador: object, aoAbrirPagina: (pagina: Page) => void): void {
  const alvo = navegador as Record<string | symbol, unknown>;
  if (alvo[NAVEGADOR_EMBRULHADO]) return;
  alvo[NAVEGADOR_EMBRULHADO] = true;

  const novoContexto = alvo.newContext;
  if (typeof novoContexto === "function") {
    const ligado = (novoContexto as (...args: unknown[]) => Promise<unknown>).bind(navegador);
    alvo.newContext = async (...args: unknown[]): Promise<unknown> => {
      const contexto = (await ligado(...args)) as { on(evento: "page", ouvinte: (pagina: Page) => void): unknown };
      if (!pediuSemJavaScript(args[0])) contexto.on("page", aoAbrirPagina);
      return contexto;
    };
  }

  const novaPagina = alvo.newPage;
  if (typeof novaPagina === "function") {
    const ligado = (novaPagina as (...args: unknown[]) => Promise<unknown>).bind(navegador);
    alvo.newPage = async (...args: unknown[]): Promise<unknown> => {
      const pagina = (await ligado(...args)) as Page;
      if (!pediuSemJavaScript(args[0])) aoAbrirPagina(pagina);
      return pagina;
    };
  }
}

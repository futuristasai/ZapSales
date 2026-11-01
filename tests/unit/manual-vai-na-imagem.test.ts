import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O manual do usuário só serve em produção se a IMAGEM o levar.
 *
 * A rota `/manual` lê `docs/manual/index.html` e `docs/manual/img/*` do disco do
 * contêiner. Dois arquivos decidem se eles estão lá, e um erro em qualquer um é
 * silencioso: o link do menu apareceria e abriria "O manual não está disponível
 * nesta instalação" — só numa instalação real, nunca no `pnpm dev`, onde a pasta
 * `docs` existe.
 *
 *   - `.dockerignore` exclui `docs` e precisa re-incluir os dois caminhos;
 *   - `Dockerfile` precisa copiá-los do estágio de build para o de execução.
 *
 * Este teste não constrói a imagem (isso é do job `imagens-ok`); ele fixa o
 * contrato entre os três lados e garante que o que o manual referencia existe.
 */

const ler = (arquivo: string) => readFileSync(arquivo, "utf-8").replace(/\r\n/g, "\n");

describe("o manual vai na imagem do app", () => {
  const dockerignore = ler(".dockerignore")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const dockerfile = ler("Dockerfile");

  it("o .dockerignore exclui docs e re-inclui só a página e os prints, nessa ordem", () => {
    const iDocs = dockerignore.indexOf("docs");
    const iPagina = dockerignore.indexOf("!docs/manual/index.html");
    const iPrints = dockerignore.indexOf("!docs/manual/img");
    expect(iDocs, "`docs` tem de continuar excluído").toBeGreaterThanOrEqual(0);
    // Em .dockerignore a ÚLTIMA linha que casa decide: a exceção vem depois da regra.
    expect(iPagina).toBeGreaterThan(iDocs);
    expect(iPrints).toBeGreaterThan(iDocs);
  });

  it("não re-inclui o conteúdo-fonte nem as ferramentas (não servem para nada em produção)", () => {
    const excecoes = dockerignore.filter((l) => l.startsWith("!"));
    expect(excecoes.filter((l) => /conteudo|ferramentas|modelo/.test(l))).toEqual([]);
  });

  it("o Dockerfile copia a página e os prints para a imagem de execução", () => {
    expect(dockerfile).toMatch(
      /COPY --from=build [^\n]*\/app\/docs\/manual\/index\.html \.\/docs\/manual\/index\.html/,
    );
    expect(dockerfile).toMatch(
      /COPY --from=build [^\n]*\/app\/docs\/manual\/img \.\/docs\/manual\/img/,
    );
  });

  it("a rota lê do mesmo lugar para onde o Dockerfile copia (docs/manual a partir do cwd)", () => {
    const fonte = ler("lib/manual/arquivo.ts");
    expect(fonte).toContain('path.join(process.cwd(), "docs", "manual")');
  });
});

describe("o manual montado está inteiro", () => {
  const pagina = ler("docs/manual/index.html");

  it("a página existe e tem conteúdo (guarda de vacuidade)", () => {
    expect(pagina.length).toBeGreaterThan(100_000);
  });

  it("todo print que a página referencia existe em docs/manual/img", () => {
    const referencias = [...pagina.matchAll(/src="(img\/[^"]+)"/g)].map((m) => m[1]!);
    expect(referencias.length, "o manual tem prints").toBeGreaterThan(50);
    const faltando = [...new Set(referencias)].filter(
      (r) => !existsSync(path.join("docs", "manual", r)),
    );
    expect(faltando).toEqual([]);
  });
});

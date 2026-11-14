/**
 * TODO `import { … } from "./…"` ESCRITO DENTRO DE UM WORKFLOW EXISTE NO CÓDIGO.
 *
 * O passo "Publicar a release no GitHub" (`release.yml`) roda um `tsx -e` que
 * importa `extractChangelogSection` de `lib/system/changelog`. A função saiu do
 * módulo quando a tela de atualização passou a mostrar intervalos, e nada
 * reprovou: o import vive numa string do YAML, onde o typecheck não chega. O
 * primeiro corte automático de verdade (v1.2.0, 14/11/2026) criou a tag,
 * publicou e conferiu as imagens — e morreu aqui com
 * "extractChangelogSection is not a function". A Release, que é o que o
 * instalador lê como "última versão", não saiu.
 *
 * Esta cerca lê todo workflow, acha os imports relativos de código TypeScript e
 * confere, importando o módulo de verdade, que cada nome existe como exportação.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractChangelogSection } from "@/lib/system/changelog";

const RAIZ = join(__dirname, "..", "..");
const PASTA = join(RAIZ, ".github", "workflows");

interface ImportDoWorkflow {
  workflow: string;
  nomes: string[];
  modulo: string;
}

function importsDosWorkflows(): ImportDoWorkflow[] {
  const achados: ImportDoWorkflow[] = [];
  const IMPORT = /import\s*\{([^}]+)\}\s*from\s*["'](\.\/[^"']+)["']/g;
  for (const arq of readdirSync(PASTA).filter((f) => /\.ya?ml$/.test(f))) {
    const texto = readFileSync(join(PASTA, arq), "utf8");
    for (const m of texto.matchAll(IMPORT)) {
      const nomes = (m[1] ?? "")
        .split(",")
        .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
        .filter(Boolean);
      achados.push({ workflow: arq, nomes, modulo: m[2]! });
    }
  }
  return achados;
}

describe("imports de código dentro dos workflows", () => {
  it("acha o import do passo que publica a release (guarda de vacuidade)", () => {
    // Sem isto, uma mudança no formato do YAML esvaziaria a lista e o caso de
    // baixo passaria verde sem medir nada.
    const doRelease = importsDosWorkflows().filter((i) => i.workflow === "release.yml");
    expect(doRelease.flatMap((i) => i.nomes)).toContain("extractChangelogSection");
  });

  it("todo nome importado existe no módulo", async () => {
    const faltando: string[] = [];
    for (const imp of importsDosWorkflows()) {
      const mod = (await import(join(RAIZ, imp.modulo))) as Record<string, unknown>;
      for (const nome of imp.nomes) {
        if (!(nome in mod)) faltando.push(`${imp.workflow}: ${nome} de ${imp.modulo}`);
      }
    }
    expect(faltando).toEqual([]);
  });
});

describe("extractChangelogSection — as notas da Release", () => {
  const CHANGELOG = [
    "# Changelog",
    "",
    "## [Não lançado]",
    "",
    "## [1.2.0] — 2026-11-14",
    "",
    "### ⚠️ Requer atenção",
    "",
    "Rode o kit de novo.",
    "",
    "### Adicionado",
    "",
    "- Modelos novos.",
    "",
    "## [1.1.0] — 2026-11-13",
    "",
    "- Coisa antiga.",
    "",
    "[1.2.0]: https://example.com/compare/v1.1.0...v1.2.0",
  ].join("\n");

  it("devolve só a seção pedida, com o aviso separado", () => {
    const s = extractChangelogSection(CHANGELOG, "1.2.0");
    expect(s?.version).toBe("1.2.0");
    expect(s?.requiresAttention).toBe("Rode o kit de novo.");
    expect(s?.body).toContain("- Modelos novos.");
    expect(s?.body).not.toContain("Coisa antiga");
    expect(s?.body).not.toContain("Requer atenção");
  });

  it("aceita o número com v na frente, como a tag", () => {
    expect(extractChangelogSection(CHANGELOG, "v1.1.0")?.body).toBe("- Coisa antiga.");
  });

  it("a última seção não leva o rodapé de links", () => {
    expect(extractChangelogSection(CHANGELOG, "1.1.0")?.body).not.toContain("example.com");
  });

  it("versão ausente → null, para o passo parar em vez de publicar notas vazias", () => {
    expect(extractChangelogSection(CHANGELOG, "9.9.9")).toBeNull();
    expect(extractChangelogSection("", "1.2.0")).toBeNull();
  });
});

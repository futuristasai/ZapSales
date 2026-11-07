/**
 * O COMANDO QUE O COMPRADOR COLA APONTA PARA O ZAPINSTALADOR — E SÓ O CI PUBLICA LÁ.
 *
 * ## O que esta cerca guarda (issue #224 item 4, ADR-0005)
 *
 * O `kit/obter.sh` roda como administrador na VPS de quem compra. Enquanto o comando apontava para
 * `raw.githubusercontent.com/.../main/kit/obter.sh`, o que o comprador executava mudava a cada push
 * na `main`. Agora ele aponta para https://zapinstalador.futuristas.app/obter.sh, que só muda por
 * `publicar-obter.yml`. Duas coisas apodrecem em silêncio, e é isso que se vigia:
 *
 *  1. A URL ANTIGA VOLTA. Um doc novo copia o comando de um doc velho, e o comprador passa a seguir
 *     um caminho que a publicação não cobre. A cerca varre as pastas que dão o comando a alguém.
 *  2. O WORKFLOW AFROUXA. A garantia de «credencial restrita» tem três pontas — ambiente que só
 *     libera o segredo à `main`/tags, host fixado (sem `ssh-keyscan`), segredo que NUNCA é
 *     interpolado dentro do `run:` (vira argumento de processo, aparece no log) — e qualquer
 *     refatoração bem-intencionada derruba uma sem derrubar nada visível.
 *
 * ## Controle positivo
 *
 * Sem os `expect(... ).toBeGreaterThan(0)`, um regex que parou de casar devolve lista vazia e a
 * cerca fica verde vigiando nada.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const URL_NOVA = "https://zapinstalador.futuristas.app/obter.sh";
// O caminho do GitHub para o kit/obter.sh, em qualquer ramo ou tag.
const URL_ANTIGA = /raw\.githubusercontent\.com\/[^\s"')]+\/kit\/obter\.sh/;

const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Arquivos versionados que dão (ou dariam) o comando a alguém. O ADR conta a história e fica de fora. */
function arquivosDeComando(): string[] {
  const saida = execFileSync(
    "git",
    ["ls-files", "kit", "docs", ".changes", "README.md", "AGENTS.md", "CLAUDE.md", ":(exclude)docs/adr"],
    { cwd: RAIZ, encoding: "utf8" },
  );
  return saida.split("\n").filter(Boolean);
}

describe("o comando do comprador aponta para o zapinstalador", () => {
  const arquivos = arquivosDeComando();

  it("a varredura enxerga arquivos (controle positivo)", () => {
    expect(arquivos.length).toBeGreaterThan(20);
    expect(arquivos).toContain("kit/obter.sh");
    expect(arquivos).toContain("docs/runbooks/instalacao-vps-limpa.md");
  });

  it("o detector reconhece a URL antiga (controle do controle)", () => {
    expect(URL_ANTIGA.test("curl -fsSL https://raw.githubusercontent.com/futuristasai/ZapSales/main/kit/obter.sh | sudo bash")).toBe(true);
    expect(URL_ANTIGA.test(`curl -fsSL ${URL_NOVA} | sudo bash`)).toBe(false);
  });

  it("nenhum arquivo manda o comprador para raw.githubusercontent.com", () => {
    const culpados = arquivos.filter((a) => URL_ANTIGA.test(ler(a)));
    expect(culpados).toEqual([]);
  });

  it.each([
    "kit/obter.sh",
    "kit/instalar.sh",
    "docs/runbooks/instalacao-vps-limpa.md",
    "docs/runbooks/installing-on-a-clean-vps.md",
    "docs/manual/conteudo/servidor/instalar-na-vps.html",
    "docs/manual/index.html",
  ])("%s dá o comando novo", (arquivo) => {
    expect(ler(arquivo)).toContain(`curl -fsSL ${URL_NOVA} | sudo bash`);
  });
});

describe("publicar-obter.yml mantém a credencial estreita", () => {
  const wf = ler(".github/workflows/publicar-obter.yml");
  // Só o código dos passos `run:` (a documentação e os `env:` ficam de fora).
  const runs = [...wf.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)+)/gm)]
    .map((m) => m[1])
    .join("\n")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#")) // comentário explica, não executa
    .join("\n");

  it("o recorte dos passos run: pegou código (controle positivo)", () => {
    expect(runs).toContain("ssh -i");
    expect(runs.length).toBeGreaterThan(500);
  });

  it("o job usa o ambiente que só libera o segredo à main e às tags", () => {
    expect(wf).toMatch(/^ {4}environment: zapinstalador$/m);
  });

  it("publica só de tag vX.Y.Z ou de disparo manual — nunca de push em branch ou PR", () => {
    const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
    expect(on).toContain('tags: ["v*"]');
    expect(on).toContain("workflow_dispatch");
    expect(on).not.toMatch(/branches:|pull_request/);
  });

  it("não escreve no repositório", () => {
    const perm = wf.slice(wf.indexOf("\npermissions:"), wf.indexOf("\njobs:"));
    expect(perm).toContain("contents: read");
    expect(perm).not.toMatch(/write/);
  });

  it("confere a chave do servidor fixada, sem ssh-keyscan nem StrictHostKeyChecking frouxo", () => {
    expect(runs).toContain("StrictHostKeyChecking=yes");
    expect(runs).not.toContain("ssh-keyscan");
    expect(runs).not.toMatch(/StrictHostKeyChecking=(no|accept-new)/);
  });

  it("nenhum segredo é interpolado dentro do código dos passos (só via env:)", () => {
    expect(runs).not.toMatch(/\$\{\{\s*secrets\./);
    expect(runs).not.toMatch(/\$\{\{\s*vars\./);
  });

  it("a chave privada não vai para a linha de comando do ssh", () => {
    expect(runs).toContain('-i "${chave}"');
    expect(runs).not.toMatch(/ssh[^\n]*\$\{CHAVE_SSH\}/);
  });

  it("só confere a procedência na main e o hash pelo endereço público", () => {
    expect(wf).toContain("compare/main...");
    expect(wf).toContain(URL_NOVA);
  });

  it("pede ao servidor exatamente o formato que o comando restrito aceita", () => {
    expect(runs).toContain('"publicar ${ROTULO} ${HASH}"');
    const servidor = ler("scripts/zapinstalador/publicar-no-servidor.sh");
    expect(servidor).toContain("publicar\\ (v[0-9]+\\.[0-9]+\\.[0-9]+|main-[0-9a-f]{40})\\ ([0-9a-f]{64})");
    // os dois rótulos que o workflow produz
    expect(runs).toContain('rotulo="main-${GITHUB_SHA}"');
    expect(runs).toContain('rotulo="${GITHUB_REF_NAME}"');
  });
});

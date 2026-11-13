import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O CORTE AUTOMÁTICO DA RELEASE — o relógio abre o PR, o merge sai sozinho.
 *
 * ## O defeito que este teste existe para não ter de novo
 *
 * O instalador entrega a ÚLTIMA RELEASE, não a `main` (`kit/obter.sh` pergunta
 * `/releases/latest`). Medido em 13/11/2026: a única versão publicada era a 1.0.0,
 * a `main` estava 88 commits à frente — com uma série inteira de correções de
 * segurança — e uma instalação nova, feita pelo comprador, veio sem nada disso. A
 * produção do projeto acompanha a `main`, então tudo PARECIA entregue. Cortar
 * dependia de alguém lembrar, e a 1.0.1 chegou a ser mesclada sem nunca virar tag.
 *
 * ## O que se guarda aqui
 *
 * Quem desliga o job é assunto de `gatilho-dos-jobs-de-entrega.test.ts` (a
 * condição inteira mora no `if:` do job). Aqui fica o que a condição não diz:
 *
 *  1. o relógio existe e bate uma vez por dia;
 *  2. dia sem nada a cortar é "nada a fazer", e não vermelho — e um PR de release
 *     já aberto não ganha um irmão;
 *  3. só o relógio liga o merge automático; quem dispara à mão lê antes;
 *  4. a release do GitHub só é publicada DEPOIS de as imagens existirem, porque é
 *     ela que o instalador consulta.
 *
 * Os passos são EXECUTADOS (o bash é o do arquivo que o CI usa), com `gh`, `git` e
 * `cat` como funções de mentira — a mesma técnica de `release-chega-na-lp.test.ts`.
 */
const RAIZ = process.cwd();
const release = readFileSync(join(RAIZ, ".github/workflows/release.yml"), "utf8");

/** O `run:` de um passo, sem a indentação do YAML. */
function runDoPasso(nome: string): string {
  const i = release.indexOf(`- name: ${nome}`);
  expect(i, `o passo "${nome}" sumiu do release.yml`).toBeGreaterThan(-1);
  const resto = release.slice(i);
  const iRun = resto.indexOf("run: |");
  expect(iRun, `o passo "${nome}" não tem bloco run`).toBeGreaterThan(-1);
  const corpo: string[] = [];
  for (const l of resto
    .slice(iRun + "run: |".length)
    .split("\n")
    .slice(1)) {
    if (l.trim() !== "" && !l.startsWith("          ")) break;
    corpo.push(l.slice(10));
  }
  return corpo.join("\n");
}

function rodar(script: string, env: Record<string, string>, cwd: string) {
  try {
    const saida = execFileSync("bash", ["-c", script], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exit: 0, saida };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { exit: e.status ?? -1, saida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Roda "Há versão a cortar?" numa pasta com os fragmentos dados e N PRs de release abertos. */
function haVersaoACortar(fragmentos: string[], prsDeReleaseAbertos: number) {
  const pasta = mkdtempSync(join(tmpdir(), "corte-automatico-"));
  try {
    mkdirSync(join(pasta, ".changes"));
    writeFileSync(join(pasta, ".changes", ".gitkeep"), "");
    for (const f of fragmentos) writeFileSync(join(pasta, ".changes", f), "impacto: nada_mudou\n");
    const saidaDoPasso = join(pasta, "saida-do-passo");
    writeFileSync(saidaDoPasso, "");
    // O `gh pr list … --jq '… | length'` devolve só o número.
    const falsos = `gh() { printf '%s\\n' "$PRS_ABERTOS"; }`;
    const r = rodar(
      `${falsos}\n${runDoPasso("Há versão a cortar?")}`,
      { GITHUB_OUTPUT: saidaDoPasso, PRS_ABERTOS: String(prsDeReleaseAbertos) },
      pasta,
    );
    return { ...r, cortar: /^cortar=(\w+)$/m.exec(readFileSync(saidaDoPasso, "utf8"))?.[1] };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** Roda "Abrir o PR" com `git` e `gh` de mentira e devolve os comandos que o passo deu. */
function abrirOPr(evento: "schedule" | "workflow_dispatch", ramoJaExiste = false): string[] {
  const pasta = mkdtempSync(join(tmpdir(), "corte-automatico-"));
  try {
    const diario = join(pasta, "comandos");
    writeFileSync(diario, "");
    const falsos = [
      // `git ls-remote --exit-code` sai 2 quando o ramo não existe no remoto.
      'git() { printf "git %s\\n" "$*" >> "$DIARIO"; if [ "$1" = ls-remote ]; then return "$LS_REMOTE"; fi; }',
      'gh() { printf "gh %s\\n" "$*" >> "$DIARIO"; }',
      // O passo lê /tmp/corte.txt, que só existe depois do passo anterior.
      "cat() { :; }",
    ].join("\n");
    const r = rodar(
      `${falsos}\n${runDoPasso("Abrir o PR")}`,
      { DIARIO: diario, EVENTO: evento, VERSAO: "9.9.9", LS_REMOTE: ramoJaExiste ? "0" : "2" },
      pasta,
    );
    expect(r.exit, r.saida).toBe(0);
    return readFileSync(diario, "utf8").trim().split("\n");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

describe("o corte automático da release", () => {
  it("o relógio existe e bate uma vez por dia", () => {
    const gatilhos = release.slice(release.indexOf("\non:\n"), release.indexOf("\npermissions:\n"));
    expect(gatilhos).toContain("workflow_dispatch:");
    // Minuto e hora fixos, todo dia: `*/N` ou lista viraria vários cortes por dia.
    expect(gatilhos).toMatch(/schedule:\n(?:\s+#.*\n)*\s+- cron: "\d{1,2} \d{1,2} \* \* \*"\n/);
  });

  it("sem fragmento em .changes/ não há o que cortar — e o job não fica vermelho", () => {
    const r = haVersaoACortar([], 0);
    expect(r.exit, r.saida).toBe(0);
    expect(r.cortar).toBe("nao");
    expect(r.saida).toContain("::notice::");
  });

  it("com um PR de release já aberto, não abre outro para a mesma versão", () => {
    const r = haVersaoACortar(["mudanca-qualquer.md"], 1);
    expect(r.exit, r.saida).toBe(0);
    expect(r.cortar).toBe("nao");
    expect(r.saida).toContain("::warning::");
  });

  it("com fragmento e nenhum PR de release aberto, corta", () => {
    const r = haVersaoACortar(["uma.md", "outra.md"], 0);
    expect(r.exit, r.saida).toBe(0);
    expect(r.cortar).toBe("sim");
  });

  it("os passos que escrevem só rodam quando há o que cortar", () => {
    const job = release.slice(release.indexOf("  abrir-pr-de-release:"), release.indexOf("  cortar-tag:"));
    for (const passo of ["- uses: ./.github/actions/preparar-node", "- name: Calcular o número e montar a seção", "- name: Abrir o PR"]) {
      const i = job.indexOf(passo);
      expect(i, passo).toBeGreaterThan(-1);
      expect(job.slice(i, i + passo.length + 80), passo).toContain("if: steps.haver.outputs.cortar == 'sim'");
    }
  });

  it("pelo relógio, o PR já sai com o merge automático ligado", () => {
    const comandos = abrirOPr("schedule");
    expect(comandos).toContain("gh pr merge release/9.9.9 --auto --merge");
    // O merge automático é pedido DEPOIS de o PR existir.
    expect(comandos.findIndex((c) => c.startsWith("gh pr create"))).toBeLessThan(
      comandos.findIndex((c) => c.startsWith("gh pr merge")),
    );
  });

  it("disparado à mão, o PR fica esperando quem disparou ler e mesclar", () => {
    const comandos = abrirOPr("workflow_dispatch");
    expect(comandos.some((c) => c.startsWith("gh pr create"))).toBe(true);
    expect(comandos.some((c) => c.startsWith("gh pr merge"))).toBe(false);
  });

  it("ramo que sobrou de um PR de release fechado é refeito, em vez de travar o corte todo dia", () => {
    const comandos = abrirOPr("schedule", true);
    const apagar = comandos.indexOf("git push origin --delete release/9.9.9");
    const empurrar = comandos.indexOf("git push origin release/9.9.9");
    expect(apagar).toBeGreaterThan(-1);
    expect(apagar).toBeLessThan(empurrar);
    // Sem sobra, nada é apagado.
    expect(abrirOPr("schedule", false)).not.toContain("git push origin --delete release/9.9.9");
  });

  it("nunca empurra à força: o ramo de release é refeito, não reescrito", () => {
    expect(runDoPasso("Abrir o PR")).not.toMatch(/--force|-f\b|\+release/);
  });

  it("a release do GitHub só é publicada depois de as imagens existirem — é ela que o instalador consulta", () => {
    const tag = release.indexOf("- name: Criar e empurrar a tag");
    const imagens = release.indexOf("- name: As três imagens existem nesta versão?");
    const publicar = release.indexOf("- name: Publicar a release no GitHub");
    const vitrine = release.indexOf("- name: A versão aparece na página de changelog da LP?");
    expect(tag).toBeGreaterThan(-1);
    expect(imagens).toBeGreaterThan(tag);
    expect(publicar, "a release sairia antes de as imagens responderem").toBeGreaterThan(imagens);
    expect(vitrine).toBeGreaterThan(publicar);
  });
});

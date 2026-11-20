import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NIVEIS_EXPLICADOS,
  OPCOES_EXPLICADAS,
  RISCO_DO_NIVEL_EQUILIBRADO,
  TOTAL_DE_OPCOES,
  opcaoExplicada,
} from "@/lib/ai/ferramentas-externas/api/opcoes";
import { OPCOES_COM_RECOMENDACAO, NIVEIS_DE_SEGURANCA } from "@/lib/ai/ferramentas-externas/api/seguranca";
import { FRASE_DA_TRAVA } from "@/lib/ai/ferramentas-externas/api/travas";
import { ROTULO_DO_DADO_DO_CONTATO } from "@/lib/ai/ferramentas-externas/api/tipos";
import { temTraducao } from "@/lib/i18n/dicionario";

/**
 * AS OPÇÕES DE SEGURANÇA DAS APIs CHEGAM EXPLICADAS A QUEM NÃO É PROGRAMADOR (issue #372).
 *
 * Decisão do dono do produto, e critério de aceite da issue: toda opção de segurança mostra, NA
 * TELA, o que faz, um exemplo, a posição recomendada e o risco de sair dela — e sair do
 * recomendado nunca é um clique só. Uma regra dessas apodrece no dia em que alguém acrescenta a
 * 18ª opção com um interruptor e um rótulo. Esta cerca é o que impede:
 *
 *   1. o catálogo tem as 16 opções prometidas, cada uma com os cinco textos preenchidos;
 *   2. toda opção que tem posição recomendada no schema (`OPCOES_COM_RECOMENDACAO`) está no
 *      catálogo marcada `comAlerta` — é o que liga a confirmação de risco e o selo;
 *   3. todo texto do catálogo existe em espanhol e em inglês (a tela cai no português em
 *      silêncio quando falta, e este é exatamente o texto que não pode faltar);
 *   4. a tela desenha cada opção pelo componente único (`OpcaoDeSeguranca`), que é quem mostra
 *      os cinco textos — uma opção com controle solto na tela não passa.
 */

const TEXTOS = ["nome", "oQueFaz", "exemplo", "recomendacao", "risco"] as const;
/** O tamanho abaixo do qual o texto não explica nada (um rótulo solto no lugar de uma frase). */
const MINIMO: Record<(typeof TEXTOS)[number], number> = { nome: 5, oQueFaz: 25, exemplo: 25, recomendacao: 15, risco: 25 };

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("o catálogo das opções de segurança das APIs", () => {
  it(`tem as ${TOTAL_DE_OPCOES} opções prometidas, sem id repetido`, () => {
    expect(OPCOES_EXPLICADAS).toHaveLength(TOTAL_DE_OPCOES);
    expect(new Set(OPCOES_EXPLICADAS.map((o) => o.id)).size).toBe(TOTAL_DE_OPCOES);
    expect(OPCOES_EXPLICADAS.filter((o) => o.escopo === "organizacao")).toHaveLength(8);
    // A verificação em duas etapas saiu por decisão do dono (20/11/2026) e não volta sem decisão nova.
    expect(OPCOES_EXPLICADAS.map((o) => o.id)).not.toContain("exigir_duas_etapas");
    expect(OPCOES_EXPLICADAS.filter((o) => o.escopo === "ferramenta")).toHaveLength(8);
  });

  it("toda opção diz o que faz, dá um exemplo, a recomendação e o risco — em frases de verdade", () => {
    const fracas = OPCOES_EXPLICADAS.flatMap((o) =>
      TEXTOS.filter((campo) => o[campo].trim().length < MINIMO[campo]).map((campo) => `${o.id}.${campo}`),
    );
    expect(fracas).toEqual([]);
    // O exemplo é um exemplo, não a explicação repetida.
    expect(OPCOES_EXPLICADAS.filter((o) => o.exemplo === o.oQueFaz).map((o) => o.id)).toEqual([]);
  });

  it("toda opção com posição recomendada no schema pede confirmação de risco e deixa selo", () => {
    for (const chave of OPCOES_COM_RECOMENDACAO) {
      expect(opcaoExplicada(chave).comAlerta, `${chave} tem posição recomendada e precisa de alerta`).toBe(true);
      expect(opcaoExplicada(chave).escopo).toBe("organizacao");
    }
    // As de ferramenta que a regra `foraDoRecomendadoNaFerramenta` cobra.
    for (const id of ["efeito_e_aprovacao", "limite_de_uso", "pausa_automatica"]) {
      expect(opcaoExplicada(id).comAlerta, `${id} precisa de alerta`).toBe(true);
    }
  });

  it("os três níveis de segurança estão explicados", () => {
    expect(NIVEIS_EXPLICADOS.map((n) => n.id)).toEqual([...NIVEIS_DE_SEGURANCA]);
    for (const n of NIVEIS_EXPLICADOS) {
      expect(n.oQueFaz.length).toBeGreaterThan(25);
      expect(n.exemplo.length).toBeGreaterThan(25);
    }
  });
});

describe("os textos de segurança existem nos três idiomas", () => {
  const textos = [
    ...OPCOES_EXPLICADAS.flatMap((o) => TEXTOS.map((campo) => o[campo])),
    ...NIVEIS_EXPLICADOS.flatMap((n) => [n.nome, n.oQueFaz, n.exemplo]),
    RISCO_DO_NIVEL_EQUILIBRADO,
    ...Object.values(FRASE_DA_TRAVA),
    ...Object.values(ROTULO_DO_DADO_DO_CONTATO),
    "Fora do recomendado",
    "Na posição recomendada",
    "Manter como está (recomendado)",
    "Mudar mesmo assim",
    "Voltar e ajustar (recomendado)",
    "Salvar mesmo assim",
  ];

  it.each(["es", "en"] as const)("nenhum texto cai no português em %s", (idioma) => {
    expect(textos.filter((texto) => !temTraducao(texto, idioma))).toEqual([]);
  });
});

describe("a tela desenha cada opção pelo componente que mostra os cinco textos", () => {
  const painel = fonte("app/app/ai/external-tools/_apis-seguranca.tsx");
  const formulario = fonte("app/app/ai/external-tools/_apis-dialogs.tsx");
  const componente = fonte("app/app/ai/external-tools/_apis-opcao.tsx");

  it("o componente mostra o que faz, o exemplo, a recomendação e o risco", () => {
    for (const trecho of ["opcao.oQueFaz", "opcao.exemplo", "opcao.recomendacao", "opcao.risco", "Fora do recomendado"]) {
      expect(componente).toContain(trecho);
    }
  });

  it("toda opção da organização aparece no painel dentro de <OpcaoDeSeguranca>", () => {
    // «ligar» é o interruptor do recurso: tem a própria tela (o estado desligado, com o aceite).
    const esperadas = OPCOES_EXPLICADAS.filter((o) => o.escopo === "organizacao" && o.id !== "ligar").map((o) => o.id);
    expect(esperadas.filter((id) => !painel.includes(`<OpcaoDeSeguranca id="${id}"`))).toEqual([]);
  });

  it("toda opção de ferramenta aparece no formulário da API", () => {
    const esperadas = OPCOES_EXPLICADAS.filter((o) => o.escopo === "ferramenta").map((o) => o.id);
    // «valores permitidos» mora junto de cada campo (parte 3), com a explicação citada do catálogo.
    const faltando = esperadas.filter(
      (id) => !formulario.includes(`<OpcaoDeSeguranca id="${id}"`) && !formulario.includes(`opcaoExplicada("${id}")`),
    );
    expect(faltando).toEqual([]);
  });

  it("sair do recomendado passa por uma confirmação que mostra o risco, no painel e no formulário", () => {
    expect(painel).toContain('data-testid="confirmar-risco"');
    expect(painel).toContain('data-testid="manter-recomendado"');
    expect(formulario).toContain('data-testid="confirmar-risco-da-api"');
    expect(formulario).toContain('data-testid="voltar-e-ajustar"');
  });
});

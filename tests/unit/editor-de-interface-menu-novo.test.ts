import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { essencial, permitidos, PORTAS_ESSENCIAIS } from "@/lib/navigation/interface";
import { menuEditavelDoPapel, type BlocoProjetado } from "@/lib/navigation/menu";

/**
 * O EDITOR DE INTERFACE POR EMPRESA NO MENU NOVO (issue #191, pai #183).
 *
 * O editor em que o dono escolhe quais telas a empresa mostra lista as telas pelos
 * blocos, áreas e grupos do menu novo, com os nomes novos. O que ele lista é o que
 * o papel enxerga MENOS as portas essenciais (que nunca se escondem): a lista de
 * opções e o menu são projeções do mesmo catálogo e não podem divergir.
 */

const DONO = "admin" as const;
const GERENTE = "manager" as const;
const ATENDENTE = "agent" as const;
const LEITOR = "viewer" as const;

function hrefsDe(blocos: readonly BlocoProjetado[]): string[] {
  return blocos.flatMap((b) =>
    (b.id === "configurar" ? b.areas.flatMap((a) => a.grupos) : b.grupos).flatMap((g) =>
      g.itens.map((i) => i.href),
    ),
  );
}

/** "Bloco › Área › Grupo: Tela, Tela" — uma linha por grupo, na ordem do menu. */
function resumo(blocos: readonly BlocoProjetado[]): string[] {
  return blocos.flatMap((b) =>
    b.id === "configurar"
      ? b.areas.flatMap((a) =>
          a.grupos.map((g) => `${b.label} › ${a.label} › ${g.label}: ${g.itens.map((i) => i.label).join(", ")}`),
        )
      : b.grupos.map((g) => `${b.label} › ${g.label}: ${g.itens.map((i) => i.label).join(", ")}`),
  );
}

describe("opções do editor de interface por empresa", () => {
  it("agrupa as telas por bloco, área e grupo do menu novo, com os nomes novos", () => {
    const linhas = resumo(menuEditavelDoPapel(DONO));

    // Bloco › Área › Grupo, e o NOME NOVO da tela (não "Credenciais"/"Webhooks").
    expect(linhas.some((l) => l.startsWith("Configurar › Agente › Conectar a IA:") && l.includes("Chave da IA"))).toBe(
      true,
    );
    expect(linhas.some((l) => l.startsWith("Configurar › Conexões › Outros sistemas:") && l.includes("Avisar outros sistemas"))).toBe(
      true,
    );
    expect(linhas.some((l) => l.startsWith("Todo dia › Leads:") && l.includes("Conversas"))).toBe(true);
    expect(linhas.some((l) => l.startsWith("Resultados › "))).toBe(true);
    // O modelo antigo não aparece: nem o grupo "Agente de IA" nem "Canais".
    expect(linhas.join("\n")).not.toMatch(/Agente de IA|Canais|Organização/);
  });

  it("nunca oferece uma porta essencial — ela não pode ser escondida", () => {
    // Quem administra: as quatro (Perfil, Segurança, Equipe, Dados da empresa).
    const doDono = hrefsDe(menuEditavelDoPapel(DONO));
    for (const porta of PORTAS_ESSENCIAIS) {
      expect(doDono, `${porta} apareceu como opção escondível para o dono`).not.toContain(porta);
    }
    // Equipe e Dados da empresa só são essenciais para quem administra; Perfil e
    // Segurança são pessoais e valem para todo papel.
    for (const role of [GERENTE, ATENDENTE, LEITOR] as const) {
      const hrefs = hrefsDe(menuEditavelDoPapel(role));
      expect(hrefs).not.toContain("/app/settings/profile");
      expect(hrefs).not.toContain("/app/settings/security");
    }
  });

  it("oferece cada tela escondível do papel exatamente uma vez — nenhuma some, nenhuma repete", () => {
    for (const role of [DONO, GERENTE, ATENDENTE, LEITOR] as const) {
      const esperado = permitidos(false, role)
        .filter((d) => !essencial(d, role))
        .map((d) => d.href)
        .sort();
      expect(esperado.length, `${role} ficou sem opção nenhuma — a comparação seria vacuidade`).toBeGreaterThan(0);
      expect(hrefsDe(menuEditavelDoPapel(role)).sort()).toEqual(esperado);
    }
  });

  it("o papel só vê as opções que o seu papel permite (leitor tem menos que o dono)", () => {
    const dono = new Set(hrefsDe(menuEditavelDoPapel(DONO)));
    const leitor = hrefsDe(menuEditavelDoPapel(LEITOR));
    expect(leitor.length).toBeLessThan(dono.size + PORTAS_ESSENCIAIS.length);
    // Tudo o que o leitor pode escolher o dono pode, salvo as portas que são
    // essenciais só para o dono (e por isso saem da lista dele).
    for (const href of leitor) {
      const soEssencialDoDono = (PORTAS_ESSENCIAIS as readonly string[]).includes(href);
      expect(dono.has(href) || soEssencialDoDono, `${href} está na lista do leitor e não na do dono`).toBe(true);
    }
    expect(dono.has("/app/ai/providers"), "controle: a tela existe para o dono").toBe(true);
    expect(leitor).not.toContain("/app/ai/providers");
  });

  it("bloco, área e grupo sem opção não aparecem", () => {
    for (const role of [DONO, GERENTE, ATENDENTE, LEITOR] as const) {
      for (const b of menuEditavelDoPapel(role)) {
        const grupos = b.id === "configurar" ? b.areas.flatMap((a) => a.grupos) : b.grupos;
        expect(grupos.length, `bloco ${b.id} vazio para ${role}`).toBeGreaterThan(0);
        if (b.id === "configurar") for (const a of b.areas) expect(a.grupos.length).toBeGreaterThan(0);
        for (const g of grupos) expect(g.itens.length).toBeGreaterThan(0);
      }
    }
  });

  it("com módulos e capacidades opcionais desligados, a tela deles não é oferecida", () => {
    const hrefs = hrefsDe(menuEditavelDoPapel(DONO, [], []));
    const comOpcional = NAV_CATALOG.filter((d) => "modulo" in d || "capacidade" in d).map((d) => d.href);
    expect(comOpcional.length).toBeGreaterThan(0);
    for (const href of comOpcional) expect(hrefs).not.toContain(href);

    const todos = hrefsDe(menuEditavelDoPapel(DONO, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO));
    expect(todos.length).toBeGreaterThan(hrefs.length);
  });
});

import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { destinosDaInterface, type InterfaceSettings } from "@/lib/navigation/interface";
import { entradaDaTela, faixaDoMenu } from "@/lib/navigation/faixa";
import { menuDoPapel } from "@/lib/navigation/menu";
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";

/**
 * A FAIXA E O PAINEL DO COMPUTADOR (issue #188, pai #183), como projeção do menu.
 *
 * O que a pessoa vê na faixa — quais entradas, em que ordem, com que telas atrás — é
 * decidido aqui, sem componente nenhum. Quem vê o quê continua sendo a regra de
 * sempre (`destinosDaInterface`): a faixa só reagrupa o que `menuDoPapel` entrega.
 * O que estes casos prendem é o que não pode divergir: nenhuma tela some do conjunto
 * (as 63 continuam alcançáveis), e entrada sem tela visível não aparece.
 */

type Papel = "admin" | "manager" | "agent" | "viewer";

const faixa = (papel: Papel, settings?: InterfaceSettings, platform = false) =>
  faixaDoMenu(
    menuDoPapel(platform, papel, settings, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO),
  );

const ids = (f: ReturnType<typeof faixa>) =>
  [f.todoDia, ...f.configurar, f.resultados].filter(Boolean).map((e) => e!.id);

const hrefsDe = (f: ReturnType<typeof faixa>): string[] =>
  [f.todoDia, ...f.configurar, f.resultados, f.conta]
    .filter(Boolean)
    .flatMap((e) => ("grupos" in e! ? e!.grupos : [e!]).flatMap((g) => g.itens.map((i) => i.href)));

describe("as entradas da faixa", () => {
  it("o dono vê Todo dia, as quatro áreas de Configurar e Resultados, nessa ordem", () => {
    expect(ids(faixa("admin"))).toEqual([
      "todo-dia",
      "vender",
      "agente",
      "conexoes",
      "empresa",
      "resultados",
    ]);
  });

  it("os rótulos são os do catálogo, no singular que a pessoa lê", () => {
    const f = faixa("admin");
    expect(f.todoDia?.label).toBe("Todo dia");
    expect(f.configurar.map((e) => e.label)).toEqual(["Vender", "Agente", "Conexões", "Empresa"]);
    expect(f.resultados?.label).toBe("Resultados");
  });

  it("o leitor não vê Agente: área sem tela visível não aparece", () => {
    const f = faixa("viewer");
    expect(ids(f)).toEqual(["todo-dia", "vender", "conexoes", "empresa", "resultados"]);
    // Nenhuma entrada vazia, nenhum grupo vazio.
    for (const e of [f.todoDia, ...f.configurar, f.resultados]) {
      expect(e!.grupos.length).toBeGreaterThan(0);
      for (const g of e!.grupos) expect(g.itens.length).toBeGreaterThan(0);
    }
  });

  it("Todo dia traz Leads e Gestão de Clientes CRM antes de «Se a sua empresa usa»", () => {
    const f = faixa("admin");
    expect(f.todoDia!.grupos.map((g) => g.label)).toEqual([
      "Leads",
      "Gestão de Clientes CRM",
      "Se a sua empresa usa",
    ]);
    expect(f.todoDia!.grupos[0]!.itens.map((i) => i.label)).toEqual([
      "Conversas",
      "Aguardando Humano",
      "Alertas",
      "Riscos de Perda",
      "Compromissos",
    ]);
  });

  it("Propostas só aparece em «Se a sua empresa usa» quando a empresa liga o recurso", () => {
    const itensDoGrupo = (f: ReturnType<typeof faixa>) =>
      f
        .todoDia!.grupos.find((g) => g.label === "Se a sua empresa usa")
        ?.itens.map((i) => i.label) ?? [];
    const sem = faixaDoMenu(menuDoPapel(false, "admin", undefined, MODULOS_OPCIONAIS, []));
    expect(itensDoGrupo(sem)).not.toContain("Propostas");
    expect(itensDoGrupo(faixa("admin"))).toContain("Propostas");
  });

  it("o menu da conta (Você) traz Perfil, Segurança e Notificações", () => {
    expect(faixa("viewer").conta!.itens.map((i) => i.label)).toEqual([
      "Perfil",
      "Segurança",
      "Notificações",
    ]);
  });

  it("cada entrada da faixa tem o seu ícone, e nenhum é o de uma tela", () => {
    const f = faixa("admin");
    const icones = [f.todoDia, ...f.configurar, f.resultados].map((e) => e!.icone);
    expect(new Set(icones).size, "ícones repetidos entre as entradas da faixa").toBe(icones.length);
    const dasTelas = new Set(NAV_DESTINATIONS.map((d) => d.icon));
    expect(icones.filter((i) => dasTelas.has(i))).toEqual([]);
  });
});

describe("nenhuma tela some", () => {
  const casos: Array<[string, Papel, InterfaceSettings | undefined, boolean]> = [
    ["dono", "admin", undefined, false],
    ["gerente", "manager", undefined, false],
    ["atendente", "agent", undefined, false],
    ["leitor", "viewer", undefined, false],
    ["administrador da plataforma", "viewer", undefined, true],
    ["interface simplificada", "admin", { preset: "simplificada" }, false],
  ];

  it.each(casos)(
    "%s: faixa + conta alcançam exatamente as telas que a regra de hoje libera",
    (_n, papel, settings, platform) => {
      const esperado = destinosDaInterface(
        settings,
        platform,
        papel,
        MODULOS_OPCIONAIS,
        CAPACIDADES_DA_ORGANIZACAO,
      )
        .map((d) => d.href)
        .sort();
      const obtido = hrefsDe(faixa(papel, settings, platform)).sort();
      expect(obtido.length, "guarda de vacuidade").toBeGreaterThan(5);
      expect(obtido).toEqual(esperado);
    },
  );
});

describe("a entrada onde a pessoa está", () => {
  it("é a entrada que guarda a tela atual", () => {
    const f = faixa("admin");
    expect(entradaDaTela(f, "/app/inbox")).toBe("todo-dia");
    expect(entradaDaTela(f, "/app/ai/agents")).toBe("agente");
    expect(entradaDaTela(f, "/app/analise")).toBeNull();
  });

  it("uma sub-rota pertence à tela dela, e a mais específica vence", () => {
    const f = faixa("admin");
    expect(entradaDaTela(f, "/app/ai/agents/abc-123")).toBe("agente");
    // /app/settings/tenant (Dados da empresa) e /app/settings/tenant/pipelines (Etapas do funil)
    expect(entradaDaTela(f, "/app/settings/tenant")).toBe("empresa");
    expect(entradaDaTela(f, "/app/settings/tenant/pipelines")).toBe("vender");
  });

  it("não confunde prefixo de texto com sub-rota", () => {
    // «/app/inboxes» não é filho de «/app/inbox».
    expect(entradaDaTela(faixa("admin"), "/app/inboxes")).toBeNull();
  });

  it("uma tela do menu da conta não pertence a nenhuma entrada da faixa", () => {
    expect(entradaDaTela(faixa("admin"), "/app/settings/profile")).toBeNull();
  });
});

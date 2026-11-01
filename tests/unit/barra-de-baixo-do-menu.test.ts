import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { barraDeBaixoDoMenu } from "@/lib/navigation/celular";
import { faixaDoMenu } from "@/lib/navigation/faixa";
import type { InterfaceSettings } from "@/lib/navigation/interface";
import { menuDoPapel } from "@/lib/navigation/menu";

/**
 * A BARRA DE BAIXO DO CELULAR, como projeção do menu (issue #190, pai #183).
 *
 * Quem vê o quê continua sendo a regra de sempre (`destinosDaInterface`, via
 * `menuDoPapel`): a barra só reagrupa o que a faixa já entrega. O que estes casos
 * prendem é o que a pessoa lê na barra — quais abas, em que ordem, com que telas
 * atrás — e que aba sem tela visível não existe (nenhum botão leva a folha vazia).
 */

type Papel = "admin" | "manager" | "agent" | "viewer";

const barra = (papel: Papel, settings?: InterfaceSettings, platform = false) =>
  barraDeBaixoDoMenu(
    faixaDoMenu(
      menuDoPapel(platform, papel, settings, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO),
    ),
  );

const ids = (papel: Papel, settings?: InterfaceSettings) => barra(papel, settings).map((a) => a.id);

describe("as abas da barra de baixo", () => {
  it("o dono vê Conversas, Todo dia, Configurar e Resultados, nessa ordem", () => {
    expect(ids("admin")).toEqual(["conversas", "todo-dia", "configurar", "resultados"]);
  });

  it("os rótulos são os do catálogo", () => {
    expect(barra("admin").map((a) => a.label)).toEqual([
      "Conversas",
      "Todo dia",
      "Configurar",
      "Resultados",
    ]);
  });

  it("Conversas é um link direto para a tela, e as outras três abrem uma folha", () => {
    const [conversas, ...folhas] = barra("admin");
    expect(conversas).toMatchObject({ tipo: "link", href: "/app/inbox", contador: "fila" });
    expect(folhas.map((f) => f.tipo)).toEqual(["folha", "folha", "folha"]);
  });

  it("a folha de Todo dia traz a mesa (Leads e Gestão de Clientes CRM)", () => {
    const todoDia = barra("admin").find((a) => a.id === "todo-dia");
    expect(todoDia?.tipo === "folha" && todoDia.entradas.map((e) => e.id)).toEqual(["todo-dia"]);
    const grupos = todoDia?.tipo === "folha" ? todoDia.entradas[0]!.grupos.map((g) => g.label) : [];
    expect(grupos.slice(0, 2)).toEqual(["Leads", "Gestão de Clientes CRM"]);
  });

  it("a folha de Configurar traz as quatro áreas, cada uma com seus grupos por tarefa", () => {
    const cfg = barra("admin").find((a) => a.id === "configurar");
    expect(cfg?.tipo === "folha" && cfg.entradas.map((e) => e.label)).toEqual([
      "Vender",
      "Agente",
      "Conexões",
      "Empresa",
    ]);
    if (cfg?.tipo === "folha")
      for (const e of cfg.entradas) expect(e.grupos.length).toBeGreaterThan(0);
  });

  it("a folha de Resultados traz os três grupos", () => {
    const r = barra("admin").find((a) => a.id === "resultados");
    expect(r?.tipo === "folha" && r.entradas[0]!.grupos).toHaveLength(3);
  });

  it("o leitor não vê a área Agente: área sem tela visível não aparece na folha", () => {
    const cfg = barra("viewer").find((a) => a.id === "configurar");
    expect(cfg?.tipo === "folha" && cfg.entradas.map((e) => e.id)).toEqual([
      "vender",
      "conexoes",
      "empresa",
    ]);
  });

  it("a interface enxuta da empresa tira a aba sem tela, mas as portas essenciais seguram Configurar", () => {
    // Só Conversas e Funis escolhidos: Resultados esvazia e some; Equipe e Dados da empresa
    // (portas que nunca podem ser escondidas) mantêm a aba Configurar de pé.
    const enxuta: InterfaceSettings = {
      preset: "simplificada",
      destinos: ["/app/inbox", "/app/kanban"],
    };
    expect(ids("admin", enxuta)).toEqual(["conversas", "todo-dia", "configurar"]);
  });

  it("quem não tem a tela de Conversas não ganha a aba", () => {
    const semConversas: InterfaceSettings = { preset: "simplificada", destinos: ["/app/kanban"] };
    expect(ids("admin", semConversas)).not.toContain("conversas");
  });

  it("nenhuma tela do menu fica de fora: tudo que a faixa lista está atrás de uma aba", () => {
    const f = faixaDoMenu(
      menuDoPapel(false, "admin", undefined, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO),
    );
    const daFaixa = [f.todoDia, ...f.configurar, f.resultados]
      .flatMap((e) => e?.grupos ?? [])
      .flatMap((g) => g.itens.map((i) => i.href))
      .sort();
    const daBarra = barra("admin")
      .flatMap((a) => (a.tipo === "folha" ? a.entradas.flatMap((e) => e.grupos) : []))
      .flatMap((g) => g.itens.map((i) => i.href))
      .sort();
    expect(daBarra).toEqual(daFaixa);
    expect(daBarra.length).toBeGreaterThan(30);
  });

  it("cada aba tem um ícone, e nenhum se repete", () => {
    const icones = barra("admin").map((a) => a.icone);
    expect(icones.every(Boolean)).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
  });
});

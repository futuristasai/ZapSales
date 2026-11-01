import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { MENU_GRUPOS, NAV_CATALOG } from "@/lib/navigation/catalogo";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { menuDoPapel, type BlocoProjetado } from "@/lib/navigation/menu";

/**
 * O MODELO NOVO DO MENU (issue #185, pai #183).
 *
 * Cada tela do catálogo declara onde mora no menu novo, AO LADO dos campos de
 * hoje, e `menuDoPapel` devolve "o que cada pessoa vê" nesse modelo. Nada disto
 * é desenhado ainda: o Sidebar, o hub e o ⌘K seguem lendo o modelo antigo. Estes
 * testes prendem as duas coisas que não podem divergir quando os tickets
 * seguintes migrarem a tela: a POSIÇÃO de cada destino e a VISIBILIDADE por papel.
 */

const TODOS_OS_MODULOS = MODULOS_OPCIONAIS;
const TODAS_AS_CAPACIDADES = CAPACIDADES_DA_ORGANIZACAO;

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

/** "Bloco › Área › Grupo: Tela, Tela" — uma linha por grupo visível, na ordem do menu. */
function resumo(blocos: readonly BlocoProjetado[]): string[] {
  return blocos.flatMap((b) =>
    b.id === "configurar"
      ? b.areas.flatMap((a) =>
          a.grupos.map((g) => `${b.label} › ${a.label} › ${g.label}: ${g.itens.map((i) => i.menu.nome).join(", ")}`),
        )
      : b.grupos.map((g) => `${b.label} › ${g.label}: ${g.itens.map((i) => i.menu.nome).join(", ")}`),
  );
}

function bloco(blocos: readonly BlocoProjetado[], id: BlocoProjetado["id"]) {
  return blocos.find((b) => b.id === id);
}

function gruposDe(b: BlocoProjetado | undefined) {
  if (!b) return [];
  return b.id === "configurar" ? b.areas.flatMap((a) => a.grupos) : b.grupos;
}

const menu = (role: typeof DONO | typeof GERENTE | typeof ATENDENTE | typeof LEITOR) =>
  menuDoPapel(false, role, undefined, TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES).blocos;

describe("posição de cada tela no catálogo", () => {
  it("toda tela declara posição, num grupo que existe, com ordem inteira positiva e nome", () => {
    const grupos = new Set<string>(MENU_GRUPOS.map((g) => g.id));
    const ruins = NAV_CATALOG.filter(
      (d) =>
        !grupos.has(d.menu.grupo) ||
        !Number.isInteger(d.menu.ordem) ||
        d.menu.ordem < 1 ||
        d.menu.nome.trim() === "",
    ).map((d) => d.href);
    expect(ruins).toEqual([]);
  });

  it("nenhuma posição se repete: um grupo não tem duas telas na mesma ordem", () => {
    const vistos = new Map<string, string>();
    const repetidas: string[] = [];
    for (const d of NAV_CATALOG) {
      const chave = `${d.menu.grupo}#${d.menu.ordem}`;
      const anterior = vistos.get(chave);
      if (anterior) repetidas.push(`${chave}: ${anterior} e ${d.href}`);
      vistos.set(chave, d.href);
    }
    expect(repetidas).toEqual([]);
  });

  it("nenhuma tela some: o menu novo, para quem vê tudo, tem o mesmo conjunto do catálogo", () => {
    const projetado = hrefsDe(menuDoPapel(true, null, undefined, TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES).blocos);
    const catalogo = NAV_CATALOG.map((d) => d.href);
    expect(new Set(projetado).size, "a projeção repetiu uma tela").toBe(projetado.length);
    expect([...projetado].sort()).toEqual([...catalogo].sort());
    // Guarda de vacuidade: o catálogo tinha 63 destinos quando o menu novo nasceu.
    expect(catalogo.length).toBeGreaterThanOrEqual(63);
  });
});

describe("o que cada papel vê no modelo novo", () => {
  it("os blocos aparecem na ordem Todo dia, Configurar, Resultados, e a conta por último", () => {
    expect(menu(DONO).map((b) => b.id)).toEqual(["todo-dia", "configurar", "resultados", "conta"]);
  });

  it("Dono: a mesa de Todo dia está na ordem do protótipo 6", () => {
    const todoDia = bloco(menu(DONO), "todo-dia");
    expect(gruposDe(todoDia).map((g) => [g.label, g.itens.map((i) => i.menu.nome)])).toEqual([
      ["Leads", ["Conversas", "Aguardando Humano", "Alertas", "Riscos de Perda", "Compromissos"]],
      ["Gestão de Clientes CRM", ["Funis", "Contatos", "Tarefas", "Disparo em massa"]],
      ["Se a sua empresa usa", ["Propostas", "Comandas", "Chamadas"]],
    ]);
  });

  it("Dono: Configurar tem as quatro áreas, com os grupos por tarefa", () => {
    const configurar = bloco(menu(DONO), "configurar");
    expect(configurar?.id).toBe("configurar");
    if (configurar?.id !== "configurar") return;
    expect(configurar.areas.map((a) => [a.label, a.grupos.map((g) => g.label)])).toEqual([
      ["Vender", ["O seu funil", "O que você vende", "Como a equipe vende", "Cadastro de empresas"]],
      ["Agente", ["Montar o agente", "Ensinar o agente", "Conectar a IA"]],
      ["Conexões", ["WhatsApp e telefone", "Outros sistemas", "Anúncios"]],
      ["Empresa", ["Equipe", "A empresa", "Plano e regras"]],
    ]);
  });

  it("Dono: Resultados tem três grupos e o menu da conta guarda Perfil, Segurança e Notificações", () => {
    expect(
      gruposDe(bloco(menu(DONO), "resultados")).map((g) => [g.label, g.itens.map((i) => i.menu.nome)]),
    ).toEqual([
      ["Números do negócio", ["Desempenho", "Meta Ads", "Faturamento", "Honorários"]],
      ["Equipe e IA", ["Atividades", "Evolução da IA", "Sugestões da IA", "Uso e orçamento"]],
      ["Quando algo dá errado", ["Histórico do agente", "Quem mexeu em quê"]],
    ]);
    expect(gruposDe(bloco(menu(DONO), "conta")).flatMap((g) => g.itens.map((i) => i.menu.nome))).toEqual([
      "Perfil",
      "Segurança",
      "Notificações",
    ]);
  });

  it("a ordem das telas dentro de um grupo é a da posição declarada, não a do catálogo", () => {
    const leads = gruposDe(bloco(menu(DONO), "todo-dia"))[0]!;
    const ordens = leads.itens.map((i) => i.menu.ordem);
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b));
    // No catálogo o Radar vem antes de Casos e Alertas; no menu novo é o contrário.
    expect(leads.itens.map((i) => i.href)).toEqual([
      "/app/inbox",
      "/app/ai/cases",
      "/app/ai/inbox",
      "/app/radar",
      "/app/agenda",
    ]);
  });

  it("Atendente: só vê o que o papel dele permite; Agente desaparece", () => {
    const blocos = menu(ATENDENTE);
    expect(gruposDe(bloco(blocos, "todo-dia")).map((g) => [g.label, g.itens.map((i) => i.menu.nome)])).toEqual([
      ["Leads", ["Conversas", "Aguardando Humano", "Alertas", "Riscos de Perda", "Compromissos"]],
      ["Gestão de Clientes CRM", ["Funis", "Contatos", "Tarefas"]],
      ["Se a sua empresa usa", ["Propostas", "Comandas"]],
    ]);
    const configurar = bloco(blocos, "configurar");
    if (configurar?.id !== "configurar") throw new Error("Atendente deveria ter Configurar");
    // Conexões só sobra por "Dados de outro sistema", que QUALQUER papel vê quando o módulo está ligado.
    expect(configurar.areas.map((a) => a.label)).toEqual(["Vender", "Conexões", "Empresa"]);
    expect(
      configurar.areas.find((a) => a.id === "conexoes")?.grupos.flatMap((g) => g.itens.map((i) => i.menu.nome)),
    ).toEqual(["Dados de outro sistema"]);
    expect(bloco(blocos, "resultados")?.id).toBe("resultados");
  });

  it("Atendente numa instalação sem módulos opcionais: Configurar fica só com Vender e Empresa", () => {
    const configurar = bloco(menuDoPapel(false, ATENDENTE, undefined, [], []).blocos, "configurar");
    if (configurar?.id !== "configurar") throw new Error("Atendente deveria ter Configurar");
    expect(configurar.areas.map((a) => a.label)).toEqual(["Vender", "Empresa"]);
  });

  it("Gerente: tudo o que o Atendente vê, mais disparo, chamadas e a montagem do agente — sem o que é só do Dono", () => {
    expect(resumo(menu(GERENTE))).toEqual([
      "Todo dia › Leads: Conversas, Aguardando Humano, Alertas, Riscos de Perda, Compromissos",
      "Todo dia › Gestão de Clientes CRM: Funis, Contatos, Tarefas, Disparo em massa",
      "Todo dia › Se a sua empresa usa: Propostas, Comandas, Chamadas",
      "Configurar › Vender › O seu funil: Etapas do funil, Tipos de agendamento",
      "Configurar › Vender › O que você vende: Produtos, Padrões de proposta, Modelos de proposta",
      "Configurar › Vender › Como a equipe vende: Respostas rápidas, Etiquetas",
      "Configurar › Vender › Cadastro de empresas: Importações, Empresas, Pessoas",
      "Configurar › Agente › Montar o agente: Agentes, Follow-ups, Fluxos de atendimento, Quem atende cada conversa",
      "Configurar › Agente › Ensinar o agente: Conhecimento, Memória, O que o agente sabe fazer",
      "Configurar › Agente › Conectar a IA: Conectar outros sistemas, Chave da IA, Qual IA usar",
      "Configurar › Conexões › Outros sistemas: Avisar outros sistemas, Dados de outro sistema",
      "Configurar › Empresa › Equipe: Equipe, Revezamento da equipe",
      "Configurar › Empresa › A empresa: Financeiro",
      "Configurar › Empresa › Plano e regras: Recursos opcionais, Extensões",
      "Resultados › Números do negócio: Desempenho, Meta Ads, Faturamento, Honorários",
      "Resultados › Equipe e IA: Atividades, Evolução da IA, Sugestões da IA, Uso e orçamento",
      "Resultados › Quando algo dá errado: Histórico do agente, Quem mexeu em quê",
      "Você › Você: Perfil, Segurança, Notificações",
    ]);
  });

  it("Leitor: só consulta — menu exato, sem nenhuma tela que peça mais que viewer", () => {
    expect(resumo(menu(LEITOR))).toEqual([
      "Todo dia › Leads: Conversas, Alertas, Riscos de Perda, Compromissos",
      "Todo dia › Gestão de Clientes CRM: Funis, Contatos, Tarefas",
      "Todo dia › Se a sua empresa usa: Propostas, Comandas",
      "Configurar › Vender › O seu funil: Tipos de agendamento",
      "Configurar › Vender › O que você vende: Produtos",
      "Configurar › Vender › Como a equipe vende: Respostas rápidas",
      "Configurar › Vender › Cadastro de empresas: Empresas, Pessoas",
      "Configurar › Conexões › Outros sistemas: Dados de outro sistema",
      "Configurar › Empresa › Equipe: Equipe",
      "Configurar › Empresa › A empresa: Financeiro",
      "Configurar › Empresa › Plano e regras: Extensões",
      "Resultados › Números do negócio: Desempenho, Faturamento, Honorários",
      "Resultados › Equipe e IA: Atividades, Sugestões da IA",
      "Você › Você: Perfil, Segurança, Notificações",
    ]);
  });

  it("bloco, área ou grupo sem tela visível não aparece", () => {
    for (const papel of [DONO, GERENTE, ATENDENTE, LEITOR]) {
      for (const b of menu(papel)) {
        const grupos = gruposDe(b);
        expect(grupos.length, `${papel}: bloco ${b.id} vazio`).toBeGreaterThan(0);
        for (const g of grupos) expect(g.itens.length, `${papel}: grupo ${g.id} vazio`).toBeGreaterThan(0);
        if (b.id === "configurar") {
          for (const a of b.areas) expect(a.grupos.length, `${papel}: área ${a.id} vazia`).toBeGreaterThan(0);
        }
      }
    }
    // Sem módulos nem capacidades, a mesa opcional encolhe: Propostas (capacidade) some, Comandas (sem porta fechada) fica.
    const nada = menuDoPapel(false, LEITOR, undefined, [], []).blocos;
    const opcional = gruposDe(bloco(nada, "todo-dia")).find((g) => g.id === "se-a-empresa-usa");
    expect(opcional?.itens.map((i) => i.menu.nome)).toEqual(["Comandas"]);
  });
});

describe("a visibilidade é a de hoje, só apresentada de outro jeito", () => {
  const configuracoes = {
    completa: undefined,
    simplificada: { preset: "simplificada" as const },
    minima: { preset: "completa" as const, destinos: ["/app/inbox" as const] },
  };

  for (const papel of [DONO, GERENTE, ATENDENTE, LEITOR]) {
    for (const [nome, settings] of Object.entries(configuracoes)) {
      for (const [rotulo, modulos, capacidades] of [
        ["tudo ligado", TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES],
        ["nada opcional", [], []],
      ] as const) {
        it(`${papel}, interface ${nome}, ${rotulo}: mesmo conjunto de telas do modelo antigo`, () => {
          const antigo = destinosDaInterface(settings, false, papel, modulos, capacidades)
            .map((d) => d.href)
            .sort();
          const novo = hrefsDe(menuDoPapel(false, papel, settings, modulos, capacidades).blocos).sort();
          expect(novo).toEqual(antigo);
        });
      }
    }
  }

  it("administrador de plataforma vê o mesmo que o modelo antigo mostra a ele", () => {
    const antigo = destinosDaInterface(undefined, true, null, TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES)
      .map((d) => d.href)
      .sort();
    const novo = hrefsDe(menuDoPapel(true, null, undefined, TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES).blocos).sort();
    expect(novo).toEqual(antigo);
  });

  it("módulo opcional desligado esconde a tela em qualquer papel", () => {
    const hrefs = hrefsDe(menuDoPapel(false, DONO, undefined, [], TODAS_AS_CAPACIDADES).blocos);
    expect(hrefs).not.toContain("/app/companies");
    expect(hrefs).not.toContain("/app/integracao-dados");
    expect(hrefs).not.toContain("/app/honorarios");
  });

  it("as portas essenciais continuam no menu mesmo com a interface mínima", () => {
    const hrefs = hrefsDe(menuDoPapel(false, DONO, configuracoes.minima, [], []).blocos);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/app/settings/profile",
        "/app/settings/security",
        "/app/team",
        "/app/settings/tenant",
      ]),
    );
  });

  it("sem papel e sem ser administrador de plataforma o menu é vazio", () => {
    expect(menuDoPapel(false, null, undefined, TODOS_OS_MODULOS, TODAS_AS_CAPACIDADES).blocos).toEqual([]);
  });
});

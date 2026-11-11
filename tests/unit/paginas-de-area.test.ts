import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS, type ModuloOpcional } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { MENU_GRUPOS, PAGINAS_DE_AREA } from "@/lib/navigation/catalogo";
import { buscaveis, itensDoMenu, menuDoPapel, secoesDaPaginaDeArea } from "@/lib/navigation/menu";

/**
 * AS PÁGINAS DE ÁREA (issue #192, pai #183).
 *
 * `/app/crm`, `/app/ai`, `/app/analise` e `/app/settings` deixaram de ser o caminho
 * principal do menu — os links "Ver tudo em…" saíram —, mas continuam abrindo pelo
 * endereço e continuam na busca. Elas são projeção do MESMO catálogo do menu novo:
 * cada uma declara quais grupos por tarefa lista, e o que a pessoa vê dentro deles
 * é o que o menu já decide (papel, módulos, interface por empresa).
 */

const TODOS = MODULOS_OPCIONAIS;
const CAPACIDADES = CAPACIDADES_DA_ORGANIZACAO;
const PAPEIS = ["admin", "manager", "agent", "viewer"] as const;

const secoes = (href: string, role: (typeof PAPEIS)[number] | null, modulos: readonly ModuloOpcional[] = TODOS) =>
  secoesDaPaginaDeArea(href, false, role, undefined, modulos, CAPACIDADES);
const hrefsDe = (href: string, role: (typeof PAPEIS)[number] | null, modulos: readonly ModuloOpcional[] = TODOS) =>
  secoes(href, role, modulos).flatMap((g) => g.itens.map((i) => i.href));

describe("o que cada página de área lista", () => {
  it("são as quatro páginas que sempre existiram, com os mesmos endereços", () => {
    expect(PAGINAS_DE_AREA.map((p) => p.href)).toEqual(["/app/crm", "/app/ai", "/app/analise", "/app/settings"]);
  });

  it("só cita grupos que existem, e nenhum grupo duas vezes na mesma página", () => {
    const existentes = new Set<string>(MENU_GRUPOS.map((g) => g.id));
    for (const pagina of PAGINAS_DE_AREA) {
      expect(pagina.grupos.filter((g) => !existentes.has(g)), pagina.href).toEqual([]);
      expect(new Set(pagina.grupos).size, pagina.href).toBe(pagina.grupos.length);
    }
  });

  it("as seções são os grupos por tarefa do menu, na ordem declarada pela página", () => {
    expect(secoes("/app/ai", "admin").map((g) => g.label)).toEqual([
      "Montar o agente",
      "Ensinar o agente",
      "Conectar a IA",
      "Leads",
      "Equipe e IA",
      "Quando algo dá errado",
    ]);
  });

  it("Análise lista os três grupos de Resultados, com as telas que o Dono vê lá", () => {
    const resultados = itensDoMenu(
      menuDoPapel(false, "admin", undefined, TODOS, CAPACIDADES).blocos.filter((b) => b.id === "resultados"),
    ).map((i) => i.href);
    expect(hrefsDe("/app/analise", "admin")).toEqual(resultados);
    expect(resultados.length).toBeGreaterThan(0);
  });

  it("CRM é inventário: o que se abre todo dia mais tudo o que se define em Vender", () => {
    const hrefs = hrefsDe("/app/crm", "admin");
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/app/kanban",
        "/app/contacts",
        "/app/tasks",
        "/app/campaigns",
        "/app/comandas",
        "/app/products",
        "/app/settings/tenant/pipelines",
      ]),
    );
  });

  it("empresas, pessoas e importação só existem com o módulo crm_b2b ligado (doc 68)", () => {
    const B2B = ["/app/companies", "/app/people", "/app/imports"];
    expect(hrefsDe("/app/crm", "admin", []).filter((h) => B2B.includes(h))).toEqual([]);
    expect(hrefsDe("/app/crm", "admin", ["crm_b2b"]).filter((h) => B2B.includes(h)).sort()).toEqual([...B2B].sort());
  });

  it("Configurações guarda a conta e a empresa, e não vaza tela acima do papel", () => {
    const doLeitor = hrefsDe("/app/settings", "viewer");
    expect(doLeitor).toContain("/app/settings/profile");
    expect(doLeitor).not.toContain("/app/settings/api-tokens");
    expect(hrefsDe("/app/settings", "admin")).toContain("/app/settings/api-tokens");
  });

  it("seção sem tela visível não aparece — para nenhum papel, em nenhuma página", () => {
    for (const pagina of PAGINAS_DE_AREA) {
      for (const papel of PAPEIS) {
        for (const g of secoes(pagina.href, papel)) {
          expect(g.itens.length, `${pagina.href} / "${g.label}" veio vazia para ${papel}`).toBeGreaterThan(0);
        }
      }
    }
    // A testemunha de que o filtro por papel é exercitado: alguma seção some para o leitor.
    const rotulos = (papel: (typeof PAPEIS)[number]) =>
      new Set(PAGINAS_DE_AREA.flatMap((p) => secoes(p.href, papel).map((g) => `${p.href}/${g.id}`)));
    const doLeitor = rotulos("viewer");
    expect([...rotulos("admin")].filter((s) => !doLeitor.has(s)).length).toBeGreaterThan(0);
  });

  it("nenhuma tela aparece duas vezes na mesma página", () => {
    for (const pagina of PAGINAS_DE_AREA) {
      const hrefs = hrefsDe(pagina.href, "admin");
      expect(new Set(hrefs).size, pagina.href).toBe(hrefs.length);
    }
  });

});

/**
 * O PISO: o que cada hub listava ANTES da issue #192, tela por tela, congelado do catálogo antigo
 * (`group` de cada destino) para o Dono com todos os módulos ligados. As páginas de área não podem
 * perder nenhuma delas — três e2e abrem a página e clicam na tela (Tipos de agendamento, Etiquetas,
 * Histórico do agente). Podem listar a mais, porque o corte agora é por grupo do menu.
 */
const INVENTARIO_ANTIGO: Record<string, readonly string[]> = {
  "/app/crm": [
    "/app/prospecting", "/app/kanban", "/app/campaigns", "/app/contacts", "/app/companies", "/app/people",
    "/app/tasks", "/app/calls", "/app/products", "/app/imports", "/app/proposals", "/app/comandas",
    "/app/settings/tenant/pipelines",
  ],
  "/app/ai": [
    "/app/ai/agents", "/app/ai/followups", "/app/ai/atendimento", "/app/ai/routers", "/app/ai/credentials",
    "/app/ai/providers", "/app/ai/knowledge/sources", "/app/ai/external-tools", "/app/ai/memory",
    "/app/ai/skills", "/app/ai/cases", "/app/ai/inbox", "/app/ai/cases/avisos", "/app/ai/proposals",
    "/app/ai/runs", "/app/ai/usage",
  ],
  "/app/analise": [
    "/app/faturamento", "/app/honorarios", "/app/metrics", "/app/ads/meta", "/app/activities",
    "/app/ai/evolution", "/app/audit",
  ],
  "/app/settings": [
    "/app/settings/tenant/agenda", "/app/settings/tenant/proposals", "/app/settings/tenant/proposals/modelos",
    "/app/settings/tenant/financeiro", "/app/settings/profile", "/app/settings/security",
    "/app/settings/notifications", "/app/team", "/app/settings/atendimento", "/app/settings/tags",
    "/app/settings/recursos", "/app/settings/tenant", "/app/settings/conversoes", "/app/settings/meta-ads",
    "/app/settings/marca", "/app/settings/billing", "/app/lgpd/requests", "/app/settings/api-tokens",
    "/app/settings/voip-trunk", "/app/extensions", "/app/integracao-dados",
  ],
};

describe("nenhuma página de área perde o que listava", () => {
  for (const [href, antigo] of Object.entries(INVENTARIO_ANTIGO)) {
    it(`${href} continua listando as ${antigo.length} telas de antes`, () => {
      const hoje = new Set(hrefsDe(href, "admin"));
      expect(antigo.filter((h) => !hoje.has(h))).toEqual([]);
    });
  }
});

describe("as páginas de área na busca", () => {
  const busca = (role: (typeof PAPEIS)[number] | null, termo?: string) =>
    buscaveis(false, role, undefined, TODOS, CAPACIDADES).filter((r) => !termo || r.label === termo);

  it("o Dono acha as quatro páginas de área pelo nome", () => {
    const paginas = busca("admin").filter((r) => r.paginaDeArea);
    expect(paginas.map((r) => r.href)).toEqual(["/app/crm", "/app/ai", "/app/analise", "/app/settings"]);
    expect(paginas.map((r) => r.label)).toEqual(["Gestão de Clientes CRM", "Agente de IA", "Análise", "Configurações"]);
  });

  it("a página de área só aparece se a pessoa vê alguma tela dela", () => {
    // Com a interface mínima da empresa (só Conversas, mais as portas essenciais), nenhuma tela de
    // Resultados fica visível: a página de Análise não vira porta para o vazio.
    const minima = { preset: "completa" as const, destinos: ["/app/inbox" as const] };
    const hrefs = buscaveis(false, "admin", minima, TODOS, CAPACIDADES).map((r) => r.href);
    expect(hrefs).not.toContain("/app/analise");
    expect(hrefs).toContain("/app/settings");
    expect(busca("agent").map((r) => r.href)).toContain("/app/crm");
  });

  it("sem papel e sem ser administrador de plataforma não há nada a buscar", () => {
    expect(busca(null)).toEqual([]);
  });

  it("todo resultado diz em que lugar do menu mora — a categoria do ⌘K", () => {
    for (const r of busca("admin")) {
      expect(r.lugar.label, r.href).not.toBe("");
    }
    const porHref = (href: string) => busca("admin").find((r) => r.href === href);
    expect(porHref("/app/inbox")?.lugar.label).toBe("Todo dia");
    expect(porHref("/app/ai/agents")?.lugar.label).toBe("Agente");
    expect(porHref("/app/metrics")?.lugar.label).toBe("Resultados");
  });

  it("a tela continua sendo achada pelo nome antigo e pelo termo técnico", () => {
    const webhooks = busca("admin").find((r) => r.href === "/app/webhooks");
    expect(webhooks?.sinonimos).toContain("Webhooks");
    expect(webhooks?.termo).toBe("webhooks");
  });
});

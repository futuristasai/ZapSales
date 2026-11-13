import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { DEFAULT_APP_NAME, type Branding } from "@/lib/branding";
import { MarcaDaInstalacaoProvider } from "@/lib/branding/contexto";
import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { faixaDoMenu } from "@/lib/navigation/faixa";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { menuDoPapel } from "@/lib/navigation/menu";
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";

/**
 * A FAIXA E O PAINEL DO COMPUTADOR (issue #188), pela superfície.
 *
 * Quem vê o quê é a regra do catálogo e está em `faixa-do-menu.test.ts`; aqui se
 * prova o que a pessoa faz: o painel abre em Todo dia, cada entrada da faixa troca
 * a lista, o painel recolhe e volta, e recolhido ele se abre por cima da tela e
 * fecha por Esc, clique fora ou escolha de uma tela. Altura e largura em pixels
 * ficam para o navegador (`tests/e2e/navegacao.spec.ts`): o jsdom não faz layout.
 */

const rota = { atual: "/app/inbox" };
vi.mock("next/navigation", () => ({ usePathname: () => rota.atual }));
const toggleSidebar = vi.fn();
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: (...args: unknown[]) => toggleSidebar(...args),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => <span data-testid="saude-da-conexao" />,
}));
// Os contadores leem pelo React Query; o NÚMERO mora em contador-da-fila.test.tsx. O dublê
// marca ONDE o painel e a faixa os põem — e se é o da faixa.
vi.mock("@/components/shell/ContadorDeCasos", () => ({
  ContadorDeCasos: () => <span data-testid="marcador-casos" />,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({
  ContadorDaFila: ({ naFaixa }: { naFaixa?: boolean }) => (
    <span data-testid="marcador-fila" data-na-faixa={String(Boolean(naFaixa))} />
  ),
}));
vi.mock("@/components/shell/AvisoDeConexaoNaFaixa", () => ({
  AvisoDeConexaoNaFaixa: () => <span data-testid="aviso-de-conexao" />,
}));
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: ({ soAtualizacao }: { soAtualizacao?: boolean }) => (
    <span data-testid="versao" data-so-atualizacao={String(Boolean(soAtualizacao))} />
  ),
}));
vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Buscar telas</div> : null,
}));

const usuario = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "dono@exemplo.test",
  is_platform_admin: false,
  organizations: [],
} as unknown as AuthUser;

let org: ActiveOrg;
function comoPapel(role: ActiveOrg["role"], extra: Partial<ActiveOrg> = {}) {
  org = {
    orgId: "00000000-0000-4000-8000-0000000000aa",
    name: "Loja da Ana",
    role,
    modulos_ligados: [...MODULOS_OPCIONAIS],
    capacidades_ligadas: [...CAPACIDADES_DA_ORGANIZACAO],
    ...extra,
  } as ActiveOrg;
}
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: usuario, activeOrg: org }),
}));

const PADRAO: Branding = { name: DEFAULT_APP_NAME, logoUrl: null, initial: "Z" };

function renderizar(recolhido = false, marca: Branding = PADRAO) {
  return render(
    <MarcaDaInstalacaoProvider marca={marca}>
      <Sidebar collapsed={recolhido} />
    </MarcaDaInstalacaoProvider>,
  );
}

const faixa = () => screen.getByRole("navigation", { name: "Áreas do menu" });
const botaoDaFaixa = (nome: string) =>
  within(faixa()).getByRole("button", { name: new RegExp(`^${nome}`) });
const painel = () => screen.queryByRole("navigation", { name: "Navegação principal" });

beforeEach(() => {
  rota.atual = "/app/inbox";
  toggleSidebar.mockClear();
  comoPapel("admin");
});
afterEach(cleanup);

describe("as entradas da faixa", () => {
  it("o dono vê Todo dia, as quatro áreas sob «Configurar», Resultados, Buscar e Você", () => {
    renderizar();
    const nomes = within(faixa())
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(nomes).toEqual([
      "Todo dia",
      "Vender",
      "Agente",
      "Conexões",
      "Empresa",
      "Resultados",
      "Buscar",
      "Você",
    ]);
    expect(within(faixa()).getByRole("group", { name: "Configurar" })).toBeInTheDocument();
  });

  it("o leitor não vê a entrada Agente", () => {
    comoPapel("viewer");
    renderizar();
    expect(within(faixa()).queryByRole("button", { name: /^Agente/ })).toBeNull();
    expect(botaoDaFaixa("Vender")).toBeInTheDocument();
  });

  it("a faixa é uma região de navegação com nome, distinta da lista do painel", () => {
    renderizar();
    expect(screen.getAllByRole("navigation").map((n) => n.getAttribute("aria-label"))).toEqual([
      "Áreas do menu",
      "Navegação principal",
    ]);
  });
});

describe("o painel abre em Todo dia", () => {
  it("mostra a mesa: Leads e Gestão de Clientes CRM juntos, e «Se a sua empresa usa» fora dela", () => {
    renderizar();
    const lista = painel()!;
    expect(screen.getByRole("heading", { level: 2, name: "Todo dia" })).toBeInTheDocument();
    const mesa = screen.getByTestId("mesa-de-trabalho");
    expect(within(mesa).getByRole("heading", { name: "Leads" })).toBeInTheDocument();
    expect(
      within(mesa).getByRole("heading", { name: "Gestão de Clientes CRM" }),
    ).toBeInTheDocument();
    const titulos = within(lista)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titulos).toEqual([
      "Leads",
      "Gestão de Clientes CRM",
      "Se a sua empresa usa",
      "Dúvidas? Consulte o manual",
    ]);
    expect(within(mesa).queryByRole("heading", { name: "Se a sua empresa usa" })).toBeNull();
    expect(within(lista).getByRole("link", { name: /Conversas/ })).toHaveAttribute(
      "href",
      "/app/inbox",
    );
  });

  it("Follow-ups está na mesa; Comandas e Chamadas não estão no painel", () => {
    renderizar();
    const mesa = screen.getByTestId("mesa-de-trabalho");
    expect(within(mesa).getByRole("link", { name: /Follow-ups/ })).toHaveAttribute(
      "href",
      "/app/ai/followups",
    );
    const lista = painel()!;
    expect(within(lista).queryByRole("link", { name: /Comandas/ })).toBeNull();
    expect(within(lista).queryByRole("link", { name: /Chamadas/ })).toBeNull();
  });

  it("o Manual fecha a lista em destaque, com título próprio, e abre em outra aba", () => {
    renderizar();
    const destaque = within(painel()!).getByTestId("destaque-do-manual");
    expect(
      within(destaque).getByRole("heading", { level: 3, name: "Dúvidas? Consulte o manual" }),
    ).toBeInTheDocument();
    // O nome do link é só «Manual»; a frase de baixo é a descrição dele.
    const manual = within(destaque).getByRole("link", { name: "Manual" });
    expect(manual).toHaveAttribute("href", "/manual/index.html");
    expect(manual).toHaveAttribute("target", "_blank");
    expect(manual).toHaveAccessibleDescription("Passo a passo de cada tela");
    // Um só Manual no painel: o link do rodapé saiu.
    expect(screen.getAllByRole("link", { name: "Manual" })).toHaveLength(1);
    // E vem DEPOIS de tudo o que a mesa lista.
    const links = within(painel()!).getAllByRole("link");
    expect(links[links.length - 1]).toBe(manual);
  });

  it("empresa sem Propostas: o Manual ocupa o lugar de «Se a sua empresa usa»", () => {
    comoPapel("admin", { capacidades_ligadas: [] });
    renderizar();
    const titulos = within(painel()!)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titulos).toEqual(["Leads", "Gestão de Clientes CRM", "Dúvidas? Consulte o manual"]);
  });

  it("os contadores existentes aparecem: a fila em Conversas e no ícone de Todo dia, os casos em Aguardando Humano", () => {
    renderizar();
    const fila = screen.getAllByTestId("marcador-fila");
    // Um na linha de Conversas, um sobre o ícone de Todo dia — e nada mais.
    expect(fila).toHaveLength(2);
    expect(fila.filter((f) => f.dataset.naFaixa === "true")).toHaveLength(1);
    const naFaixa = fila.find((f) => f.dataset.naFaixa === "true")!;
    expect(naFaixa.closest("button")).toBe(botaoDaFaixa("Todo dia"));
    const casos = screen.getAllByTestId("marcador-casos");
    expect(casos).toHaveLength(1);
    expect(casos[0]!.closest("a")).toHaveAttribute("href", "/app/ai/cases");
  });

  it("o ícone de Conexões leva o aviso de conexão caída; nenhum outro ícone leva", () => {
    renderizar();
    const aviso = screen.getByTestId("aviso-de-conexao");
    expect(aviso.closest("button")).toBe(botaoDaFaixa("Conexões"));
    expect(screen.getAllByTestId("aviso-de-conexao")).toHaveLength(1);
  });

  it("marca a tela atual com aria-current e a entrada que a guarda", () => {
    renderizar();
    expect(within(painel()!).getByRole("link", { name: /Conversas/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-current", "true");
    expect(botaoDaFaixa("Vender")).not.toHaveAttribute("aria-current");
    // O painel à vista é o de Todo dia, e o botão dele fica apertado.
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-pressed", "true");
  });

  it("«Quadro do funil» é o primeiro de Gestão de Clientes CRM, e um quadro aberto marca ele — não «Funis»", () => {
    rota.atual = "/app/pipelines/11111111-1111-4111-8111-111111111111";
    renderizar();
    const mesa = screen.getByTestId("mesa-de-trabalho");
    const crm = within(mesa).getByRole("region", { name: "Gestão de Clientes CRM" });
    const links = within(crm).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/app/pipelines");
    expect(links[0]).toHaveTextContent("Quadro do funil");
    // O termo técnico fica embaixo do nome, como «inbox» sob Conversas.
    expect(links[0]).toHaveTextContent("kanban");
    expect(links[1]).toHaveAttribute("href", "/app/kanban");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-current", "true");
  });
});

describe("as áreas de Configurar e Resultados abrem a gaveta", () => {
  const gaveta = () => screen.getByRole("dialog");

  it("clicar numa área abre um diálogo com o nome dela, e o painel segue em Todo dia", async () => {
    const u = userEvent.setup();
    renderizar();
    const botao = botaoDaFaixa("Vender");
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");
    await u.click(botao);
    expect(screen.getByRole("dialog", { name: "Vender" })).toBeInTheDocument();
    // Aberta, a gaveta deixa o resto da tela fora da árvore de acessibilidade.
    expect(botao).toHaveAttribute("aria-expanded", "true");
    // O painel de baixo não troca de lista: a gaveta é por cima dele.
    expect(screen.getByRole("heading", { level: 2, hidden: true, name: "Todo dia" })).toBeTruthy();
    expect(screen.queryByRole("button", { hidden: true, name: "Voltar para Todo dia" })).toBeNull();
  });

  it("agrupa as telas por tarefa, com a descrição e o termo técnico de cada uma", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    const g = within(gaveta());
    expect(g.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "O seu funil",
      "O que você vende",
      "Como a equipe vende",
      "Cadastro de empresas",
    ]);
    const etapas = g.getByRole("link", { name: /Etapas do funil/ });
    expect(etapas).toHaveAttribute("href", "/app/settings/tenant/pipelines");
    const etapasDestino = NAV_DESTINATIONS.find(
      (d) => d.href === "/app/settings/tenant/pipelines",
    )!;
    expect(etapas).toHaveTextContent(etapasDestino.description);

    await u.keyboard("{Escape}");
    await u.click(botaoDaFaixa("Conexões"));
    const hooks = within(gaveta()).getByRole("link", { name: /Avisar outros sistemas/ });
    expect(hooks).toHaveTextContent("webhooks");
    expect(hooks).toHaveTextContent(
      NAV_DESTINATIONS.find((d) => d.href === hooks.getAttribute("href"))!.description,
    );
  });

  it("Resultados lista os três grupos", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Resultados"));
    expect(
      within(gaveta())
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Números do negócio", "Equipe e IA", "Quando algo dá errado"]);
  });

  it("fecha com o ×, e o painel continua em Todo dia", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Agente"));
    await u.click(within(gaveta()).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Todo dia" })).toBeInTheDocument();
  });

  it("fecha com Esc e devolve o foco ao botão que a abriu", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Empresa"));
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(botaoDaFaixa("Empresa")).toHaveFocus();
  });

  it("fecha com um clique fora dela", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Resultados"));
    // O fundo escurecido é irmão da gaveta, e é onde a pessoa clica.
    await u.click(gaveta().previousElementSibling!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fecha ao escolher uma tela", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    await u.click(within(gaveta()).getByRole("link", { name: /Produtos/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Todo dia" })).toBeInTheDocument();
  });

  it("prende o foco: aberta, o foco está dentro dela e o Tab não sai", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Agente"));
    expect(gaveta().contains(document.activeElement)).toBe(true);
    const voltas = within(gaveta()).getAllByRole("link").length + 3;
    for (let i = 0; i < voltas; i++) {
      await u.tab();
      expect(gaveta().contains(document.activeElement), `Tab ${i + 1}`).toBe(true);
    }
    await u.tab({ shift: true });
    expect(gaveta().contains(document.activeElement)).toBe(true);
  });

  it("marca a tela atual com aria-current, e uma sub-rota marca UMA só: as Etapas, e não os Dados da empresa", async () => {
    const u = userEvent.setup();
    rota.atual = "/app/settings/tenant/pipelines";
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    expect(within(gaveta()).getByRole("link", { name: /Etapas do funil/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await u.keyboard("{Escape}");
    await u.click(botaoDaFaixa("Empresa"));
    expect(within(gaveta()).getByRole("link", { name: /Dados da empresa/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("a entrada que guarda a tela atual ganha aria-current mesmo sem a gaveta aberta", () => {
    rota.atual = "/app/ai/agents";
    renderizar();
    expect(botaoDaFaixa("Agente")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("grupo que o papel esvaziou não aparece na gaveta", async () => {
    const u = userEvent.setup();
    comoPapel("viewer");
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    const titulos = within(gaveta())
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    const esperados = faixaDoMenu(
      menuDoPapel(false, "viewer", undefined, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO),
    )
      .configurar.find((e) => e.id === "vender")!
      .grupos.map((g) => g.label);
    expect(titulos.length, "guarda de vacuidade").toBeGreaterThan(0);
    expect(titulos).toEqual(esperados);
  });

  it("sem animação com movimento reduzido: toda animação é `motion-safe:`", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    const classes = [gaveta(), gaveta().previousElementSibling]
      .flatMap((e) => (e?.className ?? "").split(/\s+/))
      .filter((c) => /(^|:)animate-|(^|:)transition/.test(c));
    expect(classes.length, "guarda de vacuidade: a gaveta anima").toBeGreaterThan(0);
    expect(classes.filter((c) => !c.startsWith("motion-safe:"))).toEqual([]);
  });

  it("NENHUMA tela some: Todo dia + gavetas + Você alcançam todas as que a regra libera", async () => {
    const u = userEvent.setup();
    renderizar();
    const vistas = new Set<string>();
    const colher = (raiz: HTMLElement) =>
      within(raiz)
        .getAllByRole("link")
        .forEach((a) => vistas.add(a.getAttribute("href")!));
    colher(painel()!);
    for (const nome of ["Vender", "Agente", "Conexões", "Empresa", "Resultados"]) {
      await u.click(botaoDaFaixa(nome));
      colher(gaveta());
      await u.keyboard("{Escape}");
    }
    await u.click(within(faixa()).getByRole("button", { name: "Você" }));
    const menu = await screen.findByRole("menu");
    within(menu)
      .getAllByRole("menuitem")
      .forEach((i) => {
        const href = i.getAttribute("href");
        if (href?.startsWith("/app/")) vistas.add(href);
      });
    const esperadas = destinosDaInterface(
      undefined,
      false,
      "admin",
      MODULOS_OPCIONAIS,
      CAPACIDADES_DA_ORGANIZACAO,
    ).map((d) => d.href);
    expect(esperadas.length, "guarda de vacuidade").toBeGreaterThan(50);
    expect(esperadas.filter((h) => !vistas.has(h))).toEqual([]);
  });
});

describe("papel sem nenhuma tela em Todo dia", () => {
  it("mantém o painel fixado (recolher, destaque do Manual) sem a lista, e a gaveta continua abrindo", async () => {
    const u = userEvent.setup();
    comoPapel("admin", {
      interface_settings: { preset: "simplificada", destinos: ["/app/connections"] },
    });
    renderizar();
    expect(within(faixa()).queryByRole("button", { name: /^Todo dia/ })).toBeNull();
    expect(painel()).toBeNull();
    expect(screen.getByRole("button", { name: "Recolher o painel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manual" })).toBeInTheDocument();
    await u.click(botaoDaFaixa("Conexões"));
    expect(screen.getByRole("dialog", { name: "Conexões" })).toBeInTheDocument();
  });
});

describe("o menu da conta (Você)", () => {
  it("traz Perfil, Segurança, Notificações e o Manual", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(within(faixa()).getByRole("button", { name: "Você" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent?.trim()),
    ).toEqual(["Perfil", "Segurança", "Notificações", "Manual"]);
    expect(within(menu).getByRole("menuitem", { name: "Perfil" })).toHaveAttribute(
      "href",
      "/app/settings/profile",
    );
  });
});

describe("Buscar", () => {
  it("abre a paleta de busca", async () => {
    const u = userEvent.setup();
    renderizar();
    expect(screen.queryByRole("dialog")).toBeNull();
    await u.click(within(faixa()).getByRole("button", { name: "Buscar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("recolher o painel", () => {
  it("o botão do painel recolhe, grava a preferência e deixa só a faixa", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(screen.getByRole("button", { name: "Recolher o painel" }));
    expect(painel()).toBeNull();
    expect(faixa()).toBeInTheDocument();
    // Recebe o estado de ANTES (`currentlyCollapsed`), como a ação já fazia.
    expect(toggleSidebar).toHaveBeenCalledWith(false);
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-pressed", "false");
  });

  it("começa recolhido quando o servidor diz que a pessoa recolheu — sem piscar o painel", () => {
    renderizar(true);
    expect(painel()).toBeNull();
    expect(faixa()).toBeInTheDocument();
  });

  it("e começa aberto quando o servidor não traz preferência", () => {
    renderizar(false);
    expect(painel()).not.toBeNull();
  });

  it("recolhido, o aviso de atualização continua à vista na faixa; aberto, ele fica no painel", () => {
    const { unmount } = renderizar(true);
    expect(within(faixa()).getByTestId("versao")).toHaveAttribute("data-so-atualizacao", "true");
    unmount();
    renderizar(false);
    expect(within(faixa()).queryByTestId("versao")).toBeNull();
    expect(screen.getAllByTestId("versao")).toHaveLength(1);
  });

  it("recolhido, a faixa continua mostrando o contador da fila sobre o ícone de Todo dia", () => {
    renderizar(true);
    const naFaixa = screen
      .getAllByTestId("marcador-fila")
      .filter((f) => f.dataset.naFaixa === "true");
    expect(naFaixa).toHaveLength(1);
  });

  it("recolhido, escolher uma entrada abre o painel por cima da tela", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    const lista = painel()!;
    expect(within(lista).getByRole("link", { name: /Conversas/ })).toBeInTheDocument();
    // Por cima: fora do fluxo, dentro da caixa da barra (nunca `fixed`).
    const secao = lista.closest("section")!;
    expect(secao.className).toMatch(/\babsolute\b/);
    expect(secao.className).not.toMatch(/\bfixed\b/);
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-pressed", "true");
  });

  it("aberto por cima, o painel recebe o foco (o teclado não atravessa a faixa inteira)", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    expect(painel()!.contains(document.activeElement)).toBe(true);
  });

  it("o painel por cima fecha com Esc e devolve o foco ao botão que o abriu", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    expect(painel()).not.toBeNull();
    await u.keyboard("{Escape}");
    expect(painel()).toBeNull();
    expect(botaoDaFaixa("Todo dia")).toHaveFocus();
  });

  it("fecha com um clique fora", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    expect(painel()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(painel()).toBeNull();
  });

  it("fecha ao escolher uma tela", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    await u.click(within(painel()!).getByRole("link", { name: /Contatos/ }));
    expect(painel()).toBeNull();
  });

  it("apertar de novo o botão da mesma entrada fecha o painel por cima", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    await u.click(botaoDaFaixa("Todo dia"));
    expect(painel()).toBeNull();
  });

  it("recolhido, uma área de Configurar abre a gaveta, e não o painel", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Agente"));
    expect(screen.getByRole("dialog", { name: "Agente" })).toBeInTheDocument();
    expect(painel()).toBeNull();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(botaoDaFaixa("Agente")).toHaveFocus();
  });

  it("recolhido, abrir a gaveta fecha o painel que estava por cima da tela", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    expect(painel()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    await u.click(botaoDaFaixa("Empresa"));
    expect(painel()).toBeNull();
    expect(screen.getByRole("dialog", { name: "Empresa" })).toBeInTheDocument();
  });

  it("«Fixar o painel ao lado» devolve o painel ao fluxo e grava a preferência", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Todo dia"));
    await u.click(screen.getByRole("button", { name: "Fixar o painel ao lado" }));
    expect(toggleSidebar).toHaveBeenCalledWith(true);
    const secao = painel()!.closest("section")!;
    expect(secao.className).not.toMatch(/\babsolute\b/);
  });
});

describe("a marca na faixa", () => {
  it("sem marca própria, é o símbolo do produto (SVG), sem nome em texto", () => {
    renderizar();
    const marca = faixa().querySelector("svg[aria-hidden='true']");
    expect(marca).not.toBeNull();
    expect(within(faixa()).queryByText(DEFAULT_APP_NAME)).toBeNull();
  });

  it("com nome do revendedor, é a inicial dele", () => {
    renderizar(false, { name: "Vendas Turbo", logoUrl: null, initial: "V" });
    expect(within(faixa()).getByText("V")).toBeInTheDocument();
  });

  it("com logo do revendedor, o logo comprido NÃO entra nos 80px: fica a inicial (o logo vai ao topo)", () => {
    renderizar(false, {
      name: "Vendas Turbo",
      logoUrl: "https://cdn.exemplo.test/logo.png",
      initial: "V",
    });
    expect(faixa().querySelector("img")).toBeNull();
    expect(within(faixa()).getByText("V")).toBeInTheDocument();
  });

  it("com ícone subido pela instalação, desenha o ícone", () => {
    render(
      <MarcaDaInstalacaoProvider
        marca={{ ...PADRAO, name: "Vendas Turbo", iconUrl: "https://cdn.exemplo.test/i.png" }}
      >
        <Sidebar collapsed={false} />
      </MarcaDaInstalacaoProvider>,
    );
    expect(faixa().querySelector("img")).toHaveAttribute("src", "https://cdn.exemplo.test/i.png");
  });
});

describe("a faixa não carrega valor de marca no código", () => {
  const ARQUIVOS = [
    "components/shell/Faixa.tsx",
    "components/shell/NavegacaoDoComputador.tsx",
    "components/shell/PainelDoMenu.tsx",
    "components/shell/DestaqueDoManual.tsx",
    "components/shell/GavetaDaArea.tsx",
    "components/shell/ItemDoMenu.tsx",
    "components/shell/MenuDaConta.tsx",
    "components/shell/AvisoDeConexaoNaFaixa.tsx",
  ];
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it.each(ARQUIVOS)("%s: nenhum hexadecimal nem violeta fixo", (arquivo) => {
    const codigo = semComentario(readFileSync(arquivo, "utf8"));
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(codigo).not.toMatch(/\b(violet|purple)-\d/);
  });

  it("a ilha escura usa o tema, não uma cor: data-theme=dark e fundo por token", () => {
    const codigo = semComentario(
      readFileSync("components/shell/NavegacaoDoComputador.tsx", "utf8"),
    );
    expect(codigo).toMatch(/data-theme="dark"/);
    expect(codigo).toMatch(/bg-neutral-900 dark:bg-neutral-950/);
  });
});

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { DEFAULT_APP_NAME, type Branding } from "@/lib/branding";
import { MarcaDaInstalacaoProvider } from "@/lib/branding/contexto";
import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { destinosDaInterface } from "@/lib/navigation/interface";
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
  CommandPalette: ({ open }: { open: boolean }) => (open ? <div role="dialog">Buscar telas</div> : null),
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
const botaoDaFaixa = (nome: string) => within(faixa()).getByRole("button", { name: new RegExp(`^${nome}`) });
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
    expect(within(mesa).getByRole("heading", { name: "Gestão de Clientes CRM" })).toBeInTheDocument();
    const titulos = within(lista)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titulos).toEqual(["Leads", "Gestão de Clientes CRM", "Se a sua empresa usa"]);
    expect(within(mesa).queryByRole("heading", { name: "Se a sua empresa usa" })).toBeNull();
    expect(within(lista).getByRole("link", { name: /Conversas/ })).toHaveAttribute("href", "/app/inbox");
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
});

describe("as áreas de Configurar e Resultados", () => {
  it("clicar numa área troca a lista do painel pela lista simples das telas dela", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Vender"));
    expect(screen.getByRole("heading", { level: 2, name: "Vender" })).toBeInTheDocument();
    const lista = painel()!;
    expect(
      within(lista)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["O seu funil", "O que você vende", "Como a equipe vende", "Cadastro de empresas"]);
    expect(within(lista).getByRole("link", { name: /Etapas do funil/ })).toHaveAttribute(
      "href",
      "/app/settings/tenant/pipelines",
    );
    expect(botaoDaFaixa("Vender")).toHaveAttribute("aria-pressed", "true");
    expect(botaoDaFaixa("Todo dia")).toHaveAttribute("aria-pressed", "false");
  });

  it("Voltar para Todo dia, e apertar a mesma área de novo, devolvem a mesa", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Agente"));
    await u.click(screen.getByRole("button", { name: "Voltar para Todo dia" }));
    expect(screen.getByRole("heading", { level: 2, name: "Todo dia" })).toBeInTheDocument();
    await u.click(botaoDaFaixa("Empresa"));
    await u.click(botaoDaFaixa("Empresa"));
    expect(screen.getByRole("heading", { level: 2, name: "Todo dia" })).toBeInTheDocument();
  });

  it("Resultados lista os três grupos", async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(botaoDaFaixa("Resultados"));
    expect(
      within(painel()!)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Números do negócio", "Equipe e IA", "Quando algo dá errado"]);
  });

  it("a entrada que guarda a tela atual ganha aria-current mesmo sem estar à vista", async () => {
    rota.atual = "/app/ai/agents";
    renderizar();
    expect(botaoDaFaixa("Agente")).toHaveAttribute("aria-current", "true");
    expect(botaoDaFaixa("Agente")).toHaveAttribute("aria-pressed", "false");
  });

  it("NENHUMA tela some: Todo dia + áreas + Resultados + Você alcançam todas as que a regra libera", async () => {
    const u = userEvent.setup();
    renderizar();
    const vistas = new Set<string>();
    const colher = () =>
      within(painel()!)
        .getAllByRole("link")
        .forEach((a) => vistas.add(a.getAttribute("href")!));
    colher();
    for (const nome of ["Vender", "Agente", "Conexões", "Empresa", "Resultados"]) {
      await u.click(botaoDaFaixa(nome));
      colher();
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
    const naFaixa = screen.getAllByTestId("marcador-fila").filter((f) => f.dataset.naFaixa === "true");
    expect(naFaixa).toHaveLength(1);
  });

  it("recolhido, escolher uma entrada abre o painel por cima da tela", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Agente"));
    const lista = painel()!;
    expect(within(lista).getByRole("link", { name: /Agentes/ })).toBeInTheDocument();
    // Por cima: fora do fluxo, dentro da caixa da barra (nunca `fixed`).
    const secao = lista.closest("section")!;
    expect(secao.className).toMatch(/\babsolute\b/);
    expect(secao.className).not.toMatch(/\bfixed\b/);
    expect(botaoDaFaixa("Agente")).toHaveAttribute("aria-pressed", "true");
  });

  it("o painel por cima fecha com Esc e devolve o foco ao botão que o abriu", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Agente"));
    expect(painel()).not.toBeNull();
    await u.keyboard("{Escape}");
    expect(painel()).toBeNull();
    expect(botaoDaFaixa("Agente")).toHaveFocus();
  });

  it("fecha com um clique fora", async () => {
    const u = userEvent.setup();
    renderizar(true);
    await u.click(botaoDaFaixa("Empresa"));
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
    await u.click(botaoDaFaixa("Resultados"));
    await u.click(botaoDaFaixa("Resultados"));
    expect(painel()).toBeNull();
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
    renderizar(false, { name: "Vendas Turbo", logoUrl: "https://cdn.exemplo.test/logo.png", initial: "V" });
    expect(faixa().querySelector("img")).toBeNull();
    expect(within(faixa()).getByText("V")).toBeInTheDocument();
  });

  it("com ícone subido pela instalação, desenha o ícone", () => {
    render(
      <MarcaDaInstalacaoProvider marca={{ ...PADRAO, name: "Vendas Turbo", iconUrl: "https://cdn.exemplo.test/i.png" }}>
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
    const codigo = semComentario(readFileSync("components/shell/NavegacaoDoComputador.tsx", "utf8"));
    expect(codigo).toMatch(/data-theme="dark"/);
    expect(codigo).toMatch(/bg-neutral-900 dark:bg-neutral-950/);
  });
});

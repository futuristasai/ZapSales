import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BarraDeBaixo } from "@/components/shell/BarraDeBaixo";
import { ProvedorDaOcupacaoDoRodape, VARIAVEL_DA_OCUPACAO } from "@/lib/ui/rodape-ocupado";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

/**
 * A BARRA DE BAIXO E AS FOLHAS DO CELULAR (issue #190, pai #183), pelo que a pessoa vê e toca.
 *
 * Quem vê o quê é do catálogo (`barra-de-baixo-do-menu.test.ts`); aqui é a superfície: a barra
 * tem as quatro abas, Conversas leva direto à tela, as outras abrem uma folha com a lista, e a
 * folha se comporta como diálogo — nome, foco que volta ao botão, Esc fecha e escolher uma tela
 * fecha. Medida em pixels (alvo de 44 px, sem rolagem horizontal) o jsdom não faz: é do e2e.
 */

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};
let pathname = "/app/kanban";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/ContadorDaFila", () => ({
  // Como o real: o número vem com um aria-label próprio, que entra no nome do link.
  ContadorDaFila: () => (
    <span data-testid="contador-da-fila-dublê" aria-label="3 conversas esperando uma pessoa">
      3
    </span>
  ),
}));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role } as ActiveOrg;
}

beforeEach(() => {
  pathname = "/app/kanban";
  comoPapel("admin");
});
afterEach(cleanup);

const barra = () => screen.getByRole("navigation", { name: "Menu do celular" });
const aba = (nome: string) => within(barra()).getByRole("button", { name: new RegExp(`^${nome}`) });

describe("a barra de baixo", () => {
  it("mostra Conversas, Todo dia, Configurar e Resultados, nessa ordem", () => {
    render(<BarraDeBaixo />);
    const itens = [...barra().querySelectorAll("a, button")];
    expect(itens.map((i) => i.querySelector("span.truncate")?.textContent)).toEqual([
      "Conversas",
      "Todo dia",
      "Configurar",
      "Resultados",
    ]);
  });

  it("o nome do link Conversas começa por Conversas: o número da fila vem DEPOIS do rótulo", () => {
    render(<BarraDeBaixo />);
    const link = within(barra()).getByRole("link", { name: /^Conversas/ });
    expect(link).toHaveAccessibleName(/^Conversas.*3 conversas esperando uma pessoa/);
  });

  it("Conversas é um link direto para a tela e leva o contador da fila", () => {
    render(<BarraDeBaixo />);
    const link = within(barra()).getByRole("link", { name: /Conversas/ });
    expect(link).toHaveAttribute("href", "/app/inbox");
    expect(within(link).getByTestId("contador-da-fila-dublê")).toBeTruthy();
  });

  it("marca a aba da tela em que a pessoa está, por aria-current e não só por cor", () => {
    pathname = "/app/inbox";
    render(<BarraDeBaixo />);
    expect(within(barra()).getByRole("link", { name: /Conversas/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Conversas mora em Todo dia, mas é ela a aba atual — a de Todo dia não se acende junto.
    expect(aba("Todo dia")).not.toHaveAttribute("aria-current");
  });

  it("uma tela de Configurar acende a aba Configurar", () => {
    pathname = "/app/connections";
    render(<BarraDeBaixo />);
    expect(aba("Configurar")).toHaveAttribute("aria-current", "true");
    expect(aba("Todo dia")).not.toHaveAttribute("aria-current");
  });

  it("o leitor só vê as abas que o papel permite: sem a área Agente na folha de Configurar", async () => {
    comoPapel("viewer");
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Configurar"));
    const folha = screen.getByRole("dialog", { name: "Configurar" });
    const areas = within(folha)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(areas).toContain("Vender");
    expect(areas).not.toContain("Agente");
  });
});

describe("a folha de cada aba", () => {
  it("Todo dia abre a folha com a mesa e o contador de Aguardando Humano", async () => {
    render(<BarraDeBaixo />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(aba("Todo dia"));
    const folha = screen.getByRole("dialog", { name: "Todo dia" });
    expect(within(folha).getByTestId("mesa-de-trabalho")).toBeTruthy();
    expect(within(folha).getByRole("link", { name: /Aguardando Humano/ })).toHaveAttribute(
      "href",
      "/app/ai/cases",
    );
  });

  it("Configurar abre a folha com as quatro áreas e os grupos por tarefa", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Configurar"));
    const folha = screen.getByRole("dialog", { name: "Configurar" });
    const areas = within(folha).getAllByRole("group");
    expect(
      areas.map((a) => document.getElementById(a.getAttribute("aria-labelledby")!)?.textContent),
    ).toEqual(["Vender", "Agente", "Conexões", "Empresa"]);
  });

  it("Resultados abre a folha com os três grupos", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Resultados"));
    const folha = screen.getByRole("dialog", { name: "Resultados" });
    expect(within(folha).getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("a folha leva o Manual no rodapé, como o painel do computador", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Todo dia"));
    const manual = within(screen.getByRole("dialog")).getByRole("link", { name: "Manual" });
    expect(manual).toHaveAttribute("href", "/manual/index.html");
    expect(manual).toHaveAttribute("target", "_blank");
  });

  it("marca a tela atual dentro da folha", async () => {
    pathname = "/app/kanban";
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Todo dia"));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Funis" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("escolher uma tela fecha a folha", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Todo dia"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Funis" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc fecha a folha e o foco volta ao botão que a abriu", async () => {
    render(<BarraDeBaixo />);
    const todoDia = aba("Todo dia");
    await userEvent.click(todoDia);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // O Radix devolve o foco no quadro seguinte ao desmonte.
    await waitFor(() => expect(document.activeElement).toBe(todoDia));
  });

  it("o botão de fechar tem nome e a folha cai sozinha no foco dela", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Resultados"));
    const folha = screen.getByRole("dialog", { name: "Resultados" });
    expect(folha.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(folha).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a aba que abriu a folha diz que abriu um diálogo", () => {
    render(<BarraDeBaixo />);
    expect(aba("Configurar")).toHaveAttribute("aria-haspopup", "dialog");
  });
});

describe("a barra é uma peça fixa do rodapé e declara o que ocupa", () => {
  const reserva = () => document.documentElement.style.getPropertyValue(VARIAVEL_DA_OCUPACAO);

  /** O jsdom não tem `matchMedia`; `computador` diz se a janela passa de 768 px. */
  function janela(computador: boolean) {
    vi.stubGlobal("matchMedia", (consulta: string) => ({
      matches: computador,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }
  afterEach(() => vi.unstubAllGlobals());

  it("no celular a casca desconta a altura da barra do <main> e do Inbox", async () => {
    janela(false);
    render(
      <ProvedorDaOcupacaoDoRodape>
        <BarraDeBaixo />
      </ProvedorDaOcupacaoDoRodape>,
    );
    await waitFor(() => expect(reserva()).toBe("56px"));
  });

  it("no computador a barra não reserva nada: o rodapé é o de sempre", async () => {
    janela(true);
    render(
      <ProvedorDaOcupacaoDoRodape>
        <BarraDeBaixo />
      </ProvedorDaOcupacaoDoRodape>,
    );
    await waitFor(() => expect(reserva()).toBe("0px"));
  });

  it("a folha aberta fecha sozinha quando a janela passa de 768 px (aparelho girado)", async () => {
    let aoMudar: (() => void) | null = null;
    let computador = false;
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return computador;
      },
      addEventListener: (_: string, f: () => void) => {
        aoMudar = f;
      },
      removeEventListener: () => {},
    }));
    render(<BarraDeBaixo />);
    await userEvent.click(aba("Todo dia"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // No computador a navegação é a faixa com o painel: uma folha esquecida por cima dela
    // cobriria a tela sem ter como ser alcançada.
    computador = true;
    act(() => aoMudar?.());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

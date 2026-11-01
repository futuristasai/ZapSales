import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar, SidebarContent } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { DEFAULT_APP_NAME, type Branding } from "@/lib/branding";
import { MarcaDaInstalacaoProvider } from "@/lib/branding/contexto";

/**
 * O link do manual, no rodapé do menu lateral, logo abaixo de Configurações.
 *
 * O que se prova aqui é a ESTRUTURA — ordem, destino, nome acessível. Altura em
 * pixels não: o jsdom não faz layout. O que o formato protege (o menu a 900px
 * tem 19px de folga, e uma linha nova de 32px o faria rolar) é medido no
 * navegador por `tests/e2e/navegacao.spec.ts`.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/app/inbox" }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

const usuario = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@exemplo.test",
  is_platform_admin: false,
  organizations: [],
} as unknown as AuthUser;
const org = {
  orgId: "00000000-0000-4000-8000-0000000000aa",
  name: "Loja da Ana",
  role: "viewer",
} as ActiveOrg;
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: usuario, activeOrg: org }),
}));

const PADRAO: Branding = { name: DEFAULT_APP_NAME, logoUrl: null, initial: "Z" };

afterEach(cleanup);

function renderizar(ui: React.ReactElement) {
  return render(<MarcaDaInstalacaoProvider marca={PADRAO}>{ui}</MarcaDaInstalacaoProvider>);
}

describe("o link do manual no menu", () => {
  it("aparece para qualquer papel — aqui, o mais baixo (somente leitura)", () => {
    renderizar(<Sidebar collapsed={false} />);
    expect(screen.getByRole("link", { name: "Manual" })).toBeTruthy();
  });

  it("abre o manual da própria instalação, numa aba nova e sem entregar a janela de origem", () => {
    renderizar(<Sidebar collapsed={false} />);
    const link = screen.getByRole("link", { name: "Manual" });
    expect(link.getAttribute("href")).toBe("/manual/index.html");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("vem logo DEPOIS de Configurações, sem nenhum outro link no meio", () => {
    renderizar(<Sidebar collapsed={false} />);
    const configuracoes = screen.getByRole("link", { name: "Configurações" });
    const manual = screen.getByRole("link", { name: "Manual" });
    expect(
      configuracoes.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING,
      "Manual tem de vir depois de Configurações",
    ).toBeTruthy();

    const links: HTMLElement[] = [...document.querySelectorAll("a")];
    expect(links.indexOf(manual) - links.indexOf(configuracoes)).toBe(1);
  });

  it("divide a linha com o controle de recolher — é o que o mantém dentro da folga do menu", () => {
    renderizar(<Sidebar collapsed={false} />);
    const manual = screen.getByRole("link", { name: "Manual" });
    const recolher = screen.getByRole("button", { name: "Recolher sidebar" });
    expect(manual.parentElement).toBe(recolher.parentElement);
  });

  it("recolhido, o controle vira 'Expandir sidebar' e o Manual continua com nome acessível", () => {
    renderizar(<Sidebar collapsed />);
    expect(screen.getByRole("button", { name: "Expandir sidebar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manual" }).getAttribute("title")).toBe("Manual");
  });

  it("na gaveta do celular (sem controle de recolher), o Manual está lá", () => {
    renderizar(<SidebarContent collapsed={false} showCollapseControl={false} />);
    expect(screen.getByRole("link", { name: "Manual" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sidebar/ })).toBeNull();
  });
});

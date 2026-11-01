/**
 * O TERMO TÉCNICO À VISTA, embaixo do nome (issue #187).
 *
 * "Avisar outros sistemas" diz ao dono leigo o que a tela faz; "webhooks" embaixo
 * diz ao técnico que é a tela que ele procura. O nome é um só (`label`); o termo
 * aparece no menu lateral, no hub e na dica — e não some quando o nome some.
 *
 * Quem vê o quê é do registro (`navegacao-registry.test.ts`); aqui é a superfície.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { NavHub } from "@/components/shell/NavHub";
import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/kanban" }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

afterEach(cleanup);

describe("menu lateral", () => {
  it("mostra o termo técnico embaixo do nome", () => {
    render(<Sidebar collapsed={false} />);
    const link = screen.getByRole("link", { name: /Avisar outros sistemas/ });
    const [nome, termo] = Array.from(link.querySelectorAll("span > span")).map(
      (s) => s.textContent,
    );
    expect(nome).toBe("Avisar outros sistemas");
    expect(termo).toBe("webhooks");
  });

  it("a tela sem termo técnico não ganha linha vazia", () => {
    render(<Sidebar collapsed={false} />);
    const link = screen.getByRole("link", { name: /Riscos de Perda/ });
    expect(link.querySelectorAll("span > span")).toHaveLength(1);
  });

  it("a dica traz a descrição e o termo técnico", () => {
    render(<Sidebar collapsed={false} />);
    const dica = screen.getByRole("link", { name: /Avisar outros sistemas/ }).getAttribute("title");
    expect(dica).toBe(
      "Avisar outros sistemas (webhooks) — Avise outros sistemas quando algo acontecer aqui dentro.",
    );
  });

  it("recolhido, o termo não desenha texto na barra estreita, mas a dica continua", () => {
    render(<Sidebar collapsed />);
    const link = screen.getByRole("link", { name: /Avisar outros sistemas/ });
    // Só o nome (sr-only) fica no link; a linha do termo não é desenhada.
    expect(link.textContent).toBe("Avisar outros sistemas");
    expect(link.getAttribute("title")).toContain("(webhooks)");
  });
});

describe("hub", () => {
  it("mostra o termo técnico ao lado do nome do card", () => {
    render(
      <NavHub
        modulosLigados={[]}
        group="ia"
        isPlatformAdmin
        role={null}
        title="Agente de IA"
        subtitle=""
      />,
    );
    const card = screen.getByRole("link", { name: /Chave da IA/ });
    expect(within(card).getByText("API key")).toBeTruthy();
    expect(card.textContent).toMatch(/Chave da IA.*API key/);
  });
});

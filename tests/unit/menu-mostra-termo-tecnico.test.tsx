/**
 * O TERMO TÉCNICO À VISTA, embaixo do nome (issue #187).
 *
 * "Avisar outros sistemas" diz ao dono leigo o que a tela faz; "webhooks" embaixo
 * diz ao técnico que é a tela que ele procura. O nome é um só (`label`); o termo
 * aparece na lista do menu, no hub e na dica — e não some quando o nome some.
 *
 * Quem vê o quê é do registro (`navegacao-registry.test.ts`); aqui é a superfície.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NavHub } from "@/components/shell/NavHub";
import { BarraDeBaixo } from "@/components/shell/BarraDeBaixo";
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
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

afterEach(cleanup);

describe("a lista do menu (folha do celular e painel do computador)", () => {
  async function abrirConfigurar() {
    render(<BarraDeBaixo />);
    await userEvent.click(screen.getByRole("button", { name: /^Configurar/ }));
    return screen.getByRole("dialog", { name: "Configurar" });
  }

  it("mostra o termo técnico embaixo do nome", async () => {
    const folha = await abrirConfigurar();
    const link = within(folha).getByRole("link", { name: /Avisar outros sistemas/ });
    const [nome, termo] = Array.from(link.querySelectorAll("span > span")).map(
      (s) => s.textContent,
    );
    expect(nome).toBe("Avisar outros sistemas");
    expect(termo).toBe("webhooks");
  });

  it("a tela sem termo técnico não ganha linha vazia", async () => {
    render(<BarraDeBaixo />);
    await userEvent.click(screen.getByRole("button", { name: /^Todo dia/ }));
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: /Riscos de Perda/ });
    expect(link.querySelectorAll("span > span")).toHaveLength(1);
  });

  it("a dica traz a descrição e o termo técnico", async () => {
    const folha = await abrirConfigurar();
    const dica = within(folha)
      .getByRole("link", { name: /Avisar outros sistemas/ })
      .getAttribute("title");
    expect(dica).toBe(
      "Avisar outros sistemas (webhooks) — Avise outros sistemas quando algo acontecer aqui dentro.",
    );
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

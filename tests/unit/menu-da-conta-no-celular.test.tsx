import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserMenu } from "@/components/shell/UserMenu";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

/**
 * O MENU DA CONTA, NO TOPO DO CELULAR (issue #190, pai #183).
 *
 * No computador, Perfil, Segurança e Notificações moram em «Você», na faixa. No celular não há
 * faixa: o menu do avatar, que já está no topo, é o menu da conta — e leva as mesmas três telas,
 * as que o catálogo declara no grupo «Você» e que o papel permite. Esconder o grupo no
 * computador (onde a faixa já o tem) é CSS (`md:hidden`); o que se prova aqui é a presença.
 */

const authRef: { user: Partial<AuthUser>; activeOrg: ActiveOrg | null; signOut: () => void } = {
  user: { id: "u1", email: "ana@exemplo.test", full_name: "Ana Paula", is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "viewer" } as ActiveOrg,
  signOut: vi.fn(),
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  useUser: () => authRef.user,
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/shell/SeletorDeIdioma", () => ({ SeletorDeIdioma: () => null }));

afterEach(cleanup);

async function abrir() {
  render(<UserMenu />);
  await userEvent.click(screen.getByRole("button", { name: /Menu do usuário/ }));
  return screen.getByRole("menu");
}

describe("o menu do avatar como menu da conta", () => {
  it("leva Perfil, Segurança e Notificações, para qualquer papel — até o de leitura", async () => {
    const menu = await abrir();
    expect(within(menu).getByRole("menuitem", { name: /Perfil/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /Segurança/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /Notificações/ })).toBeTruthy();
  });

  it("cada item leva ao endereço de sempre da tela", async () => {
    const menu = await abrir();
    expect(within(menu).getByRole("menuitem", { name: /Perfil/ })).toHaveAttribute(
      "href",
      "/app/settings/profile",
    );
    expect(within(menu).getByRole("menuitem", { name: /Segurança/ })).toHaveAttribute(
      "href",
      "/app/settings/security",
    );
  });

  it("e continua levando o Sair", async () => {
    const menu = await abrir();
    expect(within(menu).getByRole("menuitem", { name: /Sair/ })).toBeTruthy();
  });
});

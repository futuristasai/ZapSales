import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SearchTrigger } from "@/components/shell/SearchTrigger";

/**
 * O botão de busca do topo tem o nome vindo do TEXTO, e nunca de um `aria-label` (issue #190).
 *
 * No celular o texto «Buscar...» deixa de ser visível e só o ícone sobra; a tentação é dar um
 * `aria-label` ao botão. Mas no computador o texto visível é «Buscar... ⌘K», e um `aria-label`
 * que não o contém reprova a regra `label-content-name-mismatch` do axe (WCAG 2.5.3) — foi o
 * que derrubou `rbac-roles.spec.ts` no CI do PR #203. O texto fica no DOM e, no celular, só
 * para o leitor de tela (`max-md:sr-only`).
 */

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/shell/CommandPalette", () => ({ CommandPalette: () => null }));

afterEach(cleanup);

describe("o botão de busca do topo", () => {
  it("tem nome acessível «Buscar...», vindo do texto", () => {
    render(<SearchTrigger />);
    expect(screen.getByRole("button", { name: /^Buscar\.\.\./ })).toBeTruthy();
  });

  it("não usa aria-label: o nome é o texto visível, e o atalho não o contradiz", () => {
    render(<SearchTrigger />);
    expect(screen.getByRole("button", { name: /^Buscar\.\.\./ })).not.toHaveAttribute("aria-label");
  });

  it("no celular o texto some para quem vê mas continua para o leitor de tela", () => {
    render(<SearchTrigger />);
    const texto = screen.getByText("Buscar...");
    expect(texto.className).toContain("max-md:sr-only");
    expect(texto.className).not.toContain("hidden");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SeletorDeFunil } from "./SeletorDeFunil";

/**
 * O SELETOR DE FUNIL DO QUADRO, pela superfície.
 *
 * O quadro abre no funil principal (atalho «Quadro do funil»); este botão é o que deixa ver os
 * outros sem voltar à lista. O que se prende aqui é o que a pessoa faz: abre, vê TODOS os funis
 * na ordem recebida, sabe qual está aberto e cada linha leva ao quadro daquele funil.
 */

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

const FUNIS = [
  { id: "f-1", name: "Matrículas" },
  { id: "f-2", name: "Implantes" },
  { id: "f-3", name: "Pós-venda" },
];

afterEach(cleanup);

async function abrir() {
  const u = userEvent.setup();
  await u.click(screen.getByRole("button", { name: "Trocar de funil" }));
  return screen.findByRole("menu");
}

describe("SeletorDeFunil", () => {
  it("lista todos os funis, na ordem recebida, cada um como link para o seu quadro", async () => {
    render(<SeletorDeFunil funis={FUNIS} atualId="f-2" />);
    const menu = await abrir();
    const itens = within(menu).getAllByRole("menuitem");
    expect(itens.slice(0, 3).map((i) => [i.textContent, i.getAttribute("href")])).toEqual([
      ["Matrículas", "/app/pipelines/f-1"],
      ["Implantes", "/app/pipelines/f-2"],
      ["Pós-venda", "/app/pipelines/f-3"],
    ]);
  });

  it("marca o funil aberto — e só ele — sem depender de cor", async () => {
    render(<SeletorDeFunil funis={FUNIS} atualId="f-2" />);
    const menu = await abrir();
    const atuais = within(menu)
      .getAllByRole("menuitem")
      .filter((i) => i.getAttribute("aria-current") === "page");
    expect(atuais.map((i) => i.textContent)).toEqual(["Implantes"]);
    // O sinal visível é o ícone de conferido, dentro da linha do funil aberto.
    expect(atuais[0]!.querySelector("svg")).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Matrículas" }).querySelector("svg")).toBeNull();
  });

  it("a última linha leva à lista de funis, onde se cria e se arquiva", async () => {
    render(<SeletorDeFunil funis={FUNIS} atualId="f-1" />);
    const menu = await abrir();
    const itens = within(menu).getAllByRole("menuitem");
    const ultimo = itens[itens.length - 1]!;
    expect(ultimo).toHaveTextContent("Ver todos os funis");
    expect(ultimo).toHaveAttribute("href", "/app/kanban");
  });

  it("com um funil só o botão continua lá: lista o funil aberto e o caminho para a lista", async () => {
    render(<SeletorDeFunil funis={[FUNIS[0]!]} atualId="f-1" />);
    const menu = await abrir();
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Matrículas",
      "Ver todos os funis",
    ]);
  });

  it("fechado, não põe a lista na tela", () => {
    render(<SeletorDeFunil funis={FUNIS} atualId="f-1" />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Trocar de funil" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });
});

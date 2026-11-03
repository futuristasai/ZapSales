/**
 * A galeria de modelos da campanha OFICIAL pela tela: o operador acha o modelo pelo
 * conteúdo, vê a categoria de cada um, e o atalho de criar modelo só aparece para
 * quem a rota deixaria entrar.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ModeloParaCampanha } from "@/lib/campanhas/modelos-da-campanha";
import type { MapaDeVariaveis } from "@/lib/campanhas/variaveis-do-modelo";

import { GaleriaDeModelos } from "./GaleriaDeModelos";
import { MensagemOficial } from "./MensagemOficial";

function modelo(
  parcial: Partial<ModeloParaCampanha> & Pick<ModeloParaCampanha, "id" | "name">,
): ModeloParaCampanha {
  return {
    language: "pt_BR",
    category: "UTILITY",
    texto: "",
    variaveis: [],
    botoesDeResposta: [],
    botao_wa_me: null,
    ...parcial,
  };
}

const INSCRICAO = modelo({
  id: "1",
  name: "DESAFIO JAN | INSCRIÇÃO CONFIRMADA",
  texto: "Parabéns, {{1}}! Sua inscrição está confirmada.",
  variaveis: [
    { chave: "1", rotulo: "{{1}}", onde: "corpo", antes: "Parabéns,", depois: "!", tipo: "text" },
  ],
});
const LEMBRETE = modelo({
  id: "2",
  name: "DESAFIO JULHO | LEMBRETE DOMINGO",
  texto: "Hoje às 21h tem aula ao vivo.",
});
const OFERTA = modelo({
  id: "3",
  name: "oferta_de_outubro",
  category: "MARKETING",
  texto: "Aproveite 20% de desconto.",
});

function Tela(props: {
  modelos?: ModeloParaCampanha[];
  podeCriarModelo?: boolean;
  onAtualizar?: () => void;
  baseLegal?: "consent" | "legitimate_interest";
}) {
  const [modeloId, setModeloId] = useState("");
  const [mapa, setMapa] = useState<MapaDeVariaveis>({});
  return (
    <MensagemOficial
      modelos={props.modelos ?? [INSCRICAO, LEMBRETE, OFERTA]}
      carregando={false}
      modeloId={modeloId}
      onModelo={setModeloId}
      mapa={mapa}
      onMapa={setMapa}
      podeCriarModelo={props.podeCriarModelo}
      onAtualizar={props.onAtualizar}
      baseLegal={props.baseLegal}
    />
  );
}

describe("GaleriaDeModelos — cartões, busca e filtro", () => {
  it("cada cartão mostra nome, categoria em português, idioma e o começo do texto", () => {
    render(<Tela />);
    const cartoes = screen.getAllByTestId("cartao-de-modelo");
    expect(cartoes).toHaveLength(3);
    expect(within(cartoes[0]!).getByText("Utilidade")).toBeTruthy();
    expect(within(cartoes[0]!).getByText("pt_BR")).toBeTruthy();
    expect(within(cartoes[0]!).getByText(/Sua inscrição está confirmada/)).toBeTruthy();
    expect(within(cartoes[2]!).getByText("Marketing")).toBeTruthy();
  });

  it("o filtro mostra quantos há em cada categoria e separa os cartões", async () => {
    render(<Tela />);
    expect(screen.getByRole("button", { name: "Todos · 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Utilidade · 2" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Marketing · 1" }));
    const cartoes = screen.getAllByTestId("cartao-de-modelo");
    expect(cartoes).toHaveLength(1);
    expect(within(cartoes[0]!).getByText("oferta_de_outubro")).toBeTruthy();
  });

  it("a busca acha pelo texto e ignora acento, e diz quando nada serve", async () => {
    render(<Tela />);
    await userEvent.type(screen.getByLabelText("Buscar modelo"), "inscricao");
    expect(screen.getAllByTestId("cartao-de-modelo")).toHaveLength(1);

    await userEvent.clear(screen.getByLabelText("Buscar modelo"));
    await userEvent.type(screen.getByLabelText("Buscar modelo"), "xyz");
    expect(screen.queryAllByTestId("cartao-de-modelo")).toHaveLength(0);
    expect(screen.getByTestId("galeria-sem-resultado")).toBeTruthy();
  });

  it("clicar no cartão escolhe o modelo, e só um fica marcado", async () => {
    render(<Tela />);
    await userEvent.click(screen.getByRole("radio", { name: /LEMBRETE DOMINGO/ }));
    expect(
      screen.getByRole("radio", { name: /LEMBRETE DOMINGO/ }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: /INSCRIÇÃO CONFIRMADA/ }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("sem modelo na conta, a galeria diz onde criar e não mostra busca nem filtro", () => {
    render(<Tela modelos={[]} />);
    expect(screen.getByText(/Nenhum modelo aprovado na conta deste número/)).toBeTruthy();
    expect(screen.queryByLabelText("Buscar modelo")).toBeNull();
  });
});

describe("GaleriaDeModelos — criar modelo e atualizar a lista", () => {
  it("o administrador vê 'Criar novo modelo', que abre o editor em outra aba", () => {
    render(<Tela podeCriarModelo />);
    const link = screen.getByTestId("criar-modelo") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/app/connections/modelos/novo");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByTestId("criar-modelo-so-admin")).toBeNull();
  });

  it("quem não é administrador vê a nota e nenhum botão que acabaria em 403", () => {
    render(<Tela podeCriarModelo={false} />);
    expect(screen.queryByTestId("criar-modelo")).toBeNull();
    expect(screen.getByTestId("criar-modelo-so-admin").textContent).toMatch(
      /peça a um administrador/,
    );
  });

  it("'Atualizar lista' chama a recarga, e sem ela o botão não aparece", async () => {
    const recarregar = vi.fn();
    const { unmount } = render(<Tela onAtualizar={recarregar} />);
    await userEvent.click(screen.getByTestId("atualizar-modelos"));
    expect(recarregar).toHaveBeenCalledTimes(1);
    unmount();

    render(<Tela />);
    expect(screen.queryByTestId("atualizar-modelos")).toBeNull();
  });

  it("a galeria sozinha também respeita o papel", () => {
    render(
      <GaleriaDeModelos
        modelos={[LEMBRETE]}
        carregando={false}
        modeloId=""
        onModelo={() => {}}
        podeCriarModelo={false}
      />,
    );
    expect(screen.queryByTestId("criar-modelo")).toBeNull();
  });
});

describe("MensagemOficial — balão e aviso de Marketing", () => {
  it("a variável aparece destacada no balão, e o texto continua o mesmo", async () => {
    render(<Tela />);
    await userEvent.click(screen.getByRole("radio", { name: /INSCRIÇÃO CONFIRMADA/ }));
    const variavel = screen.getByTestId("variavel-da-previa");
    expect(variavel.textContent).toBe("{{1}}");
    expect(screen.getByTestId("previa-do-modelo").textContent).toBe(
      "Parabéns, {{1}}! Sua inscrição está confirmada.",
    );
  });

  it("Marketing com interesse legítimo avisa; com consentimento ou Utilidade, não", async () => {
    const { rerender } = render(<Tela baseLegal="legitimate_interest" />);
    await userEvent.click(screen.getByRole("radio", { name: /oferta_de_outubro/ }));
    expect(screen.getByTestId("aviso-de-marketing")).toBeTruthy();

    // Utilidade: sem aviso, mesmo com interesse legítimo.
    await userEvent.click(screen.getByRole("radio", { name: /LEMBRETE DOMINGO/ }));
    expect(screen.queryByTestId("aviso-de-marketing")).toBeNull();

    // Marketing com consentimento: sem aviso.
    await userEvent.click(screen.getByRole("radio", { name: /oferta_de_outubro/ }));
    rerender(<Tela baseLegal="consent" />);
    expect(screen.queryByTestId("aviso-de-marketing")).toBeNull();
  });
});

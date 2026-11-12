/**
 * Agendar a campanha pela tela (issue #292): o cartão de dia e hora e o cartão
 * da campanha agendada.
 *
 * O relógio é injetado e o fuso é o do NÚMERO — os casos provam que a tela lê o
 * campo nesse fuso (e não no da máquina que roda o teste) e que avisa, antes de
 * confirmar, quando a hora escolhida cai fora do horário de envio.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { JanelaDeEnvio } from "@/lib/campanhas/agenda";

import { AgendamentoDaCampanha, CampanhaAgendada } from "./AgendamentoDaCampanha";

const JANELA: JanelaDeEnvio = { fuso: "America/Sao_Paulo", inicio_hora: 7, fim_hora: 22, permite_domingo: true };
/** Quinta-feira, 12/11/2026, 12h em São Paulo. */
const AGORA = new Date("2026-11-12T15:00:00.000Z");

function montar(extra: Partial<Parameters<typeof AgendamentoDaCampanha>[0]> = {}) {
  const onAgendar = vi.fn();
  const onVoltar = vi.fn();
  render(
    <AgendamentoDaCampanha
      janela={JANELA}
      agendadaPara={null}
      pessoas={12}
      enviando={false}
      onAgendar={onAgendar}
      onVoltar={onVoltar}
      agora={() => AGORA}
      {...extra}
    />,
  );
  const campo = screen.getByLabelText("Dia e hora do início") as HTMLInputElement;
  const escolher = (valor: string) => fireEvent.change(campo, { target: { value: valor } });
  const botao = () => screen.getByRole("button", { name: /Agendar envio|Salvar novo horário/ }) as HTMLButtonElement;
  return { campo, escolher, botao, onAgendar, onVoltar };
}

describe("agendar pela primeira vez", () => {
  it("abre em branco, sem chutar um horário, e não deixa confirmar", () => {
    const { campo, botao } = montar();
    expect(campo.value).toBe("");
    expect(botao().disabled).toBe(true);
    expect(screen.getByTestId("resultado-do-agendamento").textContent).toBe("");
  });

  it("diz para quantas pessoas e em que fuso o horário vale", () => {
    montar();
    expect(screen.getByTestId("agendamento-da-campanha").textContent).toContain("12 pessoas");
    // 15h UTC são 12h em São Paulo — a tela mostra a hora DO NÚMERO.
    expect(screen.getByTestId("fuso-do-agendamento").textContent).toContain("12:00");
  });

  it("dentro do horário de envio: diz quando começa e manda o instante certo", () => {
    const { escolher, botao, onAgendar } = montar();
    escolher("2026-11-13T09:30");
    const resultado = screen.getByTestId("resultado-do-agendamento").textContent ?? "";
    expect(resultado).toContain("A campanha começa a enviar");
    expect(resultado).toContain("13/11");
    expect(resultado).toContain("09:30");
    expect(resultado).not.toContain("fora do horário");

    fireEvent.click(botao());
    // 9h30 em São Paulo = 12h30 UTC, qualquer que seja o fuso de quem roda.
    expect(onAgendar).toHaveBeenCalledWith("2026-11-13T12:30:00.000Z");
  });

  it("fora do horário de envio: avisa quando o primeiro envio sai, e ainda deixa agendar", () => {
    const { escolher, botao, onAgendar } = montar();
    escolher("2026-11-13T23:00");
    const resultado = screen.getByTestId("resultado-do-agendamento").textContent ?? "";
    expect(resultado).toContain("fora do horário de envio (7h–22h)");
    expect(resultado).toContain("só começa a enviar");
    expect(resultado).toContain("14/11");
    expect(resultado).toContain("07:00");

    fireEvent.click(botao());
    expect(onAgendar).toHaveBeenCalledWith("2026-11-14T02:00:00.000Z");
  });

  it("número que não envia aos domingos: avisa e aponta a segunda-feira", () => {
    const { escolher } = montar({ janela: { ...JANELA, permite_domingo: false } });
    escolher("2026-11-15T10:00");
    const resultado = screen.getByTestId("resultado-do-agendamento").textContent ?? "";
    expect(resultado).toContain("não envia aos domingos");
    expect(resultado).toContain("16/11");
  });

  it("horário que já passou: diz por quê e não deixa confirmar", () => {
    const { escolher, botao, onAgendar } = montar();
    escolher("2026-11-12T11:00");
    expect(screen.getByTestId("resultado-do-agendamento").textContent).toContain("Esse horário já passou");
    expect(botao().disabled).toBe(true);
    fireEvent.click(botao());
    expect(onAgendar).not.toHaveBeenCalled();
  });

  it("mais de um ano à frente não é agenda", () => {
    const { escolher, botao } = montar();
    escolher("2028-01-01T09:00");
    expect(screen.getByTestId("resultado-do-agendamento").textContent).toContain("dentro de um ano");
    expect(botao().disabled).toBe(true);
  });

  it("enquanto a ação está em voo, não deixa confirmar de novo", () => {
    const { escolher, botao } = montar({ enviando: true });
    escolher("2026-11-13T09:30");
    expect(botao().disabled).toBe(true);
  });

  it("Voltar fecha sem agendar", () => {
    const { onVoltar, onAgendar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(onAgendar).not.toHaveBeenCalled();
  });
});

describe("mudar o horário de uma campanha agendada", () => {
  it("abre com o horário atual, no fuso do número, e o botão diz o que faz", () => {
    const { campo } = montar({ agendadaPara: "2026-11-13T12:30:00.000Z" });
    expect(campo.value).toBe("2026-11-13T09:30");
    expect(screen.getByRole("heading", { name: "Mudar o horário do envio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar novo horário" })).toBeTruthy();
  });
});

describe("o cartão da campanha agendada", () => {
  it("diz para quando está marcada", () => {
    render(<CampanhaAgendada agendadaPara="2026-11-13T12:30:00.000Z" janela={JANELA} />);
    const texto = screen.getByTestId("campanha-agendada").textContent ?? "";
    expect(texto).toContain("13/11");
    expect(texto).toContain("09:30");
    expect(texto).not.toContain("fora do horário");
  });

  it("marcada para fora do horário de envio: diz quando o primeiro envio sai", () => {
    render(<CampanhaAgendada agendadaPara="2026-11-14T02:00:00.000Z" janela={JANELA} />);
    const texto = screen.getByTestId("campanha-agendada").textContent ?? "";
    expect(texto).toContain("fora do horário de envio (7h–22h)");
    expect(texto).toContain("14/11");
    expect(texto).toContain("07:00");
  });
});

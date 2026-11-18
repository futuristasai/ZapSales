/**
 * A LISTA DE PROTEÇÕES DO PASSO "TREINE SEU FUNCIONÁRIO" NÃO PODE DIZER O CONTRÁRIO.
 *
 * O quadro se chamava "E nunca vai fazer", com um X vermelho em cada linha — e as
 * linhas são proteções: "Respeitar quem pediu para parar". Lido de cima para baixo,
 * o quadro afirmava que o funcionário NUNCA respeita quem pediu para parar. Nenhum
 * teste via, porque cada peça estava certa sozinha.
 *
 * E o rodapé dizia "não têm interruptor" para uma lista que incluía a segunda
 * leitura de promessa — a única conferência que tem interruptor e pode estar
 * desligada na instalação.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/actions/onboarding/createDefaultAgent", () => ({
  createDefaultAgent: vi.fn(),
  skipAi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { SetupAiForm } from "@/app/onboarding/setup-ai/_form";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import {
  CONFERENCIAS_DE_SAIDA,
  CONFERENCIAS_SEMPRE_LIGADAS,
} from "@/lib/ai/guardrails/lista-de-conferencia";

afterEach(cleanup);

describe("lista de proteções do onboarding", () => {
  it("o título diz o que a lista é, e não 'nunca vai fazer'", () => {
    render(
      <IdiomaProvider locale={null}>
        <SetupAiForm
          capacidades={["Ver os clientes"]}
          conferencias={CONFERENCIAS_SEMPRE_LIGADAS.map((c) => c.rotulo)}
        />
      </IdiomaProvider>,
    );
    expect(screen.getByRole("heading", { name: "E sempre confere antes de enviar" })).toBeVisible();
    expect(screen.queryByText(/nunca vai fazer/i)).toBeNull();
    expect(screen.getByText("Respeitar quem pediu para parar")).toBeVisible();
    expect(screen.getByText(/não dá para desligar/)).toBeVisible();
  });

  it("só entra conferência sem interruptor — o rodapé promete que não se desliga", () => {
    expect(CONFERENCIAS_SEMPRE_LIGADAS.length).toBeGreaterThan(0);
    expect(CONFERENCIAS_SEMPRE_LIGADAS.every((c) => c.escolha === null)).toBe(true);
    const comEscolha = CONFERENCIAS_DE_SAIDA.filter((c) => c.escolha !== null).map((c) => c.nome);
    expect(comEscolha.length).toBeGreaterThan(0); // controle: o recorte tira alguém de verdade
    for (const nome of comEscolha) {
      expect(CONFERENCIAS_SEMPRE_LIGADAS.map((c) => c.nome)).not.toContain(nome);
    }
  });
});

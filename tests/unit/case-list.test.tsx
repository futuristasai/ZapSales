import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UseCasesModule from "@/hooks/ai/useCases";

const useCasesMock = vi.fn();
vi.mock("@/hooks/ai/useCases", async () => {
  const actual = await vi.importActual<typeof UseCasesModule>("@/hooks/ai/useCases");
  return { ...actual, useCases: (...args: unknown[]) => useCasesMock(...args) };
});

// CaseDetail é testado à parte; aqui só a lista importa.
vi.mock("@/app/app/ai/cases/_components/CaseDetail", () => ({
  CaseDetail: () => null,
}));

import { CaseList } from "@/app/app/ai/cases/_components/CaseList";

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

const agora = Date.now();
const hAtras = (h: number) => new Date(agora - h * 3_600_000).toISOString();

function caso(id: string, status: string, titulo: string, aberto: string) {
  return {
    id,
    title: titulo,
    summary: "resumo",
    blocker: "bloqueio",
    status,
    kind: "outro",
    opened_at: aberto,
    conversation_id: `conv-${id}`,
    contact_name: "Maria Silva",
    contact_phone: "+5511999990000",
  };
}

const ESPERA_PESSOA = caso("c1", "awaiting_human", "Cliente pede desconto acima do permitido", hAtras(1));
const ESPERA_CLIENTE = caso("c2", "awaiting_lead", "Aguardando CPF do cliente", hAtras(2));
const RESOLVIDO = caso("c3", "resolved", "Troca de horário confirmada", hAtras(3));
const OUTRA_PESSOA = caso("c4", "awaiting_human", "Reembolso fora do prazo", hAtras(5));

/** A API devolve `open` = aguardando pessoa + cliente; `resolved` = os já fechados. */
function respondeComo(abertos: unknown[], fechados: unknown[]) {
  useCasesMock.mockImplementation((status: "open" | "resolved") => ({
    isLoading: false,
    data: {
      open_count: abertos.length,
      cases: status === "open" ? abertos : fechados,
    },
  }));
}

describe("CaseList", () => {
  beforeEach(() => useCasesMock.mockReset());

  it("abre só com os casos que esperam uma pessoa, com o rótulo pt-br (nunca o enum cru)", () => {
    respondeComo([ESPERA_PESSOA, ESPERA_CLIENTE, OUTRA_PESSOA], [RESOLVIDO]);

    render(wrap(<CaseList />));

    expect(screen.getByText(ESPERA_PESSOA.title)).toBeInTheDocument();
    expect(screen.getByText(OUTRA_PESSOA.title)).toBeInTheDocument();
    expect(screen.queryByText(ESPERA_CLIENTE.title)).not.toBeInTheDocument();
    expect(screen.queryByText(RESOLVIDO.title)).not.toBeInTheDocument();
    expect(screen.queryByText("awaiting_human")).not.toBeInTheDocument();
  });

  it("a aba padrão conta o mesmo número que o contador do menu", () => {
    respondeComo([ESPERA_PESSOA, ESPERA_CLIENTE, OUTRA_PESSOA], []);

    render(wrap(<CaseList />));

    // 3 abertos na API, mas só 2 esperam uma pessoa — o contador do menu diz 2,
    // e a aba não pode dizer 3 (era o `open_count`, que soma quem espera o cliente).
    expect(screen.getByRole("tab", { name: /Aguardando você \(2\)/ })).toBeInTheDocument();
  });

  it("'Todos' mostra também os que esperam o cliente e os resolvidos, do mais novo ao mais velho", () => {
    respondeComo([OUTRA_PESSOA, ESPERA_PESSOA, ESPERA_CLIENTE], [RESOLVIDO]);

    render(wrap(<CaseList />));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }));

    const titulos = screen.getAllByTestId("case-item").map((li) => li.textContent ?? "");
    expect(titulos).toHaveLength(4);
    expect(titulos[0]).toContain(ESPERA_PESSOA.title);
    expect(titulos[1]).toContain(ESPERA_CLIENTE.title);
    expect(titulos[2]).toContain(RESOLVIDO.title);
    expect(titulos[3]).toContain(OUTRA_PESSOA.title);
  });

  it("não busca os resolvidos enquanto a pessoa não pede 'Todos'", () => {
    respondeComo([ESPERA_PESSOA], [RESOLVIDO]);

    render(wrap(<CaseList />));

    const buscouResolvidos = useCasesMock.mock.calls.some(
      ([status, opcoes]) => status === "resolved" && opcoes?.enabled !== false,
    );
    expect(buscouResolvidos).toBe(false);
  });

  it("estado vazio da aba padrão ensina o que é um caso", () => {
    respondeComo([ESPERA_CLIENTE], []);

    render(wrap(<CaseList />));

    expect(screen.getByText("Nenhum caso esperando você")).toBeInTheDocument();
    expect(screen.getByText(/quando a ia precisar de você/i)).toBeInTheDocument();
  });
});

// app/app/radar/_components/RiskRadarList.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { RiskRadarList } from "./RiskRadarList";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";

const busca = { atual: "" };

vi.mock("@/hooks/leads/useAtRiskLeads", () => ({ useAtRiskLeads: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(busca.atual) }));

const BASE = {
  items: [],
  counts: { critico: 0, em_risco: 0, em_voo: 0 },
  total: 0,
  sem_proximo_passo: [],
  total_sem_proximo_passo: 0,
  propostas_vencidas_sem_retomada: [],
  propostas_esperando_revisao: [],
};

const LEAD = {
  id: "lead-1",
  title: "Matrícula — Curso de ASB",
  contact_id: "c1",
  contact_name: "Larissa Rodrigues",
  owner_user_id: null,
  owner_kind: null,
  owner_agent_id: null,
  owner_agent_name: null,
  assignee_kind: null,
  last_activity_at: "2026-01-01T00:00:00Z",
  hours_since_activity: 24 * 198,
  risk: "critico",
  in_flight: false,
  next_followup_at: null,
  conversation_id: "conv-1",
  pipeline_id: "funil-1",
  pipeline_name: "Matrículas",
  stage_name: "Interessado",
};

const DEMANDA = {
  id: "d1",
  contact_id: "c9",
  contact_name: "Érica Santos",
  aberta_em: "2026-01-01",
  horas_aberta: 484,
  origem: "inbound",
  assunto: null,
  conversation_id: "conv-9",
  lead_id: "lead-9",
  pipeline_id: "funil-9",
};

function devolve(data: unknown) {
  vi.mocked(useAtRiskLeads).mockReturnValue({ data, isLoading: false } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  busca.atual = "";
  window.history.replaceState(null, "", "/app/radar");
});

describe("RiskRadarList — propostas vencidas sem retomada (N3)", () => {
  it("lista populada: mostra a seção nova com link para a proposta", async () => {
    devolve({
      ...BASE,
      propostas_vencidas_sem_retomada: [
        {
          lead_id: "lead-1",
          proposal_id: "prop-1",
          numero: 42,
          ano: 2026,
          valid_until: "2026-10-01",
        },
      ],
    });
    render(<RiskRadarList />);
    expect(await screen.findByTestId("radar-propostas-vencidas")).toBeInTheDocument();
    expect(screen.getByText(/0042\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /0042\/2026/ })).toHaveAttribute(
      "href",
      "/app/proposals/prop-1",
    );
  });

  it("lista vazia: esconde a seção", async () => {
    devolve({ ...BASE, sem_proximo_passo: [DEMANDA], total_sem_proximo_passo: 1 });
    render(<RiskRadarList />);
    expect(screen.queryByTestId("radar-propostas-vencidas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("radar-filtro-propostas_vencidas")).not.toBeInTheDocument();
  });

  it("só há proposta vencida (sem lead frio nem demanda): NÃO mostra o vazio", async () => {
    devolve({
      ...BASE,
      propostas_vencidas_sem_retomada: [
        { lead_id: "lead-1", proposal_id: "prop-1", numero: null, ano: null, valid_until: null },
      ],
    });
    render(<RiskRadarList />);
    expect(screen.queryByTestId("radar-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("radar-propostas-vencidas")).toBeInTheDocument();
  });
});

describe("RiskRadarList — os contadores escolhem a lista", () => {
  const CHEIO = {
    ...BASE,
    items: [LEAD],
    counts: { critico: 160, em_risco: 107, em_voo: 80 },
    total: 347,
    sem_proximo_passo: [DEMANDA],
    total_sem_proximo_passo: 19,
  };

  it("cada contador é um botão de alternância, e só o da lista em vigor está ligado", () => {
    devolve(CHEIO);
    render(<RiskRadarList />);
    expect(screen.getByTestId("radar-filtro-todos")).toHaveAttribute("aria-pressed", "true");
    for (const outro of ["critico", "em_risco", "em_voo", "sem_proximo_passo"]) {
      const botao = screen.getByTestId(`radar-filtro-${outro}`);
      expect(botao.tagName).toBe("BUTTON");
      expect(botao).toHaveAttribute("aria-pressed", "false");
    }
    expect(within(screen.getByTestId("radar-filtro-em_voo")).getByText("80")).toBeInTheDocument();
  });

  it("clicar em “Em voo” pede ao servidor SÓ essa situação e grava a escolha no endereço", () => {
    devolve(CHEIO);
    render(<RiskRadarList />);
    expect(vi.mocked(useAtRiskLeads)).toHaveBeenLastCalledWith({ risk: undefined, limit: 50 });

    fireEvent.click(screen.getByTestId("radar-filtro-em_voo"));

    expect(vi.mocked(useAtRiskLeads)).toHaveBeenLastCalledWith({ risk: "em_voo", limit: 50 });
    expect(screen.getByTestId("radar-filtro-em_voo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("radar-filtro-todos")).toHaveAttribute("aria-pressed", "false");
    expect(window.location.search).toBe("?ver=em_voo");
  });

  it("o endereço com ?ver= já abre na lista pedida", () => {
    busca.atual = "ver=critico";
    devolve(CHEIO);
    render(<RiskRadarList />);
    expect(vi.mocked(useAtRiskLeads)).toHaveBeenLastCalledWith({ risk: "critico", limit: 50 });
    expect(screen.getByTestId("radar-filtro-critico")).toHaveAttribute("aria-pressed", "true");
  });

  it("“Mostrar mais” pede as próximas linhas da mesma lista", () => {
    devolve(CHEIO);
    render(<RiskRadarList />);
    expect(screen.getByTestId("radar-mostrando")).toHaveTextContent("Mostrando 1 de 347");
    fireEvent.click(screen.getByTestId("radar-mostrar-mais"));
    expect(vi.mocked(useAtRiskLeads)).toHaveBeenLastCalledWith({ risk: undefined, limit: 100 });
  });

  it("sem negócio parado e com demanda sem próximo passo: abre direto nas demandas", () => {
    devolve({ ...BASE, sem_proximo_passo: [DEMANDA], total_sem_proximo_passo: 1 });
    render(<RiskRadarList />);
    expect(screen.getByTestId("radar-filtro-sem_proximo_passo")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("radar-sem-proximo-passo")).toHaveTextContent("Érica Santos");
  });
});

describe("RiskRadarList — para onde cada clique leva", () => {
  it("negócio com conversa: a linha e “Abrir conversa” vão à conversa; “Ver no funil” abre o cartão", () => {
    devolve({ ...BASE, items: [LEAD], counts: { critico: 1, em_risco: 0, em_voo: 0 }, total: 1 });
    render(<RiskRadarList />);
    const linha = screen.getByTestId("radar-item");

    // O nome da pessoa é o destaque; o título do negócio vem abaixo.
    expect(within(linha).getByTestId("radar-nome")).toHaveTextContent("Larissa Rodrigues");
    expect(within(linha).getByText("Matrícula — Curso de ASB")).toBeInTheDocument();
    expect(within(linha).getByText(/Parado há 198 dias/)).toBeInTheDocument();
    expect(within(linha).getByText("Matrículas › Interessado")).toBeInTheDocument();

    expect(within(linha).getByRole("link", { name: /Larissa Rodrigues/ })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-1",
    );
    expect(within(linha).getByRole("link", { name: "Abrir conversa" })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-1",
    );
    expect(within(linha).getByRole("link", { name: "Ver no funil" })).toHaveAttribute(
      "href",
      "/app/pipelines/funil-1?lead=lead-1",
    );
  });

  it("título igual ao nome do cliente não se repete na linha", () => {
    devolve({
      ...BASE,
      items: [{ ...LEAD, title: "Larissa Rodrigues" }],
      counts: { critico: 1, em_risco: 0, em_voo: 0 },
      total: 1,
    });
    render(<RiskRadarList />);
    const linha = screen.getByTestId("radar-item");
    expect(within(linha).getAllByText("Larissa Rodrigues")).toHaveLength(1);
    expect(within(linha).queryByTestId("radar-titulo")).not.toBeInTheDocument();
  });

  it("negócio SEM conversa: a linha avisa e leva ao cartão no funil — nunca ao quadro solto", () => {
    devolve({
      ...BASE,
      items: [{ ...LEAD, conversation_id: null }],
      counts: { critico: 1, em_risco: 0, em_voo: 0 },
      total: 1,
    });
    render(<RiskRadarList />);
    const linha = screen.getByTestId("radar-item");
    expect(within(linha).getByText("Ainda sem conversa")).toBeInTheDocument();
    expect(within(linha).queryByRole("link", { name: "Abrir conversa" })).not.toBeInTheDocument();
    expect(within(linha).getByRole("link", { name: /Larissa Rodrigues/ })).toHaveAttribute(
      "href",
      "/app/pipelines/funil-1?lead=lead-1",
    );
  });

  it("demanda sem próximo passo: cada nome é clicável e abre a conversa", () => {
    busca.atual = "ver=sem_proximo_passo";
    devolve({ ...BASE, sem_proximo_passo: [DEMANDA], total_sem_proximo_passo: 1 });
    render(<RiskRadarList />);
    const linha = screen.getByTestId("radar-demanda");
    expect(within(linha).getByRole("link", { name: /Érica Santos/ })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-9",
    );
    // 484 horas viram dias: "484h" não diz nada a quem lê.
    expect(within(linha).getByText(/Aberta há 20 dias/)).toBeInTheDocument();
    expect(within(linha).getByRole("link", { name: "Ver no funil" })).toHaveAttribute(
      "href",
      "/app/pipelines/funil-9?lead=lead-9",
    );
  });

  it("demanda sem conversa nem negócio: ainda tem saída, a ficha do contato", () => {
    busca.atual = "ver=sem_proximo_passo";
    devolve({
      ...BASE,
      sem_proximo_passo: [{ ...DEMANDA, conversation_id: null, lead_id: null, pipeline_id: null }],
      total_sem_proximo_passo: 1,
    });
    render(<RiskRadarList />);
    expect(
      within(screen.getByTestId("radar-demanda")).getByRole("link", { name: "Ver contato" }),
    ).toHaveAttribute("href", "/app/contacts/c9");
  });
});

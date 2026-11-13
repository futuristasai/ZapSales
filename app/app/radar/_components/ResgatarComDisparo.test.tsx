/**
 * O resgate por disparo em massa, pela tela: o botão conta as pessoas da situação, guarda a lista
 * e leva à nova campanha com a lista no endereço. O `fetch` é dublado com o que as rotas devolvem;
 * o resto é o componente de verdade.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { ResgatarComDisparo } from "./ResgatarComDisparo";

const irPara = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: irPara }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

interface Chamada {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
}
let chamadas: Chamada[] = [];

const NEGOCIOS = [
  { id: "l1", contact_id: "c1", risk: "critico" },
  { id: "l2", contact_id: "c2", risk: "critico" },
  // Segundo negócio da MESMA pessoa: ela entra uma vez só.
  { id: "l3", contact_id: "c1", risk: "em_risco" },
  { id: "l4", contact_id: null, risk: "em_risco" },
  { id: "l5", contact_id: "c5", risk: "em_voo" },
];

function dublarRede(statusDoPost = 201) {
  chamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const caminho = String(url);
      const metodo = init?.method ?? "GET";
      const corpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      chamadas.push({ metodo, caminho, corpo });
      let status = 200;
      let resposta: unknown = { data: [] };
      if (caminho.includes("/api/v1/leads/at-risk")) {
        const risk = new URL(caminho, "http://x").searchParams.get("risk");
        const items = risk ? NEGOCIOS.filter((n) => n.risk === risk) : NEGOCIOS;
        resposta = { data: { items, counts: {}, total: NEGOCIOS.length } };
      } else if (caminho.endsWith("/api/v1/campaigns/listas") && metodo === "POST") {
        status = statusDoPost;
        resposta =
          statusDoPost === 201
            ? { data: { id: "lista-nova", name: String(corpo?.name), total: 2, created_at: "" } }
            : {
                error: {
                  code: "lista_de_pessoas_nome_repetido",
                  message: "Já existe uma lista com esse nome.",
                },
              };
      }
      return {
        ok: status < 400,
        status,
        headers: new Headers(),
        text: async () => JSON.stringify(resposta),
      };
    }),
  );
}

function montar(visao: "todos" | "critico" | "em_risco" | "em_voo") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <ResgatarComDisparo visao={visao} />
    </QueryClientProvider>,
  );
}

beforeEach(() => irPara.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("ResgatarComDisparo", () => {
  it("nada é buscado nem gravado antes do clique", () => {
    dublarRede();
    montar("critico");
    expect(chamadas).toEqual([]);
  });

  it("Crítico: pede ao servidor só essa situação, com o teto da rota, e conta as PESSOAS", async () => {
    dublarRede();
    montar("critico");
    fireEvent.click(screen.getByTestId("radar-resgatar"));

    expect(await screen.findByTestId("radar-resgatar-total")).toHaveTextContent(
      "2 pessoas em Crítico.",
    );
    const busca = chamadas.find((c) => c.caminho.includes("/leads/at-risk"))!;
    expect(busca.caminho).toContain("risk=critico");
    expect(busca.caminho).toContain("limit=500");
    // O nome já vem preenchido, com a situação e a data.
    expect((screen.getByLabelText("Nome da lista") as HTMLInputElement).value).toMatch(
      /^Riscos de Perda · Crítico · \d{2}\/\d{2} \d{2}h\d{2}$/,
    );
  });

  it("confirmar guarda a lista com as pessoas sem repetir e abre a nova campanha com ela", async () => {
    dublarRede();
    montar("critico");
    fireEvent.click(screen.getByTestId("radar-resgatar"));
    await screen.findByTestId("radar-resgatar-total");
    fireEvent.change(screen.getByLabelText("Nome da lista"), {
      target: { value: "Resgate de novembro" },
    });
    fireEvent.click(screen.getByTestId("radar-resgatar-confirmar"));

    await waitFor(() => expect(irPara).toHaveBeenCalledWith("/app/campaigns/new?lista=lista-nova"));
    const post = chamadas.find((c) => c.metodo === "POST")!;
    expect(post.caminho).toContain("/api/v1/campaigns/listas");
    expect(post.corpo).toEqual({ name: "Resgate de novembro", contact_ids: ["c1", "c2"] });
  });

  it("Todos: quem está em voo fica de fora, e a tela diz quantos e por quê", async () => {
    dublarRede();
    montar("todos");
    fireEvent.click(screen.getByTestId("radar-resgatar"));

    expect(await screen.findByTestId("radar-resgatar-total")).toHaveTextContent(
      "2 pessoas em Todos.",
    );
    expect(screen.getByTestId("radar-resgatar-em-voo")).toHaveTextContent(
      "1 em voo ficaram de fora",
    );
    expect(
      screen.getByText(/1 negócio\(s\) sem cliente ligado ficaram de fora\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("radar-resgatar-confirmar"));
    await waitFor(() => expect(irPara).toHaveBeenCalled());
    expect(chamadas.find((c) => c.metodo === "POST")!.corpo?.contact_ids).toEqual(["c1", "c2"]);
  });

  it("Em voo: deixa seguir, mas avisa antes que essas pessoas já têm retorno marcado", async () => {
    dublarRede();
    montar("em_voo");
    fireEvent.click(screen.getByTestId("radar-resgatar"));

    expect(await screen.findByTestId("radar-resgatar-total")).toHaveTextContent(
      "1 pessoa em Em voo.",
    );
    expect(
      screen.getByText(/Um disparo por cima manda duas mensagens à mesma pessoa\./),
    ).toBeInTheDocument();
    expect(screen.getByTestId("radar-resgatar-confirmar")).toBeEnabled();
  });

  it("nome apagado não deixa confirmar; lista recusada pelo servidor não navega", async () => {
    dublarRede(409);
    montar("critico");
    fireEvent.click(screen.getByTestId("radar-resgatar"));
    await screen.findByTestId("radar-resgatar-total");

    fireEvent.change(screen.getByLabelText("Nome da lista"), { target: { value: " " } });
    expect(screen.getByTestId("radar-resgatar-confirmar")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nome da lista"), {
      target: { value: "Nome repetido" },
    });
    fireEvent.click(screen.getByTestId("radar-resgatar-confirmar"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    expect(irPara).not.toHaveBeenCalled();
    expect(screen.getByTestId("radar-resgatar-dialogo")).toBeInTheDocument();
  });
});

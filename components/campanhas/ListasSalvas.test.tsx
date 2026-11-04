/**
 * As listas salvas pela tela: salvar o público com um nome, ver as listas, usar uma (trazendo as
 * pessoas de volta, com quem ficou de fora e por quê) e excluir com confirmação. O `fetch` é
 * dublado com o que as rotas devolvem; o resto é o componente.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { ListasSalvas } from "./ListasSalvas";

interface Lista {
  id: string;
  name: string;
  total: number;
  created_at: string;
}

const VIP: Lista = { id: "l1", name: "Clientes VIP", total: 4, created_at: "2026-11-01T00:00:00Z" };

const LEGENDA = {
  opt_out: "Pediu para não receber mensagens",
  ja_em_campanha: "Já está em outra campanha ainda não concluída",
};

const PESSOAS_DA_LISTA = {
  contatos: [
    { id: "p1", nome: "Ana", telefone: "+5511999990001", tags: [], motivo: null },
    { id: "p2", nome: "Bruno", telefone: "+5511999990002", tags: [], motivo: "opt_out" },
    { id: "p3", nome: "Carla", telefone: "+5511999990003", tags: [], motivo: null },
  ],
  guardadas: 4,
  total: 3,
  legenda: LEGENDA,
};

interface Chamada {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
}

let chamadas: Chamada[] = [];

function dublarRede(inicial: Lista[]) {
  chamadas = [];
  let listas = [...inicial];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const caminho = String(url);
      const metodo = init?.method ?? "GET";
      const corpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      chamadas.push({ metodo, caminho, corpo });
      let status = 200;
      let resposta: unknown = { data: [] };
      if (caminho.endsWith("/api/v1/campaigns/listas") && metodo === "GET") {
        resposta = { data: listas };
      } else if (caminho.endsWith("/api/v1/campaigns/listas") && metodo === "POST") {
        const nova: Lista = {
          id: "novo",
          name: String(corpo?.name),
          total: (corpo?.contact_ids as string[]).length,
          created_at: "2026-11-04T00:00:00Z",
        };
        listas = [nova, ...listas];
        status = 201;
        resposta = { data: nova };
      } else if (/\/api\/v1\/campaigns\/listas\/[^/?]+/.test(caminho) && metodo === "GET") {
        resposta = { data: PESSOAS_DA_LISTA };
      } else if (/\/api\/v1\/campaigns\/listas\/[^/?]+/.test(caminho) && metodo === "DELETE") {
        const id = caminho.split("/listas/")[1]!.split("?")[0];
        listas = listas.filter((l) => l.id !== id);
        resposta = { data: { id } };
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

function montar(props: Partial<Parameters<typeof ListasSalvas>[0]> = {}) {
  const aoMarcar = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <ListasSalvas marcados={[]} onMarcados={aoMarcar} daPlanilha={[]} {...props} />
    </QueryClientProvider>,
  );
  return { aoMarcar };
}

afterEach(() => vi.unstubAllGlobals());

describe("ListasSalvas", () => {
  it("sem listas diz isso, e sem pessoas no público não deixa salvar", async () => {
    dublarRede([]);
    montar();
    expect(await screen.findByTestId("listas-vazio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marque pessoas para salvar uma lista" }),
    ).toBeDisabled();
  });

  it("mostra as listas com quantas pessoas cada uma tem", async () => {
    dublarRede([VIP]);
    montar();
    const linha = await screen.findByTestId("lista-salva");
    expect(linha).toHaveTextContent("Clientes VIP");
    expect(linha).toHaveTextContent("4 pessoa(s)");
  });

  it("salva o público com um nome: o botão só vale com nome, e a lista aparece depois", async () => {
    dublarRede([]);
    montar({ marcados: ["p1", "p2"] });
    await screen.findByTestId("listas-vazio");
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar as 2 pessoas deste público como lista" }),
    );

    const salvar = screen.getByRole("button", { name: "Salvar lista" });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome da lista"), { target: { value: "V" } });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome da lista"), { target: { value: "  Novembro  " } });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);

    await waitFor(() =>
      expect(screen.getByTestId("aviso-de-lista")).toHaveTextContent(
        "Lista salva: Novembro (2 pessoa(s)).",
      ),
    );
    const envio = chamadas.find((c) => c.metodo === "POST")!;
    expect(envio.corpo).toEqual({ name: "Novembro", contact_ids: ["p1", "p2"] });
    expect(await screen.findByTestId("lista-salva")).toHaveTextContent("Novembro");
  });

  it("salva também quem veio da planilha, sem repetir quem está nas duas origens", async () => {
    dublarRede([]);
    montar({ marcados: ["p1"], daPlanilha: ["p1", "x1"] });
    await screen.findByTestId("listas-vazio");
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar as 2 pessoas deste público como lista" }),
    );
    fireEvent.change(screen.getByLabelText("Nome da lista"), { target: { value: "Mista" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar lista" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "POST")!.corpo?.contact_ids).toEqual(["p1", "x1"]);
  });

  it("usar a lista marca só quem pode receber e conta quem ficou de fora e por quê", async () => {
    dublarRede([VIP]);
    const { aoMarcar } = montar({ marcados: ["z9"] });
    fireEvent.click(await screen.findByRole("button", { name: "Usar a lista Clientes VIP" }));

    await waitFor(() => expect(aoMarcar).toHaveBeenCalled());
    // Soma às já marcadas, sem a pessoa vetada.
    expect(aoMarcar).toHaveBeenLastCalledWith(["z9", "p1", "p3"]);
    const aviso = screen.getByTestId("aviso-de-lista");
    expect(aviso).toHaveTextContent("2 pessoa(s) da lista entraram no público");
    expect(aviso).toHaveTextContent("1 ficaram de fora (1 · Pediu para não receber mensagens)");
    // A lista guardava 4 e só 3 ainda são pessoas desta organização.
    expect(aviso).toHaveTextContent("1 não estão mais no CRM");
  });

  it("na edição, a campanha vai junto para os destinatários dela não contarem como já em campanha", async () => {
    dublarRede([VIP]);
    montar({ campanhaId: "11111111-1111-4111-8111-111111111111" });
    fireEvent.click(await screen.findByRole("button", { name: "Usar a lista Clientes VIP" }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho.includes("/listas/l1"))).toBe(true));
    expect(chamadas.find((c) => c.caminho.includes("/listas/l1"))!.caminho).toContain(
      "?campaign_id=11111111-1111-4111-8111-111111111111",
    );
  });

  it("excluir pede confirmação, avisa que só a lista some, e depois a tira da tela", async () => {
    dublarRede([VIP]);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir a lista Clientes VIP" }));

    expect(await screen.findByText(/Só a lista some/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("lista-salva")).toBeNull());
    expect(screen.getByTestId("aviso-de-lista")).toHaveTextContent("Lista apagada: Clientes VIP.");
  });
});

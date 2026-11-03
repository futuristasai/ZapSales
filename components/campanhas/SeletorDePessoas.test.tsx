/**
 * A tabela "escolher pessoas do CRM" pela tela: o operador acha gente por busca e filtro, vê quem
 * não pode receber (esmaecido, sem caixa), marca um a um ou todos de uma vez, e a soma mostra de
 * onde vem cada pessoa. O `fetch` é dublado com o que as rotas devolvem; o resto é o componente.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { SeletorDePessoas } from "./SeletorDePessoas";

const PESSOAS = [
  { id: "p1", nome: "Ana Souza", telefone: "+5511999990001", tags: ["vip"], motivo: null },
  { id: "p2", nome: "Bruno Lima", telefone: "+5511999990002", tags: [], motivo: null },
  { id: "p3", nome: "Carla Dias", telefone: "+5511999990003", tags: ["vip"], motivo: "opt_out" },
  { id: "p4", nome: "Davi Rocha", telefone: null, tags: [], motivo: "sem_telefone" },
];
const LEGENDA = {
  opt_out: "Pediu para não receber mensagens",
  sem_telefone: "Sem telefone no cadastro",
  ja_em_campanha: "Já está em outra campanha ainda não concluída",
};

let corposDaTabela: Array<Record<string, unknown>> = [];

function dublarRede(contatos: typeof PESSOAS = PESSOAS, extras: { cortado?: boolean } = {}) {
  corposDaTabela = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const caminho = String(url);
      let corpo: unknown = { data: [] };
      if (caminho.includes("/api/v1/contact-tags")) corpo = { data: ["vip", "cliente"] };
      else if (caminho.endsWith("/api/v1/pipelines"))
        corpo = {
          data: [
            { id: "f1", name: "Vendas", is_default: true },
            { id: "f2", name: "Pós-venda", is_default: false },
          ],
        };
      else if (caminho.includes("/pipelines/f1/stages"))
        corpo = {
          data: [
            { id: "e1", name: "Novo", position: 1, is_won: false, is_lost: false },
            { id: "e2", name: "Proposta", position: 2, is_won: false, is_lost: false },
          ],
        };
      else if (caminho.includes("/pipelines/f2/stages"))
        corpo = {
          data: [{ id: "e3", name: "Entregue", position: 1, is_won: true, is_lost: false }],
        };
      else if (caminho.includes("/api/v1/campaigns/contatos")) {
        corposDaTabela.push(JSON.parse(String(init?.body ?? "{}")));
        corpo = {
          data: {
            contatos,
            total: contatos.length,
            cortado: extras.cortado ?? false,
            legenda: LEGENDA,
          },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify(corpo),
      };
    }),
  );
}

function Tela({
  planilha = [],
  aoMarcar,
}: {
  planilha?: string[];
  aoMarcar?: (ids: string[]) => void;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  return (
    <SeletorDePessoas
      marcados={marcados}
      onMarcados={(ids) => {
        setMarcados(ids);
        aoMarcar?.(ids);
      }}
      daPlanilha={planilha}
    />
  );
}

function montar(props: Parameters<typeof Tela>[0] = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Tela {...props} />
    </QueryClientProvider>,
  );
}

const CAMPO_DA_BUSCA = "Buscar por nome, telefone ou etiqueta";

async function esperarADigitacao() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 450));
  });
}

async function buscar(texto: string) {
  fireEvent.change(screen.getByLabelText(CAMPO_DA_BUSCA), { target: { value: texto } });
  await esperarADigitacao();
  await screen.findByTestId("tabela-de-pessoas");
}

describe("SeletorDePessoas", () => {
  beforeEach(() => dublarRede());
  afterEach(() => vi.unstubAllGlobals());

  it("sem filtro nem busca, não lista ninguém e diz como começar", () => {
    montar();
    expect(screen.getByTestId("tabela-sem-busca")).toBeInTheDocument();
    expect(screen.queryByTestId("tabela-de-pessoas")).toBeNull();
    expect(corposDaTabela).toHaveLength(0);
  });

  it("uma busca de uma letra só não vai ao servidor", async () => {
    montar();
    fireEvent.change(screen.getByLabelText(CAMPO_DA_BUSCA), { target: { value: "a" } });
    await esperarADigitacao();
    expect(corposDaTabela).toHaveLength(0);
  });

  it("a busca digitada lista as pessoas, com etiqueta e situação", async () => {
    montar();
    await buscar("souza");
    expect(corposDaTabela.at(-1)).toMatchObject({ busca: "souza" });
    const linhas = screen.getAllByTestId("linha-de-pessoa");
    expect(linhas).toHaveLength(4);
    expect(within(linhas[0]!).getByText("Ana Souza")).toBeInTheDocument();
    expect(within(linhas[0]!).getByText("vip")).toBeInTheDocument();
    expect(within(linhas[0]!).getByText("Pode receber")).toBeInTheDocument();
  });

  it("quem não pode receber aparece esmaecido, sem caixa para marcar, com o motivo", async () => {
    montar();
    await buscar("carla");
    const vetadas = screen
      .getAllByTestId("linha-de-pessoa")
      .filter((l) => l.dataset.vetada === "true");
    expect(vetadas).toHaveLength(2);
    expect(within(vetadas[0]!).getByRole("checkbox")).toBeDisabled();
    expect(within(vetadas[0]!).getByText("Pediu para não receber mensagens")).toBeInTheDocument();
    expect(within(vetadas[1]!).getByText("Sem telefone no cadastro")).toBeInTheDocument();
  });

  it("marcar uma pessoa soma ao público", async () => {
    const aoMarcar = vi.fn();
    montar({ aoMarcar });
    await buscar("souza");
    fireEvent.click(screen.getByLabelText("Escolher Ana Souza"));
    expect(aoMarcar).toHaveBeenLastCalledWith(["p1"]);
    expect(screen.getByTestId("soma-do-publico")).toHaveTextContent("1 pessoa(s) neste público");
  });

  it("marcar todas marca só quem pode receber, e o botão vira desmarcar", async () => {
    const aoMarcar = vi.fn();
    montar({ aoMarcar });
    await buscar("ana");
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas as 2 que podem receber" }));
    expect(aoMarcar).toHaveBeenLastCalledWith(["p1", "p2"]);
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar as encontradas" }));
    expect(aoMarcar).toHaveBeenLastCalledWith([]);
  });

  it("mostra as duas origens somadas quando há planilha, e a mesma pessoa conta uma vez", async () => {
    montar({ planilha: ["p1", "x1", "x2"] });
    await buscar("souza");
    fireEvent.click(screen.getByLabelText("Escolher Ana Souza"));
    // Ana está nas duas origens: 1 do CRM + 2 só da planilha = 3.
    expect(screen.getByTestId("soma-do-publico")).toHaveTextContent("3 pessoa(s) neste público");
    expect(screen.getByTestId("soma-do-publico")).toHaveTextContent("1 do CRM + 2 da planilha");
  });

  it("escolher uma etiqueta busca com ela, mesmo sem digitar nada", async () => {
    montar();
    const grupo = await screen.findByTestId("filtro-com-etiquetas");
    fireEvent.click(await within(grupo).findByRole("button", { name: "vip" }));
    await screen.findByTestId("tabela-de-pessoas");
    expect(
      (corposDaTabela.at(-1)!.audience_filter as { com_alguma_tag: string[] }).com_alguma_tag,
    ).toEqual(["vip"]);
  });

  it("vários funis viram só etapas: as marcadas de um e todas as do outro", async () => {
    montar();
    fireEvent.click(await screen.findByLabelText("Vendas"));
    fireEvent.click(await screen.findByLabelText("Pós-venda"));
    // Em Vendas só a etapa "Proposta"; em Pós-venda, nenhuma marcada = o funil inteiro.
    fireEvent.click(await screen.findByLabelText("Proposta"));
    await screen.findByTestId("tabela-de-pessoas");
    await waitFor(() => {
      const filtro = corposDaTabela.at(-1)!.audience_filter as {
        etapas: string[];
        funis: string[];
      };
      expect([...filtro.etapas].sort()).toEqual(["e2", "e3"]);
      expect(filtro.funis).toEqual([]);
    });
  });

  it("avisa quando a busca achou mais gente do que a tabela mostra", async () => {
    dublarRede(PESSOAS, { cortado: true });
    montar();
    await buscar("ana");
    expect(screen.getByText(/achou mais gente do que a tabela mostra/)).toBeInTheDocument();
  });

  it("pagina de 25 em 25", async () => {
    const muitas = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`,
      nome: `Pessoa ${i}`,
      telefone: `+55119999${String(i).padStart(5, "0")}`,
      tags: [],
      motivo: null,
    }));
    dublarRede(muitas);
    montar();
    await buscar("pessoa");
    expect(screen.getAllByTestId("linha-de-pessoa")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getByText("Página 2 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getAllByTestId("linha-de-pessoa")).toHaveLength(10);
  });

  it("ninguém encontrado diz isso, em vez de uma tabela vazia", async () => {
    dublarRede([]);
    montar();
    fireEvent.change(screen.getByLabelText(CAMPO_DA_BUSCA), { target: { value: "zzz" } });
    await esperarADigitacao();
    expect(await screen.findByTestId("tabela-vazia")).toBeInTheDocument();
  });
});

/**
 * A seção «Ferramentas externas» do editor do agente (issue #94) e o seletor de
 * capacidades reorganizado ao lado dela.
 *
 * As ferramentas externas ocupam o MESMO prompt das capacidades do catálogo: o
 * consumo mostrado no seletor soma as duas listas, a recusa pelo máximo vale para as
 * duas, e uma ferramenta desativada (ou que altera dados) só pode ser DESMARCADA.
 * Desde a reorganização elas moram numa seção própria, e o seletor só as conta.
 */
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ToolPicker } from "@/app/app/ai/agents/[id]/_components/ToolPicker";
import { FerramentasExternasDoAgente } from "@/app/app/ai/agents/[id]/_components/FerramentasExternasDoAgente";
import { AbrirAbaDoAgente } from "@/app/app/ai/agents/[id]/_components/abrir-aba";
import { passaDoTetoDeCapacidades } from "@/lib/ai/agents/validation";
import { TETO_MAXIMO_POR_AGENTE, TETO_RECOMENDADO_POR_AGENTE, excedeuTeto, vagasRestantes } from "@/lib/mcp/tools/selecao-por-pacote";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

const CAPACIDADE = {
  id: "crm_search_contacts",
  description: "Busca contatos.",
  category: "read",
  requires_role: "viewer",
  requires_scope: "mcp:read",
  rotulo: "Buscar contatos",
  explicacao: "Encontra o contato certo.",
  o_que_toca: "Contatos",
  risco: "seguro",
  pacotes: ["atender"],
  marcavel: true,
  motivo_nao_marcavel: null,
  exemplo: "Cliente diz o nome → o agente acha o cadastro.",
};

const ATIVA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Consultar estoque",
  agent_name: "ext_consultar_estoque",
  when_to_use: "Quando o cliente perguntar se um produto está disponível.",
  url: "https://erp.exemplo.com.br/hooks/estoque",
  effect: "consulta",
  active: true,
  unavailable_reason: null,
};
const DESATIVADA = { ...ATIVA, id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Consultar preço", active: false };

let client: QueryClient;
let externas: Array<typeof ATIVA>;
let catalogo: Array<Record<string, unknown>>;
let uso: { janela_em_dias: number; capacidades: Array<Record<string, unknown>> } | null;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  externas = [ATIVA, DESATIVADA];
  catalogo = [CAPACIDADE];
  uso = null;
  api.get.mockReset();
  api.get.mockImplementation(async (url: string) => {
    if (url.includes("external-tools")) return { data: externas };
    if (url.includes("tool-usage")) {
      if (!uso) throw new Error("403");
      return { data: uso };
    }
    return { data: { tools: catalogo, desligadas_pela_organizacao: [] } };
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

function comProvedores(no: ReactNode, abrirAba: ((aba: "capacidades") => void) | null = null) {
  return (
    <IdiomaProvider locale="pt-BR">
      <QueryClientProvider client={client}>
        <AbrirAbaDoAgente.Provider value={abrirAba}>{no}</AbrirAbaDoAgente.Provider>
      </QueryClientProvider>
    </IdiomaProvider>
  );
}

function abrirSecao(props: { marcadas?: string[]; onChange?: (ids: string[]) => void; capacidadesLigadas?: number }) {
  return render(
    comProvedores(
      <FerramentasExternasDoAgente
        value={props.marcadas ?? []}
        onChange={props.onChange ?? (() => undefined)}
        capacidadesLigadas={props.capacidadesLigadas ?? 0}
      />,
    ),
  );
}

describe("o teto de capacidades soma as duas listas", () => {
  it("vagas e excesso contam as ferramentas externas", () => {
    expect(vagasRestantes(["a", "b"], 3)).toBe(TETO_MAXIMO_POR_AGENTE - 5);
    const quase = TETO_MAXIMO_POR_AGENTE - 2;
    expect(excedeuTeto(Array(quase).fill("x"), 2)).toBe(false);
    expect(excedeuTeto(Array(quase).fill("x"), 3)).toBe(true);
    expect(passaDoTetoDeCapacidades(Array(TETO_MAXIMO_POR_AGENTE - 1).fill("x"), ["a"])).toBe(false);
    expect(passaDoTetoDeCapacidades(Array(TETO_MAXIMO_POR_AGENTE - 1).fill("x"), ["a", "b"])).toBe(true);
    expect(passaDoTetoDeCapacidades(["a"], undefined)).toBe(false);
  });

  it("o seletor de capacidades soma as externas no consumo, e não as lista", async () => {
    render(comProvedores(<ToolPicker value={["crm_search_contacts"]} onChange={() => undefined} qtdExternas={1} />));
    await waitFor(() => expect(screen.getByTestId("tool-picker")).toBeTruthy());
    expect(screen.getByTestId("consumo-teto").textContent).toContain(`2 de ${TETO_RECOMENDADO_POR_AGENTE}`);
    expect(screen.queryByTestId("grupo-ferramentas-externas")).toBeNull();
    expect(api.get.mock.calls.some(([url]) => String(url).includes("external-tools"))).toBe(false);
  });
});

describe("seção Ferramentas externas", () => {
  it("lista as ferramentas cadastradas, com o 'quando usar', o efeito e quantas estão ligadas", async () => {
    abrirSecao({ marcadas: [ATIVA.id] });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${ATIVA.id}`)).toBeTruthy());
    const ativa = screen.getByTestId(`ferramenta-externa-${ATIVA.id}`);
    expect(ativa.textContent).toContain("Consultar estoque");
    expect(ativa.textContent).toContain("Quando o cliente perguntar se um produto está disponível.");
    expect(ativa.textContent).toContain("Só consulta");
    expect(ativa.textContent).toContain("erp.exemplo.com.br");
    expect(screen.getByTestId("resumo-ferramentas-externas").textContent).toContain("2 cadastradas na empresa");
    expect(screen.getByTestId("resumo-ferramentas-externas").textContent).toContain("1 ligada neste agente");
  });

  it("marcar e desmarcar devolvem a lista nova", async () => {
    const aoMudar = vi.fn();
    abrirSecao({ marcadas: [ATIVA.id], onChange: aoMudar });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Consultar estoque" }));
    expect(aoMudar).toHaveBeenCalledWith([]);
  });

  it("ferramenta DESATIVADA não pode ser ligada, e diz por quê", async () => {
    abrirSecao({});
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar preço" }) as HTMLInputElement;
    expect(caixa.disabled).toBe(true);
    expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`).textContent).toContain("Desativada");
  });

  it("a desativada que JÁ estava marcada pode ser desmarcada", async () => {
    const aoMudar = vi.fn();
    abrirSecao({ marcadas: [DESATIVADA.id], onChange: aoMudar });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar preço" }) as HTMLInputElement;
    expect(caixa.disabled).toBe(false);
    fireEvent.click(caixa);
    expect(aoMudar).toHaveBeenCalledWith([]);
  });

  it("com o máximo atingido pelas capacidades, ligar mais uma não é possível", async () => {
    const aoMudar = vi.fn();
    abrirSecao({ capacidadesLigadas: TETO_MAXIMO_POR_AGENTE, onChange: aoMudar });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${ATIVA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar estoque" }) as HTMLInputElement;
    // Sem vaga, a caixa nem aceita ligar.
    expect(caixa.disabled).toBe(true);
    fireEvent.click(caixa);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("organização sem nenhuma ferramenta: convite grande para cadastrar, em outra aba", async () => {
    externas = [];
    abrirSecao({});
    await waitFor(() => expect(screen.getByTestId("sem-ferramentas-externas")).toBeTruthy());
    expect(screen.getByTestId("sem-ferramentas-externas").textContent).toContain(
      "Você ainda não cadastrou nenhuma ferramenta externa.",
    );
    const cadastrar = screen.getByTestId("cadastrar-ferramenta-externa");
    expect(cadastrar.getAttribute("href")).toBe("/app/ai/external-tools");
    // Em outra aba: navegar daqui perderia o rascunho que ainda não foi salvo.
    expect(cadastrar.getAttribute("target")).toBe("_blank");
    expect(cadastrar.textContent).toContain("Cadastrar uma ferramenta externa");
    expect(screen.getByTestId("conectar-servidor-mcp").getAttribute("href")).toBe("/app/ai/external-tools?aba=mcp");
  });

  it("ferramenta marcada que não existe mais é avisada e pode ser desmarcada", async () => {
    const aoMudar = vi.fn();
    abrirSecao({ marcadas: ["bbbbbbbb-0000-4000-8000-000000000009", ATIVA.id], onChange: aoMudar });
    await waitFor(() => expect(screen.getByTestId("ferramentas-externas-orfas")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar" }));
    expect(aoMudar).toHaveBeenCalledWith([ATIVA.id]);
  });
});

describe("seletor de capacidades reorganizado", () => {
  it("o pacote abre e mostra cada capacidade com explicação, exemplo e o que toca", async () => {
    render(comProvedores(<ToolPicker value={[]} onChange={() => undefined} />));
    fireEvent.click(await screen.findByTestId("abrir-pacote-atender"));
    const corpo = screen.getByTestId("capacidades-do-pacote-atender");
    expect(corpo.textContent).toContain("Buscar contatos");
    expect(corpo.textContent).toContain("Encontra o contato certo.");
    expect(screen.getByTestId("exemplo-crm_search_contacts").textContent).toContain("o agente acha o cadastro");
    expect(corpo.textContent).toContain("Mexe em: Contatos");
    // Agrupada pelo tamanho do efeito.
    expect(screen.getByTestId("grupo-atender-seguro")).toBeTruthy();
  });

  it("a busca acha a capacidade pelo nome, sem acento, e mostra o nome técnico", async () => {
    render(comProvedores(<ToolPicker value={[]} onChange={() => undefined} />));
    fireEvent.change(await screen.findByTestId("busca-capacidade"), { target: { value: "CONTATOS" } });
    const resultado = screen.getByTestId("resultado-da-busca");
    expect(resultado.textContent).toContain("1 capacidade encontrada");
    expect(resultado.textContent).toContain("crm_search_contacts");
    fireEvent.change(screen.getByTestId("busca-capacidade"), { target: { value: "nada disso" } });
    expect(screen.getByTestId("resultado-da-busca").textContent).toContain("Nenhuma capacidade com esse nome");
  });

  it("capacidade ligada e nunca usada diz isso na própria linha", async () => {
    uso = {
      janela_em_dias: 30,
      capacidades: [{ name: "crm_search_contacts", ligada: true, total: 0, falhas: 0, sinal: "nunca_usada" }],
    };
    render(
      comProvedores(<ToolPicker value={["crm_search_contacts"]} onChange={() => undefined} agentId="ag-1" />),
    );
    fireEvent.click(await screen.findByTestId("abrir-pacote-atender"));
    await waitFor(() => expect(screen.getByTestId("uso-na-linha-crm_search_contacts")).toBeTruthy());
    expect(screen.getByTestId("uso-na-linha-crm_search_contacts").textContent).toContain(
      "Nunca usada nos últimos 30 dias",
    );
  });

  it("acima do recomendado: um ponto de atenção, e o botão leva à aba de uso", async () => {
    const muitas = Array.from({ length: TETO_RECOMENDADO_POR_AGENTE + 2 }, (_, i) => ({
      ...CAPACIDADE,
      id: `crm_cap_${i}`,
      rotulo: `Capacidade ${i}`,
    }));
    catalogo = muitas;
    const abrirAba = vi.fn();
    render(
      comProvedores(
        <ToolPicker value={muitas.map((c) => c.id)} onChange={() => undefined} />,
        abrirAba,
      ),
    );
    const botao = await screen.findByTestId("toggle-atencao");
    expect(botao.textContent).toContain("1 ponto de atenção");
    // Nasce fechada: quem abre a tela já sabe o que configurou.
    expect(screen.queryByTestId("lista-de-atencao")).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByTestId("atencao-acima").textContent).toContain(
      `${TETO_RECOMENDADO_POR_AGENTE + 2} capacidades, acima das ${TETO_RECOMENDADO_POR_AGENTE}`,
    );
    fireEvent.click(screen.getByTestId("abrir-uso-das-capacidades"));
    expect(abrirAba).toHaveBeenCalledWith("capacidades");
  });

  it("sem abas por perto (criação do agente), o botão para a aba de uso não aparece", async () => {
    const muitas = Array.from({ length: TETO_RECOMENDADO_POR_AGENTE + 1 }, (_, i) => ({ ...CAPACIDADE, id: `crm_cap_${i}` }));
    catalogo = muitas;
    render(comProvedores(<ToolPicker value={muitas.map((c) => c.id)} onChange={() => undefined} />));
    fireEvent.click(await screen.findByTestId("toggle-atencao"));
    expect(screen.getByTestId("atencao-acima")).toBeTruthy();
    expect(screen.queryByTestId("abrir-uso-das-capacidades")).toBeNull();
  });
});

describe("capacidade do harness (#326)", () => {
  it("continua travada longe do teto, e o clique não a liga — no pacote e na busca", async () => {
    // Antes da #326 esta caixa só ficava travada porque o cenário comum batia o
    // teto EXATO de 27: a lista avançada não olhava `marcavel`. Com o teto virando
    // aviso, ela destravou — e foi o e2e que pegou. Aqui o seletor está quase vazio.
    const HARNESS = {
      ...CAPACIDADE,
      id: "crm_send_whatsapp_message",
      rotulo: "Enviar mensagem no WhatsApp",
      risco: "critico",
      marcavel: false,
      motivo_nao_marcavel: "O sistema envia sozinho.",
    };
    catalogo = [CAPACIDADE, HARNESS];
    const aoMudar = vi.fn();
    render(comProvedores(<ToolPicker value={["crm_search_contacts"]} onChange={aoMudar} />));
    fireEvent.click(await screen.findByTestId("abrir-pacote-atender"));
    fireEvent.change(screen.getByTestId("busca-capacidade"), { target: { value: "whatsapp" } });
    const caixas = screen.getAllByRole("checkbox", { name: "Enviar mensagem no WhatsApp" }) as HTMLInputElement[];
    expect(caixas.length).toBeGreaterThan(0);
    for (const caixa of caixas) {
      expect(caixa.disabled).toBe(true);
      fireEvent.click(caixa);
    }
    expect(aoMudar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("busca-capacidade"), { target: { value: "" } });
    expect(screen.getByTestId("motivo-nao-marcavel-crm_send_whatsapp_message").textContent).toContain(
      "O sistema envia sozinho.",
    );
  });
});

/**
 * O MOTIVO DO "SALVAR RASCUNHO" DESABILITADO TEM DE ESTAR NA TELA.
 *
 * ─── O que o relato dizia ───────────────────────────────────────────────────
 *
 * Um agente publicado com mais capacidades do que o máximo (a versão tinha sido
 * gravada por fora da tela). O dono abriu o editor, ligou "Responder em áudio"
 * em "Jeito de responder", a barra passou a dizer "Alterações não salvas" — e
 * "Salvar rascunho" continuou apagado, sem uma palavra. O motivo existia, mas
 * só embaixo do seletor de capacidades, quatro partes abaixo de onde ele estava
 * mexendo. Para quem olha a barra, o botão simplesmente não funciona.
 *
 * É o mesmo defeito que o "Publicar" já teve (issue #951,
 * `motivo-do-publicar-fica-na-tela.test.tsx`): botão desabilitado que não diz
 * o que falta. Aqui é pior, porque o campo que reprova NÃO é o que a pessoa
 * acabou de mudar.
 *
 * ─── O que este teste cobra ─────────────────────────────────────────────────
 *
 *  1. com mudança por salvar e formulário inválido, a barra diz o motivo em
 *     TEXTO e nomeia a parte do formulário onde corrigir;
 *  2. o botão desabilitado aponta para o motivo (`aria-describedby`);
 *  3. "Ver onde corrigir" leva à parte do campo que reprova;
 *  4. sem mudança por salvar, a barra não acusa nada — o botão está apagado
 *     porque não há o que salvar, e dizer outra coisa seria ruído.
 *
 * O teste não fixa o NÚMERO do máximo de capacidades: ele usa uma quantidade
 * acima de qualquer teto e lê o motivo que o próprio campo mostra.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/a1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

const PROMPT = "# QUEM VOCÊ É\n\nVocê é a Júlia, atendente da Loja Aurora.";

const CREDENCIAIS = [
  { id: "11111111-1111-4111-8111-111111111111", provider: "anthropic", label: "chave", is_active: true },
];
const SESSOES = [{ id: "22222222-2222-4222-8222-222222222222", label: "WhatsApp", status: "WORKING" }];

const AGENTE = {
  id: "a1",
  organization_id: "org-1",
  name: "Atendente da Loja",
  description: null,
  model: "claude-sonnet-5",
  system_prompt: PROMPT,
  is_active: false,
  is_default: false,
  config: {},
  guardrails: [],
  active_kb_version_id: null,
  kind: "mcp_agent",
  published_version_id: "v5",
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** Acima de qualquer teto de capacidades que o produto já teve ou venha a ter. */
const CAPACIDADES_DEMAIS = Array.from({ length: 150 }, (_, i) => `capacidade_de_teste_${i}`);

function versaoPublicada(toolIds: string[]) {
  return {
    id: "v5",
    organization_id: "org-1",
    agent_id: "a1",
    version_number: 5,
    status: "published",
    system_prompt: PROMPT,
    provider: "anthropic",
    model: "claude-sonnet-5",
    credential_id: CREDENCIAIS[0]!.id,
    tool_ids: toolIds,
    channel_session_id: SESSOES[0]!.id,
    max_steps: 10,
    token_budget: 50000,
    cost_budget_cents: 50,
    history_message_window: 20,
    history_token_window: 8000,
    handoff_keywords: [],
    handoff_tool_enabled: true,
    cases_enabled: true,
    split_messages: false,
    split_max_chars: 600,
    followup: { enabled: false, flow_pointer_ids: [] },
    operator_enabled: false,
    operator_model: null,
    operator_tool_ids: [],
    pipeline_ids: [],
    trigger_config: null,
    published_at: "2026-01-01T00:00:00Z",
    superseded_at: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
  };
}

function renderizarEditor(toolIds: string[], locale?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const publicada = versaoPublicada(toolIds);
  const editor = (
    <QueryClientProvider client={qc}>
      <AgentForm
        mode="edit"
        agent={AGENTE as never}
        credentials={CREDENCIAIS as never}
        channelSessions={SESSOES as never}
        draft={null}
        published={publicada as never}
        base={publicada as never}
        draftObsoleto={null}
      />
    </QueryClientProvider>
  );
  render(locale ? <IdiomaProvider locale={locale}>{editor}</IdiomaProvider> : editor);
}

/** O gesto do relato: ligar "Responder em áudio quando o cliente mandar áudio". */
function ligarRespostaEmAudio() {
  fireEvent.click(screen.getByTestId("audio-reply-enabled"));
}

const rolar = vi.fn();

beforeEach(() => {
  rolar.mockClear();
  // O jsdom não implementa `scrollIntoView`; o "Ver onde corrigir" depende dele.
  Element.prototype.scrollIntoView = rolar;
});

describe("o motivo do Salvar rascunho bloqueado fica na tela", () => {
  it("com mudança por salvar e um campo inválido em outra parte, a barra diz o motivo e onde corrigir", () => {
    renderizarEditor(CAPACIDADES_DEMAIS);
    ligarRespostaEmAudio();

    const barra = within(screen.getByTestId("barra-de-salvar"));
    expect(barra.getByText("Alterações não salvas")).toBeVisible();
    const salvar = barra.getByRole("button", { name: "Salvar rascunho" });
    expect(salvar, "o caso do relato exige o Salvar rascunho desabilitado").toBeDisabled();

    const motivo = screen.getByTestId("motivo-do-salvar");
    expect(motivo).toBeVisible();
    // O motivo é o MESMO que o campo mostra embaixo do seletor de capacidades…
    expect(motivo.textContent).toMatch(/Máximo de \d+ capacidades por agente\./);
    // …e a barra nomeia a parte do formulário, porque ela não está à vista.
    expect(motivo.textContent).toContain("O que ele faz");
  });

  it("o botão desabilitado aponta para o motivo, para quem chega de teclado ou leitor de tela", () => {
    renderizarEditor(CAPACIDADES_DEMAIS);
    ligarRespostaEmAudio();

    const salvar = within(screen.getByTestId("barra-de-salvar")).getByRole("button", { name: "Salvar rascunho" });
    const alvo = salvar.getAttribute("aria-describedby");
    expect(alvo, "botão desabilitado sem nada que o descreva").toBeTruthy();
    expect(document.getElementById(alvo!)).toBe(screen.getByTestId("motivo-do-salvar"));
  });

  it('"Ver onde corrigir" leva à parte do formulário que tem o campo a corrigir', async () => {
    renderizarEditor(CAPACIDADES_DEMAIS);
    ligarRespostaEmAudio();

    fireEvent.click(within(screen.getByTestId("barra-de-salvar")).getByRole("button", { name: "Ver onde corrigir" }));

    await waitFor(() => expect(rolar).toHaveBeenCalled());
    expect(rolar.mock.contexts.at(-1)).toBe(document.getElementById("secao-capacidades"));
  });

  it("sem mudança por salvar, a barra não acusa nada", () => {
    renderizarEditor(CAPACIDADES_DEMAIS);
    expect(within(screen.getByTestId("barra-de-salvar")).getByText("Tudo salvo")).toBeVisible();
    expect(screen.queryByTestId("motivo-do-salvar")).toBeNull();
  });

  it("com o formulário válido, mexer num campo libera o Salvar rascunho e não mostra motivo", () => {
    renderizarEditor([]);
    ligarRespostaEmAudio();

    const salvar = within(screen.getByTestId("barra-de-salvar")).getByRole("button", { name: "Salvar rascunho" });
    expect(salvar).toBeEnabled();
    expect(screen.queryByTestId("motivo-do-salvar")).toBeNull();
  });

  it("em espanhol, o motivo sai traduzido", () => {
    renderizarEditor(CAPACIDADES_DEMAIS, "es");
    fireEvent.click(screen.getByTestId("audio-reply-enabled"));

    const motivo = screen.getByTestId("motivo-do-salvar");
    expect(motivo.textContent).toContain("Para guardar, corrige en");
    expect(motivo.textContent).not.toContain("Para salvar");
  });
});

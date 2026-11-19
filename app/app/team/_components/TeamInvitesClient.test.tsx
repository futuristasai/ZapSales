/**
 * A LISTA DE CONVITES NÃO APARECE ANTES DA LISTA DE MEMBROS, QUE FICA ACIMA DELA.
 *
 * ═══ O defeito (medido no CI em 19/11/2026, run 44552910124) ════════════════
 *
 * Na aba Membros de /app/team as duas listas carregam por requisições
 * separadas, e cada uma mostra «Carregando…» (uma linha) até chegar. Quando a de
 * CONVITES chegava primeiro, ela se desenhava logo abaixo de uma linha só; a de
 * MEMBROS chegava em seguida, crescia para a altura de uma tabela inteira e
 * empurrava os convites para baixo.
 *
 * Quem abrisse o menu «Ações» de um convite nesse intervalo via o menu sumir: o
 * botão descia para fora da tela e o menu ia junto, com a rolagem travada pelo
 * próprio menu aberto. Foi o que travou por 180 s o caso «admin revoga» de
 * `tests/e2e/invite-lifecycle.spec.ts` — o rastro traz o menu posicionado em
 * `translate(1095px, 725px)` numa janela de 720 px de altura, e 347 vezes
 * "element is outside of the viewport".
 *
 * O conserto é de ordem: os convites esperam os membros. O que este arquivo
 * cobra é exatamente essa ordem, com as duas chegadas controladas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { TeamInvite } from "@/hooks/team/useTeamInvites";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { apiClient } from "@/lib/api/client";
import { TeamInvitesClient } from "./TeamInvitesClient";

function convite(): TeamInvite {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    email: "convidada@example.com",
    role: "agent",
    interface_settings: { preset: "completa" } as TeamInvite["interface_settings"],
    invited_by: null,
    inviter_name: "Admin",
    email_dispatched: false,
    created_at: "2026-11-19T12:00:00Z",
    last_sent_at: "2026-11-19T12:00:00Z",
    resend_count: 0,
    expires_at: "2026-11-26T12:00:00Z",
    accepted_at: null,
    revoked_at: null,
    status: "pendente",
    accept_url: "https://example.com/team/accept-invite/abc",
  };
}

function membro(): TeamMember {
  return {
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "admin",
    invited_at: null,
    accepted_at: "2026-01-01T00:00:00Z",
    revoked_at: null,
    created_at: "2026-01-01T00:00:00Z",
    email: "admin@example.com",
    full_name: "Admin",
    last_sign_in_at: null,
  };
}

/** Uma resposta que o teste solta quando quiser. */
function adiada<T>(): { promessa: Promise<T>; soltar: (valor: T) => void; falhar: (erro: unknown) => void } {
  let soltar!: (valor: T) => void;
  let falhar!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolve, reject) => {
    soltar = resolve;
    falhar = reject;
  });
  return { promessa, soltar, falhar };
}

function renderizar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TeamInvitesClient canManage />
    </QueryClientProvider>,
  );
}

/** Liga cada rota à resposta do caso: convites e membros chegam quando o teste mandar. */
function rotas(respostas: { convites: Promise<unknown>; membros: Promise<unknown> }) {
  vi.mocked(apiClient.get).mockImplementation(((caminho: string) => {
    if (caminho === "/api/v1/team/invites") return respostas.convites;
    if (caminho === "/api/v1/team") return respostas.membros;
    return Promise.reject(new Error(`rota inesperada no teste: ${caminho}`));
  }) as typeof apiClient.get);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamInvitesClient — a lista não se desenha antes da de membros", () => {
  it("convites chegaram e membros ainda não: segue em «Carregando…», sem tabela", async () => {
    const membros = adiada<{ data: TeamMember[] }>();
    rotas({ convites: Promise.resolve({ data: [convite()] }), membros: membros.promessa });
    renderizar();

    // Dá ao React Query a chance de entregar os convites: sem a espera, o caso
    // passaria por ainda estar no primeiro quadro, e não por causa da regra.
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/api/v1/team/invites"));
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(screen.queryByText("convidada@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("quando os membros chegam, os convites aparecem", async () => {
    const membros = adiada<{ data: TeamMember[] }>();
    rotas({ convites: Promise.resolve({ data: [convite()] }), membros: membros.promessa });
    renderizar();
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/api/v1/team/invites"));
    expect(screen.queryByText("convidada@example.com")).not.toBeInTheDocument();

    membros.soltar({ data: [membro()] });

    expect(await screen.findByText("convidada@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
  });

  it("membros primeiro, convites depois: nada a esperar além dos próprios convites", async () => {
    const convites = adiada<{ data: TeamInvite[] }>();
    rotas({ convites: convites.promessa, membros: Promise.resolve({ data: [membro()] }) });
    renderizar();
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/api/v1/team"));
    expect(screen.getByText("Carregando…")).toBeInTheDocument();

    convites.soltar({ data: [convite()] });

    expect(await screen.findByText("convidada@example.com")).toBeInTheDocument();
  });

  it("a lista de membros FALHOU: os convites não ficam presos em «Carregando…»", async () => {
    // A espera é pela lista de cima parar de mudar de altura. Falha também é
    // parar: prender os convites aqui esconderia a lista que funcionou.
    const membros = adiada<{ data: TeamMember[] }>();
    rotas({ convites: Promise.resolve({ data: [convite()] }), membros: membros.promessa });
    renderizar();
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith("/api/v1/team"));

    membros.falhar(new Error("falha de rede"));

    expect(await screen.findByText("convidada@example.com")).toBeInTheDocument();
  });

  it("os membros são lidos do MESMO cache da lista de cima — nenhuma requisição a mais", async () => {
    rotas({ convites: Promise.resolve({ data: [convite()] }), membros: Promise.resolve({ data: [membro()] }) });
    renderizar();
    expect(await screen.findByText("convidada@example.com")).toBeInTheDocument();

    const chamadasDeMembros = vi.mocked(apiClient.get).mock.calls.filter(([c]) => c === "/api/v1/team");
    expect(chamadasDeMembros, "a lista de convites pede os membros pela mesma chave da lista de membros").toHaveLength(1);
  });
});

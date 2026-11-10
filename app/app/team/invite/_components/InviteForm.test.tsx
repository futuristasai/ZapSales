/**
 * A TELA DE CONVITE NÃO MENTE SOBRE O E-MAIL (#246).
 *
 * Convidar pessoas deixou de ser um passo do onboarding e virou só esta tela. O
 * passo antigo era honesto numa instalação sem serviço de e-mail (o estado normal
 * de um primeiro deploy): avisava que nada saiu e dava o link para copiar. Esta
 * tela dizia "convite(s) enviado(s)" mesmo quando nada saía, citava "Resend" e
 * "(DEV)" e não tinha botão de copiar — quem a usava esperava um e-mail que nunca
 * chegaria. Como agora ela é o único caminho, ela tem de ter a mesma honestidade.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync, toastWarning, toastSuccess, copiar } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastWarning: vi.fn((_mensagem: string) => {}),
  toastSuccess: vi.fn((_mensagem: string) => {}),
  copiar: vi.fn(async () => true),
}));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/team/useInviteMembers", () => ({
  useInviteMembers: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/components/team/InterfaceEditor", () => ({ InterfaceEditor: () => null }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copiar }));
vi.mock("sonner", () => ({
  toast: { warning: toastWarning, success: toastSuccess, error: vi.fn() },
}));

import { InviteForm } from "./InviteForm";

const LINK = "https://crm.exemplo.com/team/accept-invite/eyJhbGciOi";

async function convidar(resposta: unknown) {
  mutateAsync.mockResolvedValueOnce({ data: resposta });
  render(<InviteForm />);
  fireEvent.change(screen.getByLabelText("Emails"), { target: { value: "ana@empresa.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar convites" }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
}

describe("convite sem serviço de e-mail", () => {
  beforeEach(() => vi.clearAllMocks());

  const SEM_EMAIL = {
    sent: [
      {
        email: "ana@empresa.com",
        invite_id: "i1",
        expires_at: "2026-12-01T00:00:00Z",
        email_dispatched: false,
        accept_url: LINK,
      },
    ],
    failed: [],
  };

  it("avisa que o e-mail NÃO saiu — não diz que foi enviado", async () => {
    await convidar(SEM_EMAIL);

    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    expect(String(toastWarning.mock.calls[0]?.[0])).toContain("não puderam ser enviados por email");
    expect(toastSuccess, "disse 'enviado' sem ter enviado").not.toHaveBeenCalled();
    expect(await screen.findByText("O e-mail não saiu. Copie o link e envie você mesmo.")).toBeTruthy();
    expect(screen.queryByText("Email enviado.")).toBeNull();
  });

  it("não usa jargão de desenvolvedor na frente do dono do negócio", async () => {
    await convidar(SEM_EMAIL);
    await screen.findByText(LINK);

    const tela = document.body.textContent ?? "";
    expect(tela).not.toMatch(/\(DEV\)/);
    expect(tela).not.toMatch(/Resend/);
  });

  it("mostra o link de cada pessoa e um botão que o copia", async () => {
    await convidar(SEM_EMAIL);

    expect(await screen.findByText(LINK)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() => expect(copiar).toHaveBeenCalledWith(LINK));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link copiado."));
  });
});

describe("convite com serviço de e-mail funcionando", () => {
  beforeEach(() => vi.clearAllMocks());

  it("diz que enviou, sem pedir para copiar link", async () => {
    await convidar({
      sent: [
        {
          email: "ana@empresa.com",
          invite_id: "i1",
          expires_at: "2026-12-01T00:00:00Z",
          email_dispatched: true,
          accept_url: LINK,
        },
      ],
      failed: [],
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(String(toastSuccess.mock.calls[0]?.[0])).toContain("convite(s) enviado(s)");
    expect(toastWarning).not.toHaveBeenCalled();
    expect(await screen.findByText("Email enviado.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar link" })).toBeNull();
  });
});

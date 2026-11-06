import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LicencaBanner } from "@/components/app/LicencaBanner";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import type { AuthUser, Role } from "@/lib/auth/types";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import type { EstadoDaLicenca } from "@/lib/licenca/decidir";
import type { SituacaoDaLicenca } from "@/lib/licenca/situacao";

/**
 * A FAIXA DA LICENÇA — quem vê o quê, e o que ela diz em cada estado.
 *
 * A regra (contrato, seção 2): estado em que a instalação OPERA só aparece para quem administra, em linha
 * discreta (`status`, nunca `alert`); estado em que NÃO opera aparece para TODOS, em `alert`; o permanente não
 * mostra nada. E o texto da faixa é o mesmo da página, porque os dois vêm de `lib/licenca/textos.ts`.
 */

vi.mock("@/lib/supabase/browser", () => ({
  resetRealtimeAuthentication: vi.fn(),
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}));

const usuario: AuthUser = {
  id: "u",
  email: "u@example.test",
  full_name: null,
  avatar_url: null,
  organizations: [{ organization_id: "org", organization_name: "Org", role: "admin" }],
  idioma: "pt-BR",
  is_platform_admin: false,
};

function faixa(
  situacao: SituacaoDaLicenca | null,
  papel: Role = "admin",
  locale: "pt-BR" | "es" | "en" = "pt-BR",
  quem: AuthUser = usuario,
) {
  return (
    <AuthProvider user={quem} activeOrg={{ orgId: "org", name: "Org", role: papel }}>
      <IdiomaProvider locale={locale}>
        <LicencaBanner situacao={situacao} />
      </IdiomaProvider>
    </AuthProvider>
  );
}

const sit = (
  estado: EstadoDaLicenca,
  mudancas: Partial<SituacaoDaLicenca> = {},
): SituacaoDaLicenca => ({
  estado,
  opera: !["temporario_vencido", "bloqueada"].includes(estado),
  mensagem: null,
  diasRestantes: null,
  modo: "sombra",
  ...mudancas,
});

describe("estados em que a instalação opera: só para quem administra, sem alarde", () => {
  it.each([
    ["sem_selo", "Uso não comercial: uso em empresa exige licença."],
    ["ativacao_pendente", "Ativação da licença pendente."],
  ] as const)("%s mostra a frase do contrato ao administrador, em `status`", (estado, frase) => {
    render(faixa(sit(estado)));
    const barra = screen.getByRole("status");
    expect(barra).toHaveTextContent(frase);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ver licença" })).toHaveAttribute(
      "href",
      "/app/licenca",
    );
  });

  it.each([
    [10, "Licença temporária, faltam 10 dias."],
    [2, "Licença temporária, faltam 2 dias."],
    [1, "Licença temporária, falta 1 dia."],
    [0, "Licença temporária, termina hoje."],
    [null, "Licença temporária."],
  ])("temporária com %s dia(s): «%s»", (dias, frase) => {
    render(faixa(sit("temporario_valido", { diasRestantes: dias })));
    expect(screen.getByRole("status")).toHaveTextContent(frase);
  });

  it.each(["agent", "manager", "viewer"] as const)(
    "%s (quem não administra) não vê a faixa de aviso: não tem o que fazer com ela",
    (papel) => {
      render(faixa(sit("sem_selo"), papel));
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("o dono da plataforma (fora do suporte) vê, mesmo sem papel de administrador na empresa", () => {
    render(faixa(sit("sem_selo"), "agent", "pt-BR", { ...usuario, is_platform_admin: true }));
    expect(screen.getByRole("status")).toBeVisible();
  });
});

describe("estados em que a instalação NÃO opera: para todos, em `alert`", () => {
  it.each(["admin", "manager", "agent", "viewer"] as const)(
    "%s vê «Licença bloqueada.»",
    (papel) => {
      render(faixa(sit("bloqueada"), papel));
      expect(screen.getByRole("alert")).toHaveTextContent("Licença bloqueada.");
    },
  );

  it("autorização vencida diz que foi falta de contato — não bloqueio", () => {
    render(faixa(sit("temporario_vencido"), "agent"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Autorização vencida por falta de contato com o servidor de licenças.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/bloquead/i);
  });

  it("em modo de observação (sombra) a faixa diz que o sistema segue funcionando", () => {
    render(faixa(sit("bloqueada", { modo: "sombra" })));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O sistema segue funcionando por enquanto.",
    );
  });

  it("com a licença em vigor (valendo) NÃO promete que segue funcionando", () => {
    render(faixa(sit("bloqueada", { modo: "valendo" })));
    expect(screen.getByRole("alert")).not.toHaveTextContent("segue funcionando");
  });
});

describe("onde não há o que dizer, não há faixa", () => {
  it("permanente: nenhuma faixa, para ninguém", () => {
    render(faixa(sit("permanente_valido")));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("situação ilegível (null): nenhuma faixa — nunca um 'bloqueada' inventado por falha de leitura", () => {
    render(faixa(null));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("idiomas", () => {
  it("espanhol e inglês: a frase do contrato e o link", () => {
    const { unmount } = render(faixa(sit("sem_selo"), "admin", "es"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Uso no comercial: el uso en una empresa exige licencia.",
    );
    expect(screen.getByRole("link", { name: "Ver licencia" })).toBeVisible();
    unmount();
    render(faixa(sit("sem_selo"), "admin", "en"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Non-commercial use: using it in a company requires a license.",
    );
    expect(screen.getByRole("link", { name: "View license" })).toBeVisible();
  });

  it("nenhuma frase da faixa nomeia o produto (marca própria)", () => {
    const estados: EstadoDaLicenca[] = [
      "sem_selo",
      "ativacao_pendente",
      "temporario_valido",
      "temporario_vencido",
      "bloqueada",
    ];
    for (const estado of estados) {
      const { container, unmount } = render(faixa(sit(estado, { diasRestantes: 3 })));
      expect(container.textContent?.toLowerCase()).not.toContain("zapsales");
      unmount();
    }
  });
});

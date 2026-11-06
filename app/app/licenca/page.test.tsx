import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalhesDaLicenca } from "@/lib/licenca/situacao";

/**
 * A PÁGINA DE LICENÇA — o que cada papel vê em cada estado.
 *
 * Qualquer pessoa logada vê a SITUAÇÃO; os detalhes (datas, motivo, identificador) e o botão são de quem
 * administra. A página lê a MESMA decisão da faixa (`detalhesDaLicenca`) e as MESMAS frases (`textos.ts`).
 */

const cena = vi.hoisted(() => ({
  papel: "admin" as "admin" | "agent",
  platformAdmin: false,
  suporte: "",
  detalhes: null as unknown,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({
    id: "u",
    idioma: "pt-BR",
    timezone: "America/Sao_Paulo",
    is_platform_admin: cena.platformAdmin,
    support: null,
    organizations: [],
  }),
  resolveActiveOrg: async () => ({ orgId: "org", name: "Org", role: cena.papel }),
}));
vi.mock("@/lib/branding/saida", () => ({ emailDeSuporte: async () => cena.suporte }));
vi.mock("@/lib/licenca/situacao", () => ({ detalhesDaLicenca: async () => cena.detalhes }));
vi.mock("@/lib/supabase/browser", () => ({
  resetRealtimeAuthentication: vi.fn(),
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}));

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

import LicencaPage from "./page";

const ID = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const detalhes = (mudancas: Partial<DetalhesDaLicenca> = {}): DetalhesDaLicenca => ({
  estado: "temporario_valido",
  opera: true,
  mensagem: "temporaria_faltam_dias",
  diasRestantes: 4,
  modo: "sombra",
  instalacaoId: ID,
  ativada: true,
  ultimaConsultaOkEm: "2027-01-15T11:00:00.000Z",
  janelaTerminaEm: "2027-01-19T11:00:00.000Z",
  proximaConsultaEm: "2027-01-15T12:00:00.000Z",
  bloqueioCodigo: null,
  relogioRecuou: false,
  ...mudancas,
});

async function abrir() {
  render(<IdiomaProvider locale="pt-BR">{await LicencaPage()}</IdiomaProvider>);
}

beforeEach(() => {
  cena.papel = "admin";
  cena.platformAdmin = false;
  cena.suporte = "";
  cena.detalhes = detalhes();
});

describe("administrador", () => {
  it("vê a situação, os detalhes e o botão de renovar", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Licença temporária" })).toBeVisible();
    expect(screen.getByText("Licença temporária, faltam 4 dias.")).toBeVisible();
    expect(screen.getByText(ID)).toBeVisible();
    expect(screen.getByRole("button", { name: "Tentar renovar agora" })).toBeVisible();
    expect(screen.getByText(/nada é restringido/)).toBeVisible();
  });

  it("as datas saem no fuso de quem lê, não em UTC cru", async () => {
    await abrir();
    // 11:00 UTC em America/Sao_Paulo (UTC-3) é 08:00.
    expect(screen.getAllByText(/08:00/).length).toBeGreaterThan(0);
  });

  it("licença permanente: sem botão (não há o que renovar) e sem próxima consulta", async () => {
    cena.detalhes = detalhes({
      estado: "permanente_valido",
      diasRestantes: null,
      proximaConsultaEm: null,
    });
    await abrir();
    expect(screen.getByRole("heading", { name: "Licença permanente" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tentar renovar agora" })).toBeNull();
    expect(screen.getByText("Não precisa")).toBeVisible();
  });

  it("bloqueada: diz que os dados estão preservados, oferece a exportação e mostra o motivo registrado", async () => {
    cena.suporte = "ajuda@revenda.test";
    cena.detalhes = detalhes({
      estado: "bloqueada",
      opera: false,
      diasRestantes: null,
      bloqueioCodigo: "reembolso",
    });
    await abrir();
    expect(screen.getByRole("heading", { name: "Licença bloqueada" })).toBeVisible();
    expect(screen.getByText("Os seus dados estão preservados.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Exportar os dados" })).toHaveAttribute(
      "href",
      "/app/lgpd",
    );
    expect(screen.getByTestId("licenca-motivo")).toHaveTextContent("reembolso");
    expect(screen.getByRole("link", { name: "ajuda@revenda.test" })).toHaveAttribute(
      "href",
      "mailto:ajuda@revenda.test",
    );
  });

  it("autorização vencida: explica que NÃO é bloqueio e que renovar resolve", async () => {
    cena.detalhes = detalhes({ estado: "temporario_vencido", opera: false, diasRestantes: null });
    await abrir();
    expect(screen.getByRole("heading", { name: "Autorização vencida" })).toBeVisible();
    expect(screen.getByText(/Isto não é um bloqueio/)).toBeVisible();
  });

  it("relógio atrasado: avisa para acertar o relógio da VPS", async () => {
    cena.detalhes = detalhes({ relogioRecuou: true });
    await abrir();
    expect(screen.getByText(/relógio desta VPS está atrasado/)).toBeVisible();
  });

  it("modo valendo: diz que a instalação sem licença válida deixa de funcionar", async () => {
    cena.detalhes = detalhes({ modo: "valendo" });
    await abrir();
    expect(screen.getByText(/deixa de funcionar/)).toBeVisible();
  });
});

describe("quem não administra", () => {
  it("vê a situação e é encaminhado ao administrador — sem detalhes, sem identificador, sem botão", async () => {
    cena.papel = "agent";
    cena.detalhes = detalhes({ estado: "bloqueada", opera: false, bloqueioCodigo: "reembolso" });
    await abrir();
    expect(screen.getByRole("heading", { name: "Licença bloqueada" })).toBeVisible();
    expect(screen.getByText(/são do administrador da empresa/)).toBeVisible();
    expect(screen.queryByText(ID)).toBeNull();
    expect(screen.queryByTestId("licenca-motivo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar renovar agora" })).toBeNull();
  });

  it("o dono da plataforma (fora do suporte) vê os detalhes mesmo sem papel de administrador", async () => {
    cena.papel = "agent";
    cena.platformAdmin = true;
    await abrir();
    expect(screen.getByText(ID)).toBeVisible();
    expect(screen.getByRole("button", { name: "Tentar renovar agora" })).toBeVisible();
  });
});

describe("quando não dá para ler", () => {
  it("diz que não conseguiu ler e que isso não bloqueia nada — sem inventar um estado", async () => {
    cena.detalhes = null;
    await abrir();
    expect(screen.getByText(/Isso não bloqueia nada/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tentar renovar agora" })).toBeNull();
  });
});

describe("marca própria", () => {
  it.each([
    "sem_selo",
    "temporario_valido",
    "permanente_valido",
    "temporario_vencido",
    "bloqueada",
  ] as const)("%s: nenhum texto nomeia o produto", async (estado) => {
    cena.detalhes = detalhes({
      estado,
      opera: !["temporario_vencido", "bloqueada"].includes(estado),
    });
    await abrir();
    const tudo =
      within(document.body).getByText(/./, { selector: "h1" }).closest("div")!.textContent ?? "";
    expect(tudo.toLowerCase()).not.toContain(["zap", "sales"].join(""));
  });
});

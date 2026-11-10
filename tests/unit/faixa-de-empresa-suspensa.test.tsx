/**
 * A faixa de uma empresa suspensa mostra o motivo gravado na suspensão (#177).
 *
 * A tela chamava `<SuspendedBanner suspendedAt={…} />` sem a prop `reason` (e a rota nem
 * lia a coluna), então a faixa dizia "Sem razão registrada." SEMPRE — e o teste do
 * componente passava `reason` direto, por isso ficava verde sem pegar o defeito. Este
 * renderiza a TELA (`TenantOverviewClient`), com o hook devolvendo o corpo que a rota devolve.
 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import type { TenantOrganization } from "@/hooks/useTenantDetail";

const h = vi.hoisted(() => ({ organization: null as unknown }));

vi.mock("@/hooks/useTenantDetail", () => ({
  useTenantDetail: () => ({
    isLoading: false,
    isError: false,
    data: { data: { organization: h.organization, counts: {} } },
  }),
}));
// O miolo da tela não importa aqui: só a faixa.
vi.mock("@/components/admin/tenants/TenantOverview", () => ({ TenantOverview: () => null }));
vi.mock("@/components/admin/tenants/TenantActions", () => ({ TenantActions: () => null }));

import { TenantOverviewClient } from "@/app/admin/(protected)/tenants/[id]/_client";

const SUSPENSA: TenantOrganization = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "org",
  display_name: "Org",
  legal_name: null,
  cnpj: null,
  status: "suspended",
  onboarded_at: "2026-01-01T00:00:00Z",
  suspended_at: "2026-11-01T00:00:00Z",
  suspended_reason: "Fatura vencida há 40 dias",
  created_at: "2026-01-01T00:00:00Z",
  settings: {},
};

function tela(): string {
  render(
    <IdiomaProvider locale="pt-BR">
      <TenantOverviewClient id={SUSPENSA.id} />
    </IdiomaProvider>,
  );
  return screen.getByRole("region").textContent ?? "";
}

beforeEach(() => {
  h.organization = SUSPENSA;
});
afterEach(cleanup);

describe("faixa de empresa suspensa, na tela do tenant", () => {
  it("mostra o motivo gravado na suspensão", () => {
    const texto = tela();
    expect(texto).toContain("Fatura vencida há 40 dias");
    expect(texto).not.toContain("Sem razão registrada");
  });

  it("sem motivo gravado, a frase 'Sem razão registrada.' continua correta", () => {
    h.organization = { ...SUSPENSA, suspended_reason: null };
    expect(tela()).toContain("Sem razão registrada.");
  });

  it("motivo só com espaços conta como sem motivo", () => {
    h.organization = { ...SUSPENSA, suspended_reason: "   " };
    expect(tela()).toContain("Sem razão registrada.");
  });
});

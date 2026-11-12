import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A CONFIGURAÇÃO INICIAL É DE QUEM ADMINISTRA A ORGANIZAÇÃO (#273).
 *
 * As ações do onboarding gravam com o cliente de serviço e mexem no que define
 * a empresa. A base delas (`requireOnboardingCtx`) só conferia "é membro?": a
 * tela some para quem não é admin, mas a ação por trás dela é endereçável por
 * qualquer sessão.
 *
 * Três coisas são fixadas aqui:
 *   1. a base recusa todo papel abaixo de admin, pelos dois caminhos (a
 *      organização da aba e a organização ativa);
 *   2. TODA função exportada de um arquivo de ação do onboarding passa pela
 *      base — uma ação nova que esqueça disso reprova aqui;
 *   3. quem não é admin tem para onde ir: a tela de espera, sem laço.
 */
const ORG = "0a000000-0000-4000-8000-000000000001";
const USER = "0a000000-0000-4000-8000-0000000000aa";

const mundo = vi.hoisted(() => ({
  papel: "admin",
  support: null as unknown,
  redirects: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    mundo.redirects.push(destino);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("a base não pode tocar o banco antes de decidir quem é");
  },
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({
    id: USER,
    email: "pessoa@qa.local",
    full_name: "Pessoa",
    support: mundo.support,
    organizations: [
      { organization_id: ORG, organization_name: "Org", role: mundo.papel, org_status: "active" },
    ],
  })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, name: "Org", role: mundo.papel })),
}));

import { OnboardingError, requireOnboardingCtx } from "@/app/actions/onboarding/_shared";

async function tentar(orgIdDaAba?: string): Promise<string> {
  try {
    const ctx = await requireOnboardingCtx(orgIdDaAba);
    return `passou:${ctx.role}`;
  } catch (err) {
    return err instanceof OnboardingError ? err.code : `outro:${(err as Error).message}`;
  }
}

beforeEach(() => {
  mundo.papel = "admin";
  mundo.support = null;
  mundo.redirects = [];
});

describe("requireOnboardingCtx", () => {
  it.each(["viewer", "agent", "manager"])("⭐ %s é recusado pela organização ATIVA", async (papel) => {
    mundo.papel = papel;
    expect(await tentar()).toBe("forbidden");
  });

  it.each(["viewer", "agent", "manager"])("⭐ %s é recusado pela organização DA ABA", async (papel) => {
    mundo.papel = papel;
    expect(await tentar(ORG)).toBe("forbidden");
  });

  it("papel que não existe é recusado (a régua falha fechada)", async () => {
    mundo.papel = "dono-de-tudo";
    expect(await tentar()).toBe("forbidden");
    expect(await tentar(ORG)).toBe("forbidden");
  });

  it("CONTROLE: admin passa pelos dois caminhos", async () => {
    expect(await tentar()).toBe("passou:admin");
    expect(await tentar(ORG)).toBe("passou:admin");
  });

  it("admin com a organização da aba que não é vínculo dele continua recusado", async () => {
    expect(await tentar("0a000000-0000-4000-8000-0000000000ff")).toBe("forbidden");
  });
});

describe("toda ação do onboarding passa pela base", () => {
  const PASTA = "app/actions/onboarding";
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".ts") && f !== "_shared.ts");

  it("a sonda enxerga os arquivos de ação (controle de vacuidade)", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(6);
    for (const f of arquivos) {
      expect(readFileSync(join(PASTA, f), "utf8").startsWith('"use server"'), f).toBe(true);
    }
  });

  it.each(arquivos)("%s: cada função exportada chama requireOnboardingCtx", (arquivo) => {
    const fonte = readFileSync(join(PASTA, arquivo), "utf8");
    const inicios = [...fonte.matchAll(/^export async function (\w+)\(/gm)];
    expect(inicios.length, "arquivo de ação sem função exportada").toBeGreaterThan(0);
    for (const [i, m] of inicios.entries()) {
      const fim = inicios[i + 1]?.index ?? fonte.length;
      const corpo = fonte.slice(m.index!, fim);
      expect(corpo, `${arquivo} › ${m[1]} é endereçável sem conferir quem chama`).toMatch(
        /await requireOnboardingCtx\(/,
      );
    }
  });

  it("nenhuma ação recebe a organização por argumento", () => {
    // A organização vem da sessão (ou do id da aba, VALIDADO contra os vínculos).
    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(PASTA, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/^export async function \w+\(\s*orgId\b/m);
      expect(fonte, arquivo).not.toMatch(/^export async function \w+\(\s*organizationId\b/m);
    }
  });
});

describe("quem não é admin tem para onde ir, sem laço", () => {
  const layout = readFileSync("app/onboarding/layout.tsx", "utf8");
  const espera = readFileSync("app/aguardando-administrador/page.tsx", "utf8");

  it("o layout do onboarding manda quem não administra para a tela de espera", () => {
    expect(layout).toMatch(
      /if \(!roleAtLeast\(activeOrg\.role, "admin"\)\) redirect\("\/aguardando-administrador"\);/,
    );
    // …depois de saber que a organização ainda NÃO foi configurada: a
    // configurada vai para o app, seja qual for o papel.
    expect(layout.indexOf('if (onboardedAt) redirect("/app/inbox");')).toBeLessThan(
      layout.indexOf('redirect("/aguardando-administrador")'),
    );
  });

  it("a tela de espera não fica dentro de nenhum dos dois layouts que mandam para ela", () => {
    // `app/app/**` → o layout de /app devolveria para /onboarding; `app/onboarding/**`
    // → o próprio layout devolveria para cá. O caminho acima já prova que não está.
    expect(espera).toMatch(/export default async function AguardandoAdministradorPage/);
  });

  it("cada saída da tela de espera leva a um lugar que não devolve para ela", () => {
    expect(espera).toMatch(/if \(!ativa\) redirect\("\/get-started"\);/);
    expect(espera).toMatch(/if \(onboardedAt\) redirect\("\/app\/inbox"\);/);
    expect(espera).toMatch(/if \(roleAtLeast\(ativa\.role, "admin"\)\) redirect\("\/onboarding"\);/);
  });

  it("a tela de espera encerra a sessão por formulário, não por link", () => {
    expect(espera).toMatch(/<form action=\{signOut\}>/);
  });
});

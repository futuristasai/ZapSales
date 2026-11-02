import { describe, expect, it } from "vitest";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import {
  destinosDaInterface,
  homeDaInterface,
  interfaceSettingsSchema,
  interfaceTemDestino,
  lerInterface,
} from "@/lib/navigation/interface";
import { buscaveis, gruposDoBloco, itensDoMenu, menuDoPapel, secoesDaPaginaDeArea } from "@/lib/navigation/menu";
import { signInviteToken, verifyInviteToken } from "@/lib/auth/invite-token";
const complete = { preset: "completa" } as const;
const simplified = { preset: "simplificada" } as const;
const granular = { preset: "completa", destinos: ["/app/products"] } as const;
const hrefs = (settings: unknown, role: "agent" | "admin" = "admin", platform = false) =>
  destinosDaInterface(settings, platform, role).map((d) => d.href);
describe("interface por vínculo é apresentação", () => {
  it("legado completa acompanha catálogo e não duplica IDs", () => {
    expect(hrefs(null)).toEqual(NAV_CATALOG.map((d) => d.href));
    expect(new Set(NAV_CATALOG.map((d) => d.href)).size).toBe(NAV_CATALOG.length);
  });
  it("simplificada tem operação e Conexões somente quando papel permite", () => {
    expect(hrefs(simplified)).toContain("/app/connections");
    expect(hrefs(simplified, "agent")).not.toContain("/app/connections");
    expect(hrefs(simplified)).not.toContain("/app/ai/credentials");
    expect(hrefs(simplified)).toEqual(
      expect.arrayContaining([
        "/app/inbox",
        "/app/agenda",
        "/app/contacts",
        "/app/kanban",
        "/app/tasks",
      ]),
    );
  });
  it("admin plataforma também respeita seleção; completa não promove atendente", () => {
    expect(hrefs(simplified, "admin", true)).not.toContain("/app/ai/credentials");
    expect(hrefs(complete, "agent")).not.toContain("/app/settings/tenant");
  });
  it("granular com uma só tela tem porta, home e busca úteis, sem grupos vazios", () => {
    const settings = interfaceSettingsSchema.parse(granular);
    const { blocos } = menuDoPapel(false, "admin", settings);
    expect(itensDoMenu(blocos).map((d) => d.href)).toContain("/app/products");
    // Bloco, área e grupo que ficaram sem tela não aparecem: o menu não desenha título órfão.
    expect(blocos.flatMap(gruposDoBloco).filter((g) => g.itens.length === 0)).toEqual([]);
    expect(
      secoesDaPaginaDeArea("/app/crm", false, "admin", settings)
        .flatMap((g) => g.itens)
        .map((d) => d.href),
    ).toEqual(["/app/products"]);
    expect(buscaveis(false, "admin", settings).map((d) => d.href)).toContain("/app/products");
    expect(homeDaInterface(settings, false, "admin")).toBe("/app/products");
    expect(hrefs(settings)).toEqual(
      expect.arrayContaining(["/app/team", "/app/settings/profile", "/app/settings/security"]),
    );
  });
  it("escrita recusa arbitrário/vazio; leitura remove obsoleto e degrada sem lançar", () => {
    expect(
      interfaceSettingsSchema.safeParse({ preset: "completa", destinos: ["https://evil.test"] })
        .success,
    ).toBe(false);
    expect(interfaceSettingsSchema.safeParse({ preset: "completa", destinos: [] }).success).toBe(
      false,
    );
    expect(lerInterface({ preset: "simplificada", destinos: ["/removed", "/app/tasks"] })).toEqual({
      settings: { preset: "simplificada", destinos: ["/app/tasks"] },
      needsAdjustment: true,
    });
    expect(lerInterface({ preset: "simplificada", destinos: ["/removed"] }).settings).toEqual(
      complete,
    );
    expect(
      interfaceTemDestino({ preset: "completa", destinos: ["/app/ai/credentials"] }, "agent"),
    ).toBe(false);
  });
  it("token novo preserva escolha, token antigo omite e usa default na leitura", () => {
    const payload = {
      invite_id: "f2210000-0000-4000-8000-000000000001",
      email: "guest@local.test",
      organization_id: "f2210000-0000-4000-8000-000000000002",
      role: "agent",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    expect(
      verifyInviteToken(signInviteToken({ ...payload, interface_settings: simplified }))
        ?.interface_settings,
    ).toEqual(simplified);
    expect(
      lerInterface(verifyInviteToken(signInviteToken(payload))?.interface_settings).settings,
    ).toEqual(complete);
  });
});

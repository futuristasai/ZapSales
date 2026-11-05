// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A PORTA DA LICENÇA NO PROXY — o que uma instalação bloqueada vê, e o que continua aberto.
 *
 * O `proxy` é a porta das telas e da API de sessão (ADR-0005). Aqui a decisão é simulada
 * (`consultarPorta` mockada) e o que se prova é o COMPORTAMENTO DA PORTA: quando `aplicar`, JSON 403
 * `license_blocked` em /api/ e página mínima nas telas; quando não, segue como sempre; e o que o
 * contrato manda ficar liberado (login, exportação, tela de licença) passa mesmo com `aplicar`.
 * A regra de quem aplica o quê está em `lib/licenca/porta.test.ts`.
 */

import type * as Porta from "@/lib/licenca/porta";

const consultarPorta = vi.fn();
vi.mock("@/lib/licenca/porta", async (original) => ({
  ...(await original<typeof Porta>()),
  consultarPorta: (...a: unknown[]) => consultarPorta(...a),
}));

let usuario: { id: string } | null = { id: "11111111-1111-4111-8111-111111111111" };
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    rpc: async () => ({ data: true, error: null }),
  }),
}));
vi.mock("@/lib/auth/sessao-repassada", () => ({
  CABECALHO_SESSAO: "x-zs-sessao",
  assinarSessao: async () => "assinado",
}));

import { proxy } from "@/proxy";

const RECUSANDO = {
  aplicar: true,
  modo: "valendo",
  motivo: "valendo",
  decisao: { estado: "temporario_vencido", opera: false },
};
const OPERANDO = { aplicar: false, modo: "sombra", motivo: "sombra", decisao: null };

const req = (caminho: string) => new NextRequest(`https://exemplo.test${caminho}`);

beforeEach(() => {
  consultarPorta.mockReset();
  usuario = { id: "11111111-1111-4111-8111-111111111111" };
});

describe("instalação bloqueada, modo valendo", () => {
  beforeEach(() => consultarPorta.mockResolvedValue(RECUSANDO));

  it("a API de sessão recebe 403 license_blocked em JSON, com o estado", async () => {
    const r = await proxy(req("/api/v1/conversations"));
    expect(r.status).toBe(403);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect(await r.json()).toMatchObject({
      error: { code: "license_blocked", details: { state: "temporario_vencido" } },
    });
  });

  it("a tela recebe uma página mínima 403 — sem nome de produto (white-label) e dizendo que os dados estão preservados", async () => {
    const r = await proxy(req("/app/inbox"));
    expect(r.status).toBe(403);
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain("Licença bloqueada ou vencida");
    expect(html).toContain("preservados");
    expect(html.toLowerCase()).not.toContain("zapsales");
  });

  it.each([
    "/app/lgpd",
    "/app/lgpd/requests",
    "/api/v1/lgpd/requests",
    "/api/v1/audit/export",
    "/licenca",
  ])(
    "%s continua liberado: exportação e a tela de licença nunca são trancadas",
    async (caminho) => {
      const r = await proxy(req(caminho));
      expect(r.status).toBe(200);
      expect(consultarPorta).not.toHaveBeenCalled();
    },
  );

  it("quem não está logado segue para o login, e a licença nem é consultada", async () => {
    usuario = null;
    const r = await proxy(req("/app/inbox"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/login");
    expect(consultarPorta).not.toHaveBeenCalled();
  });
});

describe("modo sombra ou instalação que opera", () => {
  it("segue como sempre — a decisão é calculada e nada é recusado", async () => {
    consultarPorta.mockResolvedValue(OPERANDO);
    const r = await proxy(req("/app/inbox"));
    expect(r.status).toBe(200);
    expect(consultarPorta).toHaveBeenCalledWith("proxy");
  });

  it("estado ilegível (aplicar=false) também segue", async () => {
    consultarPorta.mockResolvedValue({
      aplicar: false,
      modo: null,
      motivo: "estado_indisponivel",
      decisao: null,
    });
    expect((await proxy(req("/api/v1/conversations"))).status).toBe(200);
  });
});

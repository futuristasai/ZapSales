/**
 * O cadastro de uma API (issue #372): o portão (papel escolhido pela organização, recurso ligado,
 * segunda etapa), as travas da organização no cadastro, o endereço pela rede segura ANTES de
 * gravar, e a credencial que nunca volta nem vai para a auditoria.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RECOMENDADO, type SegurancaDasApis } from "@/lib/ai/ferramentas-externas/api/seguranca";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  ler: vi.fn(),
  avisar: vi.fn(),
  aal: vi.fn(),
  criar: vi.fn(),
  listar: vi.fn(),
  destino: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/auth/server", () => ({ sessionAal: deps.aal }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/ferramentas-externas/api/seguranca-servidor", () => ({
  lerSegurancaDaOrganizacao: deps.ler,
  avisarAdministrador: deps.avisar,
}));
vi.mock("@/lib/ai/ferramentas-externas/api/repositorio", () => ({
  criarApi: deps.criar,
  efeitoPadraoDoMetodo: (metodo: string) => (metodo === "GET" ? "consulta" : "altera"),
}));
vi.mock("@/lib/ai/ferramentas-externas/repositorio", () => ({ listarFerramentas: deps.listar }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: deps.destino }));

import { GET, POST } from "@/app/api/v1/ai/api-tools/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const ACEITE = { em: "2026-11-20T12:00:00.000Z", por: EU };
const CREDENCIAL = "chave-secreta-da-loja-4242";

const LIGADA: SegurancaDasApis = { ...RECOMENDADO, ligado: true, aceite: ACEITE };

const CONSULTA = {
  nome: "Consultar pedido",
  quando_usar: "Quando o cliente perguntar onde está o pedido dele.",
  url: "https://api.loja.example.com/pedidos/{{numero}}",
  parametros: [{ nome: "numero", tipo: "texto", descricao: "Número do pedido", obrigatorio: true }],
  config: { metodo: "GET", credencial: { tipo: "bearer" } },
  credencial: CREDENCIAL,
};
const ACAO = { ...CONSULTA, nome: "Cancelar pedido", config: { metodo: "DELETE", credencial: { tipo: "bearer" } } };

const post = (corpo: unknown) =>
  new NextRequest("http://localhost/api/v1/ai/api-tools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

const comoAdmin = { ok: true, user: { id: EU, idioma: "pt-BR", email: "dono@exemplo.invalid" }, org: { orgId: ORG } };

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue(comoAdmin);
  deps.admin.mockReturnValue({});
  deps.aal.mockResolvedValue("aal2");
  deps.ler.mockResolvedValue(LIGADA);
  deps.avisar.mockResolvedValue(undefined);
  deps.destino.mockResolvedValue(null);
  deps.listar.mockResolvedValue([]);
  deps.criar.mockResolvedValue({
    ok: true,
    ferramenta: { id: ID, name: "Consultar pedido", slug: "consultar_pedido", effect: "consulta", require_approval: null, approval_ttl_hours: 24, parameters: [{}] },
  });
});

describe("GET — a lista", () => {
  it("gerente lê; só as ferramentas do tipo api, da organização da sessão", async () => {
    expect((await GET()).status).toBe(200);
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
    expect(deps.listar).toHaveBeenCalledWith(expect.anything(), ORG, { tipo: "api" });
  });
});

describe("POST — o portão", () => {
  it("suporte temporário não cadastra", async () => {
    const suporte = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(suporte);
    expect(await POST(post(CONSULTA))).toBe(suporte);
    expect(deps.criar).not.toHaveBeenCalled();
  });

  it("«só administrador cadastra» (o padrão): a rota pede o papel de administrador", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockImplementation(async (papel: string) => (papel === "admin" ? { ok: false, response: barrado } : comoAdmin));
    expect(await POST(post(CONSULTA))).toBe(barrado);
    expect(deps.criar).not.toHaveBeenCalled();
  });

  it("com «administrador e gerente», o papel de gerente basta", async () => {
    deps.ler.mockResolvedValue({ ...LIGADA, quem_cadastra: "manager" });
    expect((await POST(post(CONSULTA))).status).toBe(201);
    expect(deps.role).not.toHaveBeenCalledWith("admin", expect.anything());
  });

  it("recurso desligado é 409 e nada é gravado", async () => {
    deps.ler.mockResolvedValue({ ...RECOMENDADO, ligado: false, aceite: null });
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("api_disabled");
    expect(deps.criar).not.toHaveBeenCalled();
  });

  it("exigência das duas etapas: sessão só com a senha é 403; com a exigência desligada, passa", async () => {
    deps.aal.mockResolvedValue("aal1");
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("api_two_step_required");
    expect(deps.criar).not.toHaveBeenCalled();

    deps.ler.mockResolvedValue({ ...LIGADA, exigir_duas_etapas: false });
    expect((await POST(post(CONSULTA))).status).toBe(201);
  });

  it("falha ao ler a segurança é 500, nunca «liberado»", async () => {
    deps.ler.mockResolvedValue(null);
    expect((await POST(post(CONSULTA))).status).toBe(500);
    expect(deps.criar).not.toHaveBeenCalled();
  });
});

describe("POST — as travas da organização no cadastro", () => {
  it("«somente consulta» recusa a API que altera dados", async () => {
    const res = await POST(post(ACAO));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ trava: "somente_consulta" });
    expect(deps.criar).not.toHaveBeenCalled();
  });

  it("endereço fora da lista de permitidos é recusado", async () => {
    deps.ler.mockResolvedValue({ ...LIGADA, dominios_permitidos: ["api.outro.example.com"] });
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ trava: "endereco_nao_permitido" });
  });

  it("dado do contato que a organização não liberou não entra", async () => {
    const corpo = { ...CONSULTA, config: { ...CONSULTA.config, dados_contato: ["telefone"] } };
    const res = await POST(post(corpo));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ trava: "dado_do_contato_nao_liberado" });

    deps.ler.mockResolvedValue({ ...LIGADA, dados_do_contato: ["telefone"] });
    expect((await POST(post(corpo))).status).toBe(201);
  });

  it("com «aprovação sempre obrigatória», não se cadastra ação com a aprovação desligada", async () => {
    deps.ler.mockResolvedValue({ ...LIGADA, somente_consulta: false });
    const res = await POST(post({ ...ACAO, pedir_aprovacao: false }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ trava: "aprovacao_obrigatoria" });

    deps.ler.mockResolvedValue({ ...LIGADA, somente_consulta: false, aprovacao_obrigatoria: false });
    expect((await POST(post({ ...ACAO, pedir_aprovacao: false }))).status).toBe(201);
  });
});

describe("POST — o endereço e a credencial", () => {
  it("endereço da rede interna é recusado pela rede segura ANTES de gravar", async () => {
    deps.destino.mockResolvedValue("unsafe_url:private_ip");
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(422);
    expect(deps.criar).not.toHaveBeenCalled();
    // O que a rede segura julga é o endereço com os marcadores trocados (eles ficam depois do host).
    expect(deps.destino).toHaveBeenCalledWith("https://api.loja.example.com/pedidos/x", "organizacao");
  });

  it("o corpo é estrito e o host nunca é marcador", async () => {
    expect((await POST(post({ ...CONSULTA, organization_id: ORG }))).status).toBe(422);
    expect((await POST(post({ ...CONSULTA, url: "https://{{numero}}.loja.example.com/x" }))).status).toBe(422);
    expect(deps.criar).not.toHaveBeenCalled();
  });

  it("cadastra com a organização e o ator da SESSÃO; a credencial não vai à resposta, à auditoria nem ao aviso", async () => {
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(201);
    expect(deps.criar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG, atorId: EU, dados: expect.objectContaining({ credencial: CREDENCIAL }) }),
    );
    expect(JSON.stringify(await res.json())).not.toContain(CREDENCIAL);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.external_tool_created",
        organizationId: ORG,
        actorUserId: EU,
        metadata: expect.objectContaining({ kind: "api", method: "GET", host: "api.loja.example.com", credential_type: "bearer" }),
      }),
    );
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain(CREDENCIAL);
    expect(JSON.stringify(deps.avisar.mock.calls)).not.toContain(CREDENCIAL);
    expect(deps.avisar).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      true,
      expect.objectContaining({ titulo: "A API «Consultar pedido» foi cadastrada" }),
    );
  });

  it("sem cifra no servidor a credencial NÃO é gravada em claro: 422", async () => {
    deps.criar.mockResolvedValue({ ok: false, erro: "cifra_indisponivel" });
    const res = await POST(post(CONSULTA));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("encryption_unavailable");
  });
});

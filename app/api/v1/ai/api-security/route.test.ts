/**
 * A segurança das APIs (issue #372): desligada por padrão, restrita a administrador, com guarda
 * de suporte; ligar exige o aceite; a exigência das duas etapas vale para mudar opções (com a
 * saída para quem não tem fator); e toda mudança deixa rastro — auditoria com o que foi
 * AFROUXADO e aviso ao administrador, inclusive o último, quando o que se desliga é o aviso.
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
  gravar: vi.fn(),
  avisar: vi.fn(),
  aal: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/auth/server", () => ({ sessionAal: deps.aal }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/ferramentas-externas/api/seguranca-servidor", () => ({
  lerSegurancaDaOrganizacao: deps.ler,
  gravarSegurancaDaOrganizacao: deps.gravar,
  avisarAdministrador: deps.avisar,
}));

import { GET, PUT } from "@/app/api/v1/ai/api-security/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ACEITE = { em: "2026-11-20T12:00:00.000Z", por: EU };

const DESLIGADA: SegurancaDasApis = { ...RECOMENDADO, ligado: false, aceite: null };
const LIGADA: SegurancaDasApis = { ...RECOMENDADO, ligado: true, aceite: ACEITE };

const contagem = { count: 0 };
function admin() {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.then = (f: (v: unknown) => unknown) => f(contagem);
  return { from: () => cadeia };
}

const put = (corpo: unknown) =>
  new NextRequest("http://localhost/api/v1/ai/api-security", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

/** O que a gravação devolve: o antes que a rota leu e o depois com a mudança aplicada. */
function gravou(antes: SegurancaDasApis, mudanca: Partial<SegurancaDasApis>) {
  deps.ler.mockResolvedValue(antes);
  deps.gravar.mockResolvedValue({ ok: true, antes, depois: { ...antes, ...mudanca } });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR", email: "dono@exemplo.invalid" }, org: { orgId: ORG } });
  deps.admin.mockReturnValue(admin());
  deps.aal.mockResolvedValue("aal2");
  deps.ler.mockResolvedValue(DESLIGADA);
  deps.avisar.mockResolvedValue(undefined);
});

describe("GET — o estado", () => {
  it("instalação nova: desligado, sem aceite, tudo na posição recomendada, nível «mais seguro»", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const dados = (await res.json()).data;
    expect(dados).toMatchObject({ ligado: false, aceite: null, nivel: "mais_seguro", fora_do_recomendado: [] });
    expect(dados.opcoes).toEqual(RECOMENDADO);
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
  });

  it("diz se ESTA sessão provou a segunda etapa — a tela explica o bloqueio antes do clique", async () => {
    deps.aal.mockResolvedValue("aal1");
    expect((await (await GET()).json()).data.sessao_com_duas_etapas).toBe(false);
    deps.aal.mockResolvedValue("aal2");
    expect((await (await GET()).json()).data.sessao_com_duas_etapas).toBe(true);
  });

  it("falha na leitura é 500, nunca «desligado» inventado", async () => {
    deps.ler.mockResolvedValue(null);
    expect((await GET()).status).toBe(500);
  });
});

describe("PUT — quem pode e o aceite", () => {
  it("só administrador; suporte temporário não muda a segurança", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockResolvedValue({ ok: false, response: barrado });
    expect(await PUT(put({ ligado: true, aceitar: true }))).toBe(barrado);
    expect(deps.role).toHaveBeenCalledWith("admin", expect.anything());

    deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
    const suporte = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(suporte);
    expect(await PUT(put({ ligado: true, aceitar: true }))).toBe(suporte);
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("ligar SEM aceite é 422 (a rota confere, não só a tela) e nada é gravado", async () => {
    const res = await PUT(put({ ligado: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ motivo: "sem_aceite" });
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("ligar COM aceite grava com a organização e o ator da SESSÃO", async () => {
    gravou(DESLIGADA, { ligado: true, aceite: ACEITE });
    const res = await PUT(put({ ligado: true, aceitar: true }));
    expect(res.status).toBe(200);
    expect(deps.gravar).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, actorUserId: EU, mudanca: { ligado: true, aceitar: true } }),
    );
  });

  it("o corpo é estrito: organização, aceite forjado e opção desconhecida são 422", async () => {
    for (const corpo of [{ organization_id: ORG, somente_consulta: false }, { aceite: ACEITE }, { opcao_inventada: true }, {}]) {
      expect((await PUT(put(corpo))).status).toBe(422);
    }
    expect(deps.gravar).not.toHaveBeenCalled();
  });
});

describe("PUT — a exigência das duas etapas", () => {
  it("com a exigência ligada e a sessão sem a segunda etapa, mudar uma opção é 403 e nada é gravado", async () => {
    deps.ler.mockResolvedValue(LIGADA);
    deps.aal.mockResolvedValue("aal1");
    const res = await PUT(put({ somente_consulta: false }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("api_two_step_required");
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("a saída existe: sem a segunda etapa dá para desligar a PRÓPRIA exigência e para ligar/desligar o recurso", async () => {
    deps.aal.mockResolvedValue("aal1");
    gravou(LIGADA, { exigir_duas_etapas: false });
    expect((await PUT(put({ exigir_duas_etapas: false }))).status).toBe(200);
    gravou(LIGADA, { ligado: false });
    expect((await PUT(put({ ligado: false }))).status).toBe(200);
    // O nível «Equilibrado» também sai da exigência na mesma chamada.
    gravou(LIGADA, { exigir_duas_etapas: false, somente_consulta: false, quem_aprova: "manager" });
    expect((await PUT(put({ nivel: "equilibrado" }))).status).toBe(200);
  });

  it("com a exigência DESLIGADA, a sessão sem a segunda etapa muda as opções", async () => {
    deps.aal.mockResolvedValue("aal1");
    gravou({ ...LIGADA, exigir_duas_etapas: false }, { somente_consulta: false });
    expect((await PUT(put({ somente_consulta: false }))).status).toBe(200);
  });
});

describe("PUT — o rastro", () => {
  it("afrouxar uma opção vai à auditoria com o nome dela, e avisa o administrador", async () => {
    gravou(LIGADA, { somente_consulta: false });
    expect((await PUT(put({ somente_consulta: false }))).status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.api_security_changed",
        organizationId: ORG,
        actorUserId: EU,
        metadata: expect.objectContaining({
          opcoes_alteradas: ["somente_consulta"],
          afrouxadas: ["somente_consulta"],
          somente_consulta: false,
          nivel: "personalizado",
        }),
      }),
    );
    expect(deps.avisar).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      true,
      expect.objectContaining({
        // O TÍTULO diz o que saiu do recomendado: a Central guarda um aviso aberto por título.
        titulo: expect.stringMatching(/^A segurança das APIs foi alterada — fora do recomendado: Somente consulta \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\)$/),
        corpo: expect.stringContaining("Saíram da posição recomendada: Somente consulta"),
      }),
    );
  });

  it("ligar e, em seguida, afrouxar geram avisos com títulos DIFERENTES — o segundo não é engolido", async () => {
    gravou(DESLIGADA, { ligado: true, aceite: ACEITE });
    await PUT(put({ ligado: true, aceitar: true }));
    gravou(LIGADA, { somente_consulta: false });
    await PUT(put({ somente_consulta: false }));
    const titulos = deps.avisar.mock.calls.map((c) => (c[3] as { titulo: string }).titulo.replace(/ \(.*\)$/, ""));
    expect(titulos).toEqual([
      "A segurança das APIs foi alterada — APIs ligadas",
      "A segurança das APIs foi alterada — fora do recomendado: Somente consulta",
    ]);
  });

  it("voltar à posição recomendada é mudança, mas não é afrouxar", async () => {
    gravou({ ...LIGADA, somente_consulta: false }, { somente_consulta: true });
    await PUT(put({ somente_consulta: true }));
    const meta = deps.audit.mock.calls[0]?.[0].metadata;
    expect(meta.opcoes_alteradas).toEqual(["somente_consulta"]);
    expect(meta.afrouxadas).toEqual([]);
  });

  it("desligar o aviso ao administrador AINDA gera o último aviso", async () => {
    gravou(LIGADA, { avisar_administrador: false });
    await PUT(put({ avisar_administrador: false }));
    expect(deps.avisar).toHaveBeenCalledWith(expect.anything(), ORG, true, expect.anything());
  });

  it("com o aviso já desligado, uma mudança seguinte não avisa", async () => {
    gravou({ ...LIGADA, avisar_administrador: false }, { avisar_administrador: false, quem_aprova: "manager" });
    await PUT(put({ quem_aprova: "manager" }));
    expect(deps.avisar).toHaveBeenCalledWith(expect.anything(), ORG, false, expect.anything());
  });

  it("a lista de endereços não vai inteira para a auditoria: só a quantidade", async () => {
    gravou(LIGADA, { dominios_permitidos: ["api.loja.example.com", "*.erp.example.com"] });
    await PUT(put({ dominios_permitidos: ["api.loja.example.com", "*.erp.example.com"] }));
    const meta = deps.audit.mock.calls[0]?.[0].metadata;
    expect(meta.dominios_permitidos).toBe(2);
    expect(JSON.stringify(meta)).not.toContain("api.loja.example.com");
  });

  it("salvar sem mudar nada não avisa ninguém", async () => {
    gravou(LIGADA, {});
    await PUT(put({ somente_consulta: true }));
    expect(deps.avisar).not.toHaveBeenCalled();
  });

  it("gravação recusada é 500, e config inválida é 422", async () => {
    deps.ler.mockResolvedValue(LIGADA);
    deps.gravar.mockResolvedValue({ ok: false, motivo: "escrita_recusada" });
    expect((await PUT(put({ somente_consulta: false }))).status).toBe(500);
    deps.gravar.mockResolvedValue({ ok: false, motivo: "config_invalida" });
    expect((await PUT(put({ dominios_permitidos: ["https://com-esquema.example.com/x"] }))).status).toBe(422);
  });
});

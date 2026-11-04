// @vitest-environment node
/**
 * A tabela "escolher pessoas do CRM": a busca digitada vira predicado da MESMA consulta do público,
 * abaixo do piso ela não vai ao banco, e quem não pode receber vem com o motivo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { FILTRO_VAZIO, type FiltroDeAudiencia } from "./audiencia";
import { listarContatosDaTabela } from "./consulta-de-audiencia";

const ORG = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-11-03T12:00:00Z");

type Chamada = { metodo: string; args: unknown[] };

function linha(id: string, parcial: Record<string, unknown> = {}) {
  return {
    id,
    name: `Pessoa ${id}`,
    display_name: null,
    phone_number: "+5511999998888",
    email: null,
    custom_fields: null,
    is_blocked: false,
    is_anonymized: false,
    consent: {},
    tags: ["cliente"],
    ...parcial,
  };
}

function banco(contatos: Record<string, unknown>[], emCampanha: string[] = []) {
  const consultasDeContatos: Chamada[][] = [];
  const admin = {
    from(tabela: string) {
      const chamadas: Chamada[] = [];
      const q: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "is",
        "not",
        "order",
        "limit",
        "contains",
        "overlaps",
        "or",
        "gte",
        "lte",
        "in",
        "neq",
      ]) {
        q[m] = (...args: unknown[]) => {
          chamadas.push({ metodo: m, args });
          return q;
        };
      }
      q.then = (resolver: (v: unknown) => unknown) => {
        let data: unknown[] = [];
        if (tabela === "contacts") {
          consultasDeContatos.push(chamadas);
          data = contatos;
        } else if (tabela === "campaigns") {
          data = emCampanha.length > 0 ? [{ id: "camp-1" }] : [];
        } else if (tabela === "campaign_recipients") {
          data = emCampanha.map((contact_id) => ({ contact_id }));
        }
        return Promise.resolve({ data, error: null }).then(resolver);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, consultasDeContatos };
}

const entrada = (busca: string, filtro: FiltroDeAudiencia = FILTRO_VAZIO) => ({
  organizationId: ORG,
  filtro: { ...filtro, incluir_contatos: [], excluir_contatos: [] },
  busca,
  agora: AGORA,
});

describe("listarContatosDaTabela", () => {
  it("uma busca digitada é um critério: a consulta roda com o `or` da busca", async () => {
    const { admin, consultasDeContatos } = banco([linha("a")]);
    const r = await listarContatosDaTabela(admin, entrada("maria"));
    expect(r).toHaveLength(1);
    const ors = consultasDeContatos[0]!.filter((c) => c.metodo === "or");
    expect(ors).toHaveLength(1);
    expect(String(ors[0]!.args[0])).toContain("name.ilike.%maria%");
  });

  it("busca curta e sem filtro nenhum NÃO vai ao banco", async () => {
    const { admin, consultasDeContatos } = banco([linha("a")]);
    expect(await listarContatosDaTabela(admin, entrada("m"))).toEqual([]);
    expect(consultasDeContatos).toHaveLength(0);
  });

  it("sempre filtra pela organização, pessoa e cadastro não mesclado", async () => {
    const { admin, consultasDeContatos } = banco([]);
    await listarContatosDaTabela(admin, entrada("maria"));
    const c = consultasDeContatos[0]!;
    expect(
      c.some((x) => x.metodo === "eq" && x.args[0] === "organization_id" && x.args[1] === ORG),
    ).toBe(true);
    expect(c.some((x) => x.metodo === "eq" && x.args[0] === "kind" && x.args[1] === "person")).toBe(
      true,
    );
    expect(c.some((x) => x.metodo === "is" && x.args[0] === "is_merged_into")).toBe(true);
  });

  it("devolve o motivo de quem não pode receber, na ordem de gravidade", async () => {
    const { admin } = banco(
      [
        linha("ok"),
        linha("saiu", { is_blocked: true }),
        linha("anon", { is_anonymized: true }),
        linha("sem-fone", { phone_number: null }),
        linha("fone-ruim", { phone_number: "123" }),
        linha("campanha"),
      ],
      ["campanha"],
    );
    const r = await listarContatosDaTabela(admin, entrada("pessoa"));
    const por = Object.fromEntries(r.map((l) => [l.id, l.motivo]));
    expect(por).toEqual({
      ok: null,
      saiu: "opt_out",
      anon: "anonimizado",
      "sem-fone": "sem_telefone",
      "fone-ruim": "telefone_invalido",
      campanha: "ja_em_campanha",
    });
  });

  it("traz as etiquetas da pessoa para a tabela", async () => {
    const { admin } = banco([linha("a", { tags: ["vip", "cliente"] })]);
    expect((await listarContatosDaTabela(admin, entrada("pessoa")))[0]!.tags).toEqual([
      "vip",
      "cliente",
    ]);
  });

  it("os filtros somam à busca: etiqueta escolhida vira predicado junto", async () => {
    const { admin, consultasDeContatos } = banco([linha("a")]);
    await listarContatosDaTabela(
      admin,
      entrada("maria", { ...FILTRO_VAZIO, com_alguma_tag: ["vip"] }),
    );
    const c = consultasDeContatos[0]!;
    expect(c.some((x) => x.metodo === "overlaps" && x.args[0] === "tags")).toBe(true);
    expect(c.some((x) => x.metodo === "or")).toBe(true);
  });
});

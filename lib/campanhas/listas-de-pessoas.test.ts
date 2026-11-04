// @vitest-environment node
/**
 * As listas salvas de pessoas do disparo: criar guarda só quem é pessoa DESTA organização, o nome
 * é único sem diferenciar maiúscula, ler devolve a lista inteira (passa de uma página do
 * PostgREST), apagar não toca nas pessoas, e usar a lista passa pelos mesmos vetos da tabela de
 * busca. O banco é um dublê em memória que entende só o que o módulo usa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { CAMPANHAS_VIVAS } from "./audiencia";
import { listarContatosPorIds } from "./consulta-de-audiencia";
import {
  TETO_DE_LISTAS,
  apagarLista,
  criarLista,
  criarListaSchema,
  lerIdsDaLista,
  listarListas,
} from "./listas-de-pessoas";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

type Linha = Record<string, unknown>;

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function contato(n: number, parcial: Linha = {}): Linha {
  return {
    id: uuid(n),
    organization_id: ORG,
    kind: "person",
    is_merged_into: null,
    name: `Pessoa ${n}`,
    display_name: null,
    phone_number: `+55119999${String(n).padStart(5, "0")}`,
    email: null,
    custom_fields: null,
    is_blocked: false,
    is_anonymized: false,
    consent: {},
    tags: [],
    ...parcial,
  };
}

interface Chamada {
  tabela: string;
  metodo: string;
  args: unknown[];
}

/** Um banco em memória com o mínimo de PostgREST que `listas-de-pessoas.ts` precisa. */
function banco(
  inicial: { contacts?: Linha[]; campaigns?: Linha[]; campaign_recipients?: Linha[] } = {},
) {
  const tabelas: Record<string, Linha[]> = {
    contacts: inicial.contacts ?? [],
    campaigns: inicial.campaigns ?? [],
    campaign_recipients: inicial.campaign_recipients ?? [],
    campaign_audience_lists: [],
    campaign_audience_list_members: [],
  };
  const chamadas: Chamada[] = [];
  let proximoId = 1000;

  function nomeRepetido(org: unknown, nome: string): boolean {
    return tabelas.campaign_audience_lists!.some(
      (l) => l.organization_id === org && String(l.name).toLowerCase() === nome.toLowerCase(),
    );
  }

  const admin = {
    from(tabela: string) {
      const filtros: Array<(l: Linha) => boolean> = [];
      let operacao: "select" | "insert" | "delete" = "select";
      let carga: Linha[] = [];
      let faixa: [number, number] | null = null;
      let somenteContar = false;
      let contar = false;
      let forma: "single" | "maybe" | null = null;
      let colunas = "";
      const registrar = (metodo: string, args: unknown[]) =>
        chamadas.push({ tabela, metodo, args });

      const q: Record<string, unknown> = {
        select(cols: string, opcoes?: { count?: string; head?: boolean }) {
          registrar("select", [cols, opcoes]);
          colunas = cols;
          contar = opcoes?.count === "exact";
          somenteContar = opcoes?.head === true;
          return q;
        },
        insert(c: Linha | Linha[]) {
          registrar("insert", [c]);
          operacao = "insert";
          carga = Array.isArray(c) ? c : [c];
          return q;
        },
        delete() {
          registrar("delete", []);
          operacao = "delete";
          return q;
        },
        eq(col: string, v: unknown) {
          registrar("eq", [col, v]);
          filtros.push((l) => l[col] === v);
          return q;
        },
        in(col: string, v: unknown[]) {
          registrar("in", [col, v]);
          filtros.push((l) => v.includes(l[col]));
          return q;
        },
        is(col: string, v: unknown) {
          registrar("is", [col, v]);
          filtros.push((l) => (v === null ? l[col] == null : l[col] === v));
          return q;
        },
        order: () => q,
        limit: () => q,
        neq: () => q,
        range(de: number, ate: number) {
          faixa = [de, ate];
          return q;
        },
        single() {
          forma = "single";
          return q;
        },
        maybeSingle() {
          forma = "maybe";
          return q;
        },
        then(resolver: (v: unknown) => unknown) {
          return Promise.resolve(executar()).then(resolver);
        },
      };

      function executar(): { data: unknown; error: unknown; count?: number } {
        const alvo = tabelas[tabela]!;
        if (operacao === "insert") {
          const criadas: Linha[] = [];
          for (const c of carga) {
            if (tabela === "campaign_audience_lists") {
              if (nomeRepetido(c.organization_id, String(c.name))) {
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              }
              const nova = { id: uuid(proximoId++), created_at: "2026-11-04T00:00:00Z", ...c };
              alvo.push(nova);
              criadas.push(nova);
            } else {
              alvo.push({ ...c });
              criadas.push({ ...c });
            }
          }
          if (forma === "single") return { data: criadas[0], error: null };
          return { data: criadas, error: null };
        }
        let linhas = alvo.filter((l) => filtros.every((f) => f(l)));
        if (operacao === "delete") {
          for (const l of linhas) alvo.splice(alvo.indexOf(l), 1);
          if (tabela === "campaign_audience_lists") {
            // cascade
            const ids = new Set(linhas.map((l) => l.id));
            tabelas.campaign_audience_list_members = tabelas.campaign_audience_list_members!.filter(
              (m) => !ids.has(m.list_id),
            );
          }
          const recorte = (l: Linha): Linha =>
            colunas && !colunas.includes("(")
              ? Object.fromEntries(colunas.split(",").map((c) => [c.trim(), l[c.trim()]]))
              : l;
          if (forma === "maybe")
            return { data: linhas[0] ? recorte(linhas[0]) : null, error: null };
          return { data: linhas.map(recorte), error: null };
        }
        if (somenteContar) return { data: null, error: null, count: linhas.length };
        if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1);
        let saida: Linha[] = linhas;
        if (colunas.includes("campaign_audience_list_members(count)")) {
          saida = linhas.map((l) => ({
            ...l,
            campaign_audience_list_members: [
              {
                count: tabelas.campaign_audience_list_members!.filter((m) => m.list_id === l.id)
                  .length,
              },
            ],
          }));
        }
        if (forma === "maybe") return { data: saida[0] ?? null, error: null };
        return { data: saida, error: null, ...(contar ? { count: linhas.length } : {}) };
      }
      return q;
    },
  } as unknown as SupabaseClient;

  return { admin, tabelas, chamadas };
}

describe("criarListaSchema", () => {
  it("exige nome de 2 a 80 letras e ao menos uma pessoa", () => {
    expect(criarListaSchema.safeParse({ name: "A", contact_ids: [uuid(1)] }).success).toBe(false);
    expect(criarListaSchema.safeParse({ name: "VIP", contact_ids: [] }).success).toBe(false);
    expect(criarListaSchema.safeParse({ name: "VIP", contact_ids: ["x"] }).success).toBe(false);
    expect(criarListaSchema.safeParse({ name: "  VIP  ", contact_ids: [uuid(1)] }).data?.name).toBe(
      "VIP",
    );
  });
});

describe("criarLista", () => {
  it("guarda a lista e as pessoas, e diz quantas", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(1), contato(2), contato(3)] });
    const r = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Clientes VIP",
      contactIds: [uuid(1), uuid(2), uuid(2)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lista.total).toBe(2);
    expect(tabelas.campaign_audience_lists).toHaveLength(1);
    expect(tabelas.campaign_audience_lists![0]).toMatchObject({
      organization_id: ORG,
      name: "Clientes VIP",
      created_by: USER,
    });
    expect(tabelas.campaign_audience_list_members!.map((m) => m.contact_id).sort()).toEqual([
      uuid(1),
      uuid(2),
    ]);
    expect(tabelas.campaign_audience_list_members!.every((m) => m.organization_id === ORG)).toBe(
      true,
    );
  });

  it("descarta quem não é pessoa desta organização: outra org, grupo e cadastro mesclado", async () => {
    const { admin, tabelas } = banco({
      contacts: [
        contato(1),
        contato(2, { organization_id: OUTRA }),
        contato(3, { kind: "whatsapp_group" }),
        contato(4, { is_merged_into: uuid(1) }),
      ],
    });
    const r = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Mistura",
      contactIds: [uuid(1), uuid(2), uuid(3), uuid(4)],
    });
    expect(r.ok && r.lista.total).toBe(1);
    expect(tabelas.campaign_audience_list_members!.map((m) => m.contact_id)).toEqual([uuid(1)]);
  });

  it("sem nenhuma pessoa válida a lista nem nasce", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(2, { organization_id: OUTRA })] });
    const r = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Vazia",
      contactIds: [uuid(2)],
    });
    expect(r).toEqual({ ok: false, motivo: "sem_pessoas_validas" });
    expect(tabelas.campaign_audience_lists).toHaveLength(0);
  });

  it("o nome é único na organização sem diferenciar maiúscula, e nada fica pela metade", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(1), contato(2)] });
    await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Clientes VIP",
      contactIds: [uuid(1)],
    });
    const repetida = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "clientes vip",
      contactIds: [uuid(2)],
    });
    expect(repetida).toEqual({ ok: false, motivo: "nome_repetido" });
    expect(tabelas.campaign_audience_lists).toHaveLength(1);
    expect(tabelas.campaign_audience_list_members).toHaveLength(1);
  });

  it("outra organização pode usar o mesmo nome", async () => {
    const { admin } = banco({ contacts: [contato(1), contato(2, { organization_id: OUTRA })] });
    await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "VIP",
      contactIds: [uuid(1)],
    });
    const r = await criarLista(admin, {
      organizationId: OUTRA,
      userId: USER,
      name: "VIP",
      contactIds: [uuid(2)],
    });
    expect(r.ok).toBe(true);
  });

  it("recusa a lista nova quando a organização já guarda o máximo", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(1)] });
    for (let i = 0; i < TETO_DE_LISTAS; i += 1) {
      tabelas.campaign_audience_lists!.push({
        id: uuid(5000 + i),
        organization_id: ORG,
        name: `Lista ${i}`,
        created_at: "2026-11-04T00:00:00Z",
      });
    }
    const r = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Mais uma",
      contactIds: [uuid(1)],
    });
    expect(r).toEqual({ ok: false, motivo: "limite_de_listas" });
  });

  it("confere as pessoas em blocos, sem pôr milhares de ids numa só consulta", async () => {
    const todos = Array.from({ length: 450 }, (_, i) => contato(i + 1));
    const { admin, chamadas } = banco({ contacts: todos });
    const r = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Grande",
      contactIds: todos.map((c) => String(c.id)),
    });
    expect(r.ok && r.lista.total).toBe(450);
    const tamanhos = chamadas
      .filter((c) => c.tabela === "contacts" && c.metodo === "in")
      .map((c) => (c.args[1] as unknown[]).length);
    expect(tamanhos).toEqual([200, 200, 50]);
  });
});

describe("listarListas", () => {
  it("devolve só as listas da organização, com quantas pessoas cada uma tem", async () => {
    const { admin } = banco({
      contacts: [contato(1), contato(2), contato(3, { organization_id: OUTRA })],
    });
    await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "A",
      contactIds: [uuid(1), uuid(2)],
    });
    await criarLista(admin, {
      organizationId: OUTRA,
      userId: USER,
      name: "B",
      contactIds: [uuid(3)],
    });
    const r = await listarListas(admin, ORG);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "A", total: 2 });
  });
});

describe("lerIdsDaLista", () => {
  it("lista de outra organização é como se não existisse", async () => {
    const { admin } = banco({ contacts: [contato(1, { organization_id: OUTRA })] });
    const criada = await criarLista(admin, {
      organizationId: OUTRA,
      userId: USER,
      name: "Alheia",
      contactIds: [uuid(1)],
    });
    expect(criada.ok).toBe(true);
    if (!criada.ok) return;
    expect(await lerIdsDaLista(admin, ORG, criada.lista.id)).toBeNull();
    expect(await lerIdsDaLista(admin, OUTRA, criada.lista.id)).toEqual([uuid(1)]);
  });

  it("devolve a lista inteira mesmo quando passa de uma página do PostgREST", async () => {
    const todos = Array.from({ length: 1500 }, (_, i) => contato(i + 1));
    const { admin } = banco({ contacts: todos });
    const criada = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Enorme",
      contactIds: todos.map((c) => String(c.id)),
    });
    expect(criada.ok).toBe(true);
    if (!criada.ok) return;
    const ids = await lerIdsDaLista(admin, ORG, criada.lista.id);
    expect(ids).toHaveLength(1500);
    expect(new Set(ids).size).toBe(1500);
  });
});

describe("apagarLista", () => {
  it("apaga a lista e os ponteiros, mas não as pessoas", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(1), contato(2)] });
    const criada = await criarLista(admin, {
      organizationId: ORG,
      userId: USER,
      name: "Temporária",
      contactIds: [uuid(1), uuid(2)],
    });
    if (!criada.ok) throw new Error("não criou");
    const apagada = await apagarLista(admin, ORG, criada.lista.id);
    expect(apagada).toEqual({ id: criada.lista.id, name: "Temporária" });
    expect(tabelas.campaign_audience_lists).toHaveLength(0);
    expect(tabelas.campaign_audience_list_members).toHaveLength(0);
    expect(tabelas.contacts).toHaveLength(2);
  });

  it("não apaga a lista de outra organização", async () => {
    const { admin, tabelas } = banco({ contacts: [contato(1, { organization_id: OUTRA })] });
    const criada = await criarLista(admin, {
      organizationId: OUTRA,
      userId: USER,
      name: "Da outra",
      contactIds: [uuid(1)],
    });
    if (!criada.ok) throw new Error("não criou");
    expect(await apagarLista(admin, ORG, criada.lista.id)).toBeNull();
    expect(tabelas.campaign_audience_lists).toHaveLength(1);
  });
});

describe("usar a lista: listarContatosPorIds", () => {
  it("quem pediu para sair, está anonimizado ou já está em campanha vem com o motivo", async () => {
    const { admin } = banco({
      contacts: [
        contato(1),
        contato(2, { is_blocked: true }),
        contato(3, { is_anonymized: true }),
        contato(4),
        contato(5, { phone_number: null }),
      ],
      campaigns: [{ id: "camp-1", organization_id: ORG, status: CAMPANHAS_VIVAS[0] }],
      campaign_recipients: [{ organization_id: ORG, campaign_id: "camp-1", contact_id: uuid(4) }],
    });
    const r = await listarContatosPorIds(admin, {
      organizationId: ORG,
      ids: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)],
    });
    const motivo = (n: number) => r.find((c) => c.id === uuid(n))?.motivo;
    expect(motivo(1)).toBeNull();
    expect(motivo(2)).toBe("opt_out");
    expect(motivo(3)).toBe("anonimizado");
    expect(motivo(4)).toBe("ja_em_campanha");
    expect(motivo(5)).toBe("sem_telefone");
  });

  it("só enxerga pessoas da organização, mesmo que o ponteiro aponte para outra", async () => {
    const { admin } = banco({ contacts: [contato(1), contato(2, { organization_id: OUTRA })] });
    const r = await listarContatosPorIds(admin, { organizationId: ORG, ids: [uuid(1), uuid(2)] });
    expect(r.map((c) => c.id)).toEqual([uuid(1)]);
  });
});

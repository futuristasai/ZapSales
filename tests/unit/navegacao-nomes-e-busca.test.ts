import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import { CAPACIDADES_DA_ORGANIZACAO } from "@/lib/organizacao/capacidades";
import { casaComABusca, normalizarBusca } from "@/lib/navigation/busca";
import { dicaDoDestino } from "@/lib/navigation/dica";
import { NAV_DESTINATIONS, searchable } from "@/lib/navigation/registry";

/**
 * OS NOMES NOVOS, O TERMO TÉCNICO E A BUSCA (issue #187, do #183).
 *
 * O dono leigo não sabe o que é "Webhooks"; o técnico não acha a tela se o nome
 * sumir. Então o NOME fica simples, o TERMO TÉCNICO fica à vista, e a busca acha
 * a tela por qualquer dos dois — e pelo nome que a pessoa usava antes.
 *
 * O que se confere é o que a pessoa vê: o nome da tela, e o que ela encontra
 * digitando. Não como o catálogo guarda isso por dentro.
 */

interface Renomeada {
  href: string;
  antes: string;
  nome: string;
  /** O termo técnico que fica embaixo do nome; ausente = a tela não leva termo. */
  termo?: string;
}

/** A tabela de "Nomes" da spec do #183, tela por tela. */
const RENOMEADAS: readonly Renomeada[] = [
  { href: "/app/inbox", antes: "Inbox", nome: "Conversas", termo: "inbox" },
  { href: "/app/radar", antes: "Radar", nome: "Riscos de Perda" },
  { href: "/app/agenda", antes: "Agenda", nome: "Compromissos" },
  { href: "/app/ai/cases", antes: "Casos", nome: "Aguardando Humano" },
  { href: "/app/webhooks", antes: "Webhooks", nome: "Avisar outros sistemas", termo: "webhooks" },
  {
    href: "/app/ai/routers",
    antes: "Roteadores",
    nome: "Quem atende cada conversa",
    termo: "roteadores",
  },
  { href: "/app/ai/skills", antes: "Skills", nome: "O que o agente sabe fazer", termo: "skills" },
  { href: "/app/ai/credentials", antes: "Credenciais", nome: "Chave da IA", termo: "API key" },
  { href: "/app/ai/providers", antes: "Provedores", nome: "Qual IA usar", termo: "provedores" },
  {
    href: "/app/settings/api-tokens",
    antes: "API Tokens",
    nome: "Chaves de acesso",
    termo: "API tokens",
  },
  {
    href: "/app/ai/external-tools",
    antes: "Ferramentas externas",
    nome: "Conectar outros sistemas",
    termo: "MCP",
  },
  { href: "/app/ai/runs", antes: "Execuções", nome: "Histórico do agente", termo: "logs" },
  { href: "/app/audit", antes: "Auditoria", nome: "Quem mexeu em quê", termo: "audit log" },
  {
    href: "/app/settings/atendimento",
    antes: "Distribuição de atendimento",
    nome: "Revezamento da equipe",
    termo: "round-robin",
  },
  { href: "/app/settings/tags", antes: "Tags", nome: "Etiquetas", termo: "tags" },
  {
    href: "/app/settings/tenant",
    antes: "Organização",
    nome: "Dados da empresa",
    termo: "organização",
  },
  {
    href: "/app/integracao-dados",
    antes: "Dados externos",
    nome: "Dados de outro sistema",
    termo: "banco externo",
  },
  {
    href: "/app/settings/meta-ads",
    antes: "Meta Ads",
    nome: "Conta de anúncios",
    termo: "Meta Ads",
  },
  { href: "/app/settings/tenant/proposals", antes: "Propostas", nome: "Padrões de proposta" },
];

/** Mantêm o nome e ganham o termo técnico ("sem trocar o nome"). */
const SO_GANHAM_TERMO: readonly Renomeada[] = [
  { href: "/app/ai/knowledge/sources", antes: "Conhecimento", nome: "Conhecimento", termo: "RAG" },
  { href: "/app/settings/conversoes", antes: "Conversões", nome: "Conversões", termo: "CAPI" },
  {
    href: "/app/settings/voip-trunk",
    antes: "Linha telefônica",
    nome: "Linha telefônica",
    termo: "SIP",
  },
  { href: "/app/settings/security", antes: "Segurança", nome: "Segurança", termo: "MFA" },
  { href: "/app/imports", antes: "Importações", nome: "Importações", termo: "CSV / XLSX" },
];

// O dono vê tudo o que a instalação tem, com os recursos opcionais ligados: assim
// a tela não some da busca por um motivo que não é o que este arquivo mede.
const dono = () =>
  searchable(false, "admin", undefined, MODULOS_OPCIONAIS, CAPACIDADES_DA_ORGANIZACAO);

function acha(destinos: ReturnType<typeof dono>, digitado: string): string[] {
  const termo = normalizarBusca(digitado);
  return destinos.filter((d) => casaComABusca(d, termo, "")).map((d) => d.href);
}

const porHref = new Map(NAV_DESTINATIONS.map((d) => [d.href, d]));

describe("os nomes novos do menu", () => {
  it.each(RENOMEADAS)("$href se chama «$nome»", ({ href, nome }) => {
    expect(porHref.get(href)?.label).toBe(nome);
  });

  it.each([...RENOMEADAS, ...SO_GANHAM_TERMO])(
    "$href leva o termo técnico $termo",
    ({ href, termo }) => {
      expect(porHref.get(href)?.menu.termo).toBe(termo);
    },
  );

  it("nenhuma tela guarda um segundo nome além do que o menu mostra", () => {
    // O nome mora num lugar só: `label`. Dois campos com o nome dariam duas verdades.
    for (const d of NAV_DESTINATIONS) {
      expect(Object.keys(d.menu), d.href).not.toContain("nome");
    }
  });

  it("duas telas não carregam o mesmo nome — o nome novo distingue o que o antigo confundia", () => {
    const repetidos = new Map<string, string[]>();
    for (const d of NAV_DESTINATIONS)
      repetidos.set(d.label, [...(repetidos.get(d.label) ?? []), d.href]);
    expect([...repetidos].filter(([, hrefs]) => hrefs.length > 1)).toEqual([]);
  });
});

describe("a busca (Ctrl K) acha a tela", () => {
  it.each(RENOMEADAS)("$href: pelo nome novo «$nome»", ({ href, nome }) => {
    expect(acha(dono(), nome)).toContain(href);
  });

  it.each(RENOMEADAS)("$href: pelo nome antigo «$antes»", ({ href, antes }) => {
    expect(acha(dono(), antes)).toContain(href);
  });

  it.each([...RENOMEADAS, ...SO_GANHAM_TERMO].filter((r) => r.termo))(
    "$href: pelo termo técnico «$termo»",
    ({ href, termo }) => {
      expect(acha(dono(), termo!)).toContain(href);
    },
  );

  it("o pedido da spec: «Inbox», «Radar», «Casos» e «Webhooks» chegam à tela nova", () => {
    expect(acha(dono(), "Inbox")).toContain("/app/inbox");
    expect(acha(dono(), "Radar")).toContain("/app/radar");
    expect(acha(dono(), "Casos")).toContain("/app/ai/cases");
    expect(acha(dono(), "Webhooks")).toContain("/app/webhooks");
  });

  it("acha pela descrição, sem acento e sem caixa", () => {
    expect(acha(dono(), "PROVEDOR DE IA")).toContain("/app/ai/credentials");
    expect(acha(dono(), "operadora de telefonia")).toContain("/app/settings/voip-trunk");
  });

  it("«chave» leva às duas telas de chave, e «webhook» à tela de avisos", () => {
    expect(acha(dono(), "chave")).toEqual(
      expect.arrayContaining(["/app/ai/credentials", "/app/settings/api-tokens"]),
    );
    expect(acha(dono(), "webhook")).toContain("/app/webhooks");
  });

  it("achar não é autorizar: quem não vê a tela não a encontra", () => {
    const atendente = searchable(false, "agent", undefined, MODULOS_OPCIONAIS, []);
    // Webhooks pede gerente; Chaves de acesso pede administrador.
    expect(acha(atendente, "webhooks")).not.toContain("/app/webhooks");
    expect(acha(atendente, "API tokens")).not.toContain("/app/settings/api-tokens");
    expect(acha(atendente, "Inbox")).toContain("/app/inbox");
  });

  it("a busca vazia não filtra nada", () => {
    const todos = dono();
    expect(acha(todos, "")).toHaveLength(todos.length);
  });

  it("a palavra errada não acha tela nenhuma", () => {
    expect(acha(dono(), "zzzxqk")).toEqual([]);
  });

  it("o texto que a pessoa VÊ na língua dela também acha a tela", () => {
    const traduz = (t: string) => (t === "Chave da IA" ? "Clave de la IA" : t);
    const d = porHref.get("/app/ai/credentials")!;
    expect(casaComABusca(d, normalizarBusca("clave de la ia"), "", traduz)).toBe(true);
    expect(casaComABusca(d, normalizarBusca("clave de la ia"), "")).toBe(false);
  });
});

describe("a dica ao passar o mouse", () => {
  const igual = (t: string) => t;

  it("traz o nome, o termo técnico e a descrição", () => {
    const dica = dicaDoDestino(porHref.get("/app/webhooks")!, igual);
    expect(dica).toBe(
      "Avisar outros sistemas (webhooks) — Avise outros sistemas quando algo acontecer aqui dentro.",
    );
  });

  it("sem termo técnico, não deixa parênteses vazios", () => {
    const dica = dicaDoDestino(porHref.get("/app/radar")!, igual);
    expect(dica.startsWith("Riscos de Perda — ")).toBe(true);
    expect(dica).not.toContain("()");
  });

  it("sai na língua da pessoa", () => {
    const dica = dicaDoDestino(porHref.get("/app/ai/credentials")!, (t) => `«${t}»`);
    expect(dica).toContain("«Chave da IA» («API key»)");
  });
});

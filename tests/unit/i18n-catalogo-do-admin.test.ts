import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOGO_DO_ADMIN, GRUPOS_DO_ADMIN, SUBPAGINAS_DO_ADMIN } from "@/lib/admin/catalogo";
import { TEXTOS_DO_CHECKLIST } from "@/components/admin/dashboard/ChecklistDaInstalacao";
import { TEXTOS_DOS_CARTOES } from "@/components/admin/dashboard/KPICards";
import { TEXTOS_DA_LICENCA_NO_PAINEL } from "@/components/admin/dashboard/CartaoDaLicenca";
import { TEXTOS_DA_SAUDE } from "@/lib/saude/da-instalacao";
import { textoDaLicenca, textoDoModo } from "@/lib/licenca/textos";
import type { EstadoDaLicenca } from "@/lib/licenca/decidir";
import { RECURSOS_OPCIONAIS } from "@/lib/recursos-opcionais/catalogo";
import { DICIONARIO } from "@/lib/i18n/dicionario";

/**
 * O CATÁLOGO DO ADMIN FALA OS QUATRO IDIOMAS (issue #308, histórias 17 e 18).
 *
 * O texto do menu, das dicas e do cabeçalho de cada tela mora em `lib/admin/catalogo.ts`
 * e chega à tela por `t(item.label)` — variável de laço, que a varredura de chaves de
 * `i18n-espanhol-cobre-a-tela` não resolve. Aqui o catálogo é lido como dado, sem adivinhar.
 *
 * O chinês é cobrado também, ao contrário do resto do produto (`zh-CN` ainda é
 * `em_construcao` no registro): a issue pede os quatro idiomas para esta área, e uma
 * área nova nasce inteira em vez de entrar na dívida.
 */
const ler = (nome: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "..", "..", "lib", "i18n", "traducoes", nome), "utf8"),
  ) as Record<string, string>;
const INGLES = ler("en.json");
const CHINES = ler("zh-CN.json");

function textos(): { onde: string; texto: string }[] {
  const lista: { onde: string; texto: string }[] = [];
  for (const g of GRUPOS_DO_ADMIN) lista.push({ onde: `grupo:${g.id}`, texto: g.label });
  for (const [id, texto] of Object.entries(SUBPAGINAS_DO_ADMIN))
    lista.push({ onde: `subpagina:${id}`, texto });
  for (const i of CATALOGO_DO_ADMIN) {
    for (const campo of ["label", "dica", "paraQueServe", "quandoUsar"] as const) {
      lista.push({ onde: `${i.href} [${campo}]`, texto: i[campo] });
    }
  }
  // Os cartões e o checklist do Painel chegam à tela por `t(c.rotulo)` / `t(T.x)` — mesma
  // razão: variável, não literal.
  for (const [id, textos] of Object.entries(TEXTOS_DOS_CARTOES)) {
    for (const [campo, texto] of Object.entries(textos))
      lista.push({ onde: `cartao:${id} [${campo}]`, texto });
  }
  for (const [campo, texto] of Object.entries(TEXTOS_DO_CHECKLIST))
    lista.push({ onde: `checklist [${campo}]`, texto });
  for (const r of RECURSOS_OPCIONAIS.filter((r) => r.checklist)) {
    lista.push(
      { onde: `checklist:${r.id} [nome]`, texto: r.nome },
      { onde: `checklist:${r.id} [oQueFaz]`, texto: r.oQueFaz },
    );
  }
  // A saúde e a licença do Painel (issue #310). A saúde tem dois níveis (nomes, estados).
  const folhas = (prefixo: string, obj: object) => {
    for (const [campo, valor] of Object.entries(obj)) {
      if (typeof valor === "string") lista.push({ onde: `${prefixo} [${campo}]`, texto: valor });
      else folhas(`${prefixo}.${campo}`, valor as object);
    }
  };
  folhas("saude", TEXTOS_DA_SAUDE);
  folhas("licenca-no-painel", TEXTOS_DA_LICENCA_NO_PAINEL);
  // As frases da licença que o cartão reaproveita (`textoDaLicenca`, `textoDoModo`): o
  // Painel as mostra, então também têm de existir nos quatro idiomas. Lidas com um `t`
  // que só anota o que recebeu.
  const anotar = (texto: string) => {
    lista.push({ onde: "licenca (textos.ts)", texto });
    return texto;
  };
  const estados: EstadoDaLicenca[] = [
    "sem_selo",
    "ativacao_pendente",
    "temporario_valido",
    "permanente_valido",
    "temporario_vencido",
    "bloqueada",
  ];
  for (const e of estados) for (const dias of [null, 0, 1, 7]) textoDaLicenca(e, dias, anotar);
  textoDoModo("sombra", anotar);
  textoDoModo("valendo", anotar);
  return lista;
}

describe("o catálogo do admin tem os quatro idiomas", () => {
  const todos = textos();

  it("leu o catálogo de verdade (não é vacuidade)", () => {
    expect(todos.length).toBeGreaterThan(60);
  });

  it.each([
    [
      "espanhol",
      (t: string) => Boolean(DICIONARIO[t]?.es),
      'lib/i18n/dicionario.ts — "pt": { es: "…" }',
    ],
    ["inglês", (t: string) => Boolean(INGLES[t]), 'lib/i18n/traducoes/en.json — "pt": "…"'],
    ["chinês", (t: string) => Boolean(CHINES[t]), 'lib/i18n/traducoes/zh-CN.json — "pt": "…"'],
  ] as const)("todo texto tem %s", (_nome, tem, onde) => {
    const faltam = todos
      .filter((t) => !tem(t.texto))
      .map((t) => `${t.onde} → ${JSON.stringify(t.texto)}`);
    expect(faltam, `Conserto: uma linha em ${onde}`).toEqual([]);
  });

  it("a tradução não é a frase em português copiada (fora nomes próprios)", () => {
    const iguaisPermitidos = new Set(["Marca", "E-mail", "Google Agenda"]);
    const copiadas = todos
      .filter((t) => !iguaisPermitidos.has(t.texto))
      .filter(
        (t) =>
          INGLES[t.texto] === t.texto ||
          (DICIONARIO[t.texto]?.es === t.texto && t.texto.length > 25),
      )
      .map((t) => t.onde);
    expect(copiadas).toEqual([]);
  });
});

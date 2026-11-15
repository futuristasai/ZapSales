/**
 * "SUA INSTALAÇÃO ESTÁ PRONTA?" — O CHECKLIST DO PAINEL (issue #308, histórias 32–35).
 *
 * O checklist não tem lista própria: cada item é um recurso do catálogo de Recursos
 * opcionais marcado como parte dele, e o estado é o MESMO `estadoDoRecurso` que aquela
 * tela mostra. As duas telas nunca discordam porque não há duas contas.
 */
import { describe, expect, it } from "vitest";

import { checklistDaInstalacao } from "@/lib/recursos-opcionais/checklist";
import {
  RECURSOS_OPCIONAIS,
  estadoDoRecurso,
  type FontesDeEstado,
} from "@/lib/recursos-opcionais/catalogo";

const fontes = (servidor: Record<string, boolean | null>): FontesDeEstado => ({
  modulos: [],
  settings: null,
  servidor,
});

const INSTALACAO_FRESCA = fontes({
  email: false,
  marca: false,
  cadastro: true,
  meta: false,
  google_agenda: false,
});
const TUDO_FEITO = fontes({
  email: true,
  marca: true,
  cadastro: true,
  meta: true,
  google_agenda: true,
});

describe("checklist da instalação", () => {
  it("traz os cinco itens da issue, na ordem em que se configura, com o nível de cada um", () => {
    const { itens } = checklistDaInstalacao(INSTALACAO_FRESCA);
    expect(itens.map((i) => [i.recurso.id, i.nivel])).toEqual([
      ["email", "obrigatorio"],
      ["marca", "opcional"],
      ["cadastro", "opcional"],
      ["meta", "opcional"],
      ["google_agenda", "opcional"],
    ]);
  });

  it("instalação fresca: o e-mail falta e é o que segura o essencial", () => {
    const r = checklistDaInstalacao(INSTALACAO_FRESCA);
    expect(r.essencialPronto).toBe(false);
    expect(r.tudoPronto).toBe(false);
    expect(r.itens.find((i) => i.recurso.id === "email")?.feito).toBe(false);
    expect(r.itens.find((i) => i.recurso.id === "cadastro")?.feito).toBe(true);
    expect(r.faltamObrigatorios).toBe(1);
    expect(r.faltamOpcionais).toBe(3);
  });

  it("só opcionais faltando: o essencial está pronto (o Google Agenda desligado não é defeito)", () => {
    const r = checklistDaInstalacao(
      fontes({ email: true, marca: false, cadastro: true, meta: false, google_agenda: false }),
    );
    expect(r.essencialPronto).toBe(true);
    expect(r.tudoPronto).toBe(false);
    expect(r.faltamOpcionais).toBe(3);
  });

  it("tudo configurado: tudoPronto, para o painel recolher o checklist", () => {
    const r = checklistDaInstalacao(TUDO_FEITO);
    expect(r.tudoPronto).toBe(true);
    expect(r.faltamObrigatorios + r.faltamOpcionais).toBe(0);
  });

  it("leitura que falhou não vira 'falta' nem 'feito': fica como não lido", () => {
    const r = checklistDaInstalacao(
      fontes({ email: null, marca: true, cadastro: true, meta: true, google_agenda: true }),
    );
    const email = r.itens.find((i) => i.recurso.id === "email")!;
    expect(email.estado).toBe("nao_lido");
    expect(email.feito).toBe(false);
    expect(r.essencialPronto).toBe(false);
    expect(r.naoLidos).toBe(1);
  });

  it("o estado é o mesmo que a tela de Recursos opcionais calcula (nenhuma segunda conta)", () => {
    for (const item of checklistDaInstalacao(INSTALACAO_FRESCA).itens) {
      const doCatalogo = RECURSOS_OPCIONAIS.find((r) => r.id === item.recurso.id)!;
      expect(item.estado).toBe(estadoDoRecurso(doCatalogo, INSTALACAO_FRESCA));
    }
  });

  it("todo item leva a uma tela da instalação", () => {
    for (const item of checklistDaInstalacao(INSTALACAO_FRESCA).itens) {
      expect(item.recurso.href).toMatch(/^\/admin\//);
    }
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { recusouMarketing } from "@/lib/campanhas/elegibilidade";
import {
  contatoDisseNao,
  podeAutorizarIA,
  podeGravarConsentimento,
  type EstadoDoContato,
} from "@/lib/webhooks/entrada-sem-assinatura";

/**
 * A ENTRADA SEM ASSINATURA NÃO DESFAZ A RECUSA DE UM CONTATO (#270).
 *
 * Uma fonte de captação sem segredo é um endereço público: qualquer pessoa
 * monta um envio com o telefone de quem quiser, marcando "aceito". Este arquivo
 * fixa a régua (pura) e a ligação dela na rota.
 *
 * O que NÃO está aqui, declarado: a rota rodando contra o banco. Os casos de
 * consentimento que já existem em `tests/invariants/webhooks-inbound.test.ts`
 * (concede; recusa; quem concedeu e depois recusa; formulário sem a pergunta)
 * continuam valendo e são eles que provam que o caminho comum não mudou.
 */
const nunca: EstadoDoContato = { recusouMarketing: false, bloqueado: false };
const recusou: EstadoDoContato = { recusouMarketing: true, bloqueado: false };
const bloqueado: EstadoDoContato = { recusouMarketing: false, bloqueado: true };
const osDois: EstadoDoContato = { recusouMarketing: true, bloqueado: true };

describe("gravar o consentimento que o envio afirma, num contato que já existia", () => {
  it.each([
    ["recusou marketing", recusou],
    ["pediu para sair (bloqueado)", bloqueado],
    ["recusou e está bloqueado", osDois],
  ])("⭐ concessão SEM assinatura não vale para quem %s", (_nome, contato) => {
    expect(podeGravarConsentimento({ concede: true, fonteAssinada: false, contato })).toBe(false);
  });

  it("concessão sem assinatura vale para quem nunca disse não — é para isso que o formulário serve", () => {
    expect(podeGravarConsentimento({ concede: true, fonteAssinada: false, contato: nunca })).toBe(true);
  });

  it("sem conseguir ler o estado atual, a concessão sem assinatura não é gravada", () => {
    expect(podeGravarConsentimento({ concede: true, fonteAssinada: false, contato: null })).toBe(false);
  });

  it.each([nunca, recusou, bloqueado, osDois, null])(
    "RECUSA sempre vale, com ou sem assinatura (contato: %j)",
    (contato) => {
      expect(podeGravarConsentimento({ concede: false, fonteAssinada: false, contato })).toBe(true);
      expect(podeGravarConsentimento({ concede: false, fonteAssinada: true, contato })).toBe(true);
    },
  );

  it.each([nunca, recusou, bloqueado, osDois, null])(
    "fonte ASSINADA concede — quem assina responde pelo que afirma (contato: %j)",
    (contato) => {
      expect(podeGravarConsentimento({ concede: true, fonteAssinada: true, contato })).toBe(true);
    },
  );
});

describe("autorizar a IA a atender o contato", () => {
  it.each([
    ["recusou marketing", recusou],
    ["pediu para sair (bloqueado)", bloqueado],
  ])("⭐ envio SEM assinatura não autoriza a IA para quem %s", (_nome, contato) => {
    expect(podeAutorizarIA({ fonteAssinada: false, contato })).toBe(false);
  });

  it("contato que nasceu neste envio é autorizado — não havia 'não' anterior", () => {
    expect(podeAutorizarIA({ fonteAssinada: false, contato: "novo" })).toBe(true);
  });

  it("contato existente que nunca disse não é autorizado como antes", () => {
    expect(podeAutorizarIA({ fonteAssinada: false, contato: nunca })).toBe(true);
  });

  it("sem conseguir ler o estado atual, o envio sem assinatura não autoriza", () => {
    expect(podeAutorizarIA({ fonteAssinada: false, contato: null })).toBe(false);
  });

  it("fonte assinada autoriza", () => {
    expect(podeAutorizarIA({ fonteAssinada: true, contato: recusou })).toBe(true);
  });
});

describe("o que conta como 'disse não'", () => {
  it("a régua lê o mesmo `declined_at` que a campanha lê", () => {
    const comRecusa = { marketing: { granted_at: null, declined_at: "2026-11-01T00:00:00Z" } };
    const comAceite = { marketing: { granted_at: "2026-11-01T00:00:00Z", declined_at: null } };
    expect(contatoDisseNao({ recusouMarketing: recusouMarketing(comRecusa), bloqueado: false })).toBe(true);
    expect(contatoDisseNao({ recusouMarketing: recusouMarketing(comAceite), bloqueado: false })).toBe(false);
    expect(contatoDisseNao({ recusouMarketing: recusouMarketing(null), bloqueado: false })).toBe(false);
    expect(contatoDisseNao(null)).toBe(false);
  });
});

/**
 * Cerca: a régua só protege se a rota passar por ela. Lê o código-fonte porque
 * a rota tem uma dúzia de dependências de I/O; o que se fixa aqui é a ORDEM —
 * decidir antes de gravar, decidir antes de autorizar.
 */
describe("a rota de entrada passa pela régua", () => {
  const rota = readFileSync("app/api/v1/webhooks/in/[token]/route.ts", "utf8");

  it("sabe se a fonte assinou: segredo que decifrou e assinatura que conferiu", () => {
    expect(rota).toMatch(/const fonteAssinada = sourceSecret !== null;/);
  });

  it("há UM único ponto que grava consentimento em contato existente, e ele vem depois da decisão", () => {
    const gravacoes = [...rota.matchAll(/\.update\(\{ consent: /g)];
    expect(gravacoes).toHaveLength(1);
    const decisao = rota.indexOf("podeGravarConsentimento(");
    expect(decisao).toBeGreaterThan(-1);
    expect(decisao).toBeLessThan(gravacoes[0]!.index!);
    // …e a gravação está no ramo do `else`: o `if (!pode…)` não grava.
    const trecho = rota.slice(decisao, gravacoes[0]!.index!);
    expect(trecho).toMatch(/\} else \{/);
  });

  it("a IA só é autorizada num único ponto, e a condição dele inclui a decisão", () => {
    expect([...rota.matchAll(/await autorizarContatoParaIA\(/g)]).toHaveLength(1);
    expect(rota).toMatch(
      /if \(respondiMapped && contactId && !consentNegado && iaPodeSerAutorizada\) \{[\s\S]{0,400}await autorizarContatoParaIA\(/,
    );
    expect(rota).toMatch(/const iaPodeSerAutorizada = podeAutorizarIA\(/);
  });

  it("o estado anterior do contato vem do banco, com a organização no filtro", () => {
    expect(rota).toMatch(
      /\.select\("consent, is_blocked"\)\s*\.eq\("id", contactId\)\s*\.eq\("organization_id", source\.organization_id\)/,
    );
  });

  it("toda mudança de consentimento desta rota vai para a auditoria", () => {
    expect([...rota.matchAll(/action: "lgpd\.consent_changed"/g)].length).toBeGreaterThanOrEqual(2);
  });
});

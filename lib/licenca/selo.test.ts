// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assinarParaTeste,
  CABECALHO_PADRAO,
  chavePublicaDeTeste,
} from "../../tests/support/licenca-chave-de-teste";
import {
  AGORA_DE_REFERENCIA,
  INSTALACAO_DE_EXEMPLO,
  montarConjuntoDeExemplo,
} from "../../tests/support/licenca-selos-de-exemplo";
import { TOLERANCIA_DE_EMISSAO_S, verificarSelo } from "./selo";

const CHAVES = [chavePublicaDeTeste];
const LICENCA = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const JTI = "00000000-0000-4000-8000-000000000099";

function opcoes(agora = AGORA_DE_REFERENCIA, instalacaoId = INSTALACAO_DE_EXEMPLO) {
  return { chaves: CHAVES, instalacaoId, agora };
}

function carga(mudancas: Record<string, unknown> = {}) {
  return {
    v: 1,
    iss: "zapsales-licencas",
    sub: INSTALACAO_DE_EXEMPLO,
    lic: LICENCA,
    tipo: "temporario",
    iat: AGORA_DE_REFERENCIA - 3600,
    exp: AGORA_DE_REFERENCIA + 3600,
    jti: JTI,
    ...mudancas,
  };
}

describe("selos de exemplo (os mesmos que o servidor de licenças consome)", () => {
  const arquivo = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../../tests/fixtures/licenca/selos-de-exemplo.json"),
      "utf8",
    ),
  ) as Awaited<ReturnType<typeof montarConjuntoDeExemplo>>;

  it("o arquivo versionado é exatamente o que o gerador produz (Ed25519 é determinístico)", async () => {
    expect(arquivo).toEqual(await montarConjuntoDeExemplo());
  });

  it("toda linha com um selo declara o falso positivo do detector de segredos (gitleaks:allow)", () => {
    const linhas = readFileSync(
      path.resolve(__dirname, "../../tests/fixtures/licenca/selos-de-exemplo.json"),
      "utf8",
    ).split("\n");
    const comSelo = linhas.filter((l) => /eyJ[A-Za-z0-9_-]{20,}\./.test(l));
    expect(comSelo.length).toBeGreaterThan(0);
    for (const linha of comSelo) expect(linha).toContain("gitleaks:allow");
  });

  it("cobre os casos do contrato, seção 6", () => {
    const nomes = arquivo.selos.map((s) => s.nome);
    expect(nomes).toEqual([
      "temporario_valido",
      "permanente_valido",
      "temporario_vencido",
      "emitido_no_futuro",
      "assinatura_adulterada",
      "alg_none",
      "kid_desconhecido",
      "instalacao_de_outra",
      "campo_extra",
      "versao_diferente",
      "permanente_com_exp",
      "temporario_sem_exp",
    ]);
  });

  for (const caso of (
    JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../tests/fixtures/licenca/selos-de-exemplo.json"),
        "utf8",
      ),
    ) as {
      selos: {
        nome: string;
        selo: string;
        esperado: { ok: boolean; tipo?: string; motivo?: string };
      }[];
    }
  ).selos) {
    it(`${caso.nome} → ${caso.esperado.ok ? `válido (${caso.esperado.tipo})` : caso.esperado.motivo}`, async () => {
      const r = await verificarSelo(caso.selo, opcoes());
      if (caso.esperado.ok) {
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.selo.tipo).toBe(caso.esperado.tipo);
      } else {
        expect(r).toEqual({ ok: false, motivo: caso.esperado.motivo });
      }
    });
  }
});

describe("verificarSelo — fronteiras do relógio (sempre com o 'agora' como parâmetro)", () => {
  it("exp igual ao agora já é vencido; um segundo antes ainda vale", async () => {
    const selo = await assinarParaTeste(carga({ exp: AGORA_DE_REFERENCIA }));
    expect(await verificarSelo(selo, opcoes(AGORA_DE_REFERENCIA))).toEqual({
      ok: false,
      motivo: "expirado",
    });
    expect((await verificarSelo(selo, opcoes(AGORA_DE_REFERENCIA - 1))).ok).toBe(true);
  });

  it("iat no limite da tolerância vale; um segundo além é rejeitado", async () => {
    const noLimite = await assinarParaTeste(
      carga({
        iat: AGORA_DE_REFERENCIA + TOLERANCIA_DE_EMISSAO_S,
        exp: AGORA_DE_REFERENCIA + 9999,
      }),
    );
    const alem = await assinarParaTeste(
      carga({
        iat: AGORA_DE_REFERENCIA + TOLERANCIA_DE_EMISSAO_S + 1,
        exp: AGORA_DE_REFERENCIA + 9999,
      }),
    );
    expect((await verificarSelo(noLimite, opcoes())).ok).toBe(true);
    expect(await verificarSelo(alem, opcoes())).toEqual({ ok: false, motivo: "emitido_no_futuro" });
  });

  it("o temporário vence por si só: passadas 48 horas do agora de referência, expirou", async () => {
    const selo = await assinarParaTeste(carga());
    const dois_dias_depois = AGORA_DE_REFERENCIA + 48 * 3600;
    expect(await verificarSelo(selo, opcoes(dois_dias_depois))).toEqual({
      ok: false,
      motivo: "expirado",
    });
  });

  it("o permanente não tem vencimento: continua válido dez anos depois, sem servidor nenhum", async () => {
    const selo = await assinarParaTeste(
      carga({ tipo: "permanente", exp: undefined, iat: AGORA_DE_REFERENCIA - 86_400 }),
    );
    const dezAnos = AGORA_DE_REFERENCIA + 10 * 365 * 86_400;
    const r = await verificarSelo(selo, opcoes(dezAnos));
    expect(r.ok).toBe(true);
  });
});

describe("verificarSelo — o que cada conferência barra", () => {
  it("typ errado no cabeçalho", async () => {
    const selo = await assinarParaTeste(carga(), { ...CABECALHO_PADRAO, typ: "JWT" });
    expect(await verificarSelo(selo, opcoes())).toEqual({
      ok: false,
      motivo: "cabecalho_invalido",
    });
  });

  it("emissor errado", async () => {
    const selo = await assinarParaTeste(carga({ iss: "outro-servidor" }));
    expect(await verificarSelo(selo, opcoes())).toEqual({ ok: false, motivo: "emissor_invalido" });
  });

  it("UUID da instalação não distingue maiúscula de minúscula", async () => {
    const selo = await assinarParaTeste(carga());
    const r = await verificarSelo(
      selo,
      opcoes(AGORA_DE_REFERENCIA, INSTALACAO_DE_EXEMPLO.toUpperCase()),
    );
    expect(r.ok).toBe(true);
  });

  it("sub que não é UUID v4 é payload inválido", async () => {
    const selo = await assinarParaTeste(carga({ sub: "instalacao-1" }));
    expect(await verificarSelo(selo, opcoes())).toEqual({ ok: false, motivo: "payload_invalido" });
  });

  it("só vale chave da lista de quem chama: um kid fora dela é rejeitado", async () => {
    // O atacante assina com a PRÓPRIA chave e escolhe o kid que quiser. Se o kid não está na
    // lista que a chamada entregou, o selo é rejeitado antes de qualquer conferência de assinatura.
    const selo = await assinarParaTeste(carga(), { ...CABECALHO_PADRAO, kid: "atacante-1" });
    expect(await verificarSelo(selo, opcoes())).toEqual({
      ok: false,
      motivo: "chave_desconhecida",
    });
  });

  it("chave configurada mal formada é erro interno (rejeita), nunca exceção", async () => {
    const selo = await assinarParaTeste(carga());
    const r = await verificarSelo(selo, {
      chaves: [{ kid: CABECALHO_PADRAO.kid, jwk: { kty: "OKP", crv: "Ed25519", x: "curto" } }],
      instalacaoId: INSTALACAO_DE_EXEMPLO,
      agora: AGORA_DE_REFERENCIA,
    });
    expect(r).toEqual({ ok: false, motivo: "erro_interno" });
  });

  it("agora inválido (NaN) rejeita", async () => {
    const selo = await assinarParaTeste(carga());
    expect(await verificarSelo(selo, opcoes(Number.NaN))).toEqual({
      ok: false,
      motivo: "erro_interno",
    });
  });
});

describe("verificarSelo — entrada torta nunca lança", () => {
  const entradas: [string, string][] = [
    ["vazia", ""],
    ["só pontos", ".."],
    ["duas partes", "abc.def"],
    ["quatro partes", "a.b.c.d"],
    ["cabeçalho que não é base64", "!!!.@@@.###"],
    ["cabeçalho que não é JSON", `${Buffer.from("isto nao e json").toString("base64url")}.e30.`],
    ["cabeçalho JSON mas não objeto", `${Buffer.from("[1,2]").toString("base64url")}.e30.assin`],
    ["unicode", "ação.çõ.é"],
    ["gigante", "a".repeat(100_000)],
  ];

  for (const [nome, entrada] of entradas) {
    it(`${nome} → rejeitado, sem exceção`, async () => {
      const r = await verificarSelo(entrada, opcoes());
      expect(r.ok).toBe(false);
    });
  }

  it("entrada que não é string → rejeitado", async () => {
    // @ts-expect-error — o contrato é string, mas o dado vem de fora (banco, rede, arquivo).
    const r = await verificarSelo(undefined, opcoes());
    expect(r).toEqual({ ok: false, motivo: "formato_invalido" });
  });
});

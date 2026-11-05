// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assinarParaTeste, chavePublicaDeTeste } from "../../tests/support/licenca-chave-de-teste";
import {
  AGORA_DE_REFERENCIA,
  INSTALACAO_DE_EXEMPLO,
} from "../../tests/support/licenca-selos-de-exemplo";
import { decidir } from "./decidir";
import type { EstadoLocal } from "./estado";

const CHAVES = [chavePublicaDeTeste];
const OPCOES = { chaves: CHAVES };
const AGORA = AGORA_DE_REFERENCIA;
const HORA = 3600;
const DIA = 86_400;
const LICENCA = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

let contador = 0;
function carga(mudancas: Record<string, unknown> = {}) {
  contador += 1;
  return {
    v: 1,
    iss: "zapsales-licencas",
    sub: INSTALACAO_DE_EXEMPLO,
    lic: LICENCA,
    jti: `00000000-0000-4000-8000-${String(contador).padStart(12, "0")}`,
    ...mudancas,
  };
}

/** Selo temporário emitido em `emitidoEm`, com a validade de 48 horas do contrato. */
async function temporario(emitidoEm = AGORA - HORA) {
  return assinarParaTeste(
    carga({ tipo: "temporario", iat: emitidoEm, exp: emitidoEm + 48 * HORA }),
  );
}

async function permanente(emitidoEm = AGORA - 11 * DIA) {
  return assinarParaTeste(carga({ tipo: "permanente", iat: emitidoEm }));
}

function estado(mudancas: Partial<EstadoLocal> = {}): EstadoLocal {
  return {
    instalacaoId: INSTALACAO_DE_EXEMPLO,
    seloAtual: null,
    maiorHorarioVisto: null,
    ativadaEm: null,
    bloqueio: null,
    ultimaConsultaOkEm: null,
    janelaTerminaEm: null,
    modo: "sombra",
    ...mudancas,
  };
}

describe("instalação que nunca foi ativada — opera como uso não comercial", () => {
  it("sem selo: opera, com a faixa de uso não comercial", async () => {
    const d = await decidir(estado(), AGORA, OPCOES);
    expect(d).toMatchObject({
      estado: "sem_selo",
      opera: true,
      mensagem: "uso_nao_comercial",
      seloTipo: null,
      motivoDoSelo: null,
    });
  });

  it("durante a instalação, a ativação ainda por fazer muda só a mensagem — continua operando", async () => {
    const d = await decidir(estado(), AGORA, { ...OPCOES, ativacaoPendente: true });
    expect(d).toMatchObject({
      estado: "ativacao_pendente",
      opera: true,
      mensagem: "ativacao_pendente",
    });
  });

  it("selo forjado numa instalação nunca ativada não é melhor que nenhum selo: continua sem_selo", async () => {
    const d = await decidir(estado({ seloAtual: "lixo.lixo.lixo" }), AGORA, OPCOES);
    expect(d).toMatchObject({ estado: "sem_selo", opera: true });
    expect(d.motivoDoSelo).not.toBeNull();
  });
});

describe("selo temporário — vale 48 horas e some por si só", () => {
  it("dentro do prazo: opera e diz quantos dias faltam da JANELA (que é do servidor)", async () => {
    const d = await decidir(
      estado({
        seloAtual: await temporario(),
        ativadaEm: AGORA - 2 * DIA,
        janelaTerminaEm: AGORA + 8 * DIA - 1,
      }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({
      estado: "temporario_valido",
      opera: true,
      mensagem: "temporaria_faltam_dias",
      diasRestantes: 8,
      seloTipo: "temporario",
    });
  });

  it("janela desconhecida: opera, sem número de dias", async () => {
    const d = await decidir(
      estado({ seloAtual: await temporario(), ativadaEm: AGORA - DIA }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({ estado: "temporario_valido", opera: true, diasRestantes: null });
  });

  it("dias restantes nunca fica negativo", async () => {
    const d = await decidir(
      estado({
        seloAtual: await temporario(),
        ativadaEm: AGORA - 12 * DIA,
        janelaTerminaEm: AGORA - 2 * DIA,
      }),
      AGORA,
      OPCOES,
    );
    expect(d.diasRestantes).toBe(0);
  });

  it("instalação DESCONECTADA não funciona indefinidamente: 48 horas depois da emissão, vence", async () => {
    const emitido = AGORA - HORA;
    const e = estado({ seloAtual: await temporario(emitido), ativadaEm: AGORA - 2 * DIA });
    expect((await decidir(e, emitido + 48 * HORA - 1, OPCOES)).opera).toBe(true);
    const vencida = await decidir(e, emitido + 48 * HORA, OPCOES);
    expect(vencida).toMatchObject({
      estado: "temporario_vencido",
      opera: false,
      mensagem: "autorizacao_vencida",
      motivoDoSelo: "expirado",
    });
  });
});

describe("mexer só no relógio local não concede nada", () => {
  it("relógio voltado 3 dias NÃO estende o temporário vencido: vale o maior horário já visto", async () => {
    const emitido = AGORA - HORA;
    const selo = await temporario(emitido);
    const depoisDoVencimento = emitido + 49 * HORA;
    const d = await decidir(
      estado({
        seloAtual: selo,
        ativadaEm: AGORA - 2 * DIA,
        maiorHorarioVisto: depoisDoVencimento,
      }),
      depoisDoVencimento - 3 * DIA,
      OPCOES,
    );
    expect(d).toMatchObject({ estado: "temporario_vencido", opera: false, relogioRecuou: true });
    expect(d.agora).toBe(depoisDoVencimento);
  });

  it("relógio adiantado só ANTECIPA o vencimento — nunca o adia", async () => {
    const selo = await temporario();
    const e = estado({ seloAtual: selo, ativadaEm: AGORA - 2 * DIA });
    expect((await decidir(e, AGORA + 100 * DIA, OPCOES)).opera).toBe(false);
  });

  it("relógio levemente atrás (dentro da tolerância) não acende o alerta de recuo", async () => {
    const d = await decidir(estado({ maiorHorarioVisto: AGORA }), AGORA - 60, OPCOES);
    expect(d.relogioRecuou).toBe(false);
    expect(d.agora).toBe(AGORA);
  });
});

describe("selo permanente — funciona sem o servidor e não se revoga à distância", () => {
  it("opera, sem mensagem", async () => {
    const d = await decidir(
      estado({ seloAtual: await permanente(), ativadaEm: AGORA - 11 * DIA }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({
      estado: "permanente_valido",
      opera: true,
      mensagem: null,
      seloTipo: "permanente",
    });
  });

  it("continua válido dez anos depois, sem servidor nenhum (sobrevive a reinício: o estado é o do banco)", async () => {
    const d = await decidir(
      estado({ seloAtual: await permanente(), ativadaEm: AGORA - 11 * DIA }),
      AGORA + 10 * 365 * DIA,
      OPCOES,
    );
    expect(d).toMatchObject({ estado: "permanente_valido", opera: true });
  });

  it("vale mais que um bloqueio local: a cláusula 6.3 diz que o permanente não é revogado à distância", async () => {
    const d = await decidir(
      estado({
        seloAtual: await permanente(),
        ativadaEm: AGORA - 11 * DIA,
        bloqueio: { codigo: "reembolso", em: AGORA - HORA },
      }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({ estado: "permanente_valido", opera: true });
  });

  it("de OUTRA instalação não vale: numa instalação ativada, cai em vencida", async () => {
    const outra = await assinarParaTeste(
      carga({
        tipo: "permanente",
        iat: AGORA - DIA,
        sub: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      }),
    );
    const d = await decidir(
      estado({ seloAtual: outra, ativadaEm: AGORA - 11 * DIA }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({
      estado: "temporario_vencido",
      opera: false,
      motivoDoSelo: "instalacao_diferente",
    });
  });
});

describe("bloqueio", () => {
  it("bloqueia mesmo com temporário ainda dentro do prazo", async () => {
    const d = await decidir(
      estado({
        seloAtual: await temporario(),
        ativadaEm: AGORA - 2 * DIA,
        bloqueio: { codigo: "reembolso", em: AGORA - 60 },
      }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({ estado: "bloqueada", opera: false, mensagem: "licenca_bloqueada" });
  });

  it("bloqueia sem selo nenhum e sem ativação (o bloqueio nunca é ignorado)", async () => {
    const d = await decidir(estado({ bloqueio: { codigo: "fraude", em: AGORA } }), AGORA, OPCOES);
    expect(d).toMatchObject({ estado: "bloqueada", opera: false });
  });
});

describe("instalação já ativada NUNCA volta a sem_selo", () => {
  it("perdeu o selo (arquivo apagado): vencida, não sem_selo", async () => {
    const d = await decidir(estado({ ativadaEm: AGORA - 3 * DIA, seloAtual: null }), AGORA, OPCOES);
    expect(d).toMatchObject({ estado: "temporario_vencido", opera: false });
  });

  it("selo adulterado: vencida, e o motivo diz que a assinatura não confere", async () => {
    const bom = await temporario();
    const [c, p, s] = bom.split(".");
    const adulterado = `${c}.${p}.${s?.slice(0, -4)}AAAA`;
    const d = await decidir(
      estado({ seloAtual: adulterado, ativadaEm: AGORA - DIA }),
      AGORA,
      OPCOES,
    );
    expect(d).toMatchObject({
      estado: "temporario_vencido",
      opera: false,
      motivoDoSelo: "assinatura_invalida",
    });
  });

  it("nem a lista de chaves vazia (produção antes da chave real) reabre a instalação ativada", async () => {
    const d = await decidir(
      estado({ seloAtual: await temporario(), ativadaEm: AGORA - DIA }),
      AGORA,
      { chaves: [] },
    );
    expect(d).toMatchObject({
      estado: "temporario_vencido",
      opera: false,
      motivoDoSelo: "chave_desconhecida",
    });
  });
});

describe("a decisão é pura", () => {
  it("o mesmo estado e o mesmo relógio dão a mesma decisão, sempre", async () => {
    const e = estado({
      seloAtual: await temporario(),
      ativadaEm: AGORA - DIA,
      janelaTerminaEm: AGORA + 5 * DIA,
    });
    expect(await decidir(e, AGORA, OPCOES)).toEqual(await decidir(e, AGORA, OPCOES));
  });

  it("nunca lança, nem com estado torto", async () => {
    const d = await decidir(
      estado({ seloAtual: "x".repeat(10_000), ativadaEm: AGORA }),
      Number.NaN,
      OPCOES,
    );
    expect(d.opera).toBe(false);
  });
});

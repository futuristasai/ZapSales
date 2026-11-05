// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Precisa existir ANTES do import: `lib/env.ts` lê o processo no carregamento do módulo.
vi.hoisted(() => {
  // base64 de "chave-de-teste-nao-e-de-producao" (32 bytes): falsa à vista.
  process.env.AI_CRED_AES_KEY = "Y2hhdmUtZGUtdGVzdGUtbmFvLWUtZGUtcHJvZHVjYW8="; // gitleaks:allow — chave FALSA de teste
  delete process.env.INSTALACAO_ID;
});

import { bancoFalso, type BancoFalso } from "../../tests/support/licenca-banco-falso";

let banco: BancoFalso;

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => banco.cliente }));

import { env } from "@/lib/env";

import {
  definirModo,
  garantirEstado,
  gravarAtivacao,
  gravarBloqueio,
  gravarRenovacao,
  lerCredencial,
  registrarHorarioVisto,
} from "./armazem";

const ID_DO_AMBIENTE = "11111111-2222-4333-8444-555555555555";
const ID_DO_BANCO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const AGORA = 1_800_000_000;
const CREDENCIAL = "zpl_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const linhaPronta = (mudancas: Record<string, unknown> = {}) => ({
  id: 1,
  instalacao_id: ID_DO_BANCO,
  selo_atual: null,
  maior_horario_visto: null,
  ativada_em: null,
  bloqueio_codigo: null,
  bloqueio_em: null,
  ultima_consulta_ok_em: null,
  janela_termina_em: null,
  modo: "sombra",
  ...mudancas,
});

beforeEach(() => {
  env.INSTALACAO_ID = "";
  banco = bancoFalso();
});

describe("garantirEstado — a identidade da instalação", () => {
  it("primeira leitura: cria a linha com um UUID v4 gerado e devolve o estado vazio, em sombra", async () => {
    const r = await garantirEstado();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.instalacaoId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(r.estado).toMatchObject({
      ativadaEm: null,
      seloAtual: null,
      bloqueio: null,
      modo: "sombra",
    });
  });

  it("o INSTALACAO_ID do .env semeia a linha quando ela ainda não existe", async () => {
    env.INSTALACAO_ID = ID_DO_AMBIENTE.toUpperCase();
    const r = await garantirEstado();
    expect(r.ok && r.estado.instalacaoId).toBe(ID_DO_AMBIENTE);
  });

  it(".env que não é UUID v4 é ignorado: o app gera o seu, em vez de gravar lixo", async () => {
    env.INSTALACAO_ID = "minha-instalacao";
    const r = await garantirEstado();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estado.instalacaoId).not.toBe("minha-instalacao");
  });

  it("o banco manda: .env que discorda não troca o UUID de uma linha que já existe", async () => {
    banco = bancoFalso({ inicial: linhaPronta() });
    env.INSTALACAO_ID = ID_DO_AMBIENTE;
    const r = await garantirEstado();
    expect(r.ok && r.estado.instalacaoId).toBe(ID_DO_BANCO);
    expect(banco.chamadas.criar).toBe(0);
  });

  it("segunda chamada não cria de novo nem muda o UUID", async () => {
    const a = await garantirEstado();
    const b = await garantirEstado();
    expect(a.ok && b.ok && a.estado.instalacaoId === b.estado.instalacaoId).toBe(true);
    expect(banco.chamadas.criar).toBe(1);
  });
});

describe("garantirEstado — nunca lança", () => {
  it("tabela ausente (PGRST205: imagem nova sobre schema velho) → tabela_ausente", async () => {
    banco = bancoFalso({ erro: { code: "PGRST205" } });
    expect(await garantirEstado()).toEqual({ ok: false, motivo: "tabela_ausente" });
  });

  it("tabela ausente pelo código do Postgres (42P01) também", async () => {
    banco = bancoFalso({ erro: { code: "42P01" } });
    expect(await garantirEstado()).toEqual({ ok: false, motivo: "tabela_ausente" });
  });

  it("banco recusa → banco_recusou, sem vazar a mensagem do erro", async () => {
    banco = bancoFalso({ erro: { code: "XX000", message: "senha do usuário 123 inválida" } });
    const r = await garantirEstado();
    expect(r).toEqual({ ok: false, motivo: "banco_recusou" });
  });

  it("rede caída (lança) → banco_recusou, não exceção", async () => {
    banco = bancoFalso({ lanca: true });
    expect(await garantirEstado()).toEqual({ ok: false, motivo: "banco_recusou" });
  });
});

describe("registrarHorarioVisto — o horário só avança", () => {
  it("grava o maior; um horário menor depois NÃO o faz recuar", async () => {
    banco = bancoFalso({ inicial: linhaPronta() });
    expect(await registrarHorarioVisto(AGORA)).toEqual({ ok: true });
    expect(await registrarHorarioVisto(AGORA - 5 * 86_400)).toEqual({ ok: true });
    const r = await garantirEstado();
    expect(r.ok && r.estado.maiorHorarioVisto).toBe(AGORA);
  });

  it("horário não finito é recusado sem tocar o banco", async () => {
    banco = bancoFalso({ inicial: linhaPronta() });
    expect((await registrarHorarioVisto(Number.NaN)).ok).toBe(false);
    expect(banco.chamadas.atualizar).toBe(0);
  });

  it("sem linha criada ainda, não finge que gravou", async () => {
    expect(await registrarHorarioVisto(AGORA)).toEqual({ ok: false, motivo: "banco_recusou" });
  });
});

describe("gravarAtivacao / lerCredencial — a credencial só existe cifrada", () => {
  beforeEach(() => {
    banco = bancoFalso({ inicial: linhaPronta() });
  });

  it("grava selo, ativada_em e consulta OK; a credencial volta pela decifra", async () => {
    const r = await gravarAtivacao({
      credencial: CREDENCIAL,
      selo: "cab.carga.assin",
      agora: AGORA,
      janelaTerminaEm: AGORA + 10 * 86_400,
    });
    expect(r).toEqual({ ok: true });

    const e = await garantirEstado();
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.estado).toMatchObject({
      seloAtual: "cab.carga.assin",
      ativadaEm: AGORA,
      maiorHorarioVisto: AGORA,
      ultimaConsultaOkEm: AGORA,
      janelaTerminaEm: AGORA + 10 * 86_400,
      bloqueio: null,
    });
    expect(await lerCredencial()).toEqual({ ok: true, credencial: CREDENCIAL });
  });

  it("o que fica gravado NÃO contém a credencial em claro (nem os 4 últimos como valor da coluna cifrada)", async () => {
    await gravarAtivacao({
      credencial: CREDENCIAL,
      selo: "a.b.c",
      agora: AGORA,
      janelaTerminaEm: null,
    });
    const crua = JSON.stringify(banco.linha());
    expect(crua).not.toContain(CREDENCIAL);
    expect(crua).not.toContain("AbCdEfGhIjKl");
    expect(banco.linha()?.credencial_last4).toBe("6789");
  });

  it("credencial sem o prefixo zpl_, vazia ou gigante é recusada sem tocar o banco", async () => {
    for (const ruim of ["", "zpl_", "tok_123456789", `zpl_${"a".repeat(300)}`]) {
      const r = await gravarAtivacao({
        credencial: ruim,
        selo: "a.b.c",
        agora: AGORA,
        janelaTerminaEm: null,
      });
      expect(r).toEqual({ ok: false, motivo: "credencial_invalida" });
    }
    expect(banco.chamadas.atualizar).toBe(0);
  });

  it("ativar de novo não desfaz a primeira ativação (ativada_em é a PRIMEIRA)", async () => {
    await gravarAtivacao({
      credencial: CREDENCIAL,
      selo: "a.b.c",
      agora: AGORA,
      janelaTerminaEm: null,
    });
    await gravarAtivacao({
      credencial: CREDENCIAL,
      selo: "d.e.f",
      agora: AGORA + 999,
      janelaTerminaEm: null,
    });
    const e = await garantirEstado();
    expect(e.ok && e.estado.ativadaEm).toBe(AGORA);
    expect(e.ok && e.estado.seloAtual).toBe("d.e.f");
  });

  it("sem credencial gravada, lerCredencial diz sem_credencial", async () => {
    expect(await lerCredencial()).toEqual({ ok: false, motivo: "sem_credencial" });
  });
});

describe("gravarRenovacao / gravarBloqueio / definirModo", () => {
  beforeEach(() => {
    banco = bancoFalso({ inicial: linhaPronta() });
  });

  it("renovação troca o selo, avança o horário e LIMPA um bloqueio anterior", async () => {
    await gravarBloqueio("reembolso", AGORA);
    await gravarRenovacao({ selo: "novo.selo.aqui", agora: AGORA + 3600, janelaTerminaEm: null });
    const e = await garantirEstado();
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.estado.seloAtual).toBe("novo.selo.aqui");
    expect(e.estado.bloqueio).toBeNull();
    expect(e.estado.maiorHorarioVisto).toBe(AGORA + 3600);
  });

  it("bloqueio grava código e instante e NÃO toca o selo atual", async () => {
    await gravarRenovacao({ selo: "selo.que.ficou", agora: AGORA, janelaTerminaEm: null });
    await gravarBloqueio("reembolso", AGORA + 60);
    const e = await garantirEstado();
    expect(e.ok && e.estado.bloqueio).toEqual({ codigo: "reembolso", em: AGORA + 60 });
    expect(e.ok && e.estado.seloAtual).toBe("selo.que.ficou");
  });

  it("código de bloqueio fora do formato vira `desconhecido`: o motivo se perde, o bloqueio não", async () => {
    await gravarBloqueio("Texto livre com espaço!", AGORA);
    const e = await garantirEstado();
    expect(e.ok && e.estado.bloqueio?.codigo).toBe("desconhecido");
  });

  it("o modo muda entre sombra e valendo", async () => {
    await definirModo("valendo");
    const e = await garantirEstado();
    expect(e.ok && e.estado.modo).toBe("valendo");
  });
});

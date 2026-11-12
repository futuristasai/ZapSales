/**
 * OS CÓDIGOS ANTIGOS DOS AVISOS POR QR CODE SÃO TROCADOS UMA VEZ (#274, etapa 10c).
 *
 * O código do endereço dos avisos ficou legível por qualquer membro até a
 * migration 0565. Esconder a coluna não desfaz o que já pode ter sido lido —
 * então os códigos que existiam são trocados.
 *
 * O que fica provado, num Postgres de verdade, reaplicando o bloco do baseline
 * sobre números semeados como um banco de antes da mudança:
 *   1. o número por QR code ganha código NOVO e o antigo deixa de existir;
 *   2. o número da conexão oficial NÃO é tocado (o código dele é registrado na
 *      Meta, e trocá-lo cortaria a entrega);
 *   3. a troca é UMA só: reaplicar o bloco não muda o código de novo;
 *   4. número criado depois já nasce carimbado e não é trocado na atualização
 *      seguinte;
 *   5. a coluna de carimbo é legível pela sessão (não é segredo) e o código
 *      continua ilegível.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

const ORG = "d10c0000-0000-4000-8000-0000000000a1";
const QR = "d10c0000-0000-4000-8000-0000000000b1";
const OFICIAL = "d10c0000-0000-4000-8000-0000000000b2";
const NOVO = "d10c0000-0000-4000-8000-0000000000b3";
const CODIGO_ANTIGO_QR = "codigoantigodoqrcode0000000000001";
const CODIGO_DA_OFICIAL = "codigodaconexaooficial00000000002";

const ultima = (saida: string): string => saida.split("\n").at(-1) ?? "";

function bloco(): string {
  const texto = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
  const marca = "-- ---- troca do código dos avisos dos números por QR code";
  const inicio = texto.indexOf(marca);
  if (inicio === -1) throw new Error("não achei o bloco da troca dos códigos no baseline.sql");
  const resto = texto.slice(texto.indexOf("\n", inicio));
  const fim = resto.indexOf("\n-- ---- ");
  return resto.slice(0, fim === -1 ? undefined : fim);
}

function codigoDe(id: string): string {
  return ultima(sql(`select webhook_path_token from public.channel_sessions where id = '${id}';`));
}
function carimboDe(id: string): string {
  return ultima(
    sql(`select coalesce(webhook_path_token_trocado_em::text, '<nulo>') from public.channel_sessions where id = '${id}';`),
  );
}

beforeAll(() => {
  // Como um banco de ANTES da mudança: códigos conhecidos e carimbo nulo.
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'inv-troca-do-codigo', 'Troca do Código LTDA', 'Troca do Código')
      on conflict do nothing;
    insert into public.channel_sessions
      (id, organization_id, waha_session_name, webhook_secret_encrypted, provider, webhook_path_token, meta_phone_number_id)
    values
      ('${QR}', '${ORG}', 'inv-troca-qr', '\\x00'::bytea, 'waha', '${CODIGO_ANTIGO_QR}', null),
      ('${OFICIAL}', '${ORG}', 'inv-troca-oficial', '\\x00'::bytea, 'meta_cloud', '${CODIGO_DA_OFICIAL}', 'inv-10c-9999');
    update public.channel_sessions set webhook_path_token_trocado_em = null where id in ('${QR}', '${OFICIAL}');
  `);
});

describe("a troca", () => {
  it("a semente é a de um banco de antes da mudança (controle)", () => {
    expect(codigoDe(QR)).toBe(CODIGO_ANTIGO_QR);
    expect(carimboDe(QR)).toBe("<nulo>");
    expect(carimboDe(OFICIAL)).toBe("<nulo>");
  });

  it("⭐ o número por QR code ganha código novo, e o antigo deixa de existir", () => {
    sql(bloco());
    const novo = codigoDe(QR);
    expect(novo).not.toBe(CODIGO_ANTIGO_QR);
    expect(novo).toMatch(/^[0-9a-f]{32}$/);
    expect(carimboDe(QR)).not.toBe("<nulo>");
    expect(
      ultima(sql(`select count(*) from public.channel_sessions where webhook_path_token = '${CODIGO_ANTIGO_QR}';`)),
      "o código antigo ainda leva a um número",
    ).toBe("0");
  });

  it("⭐ o número da conexão oficial não é tocado", () => {
    expect(codigoDe(OFICIAL)).toBe(CODIGO_DA_OFICIAL);
    expect(carimboDe(OFICIAL)).toBe("<nulo>");
  });

  it("⭐ a troca é uma só: reaplicar o bloco não muda o código de novo", () => {
    const depoisDaPrimeira = codigoDe(QR);
    const carimbo = carimboDe(QR);
    sql(bloco());
    sql(bloco());
    expect(codigoDe(QR)).toBe(depoisDaPrimeira);
    expect(carimboDe(QR)).toBe(carimbo);
    expect(codigoDe(OFICIAL)).toBe(CODIGO_DA_OFICIAL);
  });

  it("número criado depois já nasce carimbado, e a atualização seguinte não o troca", () => {
    sql(`insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, provider)
         values ('${NOVO}', '${ORG}', 'inv-troca-novo', '\\x00'::bytea, 'waha');`);
    expect(carimboDe(NOVO)).not.toBe("<nulo>");
    const codigo = codigoDe(NOVO);
    sql(bloco());
    expect(codigoDe(NOVO)).toBe(codigo);
  });

  it("nenhum número por QR code fica sem carimbo", () => {
    expect(
      ultima(
        sql(`select count(*) from public.channel_sessions where provider = 'waha' and webhook_path_token_trocado_em is null;`),
      ),
    ).toBe("0");
  });
});

describe("o que a sessão lê", () => {
  it("o carimbo é legível (não é segredo); o código continua ilegível", () => {
    const le = (coluna: string) =>
      ultima(sql(`select has_column_privilege('authenticated', 'public.channel_sessions', '${coluna}', 'SELECT');`));
    expect(le("webhook_path_token_trocado_em")).toBe("t");
    expect(le("webhook_path_token")).toBe("f");
  });
});

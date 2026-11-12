/**
 * OS SEGREDOS DO CANAL NÃO SÃO LEGÍVEIS PELA SESSÃO DO USUÁRIO (#274).
 *
 * `channel_sessions` guarda o que autentica os avisos do WhatsApp: o código do
 * endereço, o segredo da assinatura e as três credenciais da conexão oficial.
 * O mesmo código do endereço fica gravado em `webhook_events_log`. A policy de
 * leitura das duas tabelas só confere a organização — qualquer membro lia essas
 * colunas falando direto com o banco.
 *
 * O que fica provado, num Postgres de verdade:
 *   1. nenhuma coluna de segredo é legível por `authenticated` nem por `anon` —
 *      e isso vale para QUALQUER papel, porque é privilégio de coluna, não RLS;
 *   2. TODA outra coluna das duas tabelas continua legível: a lista liberada
 *      vem do catálogo, então o teste também pergunta ao catálogo (coluna nova
 *      que nascesse ilegível quebraria uma tela, e apareceria aqui);
 *   3. as colunas que as telas pedem hoje estão todas entre as legíveis;
 *   4. o servidor continua lendo tudo;
 *   5. a sessão ainda consegue ESCREVER o que já escrevia (trocar o código ao
 *      arquivar um canal é um UPDATE feito pela rota com a sessão).
 */
import { describe, expect, it } from "vitest";

import { CHANNEL_SESSION_REF_COLUMNS } from "@/lib/channels/session-ref";

import { sql } from "./psql-transporte";

const SEGREDOS = {
  channel_sessions: [
    "webhook_path_token",
    "webhook_secret_encrypted",
    "meta_token_encrypted",
    "meta_app_secret_encrypted",
    "meta_verify_token_encrypted",
  ],
  webhook_events_log: ["webhook_path_token"],
} as const;

const ultima = (saida: string): string => saida.split("\n").at(-1) ?? "";

function colunasDe(tabela: string): string[] {
  return ultima(
    sql(`select string_agg(attname, ',' order by attnum) from pg_attribute
          where attrelid = 'public.${tabela}'::regclass and attnum > 0 and not attisdropped;`),
  ).split(",");
}

function podeLer(papel: string, tabela: string, coluna: string): boolean {
  return ultima(sql(`select has_column_privilege('${papel}', 'public.${tabela}', '${coluna}', 'SELECT');`)) === "t";
}

describe.each(Object.entries(SEGREDOS))("%s", (tabela, segredos) => {
  const todas = colunasDe(tabela);

  it("a sonda enxerga a tabela (guarda de vacuidade)", () => {
    expect(todas.length).toBeGreaterThan(segredos.length + 3);
    for (const s of segredos) expect(todas, `${s} não existe mais em ${tabela}`).toContain(s);
  });

  it.each(segredos)("⭐ %s não é legível pela sessão — nem por quem administra", (coluna) => {
    expect(podeLer("authenticated", tabela, coluna)).toBe(false);
    expect(podeLer("anon", tabela, coluna)).toBe(false);
  });

  it("⭐ toda outra coluna continua legível pela sessão", () => {
    const ilegiveis = todas
      .filter((c) => !(segredos as readonly string[]).includes(c))
      .filter((c) => !podeLer("authenticated", tabela, c));
    expect(ilegiveis, "coluna que não é segredo ficou ilegível — alguma tela vai quebrar").toEqual([]);
  });

  it("`select *` pela sessão é recusado (a tabela inteira inclui os segredos)", () => {
    expect(ultima(sql(`select has_table_privilege('authenticated', 'public.${tabela}', 'SELECT');`))).toBe("f");
  });

  it("CONTROLE: o servidor continua lendo tudo", () => {
    for (const coluna of segredos) expect(podeLer("service_role", tabela, coluna)).toBe(true);
  });

  it("`anon` não lê coluna nenhuma", () => {
    expect(todas.filter((c) => podeLer("anon", tabela, c))).toEqual([]);
  });
});

describe("o que as telas pedem continua legível", () => {
  // As listas de colunas que o app pede com a sessão do usuário. Texto do
  // próprio código (importado ou conferido aqui) — se uma tela passar a pedir um
  // segredo, este caso reprova antes de a tela quebrar em produção.
  const PEDIDAS = [
    CHANNEL_SESSION_REF_COLUMNS,
    "id, provider, waha_session_name, display_name, phone_number, status, status_reason, last_health_check_at, last_status_change_at, daily_message_limit, is_warmup_complete, created_at",
    "id, display_name, status, phone_number, waha_session_name, provider",
    "id, provider, waha_session_name, display_name, phone_number, meta_phone_number_id",
    "id, wacalls_session_id, wacalls_paired_at",
    "id, status, wacalls_jid, wacalls_paired_at",
    "provider, meta_waba_id",
    "id, organization_id, waha_session_name, status, archived_at",
  ];

  it.each(PEDIDAS)("%s", (lista) => {
    for (const coluna of lista.split(",").map((c) => c.trim())) {
      expect(podeLer("authenticated", "channel_sessions", coluna), `${coluna} ilegível pela sessão`).toBe(true);
    }
  });

  it("a lista de recebimentos de uma fonte de captação pede colunas legíveis", () => {
    for (const coluna of ["id", "received_at", "valid_signature", "payload_parsed", "status"]) {
      expect(podeLer("authenticated", "webhook_events_log", coluna)).toBe(true);
    }
  });
});

describe("a sessão ainda escreve o que já escrevia", () => {
  it("o privilégio de UPDATE em channel_sessions não mudou (quem decide é a policy por papel)", () => {
    expect(ultima(sql(`select has_table_privilege('authenticated', 'public.channel_sessions', 'UPDATE');`))).toBe("t");
    expect(
      ultima(sql(`select has_column_privilege('authenticated', 'public.channel_sessions', 'webhook_path_token', 'UPDATE');`)),
    ).toBe("t");
  });
});

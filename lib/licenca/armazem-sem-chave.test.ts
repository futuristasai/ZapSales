// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type * as Aes from "@/lib/crypto/aes_gcm";

import { bancoFalso } from "../../tests/support/licenca-banco-falso";

const banco = bancoFalso({
  inicial: {
    id: 1,
    instalacao_id: "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f",
    maior_horario_visto: null,
    ativada_em: null,
  },
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => banco.cliente }));
// A chave de cifra some: é o que acontece quando o `.env` perde `AI_CRED_AES_KEY`.
vi.mock("@/lib/crypto/aes_gcm", async () => ({
  ...(await vi.importActual<typeof Aes>("@/lib/crypto/aes_gcm")),
  encryptKey: () => {
    throw new Error("AI_CRED_AES_KEY não configurada");
  },
}));

import { gravarAtivacao } from "./armazem";

describe("gravarAtivacao sem chave de cifra", () => {
  it("FALHA FECHADA: recusa e não grava a credencial em claro nem a ativação", async () => {
    const r = await gravarAtivacao({
      credencial: "zpl_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
      selo: "a.b.c",
      agora: 1_800_000_000,
      janelaTerminaEm: null,
    });
    expect(r).toEqual({ ok: false, motivo: "sem_chave_de_cifra" });
    expect(banco.chamadas.atualizar).toBe(0);
    expect(JSON.stringify(banco.linha())).not.toContain("zpl_");
    expect(banco.linha()?.ativada_em).toBeNull();
  });
});

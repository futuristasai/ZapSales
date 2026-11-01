import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { registrarEstimativaDoEnvio } from "./registro";
import { TABELA_INICIAL } from "./tabela-de-precos";

/**
 * A linha de custo estimado nasce com o relógio da rodada.
 *
 * O teto mensal da empresa soma as linhas com `created_at >= início do mês de
 * agora` (`fn_custo_comprometido`). Se a linha nascesse com o `now()` do banco
 * enquanto a rodada corre com outro relógio, a virada do mês entre os dois faria
 * o envio que acabou de sair deixar de contar contra o teto — e a campanha
 * passaria do teto. Foi o que derrubou `custo-da-campanha-oficial` em toda
 * virada de mês (3 casos, só entre 21h do último dia e 00h do dia 1 em São Paulo).
 */

function adminQueGravaEm(linhas: Array<Record<string, unknown>>): SupabaseClient {
  return {
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        expect(tabela).toBe("meta_message_costs");
        linhas.push(linha);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
}

const base = {
  organizationId: "0d0e0010-0000-4000-8000-00000000000a",
  mensagemId: "0d0e0010-0000-4000-8000-0000000000c1",
  campanhaId: "0d0e0010-0000-4000-8000-0000000000c2",
  channelSessionId: "0d0e0010-0000-4000-8000-0000000000c3",
  telefone: "+5531988880001",
  categoria: "marketing" as const,
  tabela: TABELA_INICIAL,
};

describe("registrarEstimativaDoEnvio — o relógio da linha", () => {
  it("com o relógio da rodada, a linha nasce nele (não no now() do banco)", async () => {
    const linhas: Array<Record<string, unknown>> = [];
    // Primeiro dia do mês seguinte, depois da virada em São Paulo.
    const agora = new Date("2026-11-02T15:00:00Z");

    await registrarEstimativaDoEnvio(adminQueGravaEm(linhas), { ...base, agora });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.created_at).toBe("2026-11-02T15:00:00.000Z");
    expect(linhas[0]!.origem).toBe("estimado");
  });

  it("sem o relógio, não escreve created_at: vale o default do banco", async () => {
    const linhas: Array<Record<string, unknown>> = [];

    await registrarEstimativaDoEnvio(adminQueGravaEm(linhas), base);

    expect(linhas).toHaveLength(1);
    expect("created_at" in linhas[0]!).toBe(false);
  });
});

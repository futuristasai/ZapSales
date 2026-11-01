import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AvisoDeConexaoNaFaixa } from "@/components/shell/AvisoDeConexaoNaFaixa";
import type * as HookDasSessoes from "@/hooks/channels/useChannelSessions";

/**
 * O aviso sobre o ícone de Conexões na faixa (issue #188): um número do WhatsApp caiu.
 *
 * Acende SÓ com a conexão em `down` — «nenhuma conexão», «conectando» e «não foi possível
 * verificar» são estados de tela, e um aviso que acende o tempo todo ensina a ser ignorado.
 */

const sessoes: { data: unknown; isError: boolean } = { data: undefined, isError: false };
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/channels/useChannelSessions", async (importar) => ({
  ...(await importar<typeof HookDasSessoes>()),
  useChannelSessions: () => sessoes,
}));

const canal = (status: string) => ({ id: status, status, is_active: true });

afterEach(cleanup);

describe("o aviso de conexão caída na faixa", () => {
  it("uma conexão caída acende o aviso, com palavra e forma (não só cor)", () => {
    sessoes.data = [canal("WORKING"), canal("FAILED")];
    sessoes.isError = false;
    render(<AvisoDeConexaoNaFaixa />);
    const aviso = screen.getByTestId("aviso-de-conexao-na-faixa");
    expect(aviso).toHaveAccessibleName("Uma conexão caiu");
    expect(aviso.querySelector("svg")).not.toBeNull();
  });

  it("tudo conectado não desenha nada", () => {
    sessoes.data = [canal("WORKING")];
    sessoes.isError = false;
    render(<AvisoDeConexaoNaFaixa />);
    expect(screen.queryByTestId("aviso-de-conexao-na-faixa")).toBeNull();
  });

  it("sem nenhum número não é alarme", () => {
    sessoes.data = [];
    sessoes.isError = false;
    render(<AvisoDeConexaoNaFaixa />);
    expect(screen.queryByTestId("aviso-de-conexao-na-faixa")).toBeNull();
  });

  it("a consulta que falhou não vira alarme falso", () => {
    sessoes.data = undefined;
    sessoes.isError = true;
    render(<AvisoDeConexaoNaFaixa />);
    expect(screen.queryByTestId("aviso-de-conexao-na-faixa")).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

import { alvoDoAviso } from "@/lib/waha/alvo-de-edicao";
import { dispatchWahaEvent } from "@/lib/waha/ingest";

/**
 * O AVISO DE "EDITADA" OU "APAGADA" SÓ ALCANÇA A MENSAGEM DO MESMO NÚMERO E DO
 * MESMO AUTOR (#274).
 *
 * Antes o filtro era organização + id. Um aviso que chegasse por um número
 * alterava a mensagem de outro número da mesma empresa, e um aviso de mensagem
 * RECEBIDA alterava uma mensagem ENVIADA. O roteador roda de verdade aqui; o
 * banco é um dublê que anota o que foi pedido.
 */
type Filtro = [coluna: string, valor: unknown];
interface Pedido {
  tabela: string;
  valores: Record<string, unknown>;
  filtros: Filtro[];
}

function bancoQueAnota() {
  const pedidos: Pedido[] = [];
  const admin = {
    from: (tabela: string) => ({
      update: (valores: Record<string, unknown>) => {
        const pedido: Pedido = { tabela, valores, filtros: [] };
        pedidos.push(pedido);
        const cadeia = {
          eq: (coluna: string, valor: unknown) => {
            pedido.filtros.push([coluna, valor]);
            return cadeia;
          },
          then: (ok: (v: { data: null; error: null }) => unknown) => ok({ data: null, error: null }),
        };
        return cadeia;
      },
    }),
  };
  return { admin, pedidos };
}

const SESSAO = { id: "canal-1", organization_id: "org-1", status: "WORKING" } as never;
const filtrosDe = (p: Pedido) => Object.fromEntries(p.filtros);

async function avisar(event: string, payload: Record<string, unknown>) {
  const { admin, pedidos } = bancoQueAnota();
  await dispatchWahaEvent(admin as never, SESSAO, { event, payload } as never, "req-1");
  return pedidos;
}

describe("mensagem editada", () => {
  it("⭐ o filtro leva a SESSÃO que recebeu o aviso, além da organização e do id", async () => {
    const pedidos = await avisar("message.edited", {
      editedMessageId: "false_5511999990000@c.us_3EB0AAA",
      body: "texto corrigido",
      fromMe: false,
    });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.tabela).toBe("messages");
    expect(pedidos[0]!.valores).toMatchObject({ body: "texto corrigido" });
    expect(filtrosDe(pedidos[0]!)).toEqual({
      organization_id: "org-1",
      channel_session_id: "canal-1",
      external_id: "3EB0AAA",
      direction: "inbound",
    });
  });

  it("⭐ aviso de mensagem do CONTATO não alcança mensagem enviada pela empresa", async () => {
    const pedidos = await avisar("message.edited", {
      editedMessageId: "3EB0BBB",
      body: "reescrito por quem recebeu",
      fromMe: false,
    });
    expect(filtrosDe(pedidos[0]!).direction).toBe("inbound");
  });

  it("aviso de mensagem editada no celular da empresa só alcança mensagem enviada", async () => {
    const pedidos = await avisar("message.edited", {
      editedMessageId: "true_5511999990000@c.us_3EB0CCC",
      body: "corrigido pelo dono",
      fromMe: true,
    });
    expect(filtrosDe(pedidos[0]!)).toMatchObject({ direction: "outbound", external_id: "3EB0CCC" });
  });

  it("o prefixo do id da ORIGINAL vence o `fromMe` do aviso quando os dois discordam", async () => {
    const pedidos = await avisar("message.edited", {
      editedMessageId: "true_5511999990000@c.us_3EB0DDD",
      body: "x",
      fromMe: false,
    });
    expect(filtrosDe(pedidos[0]!).direction).toBe("outbound");
  });

  it("aviso que não diz o autor ainda edita — pela sessão e pelo id, sem filtro de lado", async () => {
    const pedidos = await avisar("message.edited", { editedMessageId: "3EB0EEE", body: "x" });
    expect(filtrosDe(pedidos[0]!)).toEqual({
      organization_id: "org-1",
      channel_session_id: "canal-1",
      external_id: "3EB0EEE",
    });
  });

  it.each([
    ["sem id da original", { body: "x", fromMe: false }],
    ["id vazio", { editedMessageId: "", body: "x" }],
    ["sem corpo", { editedMessageId: "3EB0FFF", fromMe: false }],
    ["id que não é texto", { editedMessageId: { a: 1 }, body: "x" }],
  ])("%s: nada é alterado", async (_nome, payload) => {
    expect(await avisar("message.edited", payload)).toHaveLength(0);
  });
});

describe("mensagem apagada", () => {
  it("⭐ leva sessão e autor, e não remove a linha", async () => {
    const pedidos = await avisar("message.revoked", {
      revokedMessageId: "false_5511999990000@c.us_3EB0GGG",
      fromMe: false,
    });
    expect(pedidos).toHaveLength(1);
    expect(Object.keys(pedidos[0]!.valores)).toEqual(["revoked_at"]);
    expect(filtrosDe(pedidos[0]!)).toEqual({
      organization_id: "org-1",
      channel_session_id: "canal-1",
      external_id: "3EB0GGG",
      direction: "inbound",
    });
  });

  it("sem id da original: nada é alterado", async () => {
    expect(await avisar("message.revoked", { fromMe: true })).toHaveLength(0);
  });
});

describe("alvoDoAviso", () => {
  it.each([
    ["false_5511@c.us_ABC", undefined, { externalId: "ABC", direction: "inbound" }],
    ["true_5511@c.us_ABC", undefined, { externalId: "ABC", direction: "outbound" }],
    ["ABC", true, { externalId: "ABC", direction: "outbound" }],
    ["ABC", false, { externalId: "ABC", direction: "inbound" }],
    ["ABC", undefined, { externalId: "ABC", direction: null }],
    ["ABC", "true", { externalId: "ABC", direction: null }],
  ])("%j com fromMe=%j", (id, fromMe, esperado) => {
    expect(alvoDoAviso(id, fromMe)).toEqual(esperado);
  });

  it.each([undefined, null, "", 42, {}])("id %j não é alvo", (id) => {
    expect(alvoDoAviso(id, true)).toBeNull();
  });
});

// O roteador não pode tocar em mais nada para estes dois eventos.
it("os dois avisos só escrevem em `messages`", async () => {
  const espia = vi.fn();
  const admin = {
    from: (tabela: string) => {
      espia(tabela);
      const cadeia = {
        update: () => cadeia,
        eq: () => cadeia,
        then: (ok: (v: unknown) => unknown) => ok({ data: null, error: null }),
      };
      return cadeia;
    },
  };
  for (const [event, payload] of [
    ["message.edited", { editedMessageId: "A", body: "x" }],
    ["message.revoked", { revokedMessageId: "A" }],
  ] as const) {
    await dispatchWahaEvent(admin as never, SESSAO, { event, payload } as never, "req");
  }
  expect(espia.mock.calls.map((c) => c[0])).toEqual(["messages", "messages"]);
});

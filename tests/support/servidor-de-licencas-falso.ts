/**
 * O SERVIDOR DE LICENÇAS DE MENTIRA — um servidor HTTP de verdade, em loopback, para provar o cliente.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 3. O servidor real (Fase 2) vive em outro
 * repositório e ainda não existe; este faz o papel dele nos testes do cliente de renovação, da ativação e do
 * cliente HTTP. É de VERDADE (porta TCP, fetch de verdade) de propósito: um mock de `fetch` não estressa o que
 * importa — o redirecionamento recusado, o corpo grande demais, o tempo esgotado, o cabeçalho que realmente
 * viaja.
 *
 * Ele assina selos com a chave de TESTE (`licenca-chave-de-teste.ts`), que nunca vale em produção.
 *
 * O servidor guarda cada pedido que recebeu (`pedidos`) para o teste olhar o que SAIU pela rede: o cabeçalho
 * `Authorization`, o corpo, a query. É assim que se prova que a credencial não vai na URL e que nenhum dado
 * fora do contrato acompanha a chamada (seção 5).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { assinarParaTeste } from "./licenca-chave-de-teste";

export interface PedidoRecebido {
  readonly metodo: string;
  readonly caminho: string;
  /** Tudo depois do `?`, ou vazio. */
  readonly query: string;
  readonly cabecalhos: Readonly<Record<string, string | string[] | undefined>>;
  readonly corpo: unknown;
  /** O corpo como chegou, em texto. */
  readonly corpoBruto: string;
}

export interface RespostaFalsa {
  readonly status: number;
  /** Serializado como JSON. Ignorado quando `bruto` existe. */
  readonly corpo?: unknown;
  /** Corpo literal, para mandar lixo, JSON torto ou resposta enorme. */
  readonly bruto?: string;
  readonly cabecalhos?: Readonly<Record<string, string>>;
  /** Demora antes de responder, em ms — para provar o tempo limite. */
  readonly atrasoMs?: number;
}

export type Atendente = (pedido: PedidoRecebido) => RespostaFalsa | Promise<RespostaFalsa>;

export interface ServidorFalso {
  /** A base da API, como a instalação a configura: `http://127.0.0.1:<porta>/api/v1`. */
  readonly base: string;
  readonly pedidos: PedidoRecebido[];
  /** Troca o atendente. Padrão: 500. */
  atender(atendente: Atendente): void;
  fechar(): Promise<void>;
}

async function lerCorpo(req: IncomingMessage): Promise<string> {
  const pedacos: Buffer[] = [];
  for await (const pedaco of req) pedacos.push(pedaco as Buffer);
  return Buffer.concat(pedacos).toString("utf8");
}

export async function subirServidorFalso(): Promise<ServidorFalso> {
  const pedidos: PedidoRecebido[] = [];
  let atendente: Atendente = () => ({ status: 500, corpo: { error: { code: "internal_error" } } });

  const servidor: Server = createServer((req, res) => {
    void (async () => {
      const bruto = await lerCorpo(req);
      let corpo: unknown;
      try {
        corpo = bruto ? JSON.parse(bruto) : undefined;
      } catch {
        corpo = undefined;
      }
      const [caminho = "", query = ""] = (req.url ?? "").split("?");
      const pedido: PedidoRecebido = {
        metodo: req.method ?? "",
        caminho,
        query,
        cabecalhos: req.headers,
        corpo,
        corpoBruto: bruto,
      };
      pedidos.push(pedido);
      const resposta = await atendente(pedido);
      if (resposta.atrasoMs) await new Promise((r) => setTimeout(r, resposta.atrasoMs));
      res.writeHead(resposta.status, {
        "content-type": "application/json",
        ...resposta.cabecalhos,
      });
      res.end(resposta.bruto ?? JSON.stringify(resposta.corpo ?? {}));
    })().catch(() => {
      res.destroy();
    });
  });

  await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const { port } = servidor.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}/api/v1`,
    pedidos,
    atender: (novo) => {
      atendente = novo;
    },
    fechar: () =>
      new Promise<void>((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => resolver());
      }),
  };
}

// ── Selos e respostas no formato do contrato ────────────────────────────────────────────────────────────

const LICENCA = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
let contadorDeJti = 0;

export interface PedidoDeSelo {
  readonly instalacaoId: string;
  readonly tipo: "temporario" | "permanente";
  /** O "agora" do servidor, em segundos. Vira o `iat`. */
  readonly iat: number;
  /** Só do temporário. Padrão: `iat` + 48 h. */
  readonly exp?: number;
  /** Para fabricar selo defeituoso. */
  readonly mudancas?: Readonly<Record<string, unknown>>;
}

/** Um selo assinado com a chave de teste, no formato do contrato (seção 1). */
export async function emitirSelo(pedido: PedidoDeSelo): Promise<string> {
  contadorDeJti += 1;
  const carga: Record<string, unknown> = {
    v: 1,
    iss: "zapsales-licencas",
    sub: pedido.instalacaoId,
    lic: LICENCA,
    tipo: pedido.tipo,
    iat: pedido.iat,
    jti: `00000000-0000-4000-8000-${String(contadorDeJti).padStart(12, "0")}`,
    ...(pedido.tipo === "temporario" ? { exp: pedido.exp ?? pedido.iat + 48 * 3600 } : {}),
    ...pedido.mudancas,
  };
  return assinarParaTeste(carga);
}

const iso = (segundos: number) => new Date(segundos * 1000).toISOString();

/** O corpo de sucesso de `/licenca/renovar` (e, com `credencial`, de `/licenca/ativar`). */
export async function respostaDeSelo(
  pedido: PedidoDeSelo & {
    /** Segundos até a próxima consulta sugerida. Padrão 1 h. `null` omite o campo. */
    proximaEmS?: number | null;
    janelaTerminaEm?: number | null;
    credencial?: string;
    /** Campos que o contrato não conhece — o cliente tem de ignorá-los. */
    extras?: Record<string, unknown>;
  },
): Promise<RespostaFalsa> {
  const selo = await emitirSelo(pedido);
  const proximaEmS = pedido.proximaEmS === undefined ? 3600 : pedido.proximaEmS;
  return {
    status: 200,
    corpo: {
      data: {
        ...(pedido.credencial ? { credencial: pedido.credencial } : {}),
        selo,
        tipo: pedido.tipo,
        ...(proximaEmS === null ? {} : { proxima_consulta_em: iso(pedido.iat + proximaEmS) }),
        janela_termina_em:
          pedido.janelaTerminaEm === null || pedido.janelaTerminaEm === undefined
            ? null
            : iso(pedido.janelaTerminaEm),
        ...pedido.extras,
      },
    },
  };
}

/** O corpo de erro do contrato. */
export function respostaDeErro(
  status: number,
  codigo: string,
  extras: { motivoCodigo?: string; cabecalhos?: Record<string, string> } = {},
): RespostaFalsa {
  return {
    status,
    corpo: {
      error: {
        code: codigo,
        message: "mensagem do servidor",
        ...(extras.motivoCodigo ? { motivo_codigo: extras.motivoCodigo } : {}),
      },
    },
    ...(extras.cabecalhos ? { cabecalhos: extras.cabecalhos } : {}),
  };
}

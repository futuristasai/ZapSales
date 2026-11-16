/**
 * "ESTÁ TUDO BEM?" — a saúde da instalação como o Painel da administração a mostra
 * (issue #310, Entrega 3 da #308).
 *
 * Função PURA: recebe o resultado das sondas — as MESMAS do `/api/v1/health`
 * (`lib/saude/sondas.ts` e `lib/channels/sonda-do-transporte-qr.ts`) — e a leitura da fila
 * (`lib/saude/fila.ts`), e devolve, por item, um estado e uma frase do que fazer. Quem
 * busca é `lib/saude/painel.ts`.
 *
 * ── O QUE NUNCA SAI DAQUI ────────────────────────────────────────────────────
 *
 * Endereço, `target` e `error` da sonda. O `/api/v1/health` só os entrega a quem tem o
 * segredo interno (ver `semAlvo`), e o Painel não é exceção: a frase é escolhida pelo
 * MOTIVO (`reason`), nunca pelo texto do erro, que carrega o endereço na forma
 * malformada mais comum.
 *
 * ── NÃO CHUTA ────────────────────────────────────────────────────────────────
 *
 * Serviço não configurado é neutro (integração que ninguém ligou), e fila que não pôde
 * ser lida é "não consegui ler" — nenhum dos dois vira verde nem vermelho.
 */
import { COMANDO_PARA_SUBIR_O_TRANSPORTE_QR } from "@/lib/channels/servico-do-transporte-qr";

import type { Check, MotivoDeFalha } from "./sonda";

export type IdDoItemDeSaude = "banco" | "whatsapp" | "redis" | "fila";
export type EstadoDeSaude = "ok" | "fora" | "nao_configurado" | "nao_lido";

/** A leitura da fila de tarefas; `null` quando não pôde ser lida. */
export type LeituraDaFila = {
  /** Há quanto tempo o evento mais atrasado já deveria ter sido processado. `null` = nenhum. */
  atrasoSegundos: number | null;
} | null;

export interface SondasDaInstalacao {
  banco: Check;
  redis: Check;
  transporteQr: Check;
  fila: LeituraDaFila;
}

export interface ItemDeSaude {
  id: IdDoItemDeSaude;
  estado: EstadoDeSaude;
  /** Chave de tradução (o texto em português). */
  frase: string;
  /** O que rodar na pasta da instalação, quando há um comando que resolve. Não se traduz. */
  comando: string | null;
}

export interface SaudeDaInstalacao {
  itens: ItemDeSaude[];
  /** Todos os itens verdes. */
  tudoBem: boolean;
  /** Quantos itens estão vermelhos. */
  fora: number;
}

/**
 * Quanto a fila pode atrasar antes de contar como parada. O processador (`event-log-drain`)
 * roda a cada minuto e leva 50 eventos por vez (`docker/scheduler/entrypoint.sh`): com
 * folga para um lote grande, dez minutos de atraso já não é fila cheia, é fila parada.
 */
export const ATRASO_MAXIMO_DA_FILA_S = 10 * 60;

/** Os textos, como dado — a cerca de idioma do admin os lê daqui. */
export const TEXTOS_DA_SAUDE = {
  titulo: "Saúde da instalação",
  tudoBem: "Tudo respondendo.",
  algoFora: "Algo precisa de atenção.",
  conferirDeNovo: "Conferir de novo",
  ondeRodar: "Na pasta da instalação no servidor (a mesma onde você rodou o instalador), rode:",
  nomes: {
    banco: "Banco de dados",
    whatsapp: "WhatsApp (conexão por QR code)",
    redis: "Redis (contadores e limites de envio)",
    fila: "Fila de tarefas",
  },
  estados: {
    ok: "Funcionando",
    fora: "Fora do ar",
    nao_configurado: "Não configurado",
    nao_lido: "Não consegui ler agora",
  },
  bancoOk: "O banco de dados está respondendo.",
  bancoFora:
    "O banco de dados não respondeu. Sem ele nada funciona: suba os serviços da instalação de novo.",
  qrOk: "O serviço que conecta os números por QR code está respondendo.",
  qrFora:
    "O serviço que conecta os números por QR code não respondeu. Os números conectados por QR code não enviam nem recebem enquanto ele estiver parado.",
  qrChave:
    "O serviço de QR code respondeu, mas recusou a chave de acesso. A chave no arquivo .env da instalação não confere com a do serviço: rode o instalador de novo para regravá-la.",
  qrNaoConfigurado:
    "A conexão por QR code não está configurada nesta instalação. Só a API Oficial da Meta funciona.",
  redisOk: "O Redis está respondendo.",
  redisFora:
    "O Redis não respondeu. Sem ele os limites de envio contam em memória, e reiniciar o app zera a contagem.",
  redisChave:
    "O Redis respondeu, mas recusou a senha. A senha no arquivo .env da instalação não confere: rode o instalador de novo para regravá-la.",
  redisConfiguracao:
    "O endereço do Redis no arquivo .env da instalação está escrito errado (aspas ou espaço sobrando). Corrija a linha UPSTASH_REDIS_REST_URL e rode o instalador de novo.",
  redisNaoConfigurado:
    "O Redis não está configurado. Os limites de envio contam em memória, e reiniciar o app zera a contagem.",
  filaOk: "As tarefas em segundo plano estão sendo processadas em dia.",
  filaParada:
    "Há tarefas em segundo plano paradas há mais de 10 minutos (respostas da IA, avisos, follow-ups). O agendador pode estar parado.",
  filaNaoLida:
    "Não consegui ler a fila de tarefas agora. Isso não quer dizer que ela parou: confira de novo daqui a pouco.",
} as const;

const T = TEXTOS_DA_SAUDE;

function item(
  id: IdDoItemDeSaude,
  estado: EstadoDeSaude,
  frase: string,
  comando: string | null = null,
): ItemDeSaude {
  return { id, estado, frase, comando };
}

/** Motivo que diz "chegou lá e foi barrado": não adianta subir o serviço, ele está de pé. */
const ehCredencial = (m: MotivoDeFalha | undefined) => m === "credencial_recusada";

function doBanco(c: Check): ItemDeSaude {
  return c.status === "ok"
    ? item("banco", "ok", T.bancoOk)
    : item("banco", "fora", T.bancoFora, "sudo docker compose up -d");
}

function doTransporteQr(c: Check): ItemDeSaude {
  if (c.status === "ok") return item("whatsapp", "ok", T.qrOk);
  if (c.reason === "nao_configurado")
    return item("whatsapp", "nao_configurado", T.qrNaoConfigurado);
  if (ehCredencial(c.reason)) return item("whatsapp", "fora", T.qrChave);
  return item("whatsapp", "fora", T.qrFora, COMANDO_PARA_SUBIR_O_TRANSPORTE_QR);
}

function doRedis(c: Check): ItemDeSaude {
  if (c.status === "ok") return item("redis", "ok", T.redisOk);
  if (c.reason === "nao_configurado")
    return item("redis", "nao_configurado", T.redisNaoConfigurado);
  if (c.reason === "configuracao_invalida") return item("redis", "fora", T.redisConfiguracao);
  if (ehCredencial(c.reason)) return item("redis", "fora", T.redisChave);
  return item("redis", "fora", T.redisFora, "sudo docker compose up -d redis srh");
}

function daFila(f: LeituraDaFila): ItemDeSaude {
  if (f === null) return item("fila", "nao_lido", T.filaNaoLida);
  if (f.atrasoSegundos !== null && f.atrasoSegundos > ATRASO_MAXIMO_DA_FILA_S) {
    return item("fila", "fora", T.filaParada, "sudo docker compose up -d scheduler worker");
  }
  return item("fila", "ok", T.filaOk);
}

export function saudeDaInstalacao(s: SondasDaInstalacao): SaudeDaInstalacao {
  const itens = [
    doBanco(s.banco),
    doTransporteQr(s.transporteQr),
    doRedis(s.redis),
    daFila(s.fila),
  ];
  return {
    itens,
    tudoBem: itens.every((i) => i.estado === "ok"),
    fora: itens.filter((i) => i.estado === "fora").length,
  };
}

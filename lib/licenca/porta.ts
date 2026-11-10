/**
 * A PORTA da licença — o que cada ponto de entrada do produto pergunta antes de trabalhar.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2 e ADR-0005. `decidir` (em
 * `decidir.ts`) é a regra; este módulo é o que a CHAMA: lê o estado local, pergunta à regra, aplica o
 * modo (sombra ou valendo) e responde se a porta deve recusar. Todas as portas passam por
 * `consultarPorta` — nenhuma lê o estado nem reimplementa a regra por conta própria.
 *
 * ── AS PORTAS ────────────────────────────────────────────────────────────────
 *
 *  - `proxy`     telas e API de sessão (`proxy.ts`);
 *  - `api_token` API por token `zps_…` (MCP e rotas com Bearer — o proxy não decide nelas);
 *  - `cron`      rotas de `app/api/v1/cron/` (o agendador bate nelas);
 *  - `worker`    os laços do processo `agent-worker`;
 *  - `webhook`   entradas de webhook dos canais e das fontes de webhook;
 *  - `tela`      NÃO é porta: é a pergunta de quem só MOSTRA a situação (a faixa e a tela de licença). Nunca recusa
 *                nada; usa a mesma decisão para a tela dizer o que as portas dizem.
 *
 * Cada porta tem cerca de teste (`tests/unit/licenca-portas-chamam-a-decisao.test.ts`): porta nova
 * sem a consulta reprova o CI. É o desenho da guarda `requireSupportWrite`.
 *
 * ── MODO SOMBRA (a válvula do operador; o padrão das instalações novas é `valendo`, desde a migration 0558) ────────────────────────────────────────────────────
 *
 * Em `sombra` a decisão é calculada e REGISTRADA, nunca aplicada: `aplicar` é sempre `false`. É o
 * estado de toda instalação até o kit ativar e a produção do projeto ter licença própria (ADR-0005).
 * Só em `valendo` uma decisão `opera: false` vira recusa.
 *
 * ── FALHA PARA O LADO QUE NÃO DERRUBA O CLIENTE ──────────────────────────────
 *
 * Estado ilegível (tabela ainda ausente, banco fora do ar) NÃO bloqueia: `aplicar` é `false` e o motivo
 * é `estado_indisponivel`, registrado. Se o banco está fora do ar o produto já está fora do ar, e
 * trancar ninguém por causa de uma oscilação seria pior que o problema. Esta função NUNCA lança.
 *
 * ── CUSTO ────────────────────────────────────────────────────────────────────
 *
 * O proxy pergunta a cada requisição. A decisão é lembrada por `VALIDADE_DA_DECISAO_MS` no processo
 * (um só processo de app na VPS; o worker é outro, e o TTL cobre a escrita feita por ele). O maior
 * horário visto só vai ao banco a cada `INTERVALO_DE_REGISTRO_DO_HORARIO_MS`.
 */
import { logger } from "@/lib/logger";

import { garantirEstado, registrarHorarioVisto } from "./armazem";
import { chavesAceitas } from "./chaves";
import { decidir, type Decisao } from "./decidir";
import type { ModoDaLicenca } from "./estado";

export type PortaDaLicenca = "proxy" | "api_token" | "cron" | "worker" | "webhook" | "tela";

export interface VereditoDaPorta {
  /** A porta deve RECUSAR agora. Só é `true` em modo `valendo` com `opera: false`. */
  readonly aplicar: boolean;
  /** A decisão, ou `null` quando o estado não pôde ser lido. */
  readonly decisao: Decisao | null;
  readonly modo: ModoDaLicenca | null;
  readonly motivo: "opera" | "sombra" | "valendo" | "estado_indisponivel";
}

/** Por quanto tempo a decisão vale no processo, antes de reler o banco. */
export const VALIDADE_DA_DECISAO_MS = 30_000;

/** De quanto em quanto tempo o maior horário visto é gravado no banco. */
export const INTERVALO_DE_REGISTRO_DO_HORARIO_MS = 5 * 60_000;

/** Por quanto tempo o mesmo aviso do mesmo tipo não se repete no log. */
const SILENCIO_DO_AVISO_MS = 10 * 60_000;

interface Lembrada {
  readonly ate: number;
  readonly veredito: VereditoDaPorta;
}

interface MemoriaDoProcesso {
  lembrada: Promise<Lembrada> | null;
  ultimoRegistroDoHorario: number;
  ultimoEstadoLogado: string | null;
  readonly ultimoAviso: Map<string, number>;
}

/**
 * A memória mora no PROCESSO (`globalThis`), não no módulo. O Next compila o proxy, cada rota e cada página
 * como pacotes separados, e uma variável de módulo vira UMA CÓPIA POR PACOTE: quem renovava a licença
 * esquecia a decisão só na própria cópia, e as telas e a API seguiam recusando por até 30 s com a decisão
 * velha (issue #255: «Licença renovada.» na tela, e a pessoa ainda barrada). Com uma memória só, esquecer
 * numa porta esquece em todas. `Symbol.for` devolve o mesmo símbolo a qualquer cópia do módulo.
 */
const CHAVE_DA_MEMORIA = Symbol.for("licenca.porta.memoria");

function memoriaDoProcesso(): MemoriaDoProcesso {
  const global = globalThis as unknown as Record<symbol, MemoriaDoProcesso | undefined>;
  return (global[CHAVE_DA_MEMORIA] ??= {
    lembrada: null,
    ultimoRegistroDoHorario: 0,
    ultimoEstadoLogado: null,
    ultimoAviso: new Map<string, number>(),
  });
}

/** Esquece tudo o que o processo lembra. Para testes e para quem acabou de gravar uma renovação. */
export function esquecerDecisaoDaLicenca(): void {
  const m = memoriaDoProcesso();
  m.lembrada = null;
  m.ultimoRegistroDoHorario = 0;
  m.ultimoEstadoLogado = null;
  m.ultimoAviso.clear();
}

function avisarUmaVez(
  chave: string,
  agora: number,
  mensagem: string,
  ctx: Record<string, unknown>,
) {
  const { ultimoAviso } = memoriaDoProcesso();
  const ultimo = ultimoAviso.get(chave);
  if (ultimo !== undefined && agora - ultimo < SILENCIO_DO_AVISO_MS) return;
  ultimoAviso.set(chave, agora);
  logger.warn(mensagem, ctx);
}

async function calcular(agoraMs: number): Promise<VereditoDaPorta> {
  const leitura = await garantirEstado();
  if (!leitura.ok) {
    avisarUmaVez("indisponivel", agoraMs, "licenca: estado ilegível — a porta não restringe", {
      motivo: leitura.motivo,
    });
    return { aplicar: false, decisao: null, modo: null, motivo: "estado_indisponivel" };
  }

  const { estado } = leitura;
  const relogio = Math.floor(agoraMs / 1000);
  const decisao = await decidir(estado, relogio, {
    chaves: chavesAceitas({ producao: process.env.NODE_ENV === "production", extras: [] }),
  });

  // O maior horário visto só avança, e só vai ao banco de tempos em tempos.
  const memoria = memoriaDoProcesso();
  if (agoraMs - memoria.ultimoRegistroDoHorario >= INTERVALO_DE_REGISTRO_DO_HORARIO_MS) {
    memoria.ultimoRegistroDoHorario = agoraMs;
    void registrarHorarioVisto(decisao.agora);
  }

  if (decisao.relogioRecuou) {
    avisarUmaVez(
      "relogio",
      agoraMs,
      "licenca: o relógio local está bem atrás do maior horário já visto",
      {
        agora_efetivo: decisao.agora,
        relogio_local: relogio,
      },
    );
  }

  const resumo = `${decisao.estado}:${estado.modo}`;
  if (resumo !== memoria.ultimoEstadoLogado) {
    memoria.ultimoEstadoLogado = resumo;
    logger.info("licenca: decisão da instalação", {
      estado: decisao.estado,
      opera: decisao.opera,
      modo: estado.modo,
      motivo_do_selo: decisao.motivoDoSelo,
    });
  }

  const aplicar = estado.modo === "valendo" && !decisao.opera;
  return {
    aplicar,
    decisao,
    modo: estado.modo,
    motivo: aplicar ? "valendo" : decisao.opera ? "opera" : "sombra",
  };
}

/**
 * Pergunta se a porta deve trabalhar. Nunca lança. O parâmetro `porta` identifica quem pergunta, para o
 * registro; a resposta é a mesma para todas.
 */
export async function consultarPorta(
  porta: PortaDaLicenca,
  agoraMs: number = Date.now(),
): Promise<VereditoDaPorta> {
  try {
    const memoria = memoriaDoProcesso();
    let atual = memoria.lembrada;
    if (!atual || (await atual).ate <= agoraMs) {
      const nova = calcular(agoraMs).then((veredito) => ({
        ate: agoraMs + VALIDADE_DA_DECISAO_MS,
        veredito,
      }));
      memoria.lembrada = atual = nova;
      // Falha inesperada não pode ficar lembrada: a próxima pergunta tenta de novo.
      nova.catch(() => {
        if (memoria.lembrada === nova) memoria.lembrada = null;
      });
    }
    // `atual`, e não `memoria.lembrada`: se alguém esquecer a decisão entre o `await` acima e aqui, esta
    // pergunta termina com a decisão que ela mesma leu.
    const { veredito } = await atual;

    // Quem só MOSTRA a situação (`tela`) não é porta: não recusa nada e não gera aviso de recusa.
    if (porta === "tela") return veredito;

    if (veredito.aplicar) {
      avisarUmaVez(`recusa:${porta}`, agoraMs, "licenca: porta recusando o trabalho", {
        porta,
        estado: veredito.decisao?.estado,
      });
    } else if (veredito.decisao && !veredito.decisao.opera) {
      avisarUmaVez(`sombra:${porta}`, agoraMs, "licenca: em modo sombra — esta porta recusaria", {
        porta,
        estado: veredito.decisao.estado,
      });
    }
    return veredito;
  } catch (erro) {
    avisarUmaVez("falha", agoraMs, "licenca: a consulta da porta falhou — a porta não restringe", {
      porta,
      erro: erro instanceof Error ? erro.name : "desconhecido",
    });
    return { aplicar: false, decisao: null, modo: null, motivo: "estado_indisponivel" };
  }
}

/**
 * O que continua liberado para quem está sem licença (contrato, seção 2): saúde, login, saída, a
 * exportação dos próprios dados e a própria tela de licença. Só as portas com CAMINHO usam isto
 * (`proxy` e `api_token`); cron, worker e webhook não têm caminho de usuário.
 *
 * Os padrões são ancorados — um sub-caminho novo não nasce liberado de carona.
 */
const CAMINHOS_LIBERADOS: readonly RegExp[] = [
  /^\/api\/v1\/health$/,
  /^\/login(\/.*)?$/,
  /^\/auth\/.+$/,
  /^\/api\/v1\/auth\/.+$/,
  /^\/account-suspended$/,
  /^\/acesso-revogado$/,
  // A exportação dos próprios dados e o fluxo de direitos do titular (LGPD): bloquear a licença nunca
  // pode impedir a saída dos dados.
  /^\/api\/v1\/audit\/export$/,
  /^\/api\/v1\/lgpd\/.+$/,
  /^\/lgpd(\/.*)?$/,
  /^\/app\/lgpd(\/.*)?$/,
  // A tela de licença e a API dela (partes seguintes da Fase 1).
  /^\/app\/licenca(\/.*)?$/,
  /^\/api\/v1\/licenca(\/.*)?$/,
];

export function caminhoLiberadoDaLicenca(pathname: string): boolean {
  return CAMINHOS_LIBERADOS.some((re) => re.test(pathname));
}

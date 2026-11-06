/**
 * O ARMAZÉM da licença — o único módulo que fala com `public.platform_licenca`.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2. Migration 0556. A parte
 * pura (tipos, tradução da linha, relógio efetivo) está em `estado.ts`; aqui só há I/O.
 *
 * ── NUNCA LANÇA ───────────────────────────────────────────────────────────────
 *
 * Quem decide se a instalação opera lê este estado a cada requisição. Banco fora do ar, tabela
 * ainda ausente (imagem nova sobre schema velho: o rollback do `agent.sh` põe CÓDIGO NOVO sobre
 * BANCO ANTIGO, e o inverso também acontece no meio de uma atualização) ou resposta torta têm de
 * virar um resultado `{ ok: false, motivo }` — nunca uma exceção que alguém trate como "sem
 * licença, funciona" ou, pior, como 500 em toda tela. O que fazer com a falha é de quem decide.
 *
 * ── SERVER-SIDE ONLY ──────────────────────────────────────────────────────────
 *
 * A tabela não é servida pelo PostgREST (RLS sem policies, grants revogados de anon/authenticated).
 * O admin client BYPASSA RLS, e a regra de `organization_id` do CLAUDE.md não se aplica: a licença
 * é da INSTALAÇÃO, não de uma organização. Nada aqui é resolvido a partir de corpo de requisição.
 *
 * ── O QUE O BANCO GARANTE POR CONTA PRÓPRIA ──────────────────────────────────
 *
 * O gatilho `fn_licenca_guarda_invariantes` impede o horário de voltar, a ativação de ser desfeita
 * e o UUID de mudar. Este módulo por isso NÃO relê-compara-escreve: escreve o que sabe e deixa o
 * banco recusar o recuo. Quem precisar do valor final relê.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ────────────────────────────────────────────────
 *
 * Não confere selo (`verificarSelo`) nem decide nada (`decidir`). Quem grava um selo aqui já o
 * conferiu. A credencial só entra cifrada, e sem a chave de cifra a gravação é recusada: falha
 * FECHADA, nunca em claro.
 */

import { randomUUID } from "node:crypto";

import { bufToBytea, byteaToBuffer, decryptKey, encryptKey } from "@/lib/crypto/aes_gcm";
import { env } from "@/lib/env";
import { tabelaAusente } from "@/lib/instalacao/tabela-ausente";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { estadoDaLinha, isoDe, type EstadoLocal, type LinhaDaLicenca } from "./estado";

/** Por que uma operação não aconteceu. Códigos, nunca texto de erro do banco (pode citar dado). */
export type MotivoDoArmazem =
  | "tabela_ausente"
  | "banco_recusou"
  | "sem_chave_de_cifra"
  | "credencial_invalida"
  | "sem_credencial";

export type LeituraDoEstado =
  { ok: true; estado: EstadoLocal } | { ok: false; motivo: MotivoDoArmazem };

export type ResultadoDeGravacao = { ok: true } | { ok: false; motivo: MotivoDoArmazem };

/** As colunas do estado. O envelope da credencial NÃO está aqui: só `lerCredencial` o abre. */
const COLUNAS =
  "instalacao_id, selo_atual, maior_horario_visto, ativada_em, bloqueio_codigo, bloqueio_em, ultima_consulta_ok_em, janela_termina_em, proxima_consulta_em, modo";

/** UUID v4, o formato do `sub` do selo. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** O prefixo fixo da credencial e um teto de tamanho: o servidor emite algo na casa de 40 caracteres. */
const PREFIXO_DA_CREDENCIAL = "zpl_";
const CREDENCIAL_TAMANHO_MAXIMO = 256;

function recusa(
  contexto: string,
  erro: { code?: string | null; message?: string } | unknown,
): MotivoDoArmazem {
  const codigo =
    typeof erro === "object" && erro !== null && "code" in erro
      ? ((erro as { code?: string | null }).code ?? null)
      : null;
  if (tabelaAusente({ code: codigo })) return "tabela_ausente";
  // Só o código do Postgres/PostgREST: a mensagem pode citar valor de coluna.
  logger.warn("licenca: o banco recusou a operação", { contexto, codigo });
  return "banco_recusou";
}

function uuidDoAmbiente(): string | null {
  const bruto = env.INSTALACAO_ID.trim();
  if (!bruto) return null;
  if (UUID_V4.test(bruto)) return bruto.toLowerCase();
  logger.warn("licenca: INSTALACAO_ID do .env não é um UUID v4 — ignorado, o app gera um");
  return null;
}

async function lerLinha(): Promise<
  { ok: true; linha: LinhaDaLicenca | null } | { ok: false; motivo: MotivoDoArmazem }
> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_licenca")
      .select(COLUNAS)
      .eq("id", 1)
      .maybeSingle();
    if (error) return { ok: false, motivo: recusa("ler", error) };
    return { ok: true, linha: (data as LinhaDaLicenca | null) ?? null };
  } catch (erro) {
    return { ok: false, motivo: recusa("ler", erro) };
  }
}

/**
 * O estado local, criando a linha na primeira leitura. O UUID nasce do `INSTALACAO_ID` do `.env`
 * (o kit o grava e o backup o leva junto) ou, na falta dele, é gerado aqui. Depois de criada, o
 * BANCO manda: um `.env` que discorda é registrado e ignorado — o UUID não muda, e o selo emitido
 * para ele continua valendo.
 *
 * Duas leituras simultâneas (app e worker no primeiro boot) não brigam: a criação é
 * `on conflict do nothing` e as duas leem a mesma linha depois.
 */
export async function garantirEstado(): Promise<LeituraDoEstado> {
  const primeira = await lerLinha();
  if (!primeira.ok) return primeira;

  let linha = primeira.linha;
  if (!linha) {
    try {
      const { error } = await createAdminClient()
        .from("platform_licenca")
        .upsert(
          { id: 1, instalacao_id: uuidDoAmbiente() ?? randomUUID() },
          { onConflict: "id", ignoreDuplicates: true },
        );
      if (error) return { ok: false, motivo: recusa("criar", error) };
    } catch (erro) {
      return { ok: false, motivo: recusa("criar", erro) };
    }
    const segunda = await lerLinha();
    if (!segunda.ok) return segunda;
    linha = segunda.linha;
    if (!linha) return { ok: false, motivo: "banco_recusou" };
  }

  const doAmbiente = uuidDoAmbiente();
  if (doAmbiente && doAmbiente !== linha.instalacao_id.toLowerCase()) {
    logger.warn("licenca: INSTALACAO_ID do .env difere do banco — vale o do banco", {
      noBanco: linha.instalacao_id,
      noAmbiente: doAmbiente,
    });
  }
  return { ok: true, estado: estadoDaLinha(linha) };
}

async function atualizar(
  contexto: string,
  campos: Record<string, unknown>,
): Promise<ResultadoDeGravacao> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_licenca")
      .update(campos)
      .eq("id", 1)
      .select("id");
    if (error) return { ok: false, motivo: recusa(contexto, error) };
    // Nenhuma linha atualizada = o estado nunca foi criado. Quem grava chamou `garantirEstado` antes.
    if (!data || data.length === 0) return { ok: false, motivo: "banco_recusou" };
    return { ok: true };
  } catch (erro) {
    return { ok: false, motivo: recusa(contexto, erro) };
  }
}

/**
 * Registra um horário observado (relógio local ou resposta do servidor), em segundos Unix.
 * O banco só deixa o maior valer — gravar um horário menor é inofensivo.
 */
export async function registrarHorarioVisto(segundos: number): Promise<ResultadoDeGravacao> {
  if (!Number.isFinite(segundos)) return { ok: false, motivo: "banco_recusou" };
  return atualizar("horario", { maior_horario_visto: isoDe(segundos) });
}

/** Instante opcional → ISO ou `null`. Não finito vira `null`: "pode consultar já" é o lado seguro. */
function instanteOuNulo(segundos: number | null | undefined): string | null {
  return segundos === null || segundos === undefined || !Number.isFinite(segundos)
    ? null
    : isoDe(segundos);
}

function credencialValida(credencial: string): boolean {
  return (
    credencial.startsWith(PREFIXO_DA_CREDENCIAL) &&
    credencial.length > PREFIXO_DA_CREDENCIAL.length &&
    credencial.length <= CREDENCIAL_TAMANHO_MAXIMO
  );
}

export interface DadosDaAtivacao {
  /** O `zpl_…` que o servidor mostrou UMA vez. */
  credencial: string;
  /** O selo recebido, já conferido por `verificarSelo`. */
  selo: string;
  /** O "agora" efetivo desta resposta, em segundos. Vira `ativada_em` e o horário visto. */
  agora: number;
  janelaTerminaEm: number | null;
  /** Quando consultar de novo (segundos). Ausente = o cliente de renovação decide na hora. */
  proximaConsultaEm?: number | null;
}

/**
 * Grava o resultado da ativação: credencial cifrada, primeiro selo, `ativada_em` e consulta OK.
 * Falha FECHADA se a credencial não puder ser cifrada — nunca grava o segredo em claro. Limpa um
 * bloqueio anterior, porque o servidor acabou de responder que a licença vale.
 */
export async function gravarAtivacao(dados: DadosDaAtivacao): Promise<ResultadoDeGravacao> {
  if (!credencialValida(dados.credencial)) return { ok: false, motivo: "credencial_invalida" };
  if (!Number.isFinite(dados.agora)) return { ok: false, motivo: "banco_recusou" };

  let envelope: ReturnType<typeof encryptKey>;
  try {
    envelope = encryptKey(dados.credencial);
  } catch {
    // Sem AI_CRED_AES_KEY (ou com ela mal formada): recusa, não degrada para texto puro.
    logger.warn("licenca: a credencial não pôde ser cifrada — ativação não gravada");
    return { ok: false, motivo: "sem_chave_de_cifra" };
  }
  const agora = isoDe(dados.agora);
  return atualizar("ativacao", {
    credencial_ciphertext: bufToBytea(envelope.ciphertext),
    credencial_iv: bufToBytea(envelope.iv),
    credencial_tag: bufToBytea(envelope.tag),
    credencial_last4: envelope.last4,
    selo_atual: dados.selo,
    ativada_em: agora,
    maior_horario_visto: agora,
    ultima_consulta_ok_em: agora,
    janela_termina_em: dados.janelaTerminaEm === null ? null : isoDe(dados.janelaTerminaEm),
    proxima_consulta_em: instanteOuNulo(dados.proximaConsultaEm),
    bloqueio_codigo: null,
    bloqueio_em: null,
  });
}

export interface DadosDaRenovacao {
  /** O selo novo, já conferido por `verificarSelo`. */
  selo: string;
  agora: number;
  janelaTerminaEm: number | null;
  proximaConsultaEm?: number | null;
}

/** Grava um selo renovado. A resposta válida do servidor também limpa um bloqueio anterior. */
export async function gravarRenovacao(dados: DadosDaRenovacao): Promise<ResultadoDeGravacao> {
  if (!Number.isFinite(dados.agora)) return { ok: false, motivo: "banco_recusou" };
  const agora = isoDe(dados.agora);
  return atualizar("renovacao", {
    selo_atual: dados.selo,
    maior_horario_visto: agora,
    ultima_consulta_ok_em: agora,
    janela_termina_em: dados.janelaTerminaEm === null ? null : isoDe(dados.janelaTerminaEm),
    proxima_consulta_em: instanteOuNulo(dados.proximaConsultaEm),
    bloqueio_codigo: null,
    bloqueio_em: null,
  });
}

/**
 * Registra que o servidor respondeu bloqueio. O selo atual NÃO é tocado: a decisão é quem
 * transforma "bloqueio registrado" em "não opera". O código é o que o servidor devolveu (nunca
 * texto livre); fora do formato, grava `desconhecido` — perder o motivo nunca pode perder o bloqueio.
 */
export async function gravarBloqueio(
  codigo: string,
  agora: number,
  proximaConsultaEm?: number | null,
): Promise<ResultadoDeGravacao> {
  if (!Number.isFinite(agora)) return { ok: false, motivo: "banco_recusou" };
  const seguro = /^[a-z0-9_]{1,64}$/.test(codigo) ? codigo : "desconhecido";
  return atualizar("bloqueio", {
    bloqueio_codigo: seguro,
    bloqueio_em: isoDe(agora),
    maior_horario_visto: isoDe(agora),
    ultima_consulta_ok_em: isoDe(agora),
    proxima_consulta_em: instanteOuNulo(proximaConsultaEm),
  });
}

/**
 * Só o lembrete de quando consultar de novo — para quem consultou e NÃO recebeu selo novo (o servidor
 * pediu para esperar, ou o selo veio recusado). O resto do estado não é tocado.
 */
export async function gravarProximaConsulta(
  proximaConsultaEm: number | null,
): Promise<ResultadoDeGravacao> {
  return atualizar("proxima_consulta", { proxima_consulta_em: instanteOuNulo(proximaConsultaEm) });
}

/** Só o modo: `sombra` calcula e registra; `valendo` aplica. Ação administrativa. */
export async function definirModo(modo: "sombra" | "valendo"): Promise<ResultadoDeGravacao> {
  return atualizar("modo", { modo });
}

export type LeituraDaCredencial =
  { ok: true; credencial: string } | { ok: false; motivo: MotivoDoArmazem };

/**
 * A credencial em claro, para o cliente de renovação mandar como `Authorization: Bearer`. Só este
 * caminho abre o envelope; o estado comum nunca o carrega. `sem_credencial` = nunca foi ativada;
 * `sem_chave_de_cifra` = o envelope existe mas não abre (chave trocada ou ausente) — dois fatos
 * diferentes para a mensagem de quem opera.
 */
export async function lerCredencial(): Promise<LeituraDaCredencial> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_licenca")
      .select("credencial_ciphertext, credencial_iv, credencial_tag")
      .eq("id", 1)
      .maybeSingle();
    if (error) return { ok: false, motivo: recusa("credencial", error) };
    const linha = data as {
      credencial_ciphertext: unknown;
      credencial_iv: unknown;
      credencial_tag: unknown;
    } | null;
    if (!linha || linha.credencial_ciphertext == null)
      return { ok: false, motivo: "sem_credencial" };
    try {
      return {
        ok: true,
        credencial: decryptKey({
          ciphertext: byteaToBuffer(linha.credencial_ciphertext),
          iv: byteaToBuffer(linha.credencial_iv),
          tag: byteaToBuffer(linha.credencial_tag),
        }),
      };
    } catch {
      logger.warn(
        "licenca: o envelope da credencial não abriu (chave de cifra ausente ou trocada)",
      );
      return { ok: false, motivo: "sem_chave_de_cifra" };
    }
  } catch (erro) {
    return { ok: false, motivo: recusa("credencial", erro) };
  }
}

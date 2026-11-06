/**
 * O CLIENTE HTTP do servidor de licenças — uma chamada, uma resposta tipada, e nunca uma exceção.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seções 3 e 5. Este módulo só FALA; quem confere
 * o selo (`verificarSelo`) e quem grava o resultado (`armazem`) são os chamadores (`renovar.ts`, `ativar.ts`).
 *
 * ── O QUE SAI PELA REDE ───────────────────────────────────────────────────────
 *
 * Só o que o contrato (seção 5) autoriza, e quem escolhe o corpo é o chamador: aqui nada é acrescentado — nem
 * cabeçalho de identificação do produto, nem dado da instalação. A credencial vai em `Authorization: Bearer`,
 * NUNCA na URL (a doutrina de API key se aplica também a este canal), e nunca é registrada em log.
 *
 * ── O QUE ENTRA ───────────────────────────────────────────────────────────────
 *
 * O servidor é de fora da instalação: a resposta é dado, não instrução. Corpo com teto de tamanho (um servidor
 * torto ou trocado não enche a memória), JSON validado pelo esquema de quem chama, campos desconhecidos
 * ignorados (contrato, seção 7). Redirecionamento é recusado — uma resposta 3xx não é seguida para outro
 * endereço levando a credencial junto.
 *
 * ── SÓ HTTPS ──────────────────────────────────────────────────────────────────
 *
 * A credencial viaja neste canal; texto puro a exporia a quem estivesse no caminho. `http:` só é aceito para
 * loopback (o servidor de mentira dos testes e a homologação local).
 */
import { z } from "zod";

/** O endereço oficial. O ambiente (`LICENCA_SERVIDOR_URL`) pode trocá-lo para teste e homologação. */
export const SERVIDOR_OFICIAL = "https://licencas.futuristas.app/api/v1";

/** Quanto esperar o servidor antes de desistir desta tentativa. */
export const TEMPO_LIMITE_DA_CHAMADA_MS = 10_000;

/** Teto do corpo da resposta. Um selo tem uns poucos KB; isto é folga larga, não alvo. */
export const TAMANHO_MAXIMO_DA_RESPOSTA = 64 * 1024;

/** O que uma chamada que não deu certo pode ser. Códigos, nunca o texto do servidor. */
export type FalhaDoServidor =
  /** Não houve resposta utilizável: DNS, conexão, TLS, tempo esgotado, redirecionamento, corpo grande demais. */
  | { readonly tipo: "rede" }
  /** Houve resposta, mas não no formato do contrato (JSON torto, esquema que não confere). */
  | { readonly tipo: "resposta_invalida"; readonly status: number }
  /** O servidor recusou: `codigo` é o do erro do contrato, `motivoCodigo` o motivo do bloqueio, se vier. */
  | {
      readonly tipo: "recusa";
      readonly status: number;
      readonly codigo: string;
      readonly motivoCodigo: string | null;
      readonly retryAfterS: number | null;
    };

export type RespostaDoServidor<T> =
  | { readonly ok: true; readonly dados: T }
  | { readonly ok: false; readonly falha: FalhaDoServidor };

/** Um código do contrato: minúsculas, dígitos e `_`. O que não for assim vira `desconhecido`. */
const CODIGO = /^[a-z0-9_]{1,64}$/;

const esquemaDoErro = z.object({
  error: z.object({
    code: z.string(),
    motivo_codigo: z.string().nullish(),
  }),
});

/** `{ "data": … }` — o envelope de sucesso. */
const esquemaDoEnvelope = z.object({ data: z.unknown() });

function loopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/**
 * Valida a base configurada. `null` = não use: não é URL, não é `https:` (fora loopback), traz credencial na
 * URL ou parâmetros. O resultado não termina em `/`.
 */
export function baseDoServidor(bruta: string): string | null {
  let url: URL;
  try {
    url = new URL(bruta.trim() || SERVIDOR_OFICIAL);
  } catch {
    return null;
  }
  const seguro = url.protocol === "https:" || (url.protocol === "http:" && loopback(url.hostname));
  if (!seguro || url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, "");
}

async function lerCorpoLimitado(resposta: Response): Promise<string | null> {
  const declarado = Number(resposta.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO_DA_RESPOSTA) return null;
  if (!resposta.body) return "";
  const leitor = resposta.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > TAMANHO_MAXIMO_DA_RESPOSTA) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    pedacos.push(value);
  }
  return Buffer.concat(pedacos).toString("utf8");
}

function segundosDeRetryAfter(valor: string | null): number | null {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface ChamadaAoServidor<T> {
  /** A base já validada por `baseDoServidor`. */
  base: string;
  /** Caminho a partir da base, com `/` na frente: `/licenca/renovar`. */
  rota: string;
  /** O `zpl_…` em claro, quando a rota exige. Vai só em `Authorization`. */
  credencial?: string;
  /** O corpo, já no formato do contrato. */
  corpo: Record<string, unknown>;
  /** Valida o `data` da resposta de sucesso. */
  esquema: z.ZodType<T>;
  /** Torna o POST repetível sem efeito duplo (contrato, seção 3). */
  idempotencyKey?: string;
  tempoLimiteMs?: number;
  /** Para teste. */
  fetchImpl?: typeof fetch;
}

/** Faz um POST ao servidor de licenças. Nunca lança. */
export async function chamarServidor<T>(
  chamada: ChamadaAoServidor<T>,
): Promise<RespostaDoServidor<T>> {
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (chamada.credencial) cabecalhos.authorization = `Bearer ${chamada.credencial}`;
  if (chamada.idempotencyKey) cabecalhos["idempotency-key"] = chamada.idempotencyKey;

  let resposta: Response;
  let texto: string | null;
  try {
    resposta = await (chamada.fetchImpl ?? fetch)(`${chamada.base}${chamada.rota}`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify(chamada.corpo),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(chamada.tempoLimiteMs ?? TEMPO_LIMITE_DA_CHAMADA_MS),
    });
    texto = await lerCorpoLimitado(resposta);
  } catch {
    return { ok: false, falha: { tipo: "rede" } };
  }
  if (texto === null) return { ok: false, falha: { tipo: "rede" } };

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }

  if (resposta.ok) {
    const envelope = esquemaDoEnvelope.safeParse(json);
    const dados = envelope.success ? chamada.esquema.safeParse(envelope.data.data) : null;
    if (dados?.success) return { ok: true, dados: dados.data };
    return { ok: false, falha: { tipo: "resposta_invalida", status: resposta.status } };
  }

  const erro = esquemaDoErro.safeParse(json);
  const codigo =
    erro.success && CODIGO.test(erro.data.error.code) ? erro.data.error.code : "desconhecido";
  const motivo = erro.success ? (erro.data.error.motivo_codigo ?? null) : null;
  return {
    ok: false,
    falha: {
      tipo: "recusa",
      status: resposta.status,
      codigo,
      motivoCodigo: motivo !== null && CODIGO.test(motivo) ? motivo : null,
      retryAfterS: segundosDeRetryAfter(resposta.headers.get("retry-after")),
    },
  };
}

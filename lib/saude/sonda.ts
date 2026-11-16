/**
 * A FORMA de uma sonda de saúde — o que o `/api/v1/health` devolve por serviço, e o que o
 * Painel da administração lê (issue #310).
 *
 * Saiu de `app/api/v1/health/route.ts` sem mudar uma linha de lógica: a rota e o Painel
 * precisam fazer a MESMA pergunta, e duas cópias da sonda divergiriam na primeira correção.
 * As sondas em si moram em `lib/saude/sondas.ts` (banco e Redis) e em
 * `lib/channels/sonda-do-transporte-qr.ts` (o transporte por QR code, que só a fronteira
 * de canais pode nomear — `scripts/lint-channels.ts`).
 */
import type { FalhaDeAlcance } from "@/lib/net/alcance";

export type CheckStatus = "ok" | "degraded" | "down";

/** Por que o check não passou. `credencial_recusada` é o 401/403 — chegamos lá, e fomos barrados. */
export type MotivoDeFalha =
  | FalhaDeAlcance
  | "credencial_recusada"
  | "resposta_inesperada"
  | "nao_configurado"
  | "configuracao_invalida";

export type Check = {
  status: CheckStatus;
  latency_ms: number;
  error?: string;
  reason?: MotivoDeFalha;
  /** Protocolo + host + porta que tentamos. Só com `?verbose=1` autenticado. */
  target?: string;
};

const TIMEOUT_MS = 3_000;

export async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

/** Chegamos ao serviço, ele respondeu, e a resposta não serve. */
export function motivoDoStatusHttp(status: number): MotivoDeFalha {
  return status === 401 || status === 403 ? "credencial_recusada" : "resposta_inesperada";
}

/**
 * Sem o segredo, o endereço não sai — nem pelo `target`, nem pelo `error`.
 *
 * O `target` sempre foi escondido de propósito: esta rota é PÚBLICA (o `GET` não
 * exige nada; o segredo interno só destrava o `?verbose=1`), e o cabeçalho de
 * `app/api/v1/health/route.ts` chama o endereço do transporte por QR code e do Redis
 * do cliente de superfície de ataque.
 * Mas o `error` saía cru ao lado dele, e ele carrega o mesmo endereço numa das
 * formas mais comuns de configuração errada.
 *
 * Medido, com valores que passam pelo Zod de `lib/env.ts` — porque só
 * `NEXT_PUBLIC_SUPABASE_URL` é `.url()` (linha 69); a URL do transporte por QR code (140) e
 * `UPSTASH_REDIS_REST_URL` (155) são `required()` puro, sem validação de forma:
 *
 *   "redis-interno.minha-vps.com"
 *     -> e.message = "Failed to parse URL from redis-interno.minha-vps.com"
 *   `"https://redis-interno.minha-vps.com"`  (aspas sobrando no .env)
 *     -> e.message = "Failed to parse URL from \"https://redis-interno...\""
 *
 * Ou seja: exatamente os dois serviços cujo endereço a rota esconde por decisão
 * escrita, e exatamente a instalação self-host que erra o `.env` — o caso já
 * catalogado nesta casa como ".env sem aspas". O `error` publicava pela porta
 * que a redação do `target` fechou.
 *
 * Contra-exemplo medido, para o escopo ficar honesto: um endereço com esquema
 * válido e host inalcançável devolve `"fetch failed"`, e o host mora em
 * `e.cause`, que esta rota nunca devolveu. O vazamento é da forma MALFORMADA,
 * não de toda falha — e é por isso que a troca é de redação, não de remoção.
 *
 * O que NÃO se perde: `reason` (`classificarFalhaDeAlcance`) continua saindo
 * inteiro, então quem monitora de fora segue distinguindo dns, recusa, tempo
 * esgotado e credencial recusada. E quem tem o segredo continua vendo o texto
 * original, porque `verbose=1` não passa por aqui.
 */
export function semAlvo(check: Check): Check {
  const { target: _oculto, error, ...resto } = check;
  return error === undefined ? resto : { ...resto, error: "erro_ao_consultar" };
}

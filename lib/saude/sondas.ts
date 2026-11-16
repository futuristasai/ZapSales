/**
 * As sondas do BANCO e do REDIS — as mesmas do `/api/v1/health`, agora também lidas pelo
 * Painel da administração (issue #310). Movidas da rota sem mudar comportamento; a
 * história de cada decisão continua nos comentários abaixo.
 */
import "server-only";

import { env } from "@/lib/env";
import { alvoDe, classificarFalhaDeAlcance } from "@/lib/net/alcance";
import { validarConfigRedisRest } from "@/lib/redis-config";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

import { motivoDoStatusHttp, withTimeout, type Check } from "./sonda";

export async function checkSupabase(): Promise<Check> {
  const t0 = Date.now();
  // A sonda pergunta ao MESMO endereço que o app usa para falar com o banco, e
  // não ao público: com `SUPABASE_SERVER_URL` (#1082) preenchida, uma instalação
  // com Kong privado não tem REST publicado — a URL pública daria `down` com o
  // CRM inteiro funcionando ao lado. Sem a variável, é a pública, como sempre.
  const url = urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    // Ping leve via REST com anon key — não precisa de service_role pra health check.
    // Se chegar 200/401/empty body, conexão e API key estão OK.
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await withTimeout(
      fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          // O SCHEMA VAI EXPLÍCITO, como o resto do app faz.
          //
          // Este `fetch` é cru, então ele cai no schema DEFAULT do PostgREST —
          // o primeiro da lista "Exposed schemas" do projeto. Que esse default
          // seja `public` é costume de projeto novo, não garantia do Supabase:
          // num projeto que já servia outra aplicação (schema próprio primeiro
          // na lista), o ping procurava `<outro>.organizations`, levava
          // `404 PGRST205` e o check declarava o banco `down` — com o CRM
          // atendendo normalmente ao lado.
          //
          // Não é falso alarme de menos importância: `update.sh` termina em
          // `wait_app_healthy`, e sair diferente de zero é o sinal que o
          // `agent.sh` usa para REVERTER a imagem. Uma atualização boa era
          // desfeita por uma configuração de painel que o CRM não controla.
          //
          // Nenhum client do CRM declara `db.schema` (`lib/supabase/*.ts`), e o
          // default do supabase-js é `public` — então é `public` que o app
          // usa de verdade, e é o que esta sonda tem de perguntar para estar
          // medindo o mesmo banco que o app enxerga.
          "Accept-Profile": "public",
        },
        cache: "no-store",
      }),
    );
    // 200 (lista vazia por RLS) ou 401/403 (auth ok mas RLS bloqueia anon) → conexão OK
    if (res.status === 200 || res.status === 401 || res.status === 403) {
      return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(url) };
    }
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: `http_${res.status}`,
      reason: motivoDoStatusHttp(res.status),
      target: alvoDe(url),
    };
  } catch (e) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      reason: classificarFalhaDeAlcance(e),
      target: alvoDe(url),
    };
  }
}

export async function checkRedis(): Promise<Check> {
  const t0 = Date.now();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  /**
   * A FORMA do valor vem antes da ida à rede, e o motivo é o que quem opera faz
   * a seguir.
   *
   * Um `.env` com as aspas sobrando (`URL="https://srh:80"`) hoje chega até o
   * `fetch`, falha, e o `reason` que sai é o de alcance — indistinguível do
   * contêiner do Redis realmente parado. As duas leituras mandam o operador
   * para lugares opostos: uma para reiniciar um serviço que está de pé, a outra
   * para o editor. `configuracao_invalida` separa as duas SEM ida à rede.
   *
   * Só "não configurado" segue `degraded`: é integração que ninguém contratou.
   * Configurado errado é `down` — o produto conta com o Redis e não o tem.
   *
   * O texto continua carregando o endereço de propósito: `semAlvo()` o redige
   * para quem não tem o segredo interno, e quem tem precisa ver QUAL valor está
   * malformado — dizer só "inválido" sem dizer qual não conserta nada.
   */
  const config = validarConfigRedisRest(url, token);
  if (!config.ok) {
    if (config.reason === "nao_configurado") {
      return {
        status: "degraded",
        latency_ms: 0,
        error: "not_configured",
        reason: "nao_configurado",
      };
    }
    return {
      status: "down",
      latency_ms: 0,
      error: `configuracao_invalida: UPSTASH_REDIS_REST_URL=${url}`,
      reason: "configuracao_invalida",
      target: alvoDe(url),
    };
  }
  try {
    // Protocolo REST do Upstash (compatível com serverless-redis-http): comando no
    // corpo via POST na raiz. NÃO existe GET /ping — daria 404 no SRH self-host.
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
        cache: "no-store",
      }),
    );
    if (!res.ok) {
      return {
        status: "down",
        latency_ms: Date.now() - t0,
        error: `http_${res.status}`,
        reason: motivoDoStatusHttp(res.status),
        target: alvoDe(url),
      };
    }
    return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(url) };
  } catch (e) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      reason: classificarFalhaDeAlcance(e),
      target: alvoDe(url),
    };
  }
}

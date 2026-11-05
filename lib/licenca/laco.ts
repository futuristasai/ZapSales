/**
 * A PORTA DO WORKER — o que cada laço do processo `agent-worker` pergunta antes de cada rodada.
 *
 * `licencaRecusaOLaco()` é `true` quando a licença está bloqueada/vencida E o modo é `valendo`
 * (em `sombra`, o padrão, é sempre `false`). O laço que recebe `true` pula a rodada e dorme o
 * intervalo ocioso de sempre; nada é perdido, só adiado.
 *
 * ⚠️ O import da porta é DINÂMICO e a falha é "não recusa", de propósito. A cadeia
 * `porta → armazem → @/lib/env` valida variáveis obrigatórias com `throw` no topo do módulo, e vários
 * laços do worker já foram escritos para NÃO carregar essa cadeia estaticamente: uma instalação com
 * `.env` mais enxuto veria o worker inteiro morrer no boot por causa de um laço acessório
 * (`lib/event-log/drain-loop.ts` explica o caso, #648). Um laço que não consegue perguntar à
 * licença segue trabalhando — trancar o cliente por defeito nosso seria pior que o defeito.
 *
 * Quem decide é `consultarPorta("worker")`; a cerca `tests/unit/licenca-portas-chamam-a-decisao.test.ts`
 * cobra que todo laço que envia ou gasta chame esta função.
 */
export async function licencaRecusaOLaco(): Promise<boolean> {
  try {
    const { consultarPorta } = await import("./porta");
    return (await consultarPorta("worker")).aplicar;
  } catch {
    return false;
  }
}

/**
 * QUANDO falar de novo com o servidor de licenças — a parte PURA do cliente de renovação.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 4. O servidor sugere o próximo contato
 * (`proxima_consulta_em`, 1 hora com variação de ±20 %), e o app só aceita sugestão entre 5 minutos e
 * 24 horas: fora da faixa, usa a própria (1 hora, com a mesma variação). A variação existe para que mil
 * instalações que subiram juntas — depois de uma queda do servidor, por exemplo — não voltem a bater
 * todas no mesmo segundo.
 *
 * Tudo em SEGUNDOS Unix, como o resto de `lib/licenca/`. Nenhum relógio e nenhum acaso são lidos aqui:
 * ambos chegam por parâmetro, que é como o prazo se testa sem esperar uma hora.
 */

/** Intervalo padrão entre consultas. */
export const CONSULTA_PADRAO_S = 3600;
/** Menor e maior intervalo que o app aceita do servidor. */
export const CONSULTA_MINIMA_S = 5 * 60;
export const CONSULTA_MAXIMA_S = 24 * 3600;
/** A variação aplicada ao intervalo padrão e à espera após falha: ±20 %. */
export const VARIACAO_DA_CONSULTA = 0.2;
/** Espera depois da primeira falha, e o teto dela: o servidor fora do ar não é martelado. */
export const ESPERA_INICIAL_APOS_FALHA_S = 5 * 60;
export const ESPERA_MAXIMA_APOS_FALHA_S = 3600;

/** `aleatorio` devolve um número em [0, 1), como `Math.random`. */
export type Aleatorio = () => number;

function comVariacao(segundos: number, aleatorio: Aleatorio): number {
  const fator = 1 + (aleatorio() * 2 - 1) * VARIACAO_DA_CONSULTA;
  return Math.round(segundos * fator);
}

/**
 * O instante da próxima consulta. `referencia` é o "agora" de QUEM sugeriu — o `iat` do selo recebido, que o
 * servidor assinou — e não o relógio local: o intervalo é a diferença entre dois instantes do servidor, então
 * um relógio local adiantado ou atrasado não encurta nem alonga a espera. O resultado é somado a `referencia`.
 *
 * Sugestão ausente, ilegível ou fora de [5 min, 24 h] → 1 hora com variação.
 */
export function proximaConsulta(
  referencia: number,
  sugerida: number | null,
  aleatorio: Aleatorio = Math.random,
): number {
  if (sugerida !== null && Number.isFinite(sugerida)) {
    const intervalo = sugerida - referencia;
    if (intervalo >= CONSULTA_MINIMA_S && intervalo <= CONSULTA_MAXIMA_S) return sugerida;
  }
  return referencia + comVariacao(CONSULTA_PADRAO_S, aleatorio);
}

/**
 * Quanto esperar depois de uma consulta que falhou (rede, 5xx, selo recusado). Dobra a cada falha seguida,
 * de 5 minutos até 1 hora. Se o servidor mandou `Retry-After`, ele manda — dentro da mesma faixa de 5 minutos
 * a 24 horas —, porque quem pede para esperar mais sabe do que está falando.
 */
export function esperaAposFalha(
  falhasSeguidas: number,
  retryAfterS: number | null,
  aleatorio: Aleatorio = Math.random,
): number {
  if (retryAfterS !== null && Number.isFinite(retryAfterS) && retryAfterS > 0) {
    return Math.min(Math.max(Math.ceil(retryAfterS), CONSULTA_MINIMA_S), CONSULTA_MAXIMA_S);
  }
  const n = Math.max(1, Math.floor(falhasSeguidas));
  const base = Math.min(ESPERA_INICIAL_APOS_FALHA_S * 2 ** (n - 1), ESPERA_MAXIMA_APOS_FALHA_S);
  return comVariacao(base, aleatorio);
}

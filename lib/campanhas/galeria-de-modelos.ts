/**
 * A galeria de modelos da campanha OFICIAL — a parte pura.
 *
 * O operador escolhe o modelo pelo CONTEÚDO, não pelo nome técnico, e uma conta
 * com dezenas de modelos de nomes parecidos (`DESAFIO JUNHO | AULAS AGENDADAS 2`)
 * pede busca e filtro por categoria. Aqui só mora a regra; a tela é
 * `components/campanhas/GaleriaDeModelos.tsx`.
 *
 * A categoria vem da Meta em maiúsculas (`UTILITY`, `MARKETING`,
 * `AUTHENTICATION`) e pode faltar num modelo ainda não sincronizado — por isso o
 * filtro nunca esconde um modelo SEM categoria quando o filtro é "todas", e o
 * trata como fora de qualquer categoria quando o operador filtra por uma.
 */
import type { ModeloParaCampanha, VariavelDoModelo } from "./modelos-da-campanha";

export const FILTROS_DE_CATEGORIA = ["todas", "UTILITY", "MARKETING"] as const;
export type FiltroDeCategoria = (typeof FILTROS_DE_CATEGORIA)[number];

export type CategoriaConhecida = "UTILITY" | "MARKETING" | "AUTHENTICATION";

/** A categoria da Meta como o código a conhece, ou `null` quando falta ou é desconhecida. */
export function categoriaConhecida(
  categoria: string | null | undefined,
): CategoriaConhecida | null {
  const c = (categoria ?? "").trim().toUpperCase();
  return c === "UTILITY" || c === "MARKETING" || c === "AUTHENTICATION" ? c : null;
}

/** Minúsculas e sem acento: "inscrição" acha "INSCRICAO". */
export function normalizarParaBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export interface ConsultaDaGaleria {
  busca: string;
  categoria: FiltroDeCategoria;
}

/** Os modelos que passam pela busca (nome e texto) e pelo filtro de categoria. */
export function filtrarModelos(
  modelos: readonly ModeloParaCampanha[],
  consulta: ConsultaDaGaleria,
): ModeloParaCampanha[] {
  const termo = normalizarParaBusca(consulta.busca);
  return modelos.filter((m) => {
    if (consulta.categoria !== "todas" && categoriaConhecida(m.category) !== consulta.categoria)
      return false;
    if (termo === "") return true;
    return normalizarParaBusca(`${m.name} ${m.texto}`).includes(termo);
  });
}

/** Quantos modelos há em cada filtro — o número que a aba mostra ao lado do nome. */
export function contarPorFiltro(
  modelos: readonly ModeloParaCampanha[],
): Record<FiltroDeCategoria, number> {
  return {
    todas: modelos.length,
    UTILITY: modelos.filter((m) => categoriaConhecida(m.category) === "UTILITY").length,
    MARKETING: modelos.filter((m) => categoriaConhecida(m.category) === "MARKETING").length,
  };
}

/** As primeiras linhas do texto aprovado — o que o cartão mostra. */
export function resumoDoTexto(texto: string, limite = 140): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite).trimEnd()}…`;
}

export interface ParteDoBalao {
  texto: string;
  /** `true` quando a parte é uma variável — a tela a pinta de azul. */
  variavel: boolean;
}

/**
 * O corpo do modelo cortado em partes: texto comum e variáveis. Cada variável do
 * CORPO vira o que `exemplo` devolve (a fonte escolhida, ou o próprio `{{…}}`
 * quando ainda não há fonte). Variável de botão ou de cabeçalho (`chave` com `:`)
 * não aparece no texto do balão e fica de fora, como sempre ficou.
 *
 * A soma das partes é o mesmo texto que a prévia sempre mostrou: pintar de azul
 * não muda uma letra do que o contato lê.
 */
export function partesDoBalao(
  texto: string,
  variaveis: readonly VariavelDoModelo[],
  exemplo: (v: VariavelDoModelo) => string,
): ParteDoBalao[] {
  const doCorpo = new Map(
    variaveis.filter((v) => !v.chave.includes(":")).map((v) => [v.rotulo, v]),
  );
  const partes: ParteDoBalao[] = [];
  for (const pedaco of texto.split(/(\{\{[^{}]+\}\})/)) {
    if (pedaco === "") continue;
    const v = doCorpo.get(pedaco);
    partes.push(v ? { texto: exemplo(v), variavel: true } : { texto: pedaco, variavel: false });
  }
  return partes;
}

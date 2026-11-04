/**
 * A escolha de pessoas do CRM — puro, sem tela e sem rede.
 *
 * O público de uma campanha tem DUAS origens que a tela mostra somadas ("X do CRM + Y da
 * planilha"): as pessoas que o operador marcou na tabela e as que vieram da planilha CSV. As
 * duas viram a mesma coisa para o servidor — `audience_filter.incluir_contatos` — e é por isso
 * que a mesma pessoa nas duas origens conta UMA vez no total.
 */

import type { MotivoDeExclusao } from "./tipos";

/**
 * A linha da tabela "escolher pessoas do CRM". Já diz se a pessoa PODE receber: quem pediu para
 * sair, não tem telefone ou já está em outra campanha aparece, mas esmaecida e sem caixa para
 * marcar. Os vetos que só existem com a lista inteira na mão (telefone repetido, lista de
 * exclusão da operação) continuam sendo contados na prévia.
 */
export interface ContatoDaTabela {
  id: string;
  nome: string | null;
  telefone: string | null;
  tags: string[];
  /** `null` = pode receber. */
  motivo: MotivoDeExclusao | null;
}

/** O teto de pessoas num público, o mesmo de `incluir_contatos` em `audiencia.ts`. */
export const TETO_DA_TABELA = 5000;

/** Uma linha da tabela, como a rota devolve. */
export interface LinhaDaTabela {
  id: string;
  /** `null` = pode receber. */
  motivo: string | null;
}

/** Quem pode ser marcado: quem não tem veto. */
export function podeMarcar(linha: LinhaDaTabela): boolean {
  return linha.motivo === null;
}

/**
 * "Marcar todos os que a busca achou": soma os que podem receber aos já marcados, sem passar do
 * teto. Devolve também quantos ficaram de fora por causa do teto, para a tela avisar em vez de
 * cortar em silêncio.
 */
export function marcarTodos(
  marcados: readonly string[],
  encontrados: readonly LinhaDaTabela[],
  planilha: readonly string[] = [],
  teto: number = TETO_DA_TABELA,
): { marcados: string[]; ficaramDeFora: number } {
  const resultado = [...marcados];
  const vistos = new Set(marcados);
  // A planilha ocupa vaga do mesmo teto: as duas origens viram uma lista só no servidor.
  const naPlanilha = new Set(planilha);
  let ficaramDeFora = 0;
  for (const linha of encontrados) {
    if (!podeMarcar(linha) || vistos.has(linha.id)) continue;
    const total = uniao(resultado, planilha).length;
    if (total >= teto && !naPlanilha.has(linha.id)) {
      ficaramDeFora += 1;
      continue;
    }
    resultado.push(linha.id);
    vistos.add(linha.id);
  }
  return { marcados: resultado, ficaramDeFora };
}

/** Tira da seleção os que a busca achou (o inverso de marcar todos). */
export function desmarcarTodos(
  marcados: readonly string[],
  encontrados: readonly { id: string }[],
): string[] {
  const sai = new Set(encontrados.map((l) => l.id));
  return marcados.filter((id) => !sai.has(id));
}

function uniao(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** A soma que a tela mostra. A pessoa que está nas duas origens conta uma vez. */
export function somaDoPublico(
  doCrm: readonly string[],
  daPlanilha: readonly string[],
): { doCrm: number; daPlanilha: number; total: number } {
  const crm = new Set(doCrm);
  const soDaPlanilha = new Set(daPlanilha.filter((id) => !crm.has(id)));
  return {
    doCrm: crm.size,
    // Quem já foi marcado na tabela não é contado de novo como "da planilha".
    daPlanilha: soDaPlanilha.size,
    total: crm.size + soDaPlanilha.size,
  };
}

/** Os ids que vão ao servidor: as duas origens, sem repetir e dentro do teto. */
export function idsDoPublico(
  doCrm: readonly string[],
  daPlanilha: readonly string[],
  teto: number = TETO_DA_TABELA,
): string[] {
  return uniao(doCrm, daPlanilha).slice(0, teto);
}

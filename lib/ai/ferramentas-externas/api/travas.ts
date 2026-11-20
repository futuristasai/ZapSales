/**
 * AS TRAVAS da API genérica (issue #372): o que as opções de segurança da organização proíbem,
 * decidido NA EXECUÇÃO — no turno do agente, na aprovação da Central e no teste da tela — e não
 * só no cadastro. Uma ferramenta gravada antes de a trava ser ligada deixa de fazer o que a
 * trava proíbe no mesmo instante, sem ninguém editar a ferramenta.
 *
 * Pura: recebe a segurança em vigor e a ferramenta, devolve a trava (ou `null`). Client-safe —
 * a tela usa a MESMA função para dizer por que uma ferramenta não está disponível.
 */
import type { EfeitoDaFerramenta } from "../tipos";
import { dadoDoMarcador, hostDoModelo, marcadoresDoCadastro } from "./montagem";
import { hostPermitido, type SegurancaDasApis } from "./seguranca";
import type { ConfigDaApi } from "./tipos";

export const TRAVAS_DA_API = [
  "recurso_desligado",
  "somente_consulta",
  "endereco_nao_permitido",
  "dado_do_contato_nao_liberado",
] as const;
export type TravaDaApi = (typeof TRAVAS_DA_API)[number];

/** A frase, sem jargão, de por que a ferramenta não pode ser usada agora. Quem lê é o dono do negócio. */
export const FRASE_DA_TRAVA: Record<TravaDaApi, string> = {
  recurso_desligado: "As APIs estão desligadas nesta organização. Ligue o recurso em Ferramentas externas › APIs.",
  somente_consulta:
    "A segurança das APIs está em «somente consulta»: ferramentas que alteram dados em outro sistema não são executadas.",
  endereco_nao_permitido:
    "O endereço desta API não está na lista de endereços permitidos da organização.",
  dado_do_contato_nao_liberado:
    "Esta API envia um dado do contato que a organização não liberou em «Dados do contato que podem sair».",
};

export interface FerramentaParaAsTravas {
  efeito: EfeitoDaFerramenta;
  urlModelo: string;
  config: Pick<ConfigDaApi, "dados_contato" | "corpo">;
}

/** A primeira trava que barra esta ferramenta, ou `null` (pode executar). */
export function travaDaFerramenta(seguranca: SegurancaDasApis, f: FerramentaParaAsTravas): TravaDaApi | null {
  if (!seguranca.ligado || seguranca.aceite === null) return "recurso_desligado";
  if (seguranca.somente_consulta && f.efeito === "altera") return "somente_consulta";
  const host = hostDoModelo(f.urlModelo);
  if (!host || !hostPermitido(host, seguranca.dominios_permitidos)) return "endereco_nao_permitido";
  const liberados = new Set(seguranca.dados_do_contato);
  // O que a ferramenta DECLARA e o que os marcadores dela USAM: os dois precisam estar liberados.
  const usados = marcadoresDoCadastro(f.urlModelo, f.config)
    .map(dadoDoMarcador)
    .filter((d) => d !== null);
  if ([...f.config.dados_contato, ...usados].some((d) => !liberados.has(d))) return "dado_do_contato_nao_liberado";
  return null;
}

/**
 * A chave «pedir aprovação» que vale de verdade: com a trava «aprovação sempre obrigatória», a
 * ferramenta que altera pede aprovação mesmo que quem a cadastrou tenha desligado a chave.
 */
export function chaveDeAprovacaoEmVigor(
  seguranca: Pick<SegurancaDasApis, "aprovacao_obrigatoria">,
  efeito: EfeitoDaFerramenta,
  chaveDaFerramenta: boolean | null,
): boolean | null {
  return seguranca.aprovacao_obrigatoria && efeito === "altera" ? true : chaveDaFerramenta;
}

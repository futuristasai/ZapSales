/**
 * «Fora do recomendado» numa FERRAMENTA de API (issue #372): quais opções de uma API cadastrada
 * saíram da posição recomendada. A tela usa para o selo na lista e para a confirmação antes de
 * salvar; a regra é pura para o teste poder cobrá-la sem tela.
 *
 * As opções da ORGANIZAÇÃO têm a regra delas em `seguranca.ts` (`foraDoRecomendado`).
 *
 * Client-safe.
 */
import type { EfeitoDaFerramenta } from "../tipos";
import type { ConfigDaApi, MetodoDaApi } from "./tipos";

/** Os ids (de `opcoes.ts`) das opções de ferramenta que têm posição recomendada e alerta. */
export type OpcaoDaFerramentaComAlerta = "efeito_e_aprovacao" | "limite_de_uso" | "pausa_automatica";

export interface FerramentaParaORecomendado {
  metodo: MetodoDaApi;
  efeito: EfeitoDaFerramenta;
  /** A aprovação que VALE (com a trava da organização aplicada): a ação que altera espera um humano? */
  pedeAprovacao: boolean;
  config: Pick<ConfigDaApi, "limite_por_conversa" | "limite_por_dia" | "pausa_apos_falhas">;
}

export function foraDoRecomendadoNaFerramenta(f: FerramentaParaORecomendado): OpcaoDaFerramentaComAlerta[] {
  const fora: OpcaoDaFerramentaComAlerta[] = [];
  // Um método que não é `GET` marcado como «só consulta», ou uma ação que altera sem aprovação.
  if ((f.metodo !== "GET" && f.efeito === "consulta") || (f.efeito === "altera" && !f.pedeAprovacao)) {
    fora.push("efeito_e_aprovacao");
  }
  if (f.config.limite_por_conversa === null || f.config.limite_por_dia === null) fora.push("limite_de_uso");
  if (f.config.pausa_apos_falhas === null) fora.push("pausa_automatica");
  return fora;
}

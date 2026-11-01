import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { Bank, ChartPieSlice, Globe, Handshake, House, Robot } from "@/lib/ui/icons";

import type { AreaDoMenu } from "./catalogo";
import type { GrupoProjetado, MenuProjetado } from "./menu";

/**
 * A FAIXA DO COMPUTADOR, como projeção do menu (issue #188, pai #183).
 *
 * `menuDoPapel` já decide quem vê o quê; aqui só se reagrupa o resultado no
 * desenho da faixa: Todo dia, as quatro áreas sob o rótulo «Configurar» e
 * Resultados. Cada entrada leva os grupos de telas que o painel lista ao lado
 * dela, e a entrada sem tela visível não existe — a faixa de um leitor não tem
 * Agente nem Conexões, e nenhum botão leva a um painel vazio.
 *
 * Os ícones são das ENTRADAS, e nenhum é o de uma tela: na faixa o ícone é o
 * único sinal que distingue um botão do outro, e repetir o de uma tela ensinaria
 * a confundir a área com a tela (`tests/unit/faixa-do-menu.test.ts` prende isso).
 */

export type EntradaDaFaixaId = "todo-dia" | AreaDoMenu | "resultados";

export interface EntradaDaFaixa {
  id: EntradaDaFaixaId;
  /** Texto do catálogo, em português; quem desenha traduz. */
  label: string;
  icone: PhosphorIcon;
  grupos: GrupoProjetado[];
}

export interface FaixaProjetada {
  todoDia: EntradaDaFaixa | null;
  /** Vender, Agente, Conexões e Empresa — as que têm tela visível, nessa ordem. */
  configurar: EntradaDaFaixa[];
  resultados: EntradaDaFaixa | null;
  /** O menu da conta («Você»): Perfil, Segurança e Notificações. */
  conta: GrupoProjetado | null;
}

const ICONE_DA_ENTRADA: Record<EntradaDaFaixaId, PhosphorIcon> = {
  "todo-dia": House,
  vender: Handshake,
  agente: Robot,
  conexoes: Globe,
  empresa: Bank,
  resultados: ChartPieSlice,
};

export function faixaDoMenu(menu: MenuProjetado): FaixaProjetada {
  const entrada = (
    id: EntradaDaFaixaId,
    label: string,
    grupos: GrupoProjetado[],
  ): EntradaDaFaixa | null =>
    grupos.length > 0 ? { id, label, icone: ICONE_DA_ENTRADA[id], grupos } : null;

  let todoDia: EntradaDaFaixa | null = null;
  let resultados: EntradaDaFaixa | null = null;
  let configurar: EntradaDaFaixa[] = [];
  let conta: GrupoProjetado | null = null;

  for (const bloco of menu.blocos) {
    if (bloco.id === "configurar") {
      configurar = bloco.areas
        .map((a) => entrada(a.id, a.label, a.grupos))
        .filter((e): e is EntradaDaFaixa => e !== null);
    } else if (bloco.id === "todo-dia") {
      todoDia = entrada("todo-dia", bloco.label, bloco.grupos);
    } else if (bloco.id === "resultados") {
      resultados = entrada("resultados", bloco.label, bloco.grupos);
    } else {
      conta = bloco.grupos[0] ?? null;
    }
  }
  return { todoDia, configurar, resultados, conta };
}

/**
 * A entrada que guarda a tela em que a pessoa está, ou `null` (uma tela do menu
 * da conta, ou uma página que não é destino do menu).
 *
 * A tela mais específica vence: `/app/settings/tenant/pipelines` é das Etapas do
 * funil (Vender), e não dos Dados da empresa (Empresa), que é o prefixo dela.
 * Prefixo só vale em fronteira de segmento — `/app/inboxes` não é filho de
 * `/app/inbox`.
 */
export function entradaDaTela(faixa: FaixaProjetada, pathname: string): EntradaDaFaixaId | null {
  let melhor: { id: EntradaDaFaixaId | null; tamanho: number } = { id: null, tamanho: 0 };
  const candidatas = [faixa.todoDia, ...faixa.configurar, faixa.resultados];
  for (const e of candidatas) {
    if (!e) continue;
    for (const g of e.grupos) {
      for (const item of g.itens) {
        const dentro = pathname === item.href || pathname.startsWith(item.href + "/");
        if (dentro && item.href.length > melhor.tamanho) {
          melhor = { id: e.id, tamanho: item.href.length };
        }
      }
    }
  }
  // Uma tela do menu da conta é mais específica que qualquer área que a contenha como prefixo.
  for (const item of faixa.conta?.itens ?? []) {
    const dentro = pathname === item.href || pathname.startsWith(item.href + "/");
    if (dentro && item.href.length > melhor.tamanho) melhor = { id: null, tamanho: item.href.length };
  }
  return melhor.id;
}

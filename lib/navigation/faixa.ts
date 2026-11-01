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

function estaDentro(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * O endereço da tela do menu em que a pessoa está, ou `null` (uma página que não é destino do
 * menu). A tela mais específica vence: em `/app/settings/tenant/pipelines` a atual são as Etapas
 * do funil, e não os Dados da empresa (`/app/settings/tenant`), que são o prefixo dela. Prefixo
 * só vale em fronteira de segmento — `/app/inboxes` não é filho de `/app/inbox`.
 *
 * É daqui que saem a marca «tela atual» da lista e a entrada da faixa: uma só medida, para os dois
 * nunca discordarem.
 */
export function telaAtual(faixa: FaixaProjetada, pathname: string): string | null {
  let melhor: string | null = null;
  const grupos = [
    ...[faixa.todoDia, ...faixa.configurar, faixa.resultados].flatMap((e) => e?.grupos ?? []),
    ...(faixa.conta ? [faixa.conta] : []),
  ];
  for (const g of grupos) {
    for (const item of g.itens) {
      if (estaDentro(pathname, item.href) && item.href.length > (melhor?.length ?? 0)) {
        melhor = item.href;
      }
    }
  }
  return melhor;
}

/**
 * A entrada que guarda a tela em que a pessoa está, ou `null` (uma tela do menu da conta, ou uma
 * página que não é destino do menu).
 */
export function entradaDaTela(faixa: FaixaProjetada, pathname: string): EntradaDaFaixaId | null {
  const href = telaAtual(faixa, pathname);
  if (!href) return null;
  const entrada = [faixa.todoDia, ...faixa.configurar, faixa.resultados].find((e) =>
    e?.grupos.some((g) => g.itens.some((i) => i.href === href)),
  );
  return entrada?.id ?? null;
}

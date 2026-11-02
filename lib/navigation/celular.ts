import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { Wrench } from "@/lib/ui/icons";

import type { EntradaDaFaixa, FaixaProjetada } from "./faixa";
import type { NavDestination } from "./registry";

/**
 * A BARRA DE BAIXO DO CELULAR, como projeção do menu (issue #190, pai #183).
 *
 * No celular o menu é uma barra de baixo com Conversas (com o contador da fila),
 * Todo dia, Configurar e Resultados. Conversas leva direto à tela; as outras três
 * abrem uma folha com a lista. Quem vê o quê não é decidido aqui: `faixaDoMenu`
 * (e, por baixo, `menuDoPapel`) já entrega as entradas visíveis a este papel, e a
 * barra só as reagrupa. Aba sem tela visível não existe — nenhum botão leva a uma
 * folha vazia.
 *
 * Mora ao lado de `faixa.ts` porque as duas são o mesmo menu em dois desenhos: o
 * computador mostra as entradas lado a lado; o celular as junta em quatro abas.
 */

export type AbaDaBarraId = "conversas" | "todo-dia" | "configurar" | "resultados";

interface AbaBase {
  id: AbaDaBarraId;
  /** Texto do catálogo, em português; quem desenha traduz. */
  label: string;
  icone: PhosphorIcon;
}

/** Conversas: vai direto à tela, com o contador da fila. */
export interface AbaDeLink extends AbaBase {
  tipo: "link";
  href: string;
  contador: NavDestination["contador"];
}

/**
 * Todo dia, Configurar e Resultados: abrem uma folha. `entradas` é o que a folha
 * lista — uma só para Todo dia e Resultados, e as áreas de Configurar (Vender,
 * Agente, Conexões, Empresa) para Configurar, cada uma com seus grupos por tarefa.
 */
export interface AbaDeFolha extends AbaBase {
  tipo: "folha";
  entradas: EntradaDaFaixa[];
}

export type AbaDaBarra = AbaDeLink | AbaDeFolha;

/** O ícone de Configurar: a faixa do computador não tem uma entrada com este nome. */
const ICONE_DE_CONFIGURAR: PhosphorIcon = Wrench;

export function barraDeBaixoDoMenu(faixa: FaixaProjetada): AbaDaBarra[] {
  const abas: AbaDaBarra[] = [];

  // Conversas é a tela de Todo dia que carrega o contador da fila: o catálogo é quem a
  // declara, e a barra não conhece o endereço dela.
  const conversas = faixa.todoDia?.grupos
    .flatMap((g) => g.itens)
    .find((i) => i.contador === "fila");
  if (conversas) {
    abas.push({
      id: "conversas",
      tipo: "link",
      label: conversas.label,
      icone: conversas.icon,
      href: conversas.href,
      contador: conversas.contador,
    });
  }

  if (faixa.todoDia) {
    abas.push({
      id: "todo-dia",
      tipo: "folha",
      label: faixa.todoDia.label,
      icone: faixa.todoDia.icone,
      entradas: [faixa.todoDia],
    });
  }
  if (faixa.configurar.length > 0) {
    abas.push({
      id: "configurar",
      tipo: "folha",
      label: "Configurar",
      icone: ICONE_DE_CONFIGURAR,
      entradas: faixa.configurar,
    });
  }
  if (faixa.resultados) {
    abas.push({
      id: "resultados",
      tipo: "folha",
      label: faixa.resultados.label,
      icone: faixa.resultados.icone,
      entradas: [faixa.resultados],
    });
  }
  return abas;
}

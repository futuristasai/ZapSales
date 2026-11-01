import type { Role } from "@/lib/auth/types";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";

import {
  MENU_AREAS,
  MENU_BLOCOS,
  MENU_GRUPOS,
  type AreaDoMenu,
  type BlocoDoMenu,
  type GrupoDoMenuId,
} from "./catalogo";
import { destinosDaInterface, essencial, type InterfaceSettings } from "./interface";
import { NAV_DESTINATIONS, type NavDestination } from "./registry";

/**
 * O MENU NOVO, PROJETADO PARA QUEM ESTÁ OLHANDO (issue #185).
 *
 * Função pura sobre o catálogo: devolve os blocos, as áreas e os grupos com as
 * telas que ESTA pessoa vê, na ordem declarada em cada tela. Ninguém decide nada
 * aqui — quem vê o quê continua sendo `destinosDaInterface` (papel, módulos e
 * capacidades opcionais, interface por empresa e por vínculo, portas essenciais,
 * administrador de plataforma), exatamente a regra do menu de hoje. A mudança é de
 * apresentação, nunca de autorização.
 *
 * Bloco, área ou grupo sem tela visível não aparece.
 */

export interface GrupoProjetado {
  id: GrupoDoMenuId;
  label: string;
  /** Ordenadas pela `menu.ordem` que cada tela declara. */
  itens: NavDestination[];
}

export interface AreaProjetada {
  id: AreaDoMenu;
  label: string;
  grupos: GrupoProjetado[];
}

/** Configurar se divide em áreas; os outros blocos têm os grupos direto. */
export type BlocoProjetado =
  | { id: "configurar"; label: string; areas: AreaProjetada[] }
  | { id: Exclude<BlocoDoMenu, "configurar">; label: string; grupos: GrupoProjetado[] };

export interface MenuProjetado {
  blocos: BlocoProjetado[];
}

export function menuDoPapel(
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): MenuProjetado {
  const visiveis = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );

  const gruposComTelas = MENU_GRUPOS.map((g) => ({
    ...g,
    itens: NAV_DESTINATIONS.filter((d) => d.menu.grupo === g.id && visiveis.has(d.href)).sort(
      (a, b) => a.menu.ordem - b.menu.ordem,
    ),
  })).filter((g) => g.itens.length > 0);

  const projeta = (grupos: typeof gruposComTelas): GrupoProjetado[] =>
    grupos.map(({ id, label, itens }) => ({ id, label, itens }));

  const blocos: BlocoProjetado[] = [];
  for (const { id, label } of MENU_BLOCOS) {
    if (id === "configurar") {
      const areas = MENU_AREAS.map((a) => ({
        id: a.id,
        label: a.label,
        grupos: projeta(gruposComTelas.filter((g) => g.bloco === "configurar" && g.area === a.id)),
      })).filter((a) => a.grupos.length > 0);
      if (areas.length > 0) blocos.push({ id, label, areas });
    } else {
      const grupos = projeta(gruposComTelas.filter((g) => g.bloco === id));
      if (grupos.length > 0) blocos.push({ id, label, grupos });
    }
  }
  return { blocos };
}

/** Os grupos de um bloco projetado, com ou sem áreas — o achatamento que todo consumidor repete. */
export function gruposDoBloco(b: BlocoProjetado): GrupoProjetado[] {
  return b.id === "configurar" ? b.areas.flatMap((a) => a.grupos) : b.grupos;
}

/** Todas as telas de um menu projetado, na ordem em que aparecem. */
export function itensDoMenu(blocos: readonly BlocoProjetado[]): NavDestination[] {
  return blocos.flatMap((b) => gruposDoBloco(b).flatMap((g) => g.itens));
}

/**
 * AS OPÇÕES DO EDITOR DE INTERFACE (issue #191): o menu que o papel enxerga,
 * SEM as portas essenciais.
 *
 * O editor em que se escolhe quais telas a empresa (ou a pessoa) mostra lista as
 * telas pelos mesmos blocos, áreas e grupos do menu, com os mesmos nomes. As
 * essenciais saem da lista porque a escolha nunca as esconde — oferecê-las seria
 * uma caixa que não faz nada. `modulos`/`capacidades` ausentes não filtram, como
 * no menu. Bloco, área e grupo que ficam sem tela somem junto.
 */
export function menuEditavelDoPapel(
  role: Role | null,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): BlocoProjetado[] {
  const semEssenciais = (grupos: GrupoProjetado[]): GrupoProjetado[] =>
    grupos
      .map((g) => ({ ...g, itens: g.itens.filter((d) => !essencial(d, role)) }))
      .filter((g) => g.itens.length > 0);

  const blocos: BlocoProjetado[] = [];
  for (const b of menuDoPapel(false, role, undefined, modulos, capacidades).blocos) {
    if (b.id === "configurar") {
      const areas = b.areas
        .map((a) => ({ ...a, grupos: semEssenciais(a.grupos) }))
        .filter((a) => a.grupos.length > 0);
      if (areas.length > 0) blocos.push({ ...b, areas });
    } else {
      const grupos = semEssenciais(b.grupos);
      if (grupos.length > 0) blocos.push({ ...b, grupos });
    }
  }
  return blocos;
}

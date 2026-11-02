"use client";
import { useMemo } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { faixaDoMenu, type FaixaProjetada } from "@/lib/navigation/faixa";
import { menuDoPapel } from "@/lib/navigation/menu";

/**
 * O menu projetado para quem está olhando: papel, módulos e capacidades opcionais, interface
 * por empresa — a regra de sempre, resolvida por `menuDoPapel`, e reagrupada como faixa.
 *
 * É daqui que o celular (a barra de baixo e o menu da conta, issue #190) lê as entradas. O
 * computador (`NavegacaoDoComputador`) faz a mesma conta por conta própria; quando os dois
 * convergirem, é este hook que ele adota.
 */
export function useFaixaDoPapel(): FaixaProjetada {
  const { user, activeOrg } = useAuth();
  return useMemo(
    () =>
      faixaDoMenu(
        menuDoPapel(
          user.is_platform_admin && !user.support,
          activeOrg?.role ?? null,
          activeOrg?.interface_settings,
          activeOrg?.modulos_ligados ?? [],
          activeOrg?.capacidades_ligadas ?? [],
        ),
      ),
    [
      user.is_platform_admin,
      user.support,
      activeOrg?.role,
      activeOrg?.interface_settings,
      activeOrg?.modulos_ligados,
      activeOrg?.capacidades_ligadas,
    ],
  );
}

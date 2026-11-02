import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

/**
 * Página de área de Configurações (`/app/settings`): a conta, a empresa e as
 * conexões, nos grupos por tarefa do menu. Continua abrindo pelo endereço e
 * aparece na busca (issue #192).
 *
 * A porta do banco externo está aqui e só existe com o módulo ligado: o
 * `modulosLigados` que a página passa é o que a esconde com ele desligado.
 */
export default async function SettingsHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;

  return (
    <NavHub
      pagina="/app/settings"
      isPlatformAdmin={user.is_platform_admin && !user.support}
      role={activeOrg?.role ?? null}
      interfaceSettings={activeOrg?.interface_settings}
      // A porta do banco externo mora neste hub, e só existe com o módulo ligado.
      modulosLigados={await modulosLigados(createAdminClient())}
      locale={idioma}
    />
  );
}

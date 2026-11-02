import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agente de IA" };

/**
 * Página de área do Agente de IA (`/app/ai`): montar, ensinar e conectar a IA, na
 * ordem em que o menu os mostra. Continua abrindo pelo endereço e aparece na busca
 * (issue #192).
 *
 * Passa `locale` (o padrão do `NavHub` é pt-BR): sem isso a página inteira ficava
 * em português mesmo com idioma=es — títulos, seções e descrições.
 */
export default async function AiHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;

  return (
    <NavHub
      pagina="/app/ai"
      isPlatformAdmin={user.is_platform_admin && !user.support}
      role={activeOrg?.role ?? null}
      interfaceSettings={activeOrg?.interface_settings}
      modulosLigados={await modulosLigados(createAdminClient())}
      locale={idioma}
    />
  );
}

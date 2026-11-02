import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { loadCrmExtensions } from "@/lib/extensions/service";
import { logger } from "@/lib/logger";
import type { ExtensionGuideView } from "@/lib/extensions/view";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gestão de Clientes CRM" };

/**
 * Página de área do CRM (`/app/crm`): o inventário do que se abre todo dia no CRM e
 * de tudo o que se prepara em Vender — os grupos que `PAGINAS_DE_AREA` declara.
 *
 * Não é mais o caminho principal do menu (issue #192); continua abrindo pelo
 * endereço e aparece na busca. Também é onde as orientações das extensões
 * instaladas se mostram.
 *
 * Passa `locale` (o padrão do `NavHub` é pt-BR): quem escolheu espanhol lê o
 * título, o subtítulo e as seções em espanhol, e não uma tela meio traduzida.
 */
export default async function CrmHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;
  let extensionGuides: ExtensionGuideView[] = [];
  let extensionsUnavailable = false;

  if (activeOrg) {
    try {
      extensionGuides = await loadCrmExtensions(activeOrg.orgId);
    } catch (error) {
      // O hub continua útil sem extensões, mas a falha precisa ser distinguível
      // de uma lista legitimamente vazia. A gestão oferece a reconciliação — e o
      // log diz que o hub degradou, para a falha não existir só na tela.
      const code = (error as { code?: unknown } | null)?.code;
      logger.warn("[crm] hub aberto sem as orientações das extensões", {
        organization_id: activeOrg.orgId,
        error_code: typeof code === "string" ? code : null,
      });
      extensionsUnavailable = true;
    }
  }

  const capacidadesLigadas = activeOrg
    ? await capacidadesDaOrganizacao(createAdminClient(), activeOrg.orgId)
    : [];

  return (
    <NavHub
      pagina="/app/crm"
      capacidadesLigadas={capacidadesLigadas}
      isPlatformAdmin={user.is_platform_admin && !user.support}
      role={activeOrg?.role ?? null}
      interfaceSettings={activeOrg?.interface_settings}
      modulosLigados={await modulosLigados(createAdminClient())}
      locale={idioma}
      extensionGuides={extensionGuides}
      extensionsUnavailable={extensionsUnavailable}
    />
  );
}

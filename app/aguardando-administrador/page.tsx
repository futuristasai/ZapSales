import { redirect } from "next/navigation";

import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { signOut } from "@/app/actions/auth/signOut";
import { OutrasOrganizacoes } from "@/app/onboarding/_components/OutrasOrganizacoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { traduzir } from "@/lib/i18n/dicionario";
import { ehOperante } from "@/lib/organizacao/operante";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configuração em andamento",
};

/**
 * A ESPERA de quem entrou numa organização que o administrador ainda não
 * terminou de configurar (#273).
 *
 * Fica fora de `app/app/` e de `app/onboarding/` de propósito: o layout de
 * `/app` manda a organização não configurada para `/onboarding`, e o layout do
 * onboarding manda quem não é admin para cá. Uma tela dentro de qualquer um
 * dos dois fecharia o círculo.
 *
 * Cada saída desta página leva a um lugar que NÃO devolve para cá:
 *   - sem organização            → /get-started
 *   - organização já configurada → /app/inbox
 *   - a pessoa é admin           → /onboarding (é ela quem configura)
 */
export default async function AguardandoAdministradorPage() {
  const user = await requireAuth();
  const ativa = await resolveActiveOrg(user);
  if (!ativa) redirect("/get-started");

  const { onboardedAt } = await loadOnboardingState(ativa.orgId);
  if (onboardedAt) redirect("/app/inbox");
  if (roleAtLeast(ativa.role, "admin")) redirect("/onboarding");

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const outras = user.organizations
    .filter((o) => o.organization_id !== ativa.orgId && ehOperante(o.org_status))
    .map((o) => ({ id: o.organization_id, nome: o.organization_name }));

  return (
    <IdiomaProvider locale={idioma}>
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md space-y-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">{t("Configuração em andamento")}</h1>
          {/* Quem participa de várias empresas precisa saber QUAL. Dado, não interface: sem t(). */}
          <p className="text-base font-medium">{ativa.name}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              "Quem administra esta empresa ainda não terminou a configuração inicial. Assim que terminar, você entra normalmente.",
            )}
          </p>
          <p className="text-sm text-muted-foreground">{t("Você não precisa fazer nada agora.")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button asChild>
              <a href="/app">{t("Conferir de novo")}</a>
            </Button>
            <OutrasOrganizacoes outras={outras} />
            {/* Encerra a sessão: um link para /login deixaria a pessoa logada, e o
                próximo /app a traria de volta aqui. */}
            <form action={signOut}>
              <Button type="submit" variant="outline">
                {t("Sair")}
              </Button>
            </form>
          </div>
        </Card>
      </main>
    </IdiomaProvider>
  );
}

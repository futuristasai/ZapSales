import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { traduzir } from "@/lib/i18n/dicionario";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { detalhesDaLicenca } from "@/lib/licenca/situacao";

import { PainelDaLicenca } from "./_components/PainelDaLicenca";

export const dynamic = "force-dynamic";

export const metadata = { title: "Licença" };

/**
 * A TELA DE LICENÇA (`/app/licenca`) — a situação da licença desta instalação, e o botão "tentar renovar agora".
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2: "a tela de licença (que mostra a
 * mensagem e oferece 'tentar renovar agora')" é uma das portas que NUNCA se trancam
 * (`caminhoLiberadoDaLicenca`). Quem manda a instalação barrada para cá é o `proxy`: toda navegação recusada
 * termina aqui, dentro da casca de sempre (menu, topo, idioma), em vez de numa página solta.
 *
 * Quem vê o quê: qualquer pessoa logada vê a SITUAÇÃO (o que está acontecendo e a quem recorrer). Os detalhes
 * (datas, motivo, identificador da instalação) e o botão são de administrador — o botão fala com o servidor de
 * licenças, e o identificador é o que o suporte pede.
 *
 * Nenhum texto daqui nomeia o produto: quem lê pode ser cliente de um revendedor.
 */
export default async function LicencaPage() {
  const user = await requireAuth();
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const ativa = await resolveActiveOrg(user);
  const administra = (user.is_platform_admin && !user.support) || roleAtLeast(ativa?.role, "admin");
  const detalhes = await detalhesDaLicenca();

  const fuso = user.timezone ?? ativa?.timezone ?? "UTC";
  const data = (iso: string | null): string => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(tagDeIdioma(idioma), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: fuso,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const suporte = await emailDeSuporte();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("Licença")}</h1>

      {detalhes === null ? (
        <Card className="space-y-2 p-6">
          <p className="text-sm text-muted-foreground">
            {t(
              "Não foi possível ler a situação da licença agora. Isso não bloqueia nada: tente de novo daqui a pouco.",
            )}
          </p>
        </Card>
      ) : (
        <PainelDaLicenca
          detalhes={detalhes}
          administra={administra}
          t={t}
          data={data}
          suporte={suporte}
        />
      )}
    </div>
  );
}

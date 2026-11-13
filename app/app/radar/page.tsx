import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { RiskRadarList } from "./_components/RiskRadarList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Riscos de Perda" };

export default async function RadarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`), sem reler o `locale` cru.
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={t("Riscos de Perda")}
        ajuda={<ComoFunciona chave="radar" pagina={t("Riscos de Perda")} />}
        descricao={t(
            "Negócios e demandas que esfriaram e precisam de você. Escolha uma situação para ver só ela. Se já existe um retorno agendado, aparece como “em voo”; sem retorno, é risco de perder o cliente.",
          )}
      />
      <RiskRadarList podeResgatar={ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager} />
    </CorpoDaPagina>
  );
}

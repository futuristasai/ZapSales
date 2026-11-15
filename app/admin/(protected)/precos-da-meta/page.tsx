import { notFound } from "next/navigation";

import { loadAuthUser } from "@/lib/auth/server";
import { carregarCotacao, COTACAO_DE_REFERENCIA } from "@/lib/custo/cotacao";
import { carregarTabela } from "@/lib/custo/tabela-de-precos";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDePrecosDaMeta } from "./_form";
import { CabecalhoDaPlataforma } from "@/components/admin/CabecalhoDaPlataforma";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/precos-da-meta");
export const dynamic = "force-dynamic";

/**
 * A tabela de preços da Meta da INSTALAÇÃO (issue #10) e a cotação do dólar.
 *
 * ── Por que `/admin`, e não Campanhas › Configuração ────────────────────────
 *
 * O preço da Meta é o mesmo para todas as empresas desta instalação, e é ele que
 * move a estimativa e o teto de gasto de cada uma. Deixar o administrador de uma
 * empresa editá-lo faria o teto das outras valer outra coisa. Irmã de
 * `/admin/destinos-internos`: mesmo gate, mesma forma.
 *
 * O gate `notFound()` é redundante com o layout de `(protected)` HOJE, e fica
 * pela mesma razão de lá: a garantia precisa ser local.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();

  const admin = createAdminClient();
  const [tabela, cotacao] = await Promise.all([carregarTabela(admin), carregarCotacao(admin)]);

  return (
    <div className="space-y-6">
      <CabecalhoDaPlataforma href="/admin/precos-da-meta" />
      <FormularioDePrecosDaMeta
        linhasIniciais={tabela}
        cotacaoInicial={cotacao.referencia ? null : cotacao.valor}
        cotacaoDeReferencia={COTACAO_DE_REFERENCIA}
      />
    </div>
  );
}

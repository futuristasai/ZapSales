import { notFound } from "next/navigation";

import { CabecalhoDaPlataforma } from "@/components/admin/CabecalhoDaPlataforma";
import { UpdatePanel } from "@/components/admin/atualizacao/UpdatePanel";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { loadAuthUser } from "@/lib/auth/server";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/atualizacao");
export const dynamic = "force-dynamic";

/**
 * ATUALIZAÇÃO DA INSTALAÇÃO (issue #311): a versão instalada, a nova quando
 * houver, o botão "Atualizar agora", o andamento e o histórico. Morava em
 * `/app/settings/atualizacao`, no app da empresa; veio para a administração da
 * instalação, que é onde mora o que vale para o servidor inteiro.
 *
 * O gate local repete o do layout de `(protected)` de propósito, como no
 * Painel: a garantia precisa morar aqui — um layout pode ser movido.
 */
export default async function Page() {
  const user = await loadAuthUser();
  if (!user?.is_platform_admin) notFound();
  return (
    <div className="space-y-6">
      <CabecalhoDaPlataforma href="/admin/atualizacao" />
      <UpdatePanel />
    </div>
  );
}

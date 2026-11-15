import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { LgpdRequestAdminDetail } from "./_client";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/lgpd", "pedidoLgpd");

export default async function AdminLgpdRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LgpdRequestAdminDetail id={id} />;
}

import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { IncidentDetailClient } from "./_client";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/incidents", "incidente");

export default async function AdminIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IncidentDetailClient id={id} />;
}

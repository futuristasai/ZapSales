import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { AuditDetailClient } from "./_client";

interface AuditDetailPageProps {
  params: Promise<{ entryId: string }>;
}

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/audit", "acao");

export default async function AuditDetailPage({ params }: AuditDetailPageProps) {
  const { entryId } = await params;
  return <AuditDetailClient entryId={entryId} />;
}

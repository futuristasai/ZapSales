import { AuditClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/audit");

export default function AdminAuditPage() {
  return <AuditClient />;
}

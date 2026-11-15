import { LgpdAdminClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/lgpd");

export default function AdminLgpdPage() {
  return <LgpdAdminClient />;
}

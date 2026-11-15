import { TenantsClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/tenants");

export default function AdminTenantsPage() {
  return <TenantsClient />;
}

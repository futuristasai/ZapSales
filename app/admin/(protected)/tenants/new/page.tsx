import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { NewTenantForm } from "./_form";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/tenants", "novaEmpresa");

export default function NewTenantPage() {
  return <NewTenantForm />;
}

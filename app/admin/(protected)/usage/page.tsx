import { UsageClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/usage");

export default function AdminUsagePage() {
  return <UsageClient />;
}

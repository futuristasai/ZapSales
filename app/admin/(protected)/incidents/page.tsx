import { IncidentsClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/incidents");

export default function AdminIncidentsPage() {
  return <IncidentsClient />;
}

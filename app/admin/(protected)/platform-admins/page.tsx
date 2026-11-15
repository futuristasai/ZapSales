import { PlatformAdminsClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/platform-admins");

export default function AdminPlatformAdminsPage() {
  return <PlatformAdminsClient />;
}

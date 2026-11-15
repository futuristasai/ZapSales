import { UsersClient } from "./_client";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/users");

export default function AdminUsersPage() {
  return <UsersClient />;
}

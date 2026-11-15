import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { UserDetailClient } from "./_client";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/users", "usuario");

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailClient id={id} />;
}

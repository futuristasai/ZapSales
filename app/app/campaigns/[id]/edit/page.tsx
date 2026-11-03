import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { EditarCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar campanha" };

export default async function EditarCampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // Criar modelo é do administrador (a rota exige `admin`); o gerente vê a nota, não o botão.
  return <EditarCampanha id={id} podeCriarModelo={org?.role === "admin"} />;
}

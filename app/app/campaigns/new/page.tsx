import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { NovaCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova campanha" };

export default async function NovaCampanhaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // Quem opera a campanha é o gerente; criar modelo é do administrador (a rota exige `admin`).
  // O atalho "Criar novo modelo" só aparece para quem a rota deixaria entrar.
  return <NovaCampanha podeCriarModelo={org?.role === "admin"} />;
}

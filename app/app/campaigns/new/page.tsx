import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { NovaCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova campanha" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<{ lista?: string | string[] }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // `?lista=<id>`: quem chega de outra tela com uma lista salva pronta (o resgate
  // de Riscos de Perda) encontra as pessoas já no público. Só o FORMATO é
  // conferido aqui; se a lista é desta organização quem decide é a rota que a lê.
  const { lista } = await searchParams;
  const listaInicial = typeof lista === "string" && UUID.test(lista) ? lista : undefined;
  // Quem opera a campanha é o gerente; criar modelo é do administrador (a rota exige `admin`).
  // O atalho "Criar novo modelo" só aparece para quem a rota deixaria entrar.
  return <NovaCampanha podeCriarModelo={org?.role === "admin"} listaInicial={listaInicial} />;
}

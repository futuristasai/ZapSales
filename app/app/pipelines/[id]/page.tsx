import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { PipelinePageClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  // Mesma razão da Agenda: a RLS é piso, não escopo. Sem este filtro o funil de
  // OUTRA organização do mesmo usuário abre, e o quadro monta com as etapas de
  // um lugar e o cabeçalho de outro.
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) notFound();

  // Os funis que o seletor do cabeçalho oferece: os vivos desta organização, na ordem da lista
  // de Funis. O filtro de organização não é redundante com a RLS, pelo mesmo motivo de cima —
  // sem ele, quem participa de duas empresas veria no seletor os funis das duas.
  const { data: funis } = await supabase
    .from("crm_pipelines")
    .select("id, name")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  return (
    <PipelinePageClient
      // `key`: trocar de funil pelo seletor mantém a mesma rota e o mesmo componente; sem
      // remontar, a seleção em lote e o diálogo aberto de um funil ficariam de pé no outro.
      key={id}
      pipelineId={id}
      initialName={pipeline.name}
      role={activeOrg.role}
      funis={funis ?? []}
    />
  );
}

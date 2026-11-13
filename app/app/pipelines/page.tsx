import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * O atalho «Kanban» do menu (Todo dia › Gestão de Clientes CRM): abre DIRETO o quadro.
 *
 * Até aqui o único caminho ao quadro era «Funis» → escolher o funil → quadro. Para a empresa
 * com um funil só — a maioria — era um clique a mais, todo dia, e o nome «Funis» não dizia a
 * quem procurava o Kanban que ele estava ali (pedido do dono do produto, 12/11/2026).
 *
 * Esta página não desenha nada: leva ao quadro do funil PRINCIPAL — o marcado como padrão ou,
 * sem marca, o primeiro da ordem —, a mesma regra de `GET /api/v1/pipelines/default`. Empresa
 * sem funil vivo vai para a lista, que é onde se cria o primeiro.
 *
 * O filtro de `organization_id` não é redundante com a RLS: a policy libera TODAS as
 * organizações do usuário, e sem ele o atalho abriria o funil de outra empresa da mesma pessoa
 * (ver `app/app/kanban/page.tsx`).
 */
export default async function KanbanDiretoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data: funil } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  redirect(funil ? `/app/pipelines/${funil.id}` : "/app/kanban");
}

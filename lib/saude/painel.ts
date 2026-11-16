/**
 * A saúde da instalação AGORA, para o Painel da administração (issue #310): as mesmas
 * sondas do `/api/v1/health`, mais a fila de tarefas, traduzidas por `saudeDaInstalacao`.
 *
 * Usa o CLIENTE DE SERVIÇO para ler a fila de TODAS as organizações (só instantes): quem
 * chama precisa ter barrado quem não é administrador da plataforma — o Painel faz
 * `is_platform_admin` → `notFound()` antes de chegar aqui.
 *
 * Só servidor. As sondas têm teto de 3 s cada e rodam juntas, então o pior caso é ~3 s —
 * por isso o Painel desenha este bloco dentro de um `Suspense`, e o resto da tela não espera.
 */
import "server-only";

import { sondarTransporteQr } from "@/lib/channels/sonda-do-transporte-qr";
import { createAdminClient } from "@/lib/supabase/admin";

import { saudeDaInstalacao, type SaudeDaInstalacao } from "./da-instalacao";
import { lerAtrasoDaFila } from "./fila";
import { checkRedis, checkSupabase } from "./sondas";

export async function saudeDaInstalacaoAgora(): Promise<SaudeDaInstalacao> {
  const [banco, redis, transporteQr, fila] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    sondarTransporteQr(),
    // `createAdminClient` lê o ambiente e pode lançar: falha aqui é "não consegui ler a
    // fila", nunca uma exceção que derrube o Painel.
    Promise.resolve()
      .then(() => lerAtrasoDaFila(createAdminClient()))
      .catch(() => null),
  ]);
  return saudeDaInstalacao({ banco, redis, transporteQr, fila });
}

/**
 * POST /api/v1/licenca/renovar — o "tentar renovar agora" da tela de licença.
 *
 * Pede ao servidor de licenças um selo novo AGORA, sem esperar o lembrete da próxima consulta (o cron faz isso
 * sozinho, de hora em hora). É o botão de quem acabou de regularizar a compra e não quer esperar.
 *
 * Quem pode: administrador da organização. A licença é da INSTALAÇÃO, não da organização, mas a decisão de
 * mexer nela é de quem administra; um agente ou gerente vê a situação, não dispara conversa com o servidor.
 *
 * O caminho está entre os que a porta da licença NUNCA tranca (`caminhoLiberadoDaLicenca`): uma instalação
 * vencida ou bloqueada precisa conseguir pedir a renovação que a destrava.
 *
 * A resposta diz o desfecho em código e mais nada — nem selo, nem credencial, nem texto do servidor:
 *  - `renovada`, `bloqueada` — o servidor respondeu e o estado mudou;
 *  - `nada_a_fazer` — com `motivo`: `nao_ativada` (nunca ativou) ou `permanente` (não precisa);
 *  - `adiada` — com `ate_segundos`: o botão não vira martelo (uma conversa a cada 15 s, no máximo);
 *  - `falhou` — com `motivo`: o servidor não respondeu a contento; o estado não mudou.
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { auditarRenovacao } from "@/lib/licenca/auditoria";
import { renovarLicenca } from "@/lib/licenca/renovar";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "license" });
  if (!auth.ok) return auth.response;

  const rodada = await renovarLicenca({ forcar: true });
  auditarRenovacao(rodada, requestId, auth.user.id);

  return ok(
    {
      resultado: rodada.resultado,
      ...("motivo" in rodada ? { motivo: rodada.motivo } : {}),
      ...(rodada.resultado === "adiada" ? { ate_segundos: rodada.ateSegundos } : {}),
    },
    { requestId },
  );
}

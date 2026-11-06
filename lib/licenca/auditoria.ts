/**
 * A TRILHA da renovação — uma linha por mudança de estado, nenhuma por rodada que não fez nada.
 *
 * Usada pelas duas portas por onde a renovação roda: o cron (`licenca-renovar`) e o botão "tentar renovar agora"
 * da tela de licença. Ficar num lugar só é o que impede as duas de divergirem sobre o que merece rastro: o
 * cron roda a cada 5 minutos e uma linha por batida seria ruído (a doutrina de `api_audit_log`), enquanto a
 * rodada que trocou o selo ou registrou um bloqueio TEM de deixar rastro.
 *
 * O selo e a credencial nunca vão para a trilha: só o tipo (renovada) ou o código do motivo (bloqueada).
 */
import { audit } from "@/lib/audit";

import type { ResultadoDaRenovacao } from "./renovar";

export function auditarRenovacao(
  rodada: ResultadoDaRenovacao,
  requestId: string,
  actorUserId?: string,
): void {
  if (rodada.resultado === "renovada") {
    void audit({
      action: "license.renewed",
      organizationId: null,
      bypassedRls: true,
      ...(actorUserId ? { actorUserId } : {}),
      metadata: { tipo: rodada.tipo },
      requestId,
    });
  } else if (rodada.resultado === "bloqueada") {
    void audit({
      action: "license.blocked_by_server",
      organizationId: null,
      bypassedRls: true,
      ...(actorUserId ? { actorUserId } : {}),
      metadata: { codigo: rodada.codigo },
      requestId,
    });
  }
}

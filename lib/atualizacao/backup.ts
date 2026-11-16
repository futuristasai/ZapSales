/**
 * A SITUAÇÃO DO BACKUP, como o Painel a mostra (issue #311, histórias 56–59 da #308).
 *
 * O backup roda no servidor (`kit/backup.sh`), fora do app, e quem conta como ele
 * está é o programa do servidor (`kit/agente.sh`) na batida de cada minuto: a data
 * do último dump bem-sucedido, a da última cópia semanal e um BOOLEANO dizendo se a
 * cópia externa (Cloudflare R2) tem credenciais. A credencial nunca sai do servidor.
 *
 * ── Quando um backup é "velho" ─────────────────────────────────────────────────
 *
 * Segue o que o kit agenda (`agendar_backups` em `kit/instalar.sh`), com um dia de
 * folga para um atraso de máquina não virar alarme:
 *   - o dump do banco é DIÁRIO (03:15): velho depois de 2 dias;
 *   - a cópia externa é SEMANAL (domingo 04:30): velha depois de 8 dias.
 * Mudou a frequência no kit, muda aqui — o teste deste arquivo cita os dois números.
 *
 * Módulo puro: o cartão do Painel e o teste usam a mesma função.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
export const LIMITE_DO_DUMP_MS = 2 * DIA_MS;
export const LIMITE_DA_COPIA_EXTERNA_MS = 8 * DIA_MS;

export interface BackupContado {
  last_backup_at: string | null;
  last_offsite_backup_at: string | null;
  offsite_configured: boolean | null;
}

export type EstadoDoDump = "ok" | "velho" | "nunca";
export type EstadoDaCopiaExterna = "ok" | "velha" | "nunca" | "nao_configurada";

export interface SituacaoDoBackup {
  /** O programa do servidor já contou alguma coisa sobre o backup? */
  contado: boolean;
  dump: EstadoDoDump;
  externa: EstadoDaCopiaExterna;
  /** Algo pede atenção (o cartão ganha o tom de aviso). */
  atencao: boolean;
}

function idade(iso: string | null, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : agora.getTime() - t;
}

export function situacaoDoBackup(
  backup: BackupContado | null | undefined,
  agora: Date,
): SituacaoDoBackup {
  // `offsite_configured` nulo é o sinal de "nunca contou": o programa novo manda
  // sempre o booleano, mesmo sem backup nenhum ainda.
  if (!backup || backup.offsite_configured === null) {
    return { contado: false, dump: "nunca", externa: "nunca", atencao: false };
  }
  const idadeDoDump = idade(backup.last_backup_at, agora);
  const dump: EstadoDoDump =
    idadeDoDump === null ? "nunca" : idadeDoDump > LIMITE_DO_DUMP_MS ? "velho" : "ok";

  let externa: EstadoDaCopiaExterna;
  if (!backup.offsite_configured) externa = "nao_configurada";
  else {
    const idadeDaCopia = idade(backup.last_offsite_backup_at, agora);
    externa =
      idadeDaCopia === null ? "nunca" : idadeDaCopia > LIMITE_DA_COPIA_EXTERNA_MS ? "velha" : "ok";
  }
  return { contado: true, dump, externa, atencao: dump !== "ok" || externa !== "ok" };
}

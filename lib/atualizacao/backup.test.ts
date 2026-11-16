import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LIMITE_DA_COPIA_EXTERNA_MS, LIMITE_DO_DUMP_MS, situacaoDoBackup } from "./backup";

const agora = new Date("2026-11-16T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const haDias = (d: number) => new Date(agora.getTime() - d * DIA).toISOString();

describe("situação do backup no Painel", () => {
  it("o programa ainda não contou: nada de afirmar 'nunca houve backup'", () => {
    expect(situacaoDoBackup(null, agora)).toMatchObject({ contado: false, atencao: false });
    expect(
      situacaoDoBackup(
        { last_backup_at: null, last_offsite_backup_at: null, offsite_configured: null },
        agora,
      ),
    ).toMatchObject({ contado: false });
  });

  it("dump de ontem e cópia externa da semana: tudo em dia", () => {
    expect(
      situacaoDoBackup(
        { last_backup_at: haDias(1), last_offsite_backup_at: haDias(6), offsite_configured: true },
        agora,
      ),
    ).toEqual({ contado: true, dump: "ok", externa: "ok", atencao: false });
  });

  it("dump parado há 3 dias é velho; cópia externa de 9 dias também", () => {
    const s = situacaoDoBackup(
      { last_backup_at: haDias(3), last_offsite_backup_at: haDias(9), offsite_configured: true },
      agora,
    );
    expect(s).toMatchObject({ dump: "velho", externa: "velha", atencao: true });
  });

  it("R2 sem credenciais pede atenção, mesmo com o dump em dia", () => {
    const s = situacaoDoBackup(
      { last_backup_at: haDias(0.5), last_offsite_backup_at: null, offsite_configured: false },
      agora,
    );
    expect(s).toMatchObject({ dump: "ok", externa: "nao_configurada", atencao: true });
  });

  it("instalação nova: nenhum dump ainda", () => {
    const s = situacaoDoBackup(
      { last_backup_at: null, last_offsite_backup_at: null, offsite_configured: true },
      agora,
    );
    expect(s).toMatchObject({ dump: "nunca", externa: "nunca", atencao: true });
  });

  it("os limites seguem o que o kit agenda: diário e semanal, com um dia de folga", () => {
    expect(LIMITE_DO_DUMP_MS).toBe(2 * DIA);
    expect(LIMITE_DA_COPIA_EXTERNA_MS).toBe(8 * DIA);
    const instalar = readFileSync(join(process.cwd(), "kit/instalar.sh"), "utf8");
    // Se o kit mudar a frequência, este teste reprova e os limites têm de ser revistos.
    expect(instalar).toContain("15 3 * * * root $KIT/backup.sh diario");
    expect(instalar).toContain("30 4 * * 0 root $KIT/backup.sh semanal");
  });
});

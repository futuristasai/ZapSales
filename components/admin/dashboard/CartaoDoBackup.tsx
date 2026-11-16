"use client";
import { Card } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { COMANDO_DE_CONFIGURAR_O_R2 } from "@/lib/atualizacao/comandos";
import { situacaoDoBackup } from "@/lib/atualizacao/backup";
import { Database } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Os textos fixos, como dado — a cerca de idioma do admin os lê daqui. */
export const TEXTOS_DO_BACKUP_NO_PAINEL = {
  titulo: "Backup",
  emDia: "Em dia",
  atencao: "Pede atenção",
  naoContado: "O programa do servidor ainda não contou como está o backup.",
  naoContadoExplica:
    "Ele conta a cada minuto quando está ligado. Se o cartão Versão diz que ele está desligado, ligue-o primeiro.",
  ultimoDump: "Última cópia do banco",
  copiaExterna: "Cópia fora do servidor (R2)",
  nunca: "nenhuma ainda",
  dumpVelho:
    "A cópia do banco é feita todo dia de madrugada, e a última passou de dois dias: o backup diário parou. Confira no servidor com sudo kit/backup.sh status.",
  dumpNunca:
    "Ainda não há cópia do banco. Ela é feita todo dia de madrugada; numa instalação de hoje, aparece amanhã.",
  externaNaoConfigurada:
    "A cópia fora do servidor não está configurada: se a máquina se perder, o backup se perde junto. Na pasta da instalação no servidor, rode:",
  externaVelha:
    "A cópia fora do servidor é semanal, e a última passou de oito dias. Confira no servidor com sudo kit/backup.sh status.",
  externaNunca:
    "A cópia fora do servidor está configurada e ainda não rodou: ela sai no domingo de madrugada.",
  configurada: "configurada",
  tudoEmDia:
    "O banco é copiado todo dia, e uma cópia cifrada vai para fora do servidor toda semana.",
  semSegredo: "Nenhuma senha nem chave aparece aqui: só se está configurado.",
} as const;

/**
 * O CARTÃO BACKUP do Painel (issue #311, histórias 56–59 da #308): a data do
 * último backup, o aviso quando ele passou da janela que o kit agenda, e se a
 * cópia externa (R2) está configurada — com o comando único quando não está.
 * Nenhum segredo: o servidor manda só o booleano.
 */
export function CartaoDoBackup() {
  const t = useT();
  const idioma = useIdioma();
  const T = TEXTOS_DO_BACKUP_NO_PAINEL;
  const { data, isLoading } = useSystemVersion({ refetchInterval: 30_000 });

  if (isLoading) {
    return (
      <Card className="space-y-3 p-4" data-testid="cartao-backup">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-32" />
      </Card>
    );
  }

  const s = situacaoDoBackup(data?.backup, new Date());
  const quando = (iso: string | null | undefined) => {
    if (!iso) return t(T.nunca);
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? t(T.nunca)
      : d.toLocaleString(tagDeIdioma(idioma), { dateStyle: "medium", timeStyle: "short" });
  };

  if (!s.contado) {
    return (
      <Card
        className="flex flex-col gap-2 p-4"
        data-testid="cartao-backup"
        data-backup-estado="nao_contado"
      >
        <Cabecalho titulo={t(T.titulo)} />
        <p className="text-sm">{t(T.naoContado)}</p>
        <p className="text-sm text-muted-foreground">{t(T.naoContadoExplica)}</p>
      </Card>
    );
  }

  return (
    <Card
      className={cn("flex flex-col gap-2 p-4", s.atencao && "border-warning bg-warning-bg")}
      data-testid="cartao-backup"
      data-backup-estado={s.atencao ? "atencao" : "em_dia"}
    >
      <Cabecalho titulo={t(T.titulo)} />
      <div>
        <Selo significado={s.atencao ? "falha" : "concluido"}>
          {t(s.atencao ? T.atencao : T.emDia)}
        </Selo>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t(T.ultimoDump)}</dt>
        <dd data-testid="backup-ultimo-dump">{quando(data?.backup?.last_backup_at)}</dd>
        <dt className="text-muted-foreground">{t(T.copiaExterna)}</dt>
        <dd data-testid="backup-copia-externa">
          {s.externa === "nao_configurada"
            ? "—"
            : `${t(T.configurada)} · ${quando(data?.backup?.last_offsite_backup_at)}`}
        </dd>
      </dl>
      {s.dump === "velho" ? <p className="text-sm">{t(T.dumpVelho)}</p> : null}
      {s.dump === "nunca" ? <p className="text-sm">{t(T.dumpNunca)}</p> : null}
      {s.externa === "velha" ? <p className="text-sm">{t(T.externaVelha)}</p> : null}
      {s.externa === "nunca" ? <p className="text-sm">{t(T.externaNunca)}</p> : null}
      {s.externa === "nao_configurada" ? (
        <>
          <p className="text-sm">{t(T.externaNaoConfigurada)}</p>
          <code
            className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs"
            data-testid="comando-r2"
          >
            {COMANDO_DE_CONFIGURAR_O_R2}
          </code>
        </>
      ) : null}
      {!s.atencao ? <p className="text-sm text-muted-foreground">{t(T.tudoEmDia)}</p> : null}
      <p className="mt-auto pt-1 text-xs text-muted-foreground">{t(T.semSegredo)}</p>
    </Card>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <Database size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{titulo}</h2>
    </div>
  );
}

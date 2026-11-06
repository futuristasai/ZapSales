import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import type { DetalhesDaLicenca } from "@/lib/licenca/situacao";
import { textoDaLicenca, textoDoModo } from "@/lib/licenca/textos";

import { BotaoRenovarAgora } from "./BotaoRenovarAgora";

const SELO_DO_ESTADO: Record<DetalhesDaLicenca["estado"], SignificadoDoSelo> = {
  sem_selo: "neutro",
  ativacao_pendente: "neutro",
  temporario_valido: "funil",
  permanente_valido: "concluido",
  temporario_vencido: "falha",
  bloqueada: "falha",
};

/**
 * O PAINEL da licença: o que a página mostra, sem buscar nada. Recebe a situação, o papel já resolvido (`administra`),
 * o tradutor e o formatador de datas — por isso se desenha igual na página e na vitrine, e se testa sem banco.
 */
export function PainelDaLicenca({
  detalhes,
  administra,
  t,
  data,
  suporte,
}: {
  detalhes: DetalhesDaLicenca;
  administra: boolean;
  t: (texto: string) => string;
  data: (iso: string | null) => string;
  suporte: string;
}) {
  const texto = textoDaLicenca(detalhes.estado, detalhes.diasRestantes, t);
  const preservados = detalhes.estado === "bloqueada" || detalhes.estado === "temporario_vencido";

  return (
    <>
      <Card className="space-y-3 p-6" data-licenca-estado={detalhes.estado}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{texto.titulo}</h2>
          <Selo significado={SELO_DO_ESTADO[detalhes.estado]}>
            {detalhes.opera ? t("Funcionando") : t("Não opera")}
          </Selo>
        </div>
        {detalhes.estado === "temporario_valido" ? (
          <p className="text-sm font-medium">{texto.curta}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{texto.explicacao}</p>
        <p className="text-xs text-muted-foreground">{textoDoModo(detalhes.modo, t)}</p>
        {preservados ? (
          <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">
            {t("Os seus dados estão preservados.")}{" "}
            <Link href="/app/lgpd" className="underline underline-offset-2">
              {t("Exportar os dados")}
            </Link>
          </p>
        ) : null}
        {suporte &&
        (detalhes.estado === "bloqueada" || detalhes.estado === "temporario_vencido") ? (
          <p className="text-sm text-muted-foreground">
            {t("Contato para regularizar:")}{" "}
            <a href={`mailto:${suporte}`} className="underline underline-offset-2">
              {suporte}
            </a>
          </p>
        ) : null}
      </Card>

      {administra ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t("Detalhes")}</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">
              {t("Última conversa com o servidor de licenças")}
            </dt>
            <dd>{data(detalhes.ultimaConsultaOkEm)}</dd>
            <dt className="text-muted-foreground">{t("Próxima consulta")}</dt>
            <dd>
              {detalhes.estado === "permanente_valido"
                ? t("Não precisa")
                : data(detalhes.proximaConsultaEm)}
            </dd>
            <dt className="text-muted-foreground">{t("Fim do período de validação")}</dt>
            <dd>{data(detalhes.janelaTerminaEm)}</dd>
            {detalhes.bloqueioCodigo ? (
              <>
                <dt className="text-muted-foreground">{t("Motivo registrado")}</dt>
                <dd data-testid="licenca-motivo">{detalhes.bloqueioCodigo}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("Identificador desta instalação")}</dt>
            <dd className="font-mono text-xs break-all">{detalhes.instalacaoId}</dd>
          </dl>
          {detalhes.relogioRecuou ? (
            <p className="rounded-md border border-warning/60 bg-warning-bg px-3 py-2 text-sm">
              {t(
                "O relógio desta VPS está atrasado em relação ao último horário registrado. Acerte o relógio: um relógio atrasado impede a renovação.",
              )}
            </p>
          ) : null}
          {detalhes.estado === "permanente_valido" ? null : <BotaoRenovarAgora />}
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Os detalhes e a renovação são do administrador da empresa.")}
        </p>
      )}
    </>
  );
}

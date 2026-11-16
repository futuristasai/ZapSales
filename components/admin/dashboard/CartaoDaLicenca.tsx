"use client";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import { CaretRight, Certificate } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { DetalhesDaLicenca } from "@/lib/licenca/situacao";
import { textoDaLicenca, textoDoModo } from "@/lib/licenca/textos";

/**
 * O que o Painel recebe da licença: um RECORTE de `detalhesDaLicenca` — a mesma leitura da
 * tela de licença (`/app/licenca`), sem o identificador da instalação nem o motivo do
 * bloqueio, que ficam naquela tela.
 */
export type LicencaNoPainel = Pick<
  DetalhesDaLicenca,
  "estado" | "opera" | "diasRestantes" | "modo" | "ativadaEm" | "ultimaConsultaOkEm"
>;

/** Os textos fixos, como dado — a cerca de idioma do admin os lê daqui. */
export const TEXTOS_DA_LICENCA_NO_PAINEL = {
  titulo: "Licença",
  funcionando: "Funcionando",
  naoOpera: "Não opera",
  ativadaEm: "Ativada em",
  ultimaConversa: "Última conversa com o servidor de licenças",
  verDetalhes: "Ver a licença",
  ilegivel:
    "Não foi possível ler a situação da licença agora. Isso não bloqueia nada: tente de novo daqui a pouco.",
} as const;

const SELO_DO_ESTADO: Record<LicencaNoPainel["estado"], SignificadoDoSelo> = {
  sem_selo: "neutro",
  ativacao_pendente: "neutro",
  temporario_valido: "funil",
  permanente_valido: "concluido",
  temporario_vencido: "falha",
  bloqueada: "falha",
};

/**
 * O CARTÃO DA LICENÇA do Painel (issue #310, história 49 da #308): a situação, com as
 * mesmas frases da faixa e da tela de licença (`textoDaLicenca`), para as três nunca
 * discordarem. Licença que não opera ganha o tom de erro e o link para a tela que resolve.
 */
export function CartaoDaLicenca({ licenca }: { licenca: LicencaNoPainel | null }) {
  const t = useT();
  const idioma = useIdioma();
  const T = TEXTOS_DA_LICENCA_NO_PAINEL;
  const data = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(tagDeIdioma(idioma), { dateStyle: "medium" });
    } catch {
      return null;
    }
  };

  if (licenca === null) {
    return (
      <Card className="space-y-2 p-4" data-testid="cartao-licenca" data-licenca-estado="ilegivel">
        <Cabecalho titulo={t(T.titulo)} />
        <p className="text-sm text-muted-foreground">{t(T.ilegivel)}</p>
      </Card>
    );
  }

  const texto = textoDaLicenca(licenca.estado, licenca.diasRestantes, t);
  const erro = texto.tom === "erro";
  const ativadaEm = data(licenca.ativadaEm);
  const ultimaConversa = data(licenca.ultimaConsultaOkEm);

  return (
    <Card
      className={cn("flex flex-col gap-2 p-4", erro && "border-error/40 bg-error-bg")}
      data-testid="cartao-licenca"
      data-licenca-estado={licenca.estado}
    >
      <Cabecalho titulo={t(T.titulo)} />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{texto.titulo}</p>
        <Selo significado={SELO_DO_ESTADO[licenca.estado]}>
          {t(licenca.opera ? T.funcionando : T.naoOpera)}
        </Selo>
      </div>
      <p className={cn("text-sm", erro ? "text-foreground" : "text-muted-foreground")}>
        {licenca.estado === "temporario_valido" ? texto.curta : texto.explicacao}
      </p>
      {ativadaEm || ultimaConversa ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {ativadaEm ? (
            <>
              <dt className="text-muted-foreground">{t(T.ativadaEm)}</dt>
              <dd>{ativadaEm}</dd>
            </>
          ) : null}
          {ultimaConversa ? (
            <>
              <dt className="text-muted-foreground">{t(T.ultimaConversa)}</dt>
              <dd>{ultimaConversa}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <p className="text-xs text-muted-foreground">{textoDoModo(licenca.modo, t)}</p>
      <Link
        href="/app/licenca"
        className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {t(T.verDetalhes)}
        <CaretRight size={12} aria-hidden />
      </Link>
    </Card>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <Certificate size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{titulo}</h2>
    </div>
  );
}

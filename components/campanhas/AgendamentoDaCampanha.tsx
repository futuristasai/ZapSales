"use client";
/**
 * Agendar a campanha pela tela (issue #292) — o cartão de escolher dia e hora, e
 * o cartão que diz para quando ela está marcada.
 *
 * ═══ Por que o campo é lido no fuso do NÚMERO ═══
 *
 * `<input type="datetime-local">` devolve um relógio de parede, sem fuso. Lido
 * no fuso do navegador, "9h" marcado de Lisboa para um número de São Paulo
 * sairia às 6h de lá — antes de o horário de envio abrir. O campo vale no fuso
 * em que a janela de envio é avaliada, e a tela diz qual é e que horas são
 * nele: é a única forma de quem está em outro fuso não agendar no escuro.
 *
 * ═══ Por que a frase aparece ANTES de confirmar ═══
 *
 * Chegar a hora marcada só põe a campanha "em andamento"; fora do horário de
 * envio nada sai. Sem dizer isso aqui, quem agenda para as 23h acha que o
 * sistema falhou quando abre a tela à meia-noite. A frase diz quando o primeiro
 * envio sai de verdade — calculada pela MESMA regra das rodadas
 * (`lib/campanhas/agenda.ts`).
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import {
  AGENDA_MAXIMA_DIAS,
  campoDoInstante,
  inicioDoEnvio,
  instanteDoCampo,
  recusaDaAgenda,
  type JanelaDeEnvio,
} from "@/lib/campanhas/agenda";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

/** "sexta-feira, 13/11, 09:30" — no fuso do número, no idioma de quem lê. */
function diaEHora(instante: Date, fuso: string, tag: string): string {
  return instante.toLocaleString(tag, {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Horário de Brasília" quando o navegador sabe dizer; senão o nome técnico do fuso. */
function nomeDoFuso(fuso: string, tag: string): string {
  try {
    const partes = new Intl.DateTimeFormat(tag, { timeZone: fuso, timeZoneName: "longGeneric" }).formatToParts(
      new Date(),
    );
    return partes.find((p) => p.type === "timeZoneName")?.value ?? fuso;
  } catch {
    return fuso;
  }
}

/**
 * Quando o primeiro envio sai, em frase. `null` = o horário está dentro do
 * horário de envio, e não há o que avisar.
 */
function useAvisoDoHorario(janela: JanelaDeEnvio): (quando: Date) => string | null {
  const t = useT();
  const tag = tagDeIdioma(useIdioma());
  return (quando) => {
    const inicio = inicioDoEnvio(quando, janela);
    if (inicio.dentro) return null;
    if (!inicio.abre) {
      return t(
        "O horário de envio desta campanha e o do número não se cruzam: nada sairia. Ajuste o ritmo da campanha antes de agendar.",
      );
    }
    const motivo =
      inicio.motivo === "domingo"
        ? t("Este número não envia aos domingos.")
        : `${t("Esse horário fica fora do horário de envio")} (${janela.inicio_hora}h–${janela.fim_hora}h).`;
    return `${motivo} ${t("A campanha fica agendada, mas só começa a enviar")} ${diaEHora(inicio.abre, janela.fuso, tag)}.`;
  };
}

export function AgendamentoDaCampanha({
  janela,
  agendadaPara,
  pessoas,
  enviando,
  onAgendar,
  onVoltar,
  agora = () => new Date(),
}: {
  janela: JanelaDeEnvio;
  /** ISO do agendamento atual, quando a ação é MUDAR o horário de uma agendada. */
  agendadaPara: string | null;
  pessoas: number;
  enviando: boolean;
  onAgendar: (quandoIso: string) => void;
  onVoltar: () => void;
  /** Só para teste: o relógio. */
  agora?: () => Date;
}) {
  const t = useT();
  const tag = tagDeIdioma(useIdioma());
  const avisoDoHorario = useAvisoDoHorario(janela);
  const mudando = agendadaPara !== null;
  // Em branco de propósito ao agendar pela primeira vez: sugerir "amanhã às 9h"
  // seria um chute que alguém confirma sem ler.
  const [campo, setCampo] = useState(mudando ? campoDoInstante(new Date(agendadaPara), janela.fuso) : "");

  const momento = agora();
  const quando = instanteDoCampo(campo, janela.fuso);
  const recusa = quando ? recusaDaAgenda(quando, momento) : null;
  const aviso = quando && !recusa ? avisoDoHorario(quando) : null;
  const limite = new Date(momento.getTime() + AGENDA_MAXIMA_DIAS * 24 * 60 * 60_000);

  return (
    <Card className="space-y-3 p-4" data-testid="agendamento-da-campanha">
      <h2 className="font-medium">{mudando ? t("Mudar o horário do envio") : t("Agendar o envio")}</h2>
      <p className="text-sm text-muted-foreground">
        {`${t("No dia e na hora marcados, a campanha começa sozinha a enviar para")} ${pessoas} ${pessoas === 1 ? t("pessoa") : t("pessoas")}, ${t("no ritmo do número.")}`}
      </p>
      <div className="space-y-2">
        <Label htmlFor="agendar-quando">{t("Dia e hora do início")}</Label>
        <Input
          id="agendar-quando"
          type="datetime-local"
          className="max-w-xs"
          value={campo}
          min={campoDoInstante(momento, janela.fuso)}
          max={campoDoInstante(limite, janela.fuso)}
          onChange={(e) => setCampo(e.target.value)}
          aria-describedby="agendar-fuso agendar-resultado"
        />
        <p id="agendar-fuso" className="text-xs text-muted-foreground" data-testid="fuso-do-agendamento">
          {`${t("Vale o horário do número")}: ${nomeDoFuso(janela.fuso, tag)}. ${t("Agora são")} ${momento.toLocaleTimeString(
            tag,
            { timeZone: janela.fuso, hour: "2-digit", minute: "2-digit" },
          )}.`}
        </p>
      </div>

      <div id="agendar-resultado" role="status" data-testid="resultado-do-agendamento">
        {recusa === "passado" && (
          <p className="text-sm text-error-fg">
            {t("Esse horário já passou. Escolha um horário no futuro — para enviar agora, use Iniciar envio.")}
          </p>
        )}
        {recusa === "longe_demais" && (
          <p className="text-sm text-error-fg">{t("Escolha uma data dentro de um ano.")}</p>
        )}
        {quando && !recusa && !aviso && (
          <p className="text-sm">{`${t("A campanha começa a enviar")} ${diaEHora(quando, janela.fuso, tag)}.`}</p>
        )}
        {aviso && <p className="text-sm text-warning-fg">{aviso}</p>}
      </div>

      <div className="flex gap-2">
        <Button disabled={!quando || recusa !== null || enviando} onClick={() => quando && onAgendar(quando.toISOString())}>
          {mudando ? t("Salvar novo horário") : t("Agendar envio")}
        </Button>
        <Button variant="outline" onClick={onVoltar}>
          {t("Voltar")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * A campanha agendada, dita por extenso: para quando está marcada e — se a hora
 * marcada cai fora do horário de envio — quando o primeiro envio sai de verdade.
 */
export function CampanhaAgendada({ agendadaPara, janela }: { agendadaPara: string; janela: JanelaDeEnvio }) {
  const t = useT();
  const tag = tagDeIdioma(useIdioma());
  const avisoDoHorario = useAvisoDoHorario(janela);
  const quando = new Date(agendadaPara);
  const aviso = avisoDoHorario(quando);
  return (
    <Card className="space-y-1 p-4" role="status" data-testid="campanha-agendada">
      <h2 className="font-medium">{t("Envio agendado")}</h2>
      <p className="text-sm">
        {`${t("Começa sozinha")} ${diaEHora(quando, janela.fuso, tag)} (${nomeDoFuso(janela.fuso, tag)}).`}
      </p>
      {aviso && <p className="text-sm text-warning-fg">{aviso}</p>}
      <p className="text-xs text-muted-foreground">
        {t("Dá para mudar o horário, enviar agora ou cancelar até a hora marcada.")}
      </p>
    </Card>
  );
}

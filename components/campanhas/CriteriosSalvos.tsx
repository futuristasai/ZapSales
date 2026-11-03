"use client";
/**
 * Os critérios que uma campanha antiga guardou (etiquetas, funis, etapas, tempo sem falar).
 *
 * Antes da tabela de pessoas, o público era "quem bate com estes critérios". Uma campanha em
 * rascunho com critérios salvos continua se comportando assim — sem que a edição mexa nela em
 * silêncio. Esta caixa mostra o que está valendo e deixa o operador trocar por pessoas
 * escolhidas, com um clique e com a consequência dita: os critérios saem, e só ficam as pessoas
 * marcadas e as da planilha.
 */
import { Button } from "@/components/ui/button";
import { useFunis } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";

export interface CriteriosGuardados {
  com_alguma_tag?: string[];
  com_todas_tags?: string[];
  sem_tags?: string[];
  funis?: string[];
  etapas?: string[];
  sem_interacao_ha_dias?: number | null;
}

interface Props {
  criterios: CriteriosGuardados;
  onTirar: () => void;
}

export function CriteriosSalvos({ criterios, onTirar }: Props) {
  const t = useT();
  const funis = useFunis();
  const nomeDoFunil = (id: string) => (funis.data ?? []).find((f) => f.id === id)?.name ?? id;

  const itens: string[] = [];
  const com = [...(criterios.com_todas_tags ?? []), ...(criterios.com_alguma_tag ?? [])];
  if (com.length > 0) itens.push(`${t("Com as etiquetas")}: ${com.join(", ")}`);
  if ((criterios.sem_tags ?? []).length > 0)
    itens.push(`${t("Sem as etiquetas")}: ${criterios.sem_tags!.join(", ")}`);
  if ((criterios.funis ?? []).length > 0)
    itens.push(`${t("Nos funis")}: ${criterios.funis!.map(nomeDoFunil).join(", ")}`);
  if ((criterios.etapas ?? []).length > 0)
    itens.push(`${criterios.etapas!.length} ${t("etapa(s) escolhida(s)")}`);
  if (criterios.sem_interacao_ha_dias != null)
    itens.push(
      `${t("Sem falar com a gente há")} ${criterios.sem_interacao_ha_dias} ${t("dia(s)")}`,
    );

  return (
    <div
      className="space-y-2 rounded-md border border-border bg-surface-elevated p-3 text-sm"
      data-testid="criterios-salvos"
    >
      <p className="font-medium">{t("Esta campanha guarda critérios de público")}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {t(
          "Eles continuam valendo e somam às pessoas que você marcar abaixo. Para usar só as pessoas escolhidas, tire os critérios.",
        )}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onTirar}>
        {t("Tirar os critérios salvos")}
      </Button>
    </div>
  );
}

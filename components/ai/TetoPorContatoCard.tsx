"use client";

/**
 * O limite de respostas automáticas por contato (#271).
 *
 * O orçamento mensal, logo acima nesta tela, protege a organização inteira. Este
 * cartão é a medida por CONTATO: um número que escreve sem parar — uma pessoa
 * insistente, um robô, dois bots conversando entre si — deixa de poder gastar a
 * IA de todos os outros clientes.
 *
 * ═══ A REGRA DE COPY ═══
 *
 * A frase diz o que ACONTECE ao estourar (a conversa vai para uma pessoa e abre
 * um aviso) e como se volta ao automático — a mesma regra do cartão de
 * orçamento: dizer o custo no momento da decisão.
 *
 * O limite nasce LIGADO, com o padrão do produto. Quem não é admin lê o valor em
 * vigor; só admin edita (a rota recusa os demais, esta tela só não oferece).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { TetoPorContatoDaOrg } from "@/lib/ai/budget/teto-por-contato";

interface Props {
  initialData: TetoPorContatoDaOrg;
  isAdmin: boolean;
}

const CHAVE = ["ai", "contact-limit"] as const;
const ROTA = "/api/v1/ai/contact-limit";

/** Campo vazio, fração ou número fora da faixa é INVÁLIDO — nunca vira zero. */
function lerInteiro(texto: string, maximo: number): number | null {
  const limpo = texto.trim();
  if (!/^\d+$/.test(limpo)) return null;
  const n = Number(limpo);
  return n <= maximo ? n : null;
}

export function TetoPorContatoCard({ initialData, isAdmin }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CHAVE,
    queryFn: async () => (await apiClient.get<{ data: TetoPorContatoDaOrg }>(ROTA)).data,
    initialData,
    staleTime: 30_000,
  });
  const teto = q.data;

  const [porHora, setPorHora] = useState(String(teto.por_hora));
  const [porDia, setPorDia] = useState(String(teto.por_dia));

  const salvar = useMutation({
    mutationKey: ["ai", "contact-limit", "update"],
    mutationFn: async (novo: { por_hora: number; por_dia: number }) =>
      (await apiClient.patch<{ data: TetoPorContatoDaOrg }>(ROTA, novo)).data,
    onSuccess: (gravado) => {
      qc.setQueryData(CHAVE, gravado);
      setPorHora(String(gravado.por_hora));
      setPorDia(String(gravado.por_dia));
      toast.success(t("Limite por contato salvo."));
    },
    onError: (err) => showApiError(err),
  });

  const hora = lerInteiro(porHora, teto.maximo);
  const dia = lerInteiro(porDia, teto.maximo);
  const valido = hora !== null && dia !== null;
  const mudou = valido && (hora !== teto.por_hora || dia !== teto.por_dia);
  const noPadrao = teto.por_hora === teto.padrao_por_hora && teto.por_dia === teto.padrao_por_dia;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hora === null || dia === null) return;
    salvar.mutate({ por_hora: hora, por_dia: dia });
  }

  const emVigor = (n: number) => (n === 0 ? t("sem limite") : String(n));

  return (
    <Card className="p-4" data-testid="cartao-teto-por-contato">
      <h2 className="text-base font-semibold tracking-tight">
        {t("Limite de respostas automáticas por contato")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          "Quando o mesmo contato é atendido pela IA mais vezes do que isto, a conversa passa para uma pessoa e abre um aviso na Central de avisos. Protege o seu gasto contra robôs e conversas em laço.",
        )}{" "}
        {t('A conversa volta ao automático pelo botão "Devolver ao automático" no cabeçalho dela.')}
      </p>

      {isAdmin ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="teto-por-hora">{t("Respostas por hora, por contato")}</Label>
              <Input
                id="teto-por-hora"
                inputMode="numeric"
                value={porHora}
                onChange={(e) => setPorHora(e.target.value)}
                aria-invalid={hora === null}
                disabled={salvar.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teto-por-dia">{t("Respostas por dia, por contato")}</Label>
              <Input
                id="teto-por-dia"
                inputMode="numeric"
                value={porDia}
                onChange={(e) => setPorDia(e.target.value)}
                aria-invalid={dia === null}
                disabled={salvar.isPending}
              />
            </div>
          </div>
          {!valido && (
            <p className="text-xs text-destructive" role="alert">
              {t("Informe um número inteiro entre 0 e 10.000.")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Use 0 para não limitar aquela janela.")}{" "}
            {t("Padrão do produto:")} {teto.padrao_por_hora} {t("por hora e")} {teto.padrao_por_dia}{" "}
            {t("por dia.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={!mudou || salvar.isPending}>
              {salvar.isPending ? t("Salvando...") : t("Salvar limite por contato")}
            </Button>
            {!noPadrao && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={salvar.isPending}
                onClick={() =>
                  salvar.mutate({ por_hora: teto.padrao_por_hora, por_dia: teto.padrao_por_dia })
                }
              >
                {t("Voltar ao padrão")}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm" data-testid="teto-por-contato-em-vigor">
          {t("Em vigor:")} <strong>{emVigor(teto.por_hora)}</strong> {t("por hora e")}{" "}
          <strong>{emVigor(teto.por_dia)}</strong> {t("por dia.")}{" "}
          <span className="text-muted-foreground">
            {t("Só quem administra a organização altera este limite.")}
          </span>
        </p>
      )}
    </Card>
  );
}

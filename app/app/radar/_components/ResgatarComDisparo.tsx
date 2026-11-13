"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSalvarListaDePessoas } from "@/hooks/campanhas/useListasDePessoas";
import { useT } from "@/hooks/i18n/useT";
import { TETO_DO_RESGATE, useNegociosDoResgate } from "@/hooks/leads/useResgateDoRadar";
import type { SituacaoNoRadar } from "@/lib/leads/radar-de-risco";
import { Megaphone, Warning } from "@/lib/ui/icons";

import { nomeDaListaDeResgate, pessoasParaResgatar } from "./visao-do-radar";

const ROTULO: Record<"todos" | SituacaoNoRadar, string> = {
  todos: "Todos",
  critico: "Crítico",
  em_risco: "Em risco",
  em_voo: "Em voo",
};

/**
 * RESGATAR COM DISPARO EM MASSA — a ponte entre o radar e as campanhas.
 *
 * O botão NÃO envia nada. Ele guarda as pessoas da situação escolhida numa
 * lista salva (as mesmas listas do cartão Público do disparo) e abre a tela de
 * nova campanha com essa lista já no público. Dali em diante é o disparo de
 * sempre, com TODAS as proteções dele: quem pediu para sair não recebe, a API
 * Oficial exige modelo aprovado, o QR code pede o aceite do risco, os tetos
 * valem. Nenhuma regra de envio mora aqui — e é isso que faz este caminho ser
 * seguro: não existe um segundo jeito de mandar mensagem.
 *
 * A lista é uma FOTO do momento, com dia e hora no nome. Uma etiqueta "crítico"
 * envelheceria em silêncio (quem respondeu ontem continuaria marcado); a lista
 * diz de quando é.
 */
export function ResgatarComDisparo({ visao }: { visao: "todos" | SituacaoNoRadar }) {
  const t = useT();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const negocios = useNegociosDoResgate(visao, aberto);
  const salvar = useSalvarListaDePessoas();

  const pessoas = negocios.data ? pessoasParaResgatar(negocios.data.items, visao) : null;
  const total = pessoas?.ids.length ?? 0;
  // O radar varre até 500 negócios; acima disso há gente que não chegou aqui.
  const cortado = (negocios.data?.items.length ?? 0) >= TETO_DO_RESGATE;
  const nomeValido = nome.trim().length >= 2;

  function abrir() {
    setNome(nomeDaListaDeResgate(t("Riscos de Perda"), t(ROTULO[visao]), new Date()));
    setAberto(true);
  }

  function confirmar() {
    if (!pessoas || total === 0 || !nomeValido) return;
    salvar.mutate(
      { name: nome.trim(), contact_ids: pessoas.ids },
      { onSuccess: (lista) => router.push(`/app/campaigns/new?lista=${lista.id}`) },
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir} data-testid="radar-resgatar">
        <Megaphone aria-hidden />
        {t("Resgatar com disparo em massa")}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent data-testid="radar-resgatar-dialogo">
          <DialogHeader>
            <DialogTitle>{t("Resgatar com disparo em massa")}</DialogTitle>
            <DialogDescription>
              {t(
                "As pessoas desta lista são guardadas com um nome e a tela de nova campanha abre com elas já escolhidas. Nada é enviado agora: você ainda escolhe o número e a mensagem.",
              )}
            </DialogDescription>
          </DialogHeader>

          {negocios.isLoading ? (
            <p className="text-sm text-text-muted">{t("Contando as pessoas…")}</p>
          ) : negocios.isError || !pessoas ? (
            <p role="alert" className="text-sm text-error-fg">
              {t("Não foi possível carregar as pessoas. Feche e tente de novo.")}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p data-testid="radar-resgatar-total">
                <strong className="tabular-nums">{total}</strong>{" "}
                {total === 1 ? t("pessoa em") : t("pessoas em")} <strong>{t(ROTULO[visao])}</strong>
                .
              </p>

              {visao === "em_voo" ? (
                <p className="flex items-start gap-2 rounded-md bg-warning-bg p-3 text-warning-fg">
                  <Warning size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    {t(
                      "Estas pessoas já têm um retorno marcado. Um disparo por cima manda duas mensagens à mesma pessoa.",
                    )}
                  </span>
                </p>
              ) : null}
              {pessoas.emVooDeFora > 0 ? (
                <p className="text-text-muted" data-testid="radar-resgatar-em-voo">
                  {pessoas.emVooDeFora}{" "}
                  {t(
                    "em voo ficaram de fora: já têm retorno marcado. Para incluí-las, escolha o cartão Em voo.",
                  )}
                </p>
              ) : null}
              {pessoas.semContato > 0 ? (
                <p className="text-text-muted">
                  {pessoas.semContato} {t("negócio(s) sem cliente ligado ficaram de fora.")}
                </p>
              ) : null}
              {cortado ? (
                <p className="text-text-muted">
                  {t("A lista leva até 500 negócios por vez, os mais urgentes primeiro.")}
                </p>
              ) : null}

              {total > 0 ? (
                <div className="space-y-1">
                  <Label htmlFor="radar-resgatar-nome">{t("Nome da lista")}</Label>
                  <Input
                    id="radar-resgatar-nome"
                    value={nome}
                    maxLength={80}
                    onChange={(e) => setNome(e.target.value)}
                  />
                  <p className="text-xs text-text-muted">
                    {t(
                      "A lista fica guardada em Listas salvas, na tela de campanha. Quem não puder receber é deixado de fora na hora de usar.",
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-text-muted">{t("Não há ninguém para resgatar nesta lista.")}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              onClick={confirmar}
              disabled={total === 0 || !nomeValido || salvar.isPending}
              data-testid="radar-resgatar-confirmar"
            >
              {t("Criar lista e abrir campanha")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

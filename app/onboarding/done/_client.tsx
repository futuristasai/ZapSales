"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { ArrowRight, CaretDown, Check, Warning } from "@/lib/ui/icons";

import { TITULO } from "../_components/fonte";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";
import type { ItemDoResumo } from "@/lib/onboarding/passos";
import type { PecaDoSistema } from "@/lib/onboarding/o-que-mais-existe";

export function DoneClient({
  itens,
  pecas,
  noAr,
}: {
  itens: ItemDoResumo[];
  pecas: PecaDoSistema[];
  /**
   * Existe ao menos um agente PUBLICADO nesta organização (não-arquivado, com
   * `published_version_id`)? É a página que lê o banco e passa — este componente
   * é cliente e não tem como perguntar sem um fetch que faria a tela piscar.
   */
  noAr: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const pendentes = itens.filter((i) => !i.feito);
  /**
   * O passo da IA ficou de fora (pulado ou nunca feito)? Sem ele não há
   * atendente treinado, e a frase antiga dizia "já está de pé" do mesmo jeito.
   */
  const semIa = itens.some((i) => i.segmento === "setup-ai" && !i.feito);

  /**
   * A CONCORDÂNCIA COM A REALIDADE.
   *
   * O fim do wizard era uma frase fixa: "Tudo pronto! Seu funcionário já está
   * de pé" — dita também para quem pulou o passo da IA e para quem ficou com o
   * atendente em rascunho. O wizard prometia o que não tinha entregue, e a
   * pessoa só descobria isso no primeiro cliente que ninguém respondeu.
   *
   * O que decide é o BANCO (`noAr`), não a contagem de pendências: publicar é
   * o que coloca o atendente no ar, e pular um passo que não depende da IA
   * (telefone, equipe) não tira ninguém do ar.
   */
  const titulo = noAr ? t("Tudo pronto!") : t("Quase lá!");
  const resumo = !noAr
    ? semIa
      ? t("O passo da IA ficou para depois: ele ainda não foi treinado nem colocado no ar.")
      : t("Ele já foi treinado, mas o atendimento ainda não foi publicado — ele segue em rascunho.")
    : pendentes.length === 0
      ? t("Seu funcionário está montado. Daqui em diante é só acompanhar.")
      : t("Seu funcionário já está de pé. O que ficou para depois continua te esperando.");

  return (
    <div className="mx-auto max-w-[52rem] space-y-8">
      <div
        className={
          "flex flex-col items-start gap-5 rounded-3xl p-6 sm:flex-row sm:items-center sm:p-8 " +
          (noAr ? "bg-success-bg" : "bg-warning-bg")
        }
      >
        {/* O único momento festivo do assistente: o selo entra uma vez e para. */}
        <span
          aria-hidden
          className={
            "pulso-de-estacao flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white " +
            (noAr ? "bg-success" : "bg-warning")
          }
        >
          {noAr ? <Check size={36} weight="bold" /> : <Warning size={36} weight="bold" />}
        </span>
        <div className="space-y-2">
          <h2 className={`${TITULO} text-4xl leading-none sm:text-5xl`}>{titulo}</h2>
          <p className="max-w-[56ch] text-lg leading-relaxed text-foreground/80">{resumo}</p>
        </div>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
        {itens.map((it) => (
          <li key={it.segmento} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
            <span className="flex items-center gap-3">
              {it.feito ? (
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white"
                >
                  <Check size={14} weight="bold" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="h-5 w-5 shrink-0 rounded-full border border-dashed border-border-strong"
                />
              )}
              <span className={it.feito ? "font-medium" : "text-muted-foreground"}>{t(it.rotulo)}</span>
            </span>
            {/*
              "Pulado" é escolha da pessoa; "ainda não" é o que ela não
              chegou a fazer. Antes tudo que não estivesse feito virava
              "(pulado)", inclusive passo que a instalação nunca ofereceu —
              o wizard cobrando o que ninguém pediu.
            */}
            {it.pulado ? (
              <Selo>{t("você pulou")}</Selo>
            ) : it.feito ? null : (
              <Selo significado="funil">{t("ainda não")}</Selo>
            )}
          </li>
        ))}
      </ul>

      {/*
        O wizard acabava aqui, com um botão que entregava a pessoa numa caixa de
        conversas vazia. Ela tinha acabado de montar um funcionário e não fazia
        ideia de que existe um lugar onde ele pede ajuda, outro que mostra quem
        esfriou, outro onde ele propõe as próprias melhorias. Descobrir isso
        ficava por conta da curiosidade — e quase ninguém volta para explorar
        menu.
      */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h3 className={`${TITULO} text-2xl`}>{t("O que mais tem aqui")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("Você não precisa mexer em nada disso agora. É só para saber que existe.")}
          </p>
        </div>
        {/*
          Cada peça abre e mostra COMO funciona, em passos. Uma frase basta para
          dizer que a peça existe; não basta para o follow-up, que é a peça mais
          técnica do produto e a que mais assusta pelo nome — quem lê "volta a
          falar com quem sumiu" sem saber que o retorno PARA quando o cliente
          responde imagina um robô perseguindo cliente, e desliga justamente o
          que mais recupera venda.

          Fechado por padrão: quem acabou de montar o funcionário não precisa ler
          seis tutoriais agora. O que ele precisa é saber que a explicação existe
          e está a um clique.

          Uma linha por peça, não uma grade de cartões iguais (DESIGN.md): são
          coisas do mesmo tipo, sem imagem própria para comparar.
        */}
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
          {pecas.map((p) => (
            <li key={p.href} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <a href={p.href} className="text-base font-bold text-primary underline-offset-4 hover:underline">
                  {t(p.comoChamar)}
                </a>
                <span className="text-xs text-muted-foreground">({t(p.label)})</span>
              </div>
              <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{t(p.porQue)}</p>

              <details className="group mt-2">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                  {t("Como funciona")}
                  <CaretDown
                    aria-hidden
                    size={12}
                    weight="bold"
                    className="transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <ol className="mt-3 space-y-2">
                  {p.comoFunciona.map((passo, i) => (
                    <li key={passo} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] tabular-nums"
                      >
                        {i + 1}
                      </span>
                      <span>{t(passo)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end border-t border-border pt-6">
        <Button
          type="button"
          size="lg"
          className="h-12 gap-2 px-8 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await finishOnboarding();
              if (res && !res.ok) toast.error(`${t("Falha:")} ${res.error}`);
            })
          }
        >
          {pending ? t("Finalizando...") : t("Começar a usar")}
          {pending ? null : <ArrowRight aria-hidden size={18} weight="bold" />}
        </Button>
      </div>
    </div>
  );
}

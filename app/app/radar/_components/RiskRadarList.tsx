"use client";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";
import { CheckCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import {
  LinhaDeDemanda,
  LinhaDeNegocio,
  LinhaDePropostaParaRevisar,
  LinhaDePropostaVencida,
} from "./LinhasDoRadar";
import { ResgatarComDisparo } from "./ResgatarComDisparo";
import { SituacoesDoRadar } from "./SituacoesDoRadar";
import {
  contagemDaVisao,
  lerVisao,
  situacaoDaVisao,
  visaoDeNegocios,
  visaoEmVigor,
  type VisaoDoRadar,
} from "./visao-do-radar";

const PASSO = 50;
/** O teto da rota (`limit` máximo), que é o do pool varrido no servidor. */
const TETO = 500;

/** A frase que explica a lista em vigor — o "e daí?" de cada contador. */
const EXPLICACAO: Record<VisaoDoRadar, string> = {
  todos: "Do mais urgente para o menos urgente. A linha abre a conversa com o cliente.",
  critico:
    "Parados há tempo demais para a etapa em que estão, e ninguém marcou retorno. Comece por aqui.",
  em_risco: "Passaram do tempo esperado da etapa e ainda não têm retorno marcado.",
  em_voo: "Esfriaram, mas já existe um retorno marcado. É só acompanhar.",
  sem_proximo_passo:
    "Ninguém marcou o que acontece a seguir. Cada uma é alguém esperando sem que nada esteja combinado. Abra a conversa e marque o próximo passo no painel ao lado.",
  propostas_vencidas: "O cliente recebeu e não decidiu. Retome antes que esfrie de vez.",
  propostas_para_revisar: "Rascunhos que a IA terminou e ninguém revisou. Confira antes de enviar.",
};

const VAZIO: Record<VisaoDoRadar, string> = {
  todos: "Nenhum negócio parado.",
  critico: "Nenhum negócio em situação crítica.",
  em_risco: "Nenhum negócio em risco.",
  em_voo: "Nenhum negócio com retorno marcado.",
  sem_proximo_passo: "Nenhuma demanda sem próximo passo.",
  propostas_vencidas: "Nenhuma proposta vencida sem retomada.",
  propostas_para_revisar: "Nenhuma proposta esperando revisão.",
};

/** O `data-testid` de cada lista — os três últimos são os que as specs já liam. */
const TESTE: Record<VisaoDoRadar, string> = {
  todos: "radar-lista",
  critico: "radar-lista",
  em_risco: "radar-lista",
  em_voo: "radar-lista",
  sem_proximo_passo: "radar-sem-proximo-passo",
  propostas_vencidas: "radar-propostas-vencidas",
  propostas_para_revisar: "radar-propostas-esperando-revisao",
};

export function RiskRadarList({ podeResgatar = false }: { podeResgatar?: boolean }) {
  const t = useT();
  const parametros = useSearchParams();
  // A escolha mora na URL (`?ver=`): quem abre uma conversa e volta encontra a
  // mesma lista, e o endereço pode ser guardado ou enviado a um colega.
  const [escolhida, setEscolhida] = useState<VisaoDoRadar | null>(() =>
    lerVisao(parametros?.get("ver")),
  );
  const [limite, setLimite] = useState(PASSO);

  const { data, isLoading, isPlaceholderData, isFetching } = useAtRiskLeads({
    risk: situacaoDaVisao(escolhida),
    limit: limite,
  });

  function escolher(visao: VisaoDoRadar) {
    setEscolhida(visao);
    setLimite(PASSO);
    // `replaceState` e não `router.replace`: a página é de servidor e
    // `force-dynamic`, e navegar refaria a autenticação inteira só para trocar
    // um filtro. O Next enxerga a troca e mantém `useSearchParams` em dia.
    const url = new URL(window.location.href);
    url.searchParams.set("ver", visao);
    window.history.replaceState(null, "", url);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton className="h-[88px] w-full" />
          <Skeleton className="h-[88px] w-full" />
          <Skeleton className="h-[88px] w-full" />
          <Skeleton className="h-[88px] w-full" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // O vazio só é vazio se as QUATRO listas estiverem vazias. Sem esta condição,
  // uma organização com proposta vencida sem retomada e nenhum lead frio
  // veria "Nenhuma demanda em risco" — escondendo exatamente o vazamento que
  // a lista existe para denunciar (mesma armadilha do invariante 4).
  const semPasso = data?.sem_proximo_passo ?? [];
  const vencidas = data?.propostas_vencidas_sem_retomada ?? [];
  const esperandoRevisao = data?.propostas_esperando_revisao ?? [];
  if (
    !data ||
    (data.total === 0 &&
      semPasso.length === 0 &&
      vencidas.length === 0 &&
      esperandoRevisao.length === 0)
  ) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center"
        data-testid="radar-empty"
      >
        <CheckCircle size={28} className="text-success-fg/70" aria-hidden />
        <p className="text-sm font-medium">{t("Nenhuma demanda em risco")}</p>
        <p className="text-xs text-muted-foreground">
          {t("Toda demanda aberta teve atividade recente ou já tem um retorno agendado.")}
        </p>
      </div>
    );
  }

  const visao = visaoEmVigor(data, escolhida);
  const quantos = contagemDaVisao(data, visao);

  let linhas: ReactNode[];
  switch (visao) {
    case "sem_proximo_passo":
      linhas = semPasso.map((d) => <LinhaDeDemanda key={d.id} demanda={d} />);
      break;
    case "propostas_vencidas":
      linhas = vencidas.map((p) => <LinhaDePropostaVencida key={p.proposal_id} proposta={p} />);
      break;
    case "propostas_para_revisar":
      linhas = esperandoRevisao.map((p) => (
        <LinhaDePropostaParaRevisar key={p.proposal_id} proposta={p} />
      ));
      break;
    default:
      linhas = data.items.map((lead) => <LinhaDeNegocio key={lead.id} lead={lead} />);
  }
  // As listas de proposta chegam inteiras; negócios e demandas vêm até `limite`.
  const haMais = linhas.length < quantos && limite < TETO;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* INVARIANTE 4 em forma acionável: o índice de atrito publica a CONTAGEM
          ("N demandas abertas sem próximo passo"); contagem sem lugar para agir
          viola o invariante 5. Cada contador daqui abre a lista que responde
          "e daí?", e cada linha dela tem para onde ir. */}
      <SituacoesDoRadar dados={data} ativa={visao} onEscolher={escolher} />

      <section aria-live="polite" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[80ch] text-sm text-text-muted" data-testid="radar-explicacao">
            {t(EXPLICACAO[visao])}
          </p>
          {/* O resgate é de quem opera o disparo (gerente ou acima): a rota das
              listas e a das campanhas exigem o mesmo papel, e mostrar o botão a
              quem levaria um 403 no fim seria mandar a pessoa a uma porta trancada. */}
          {podeResgatar && visaoDeNegocios(visao) && quantos > 0 ? (
            <ResgatarComDisparo visao={visao} />
          ) : null}
        </div>

        {linhas.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted"
            data-testid="radar-lista-vazia"
          >
            {t(VAZIO[visao])}
          </p>
        ) : (
          <ul
            data-testid={TESTE[visao]}
            data-visao={visao}
            aria-busy={isPlaceholderData}
            className={cn(
              "@container divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface",
              "transition-opacity duration-fast",
              isPlaceholderData && "opacity-60",
            )}
          >
            {linhas}
          </ul>
        )}

        {linhas.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted tabular-nums" data-testid="radar-mostrando">
              {t("Mostrando")} {linhas.length} {t("de")} {Math.max(quantos, linhas.length)}
            </p>
            {haMais ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isFetching}
                onClick={() => setLimite((n) => Math.min(TETO, n + PASSO))}
                data-testid="radar-mostrar-mais"
              >
                {t("Mostrar mais")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

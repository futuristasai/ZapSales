"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { markdownParaTextoSimples } from "@/lib/system/changelog";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { useT } from "@/hooks/i18n/useT";
import { semV } from "@/lib/atualizacao/comandos";
import { ArrowCircleUp, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Os textos fixos, como dado — a cerca de idioma do admin os lê daqui. */
export const TEXTOS_DA_VERSAO_NO_PAINEL = {
  titulo: "Versão",
  instalada: "Instalada",
  disponivel: "Disponível",
  emDia: "Em dia",
  novaVersao: "Versão nova",
  atualizando: "Atualizando",
  desligado: "Programa do servidor desligado",
  desligadoExplica:
    "Sem ele a instalação não sabe se há versão nova, e o botão de atualizar fica desligado.",
  acompanha: "Atualizada pela implantação contínua",
  acompanhaExplica: "Esta instalação acompanha o desenvolvimento; não há botão de atualizar.",
  emDiaExplica: "É a versão publicada mais recente.",
  novaExplica:
    "Leia o que muda e atualize com um clique: a cópia do banco e a volta automática estão incluídas.",
  atualizandoExplica: "Acompanhe o andamento na tela de atualização.",
  verAtualizacao: "Ver a atualização",
  verComoLigar: "Ver como ligar",
  ilegivel: "Não consegui ler a versão agora.",
  oQueMuda: "O que muda",
  atualizarAgora: "Atualizar agora",
  iniciando: "Iniciando…",
  pedeAtencao: "Esta versão tem um aviso que pede atenção antes de atualizar.",
  lerAvisos: "Ler o aviso e atualizar",
  naoIniciou: "Não consegui iniciar a atualização. Tente de novo em instantes.",
} as const;

/**
 * O CARTÃO VERSÃO do Painel (issue #311, histórias 36–38 da #308): a versão instalada,
 * a disponível, o que muda nela e o botão de atualizar. Lê a mesma rota da tela de
 * atualização (`/api/v1/system/version`) — as duas nunca discordam.
 *
 * O botão do cartão é o mesmo pedido da tela (`POST /api/v1/system/update`), e depois
 * do clique leva à tela, que mostra o andamento. Uma exceção, de propósito: quando a
 * faixa de versões traz um aviso "Requer atenção" (ex.: reconectar um número depois),
 * o cartão não atualiza direto — leva à tela, onde o aviso fica ANTES do botão.
 */
export function CartaoDaVersao() {
  const t = useT();
  const T = TEXTOS_DA_VERSAO_NO_PAINEL;
  const { data, isError, isLoading } = useSystemVersion({ refetchInterval: 30_000 });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const atualizar = useMutation({
    mutationFn: async () => apiClient.post("/api/v1/system/update", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system-version"] });
      router.push("/admin/atualizacao");
    },
    onError: (err) =>
      setErro(err instanceof ApiError && err.status === 409 ? t(err.message) : t(T.naoIniciou)),
  });

  if (isLoading) {
    return (
      <Card className="space-y-3 p-4" data-testid="cartao-versao">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-32" />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="space-y-2 p-4" data-testid="cartao-versao" data-versao-estado="ilegivel">
        <Cabecalho titulo={t(T.titulo)} />
        <p className="text-sm text-muted-foreground">{t(T.ilegivel)}</p>
      </Card>
    );
  }

  const instalada = semV(data.current_version) || "—";
  const nova = semV(data.latest_version);
  const estado: "desligado" | "acompanha" | "atualizando" | "nova" | "em_dia" =
    data.run?.status === "dispatched"
      ? "atualizando"
      : !data.agent_online
        ? "desligado"
        : data.executes_updates === false
          ? "acompanha"
          : data.update_available && nova
            ? "nova"
            : "em_dia";

  const selo = {
    desligado: { texto: T.desligado, significado: "falha" as const },
    acompanha: { texto: T.acompanha, significado: "neutro" as const },
    atualizando: { texto: T.atualizando, significado: "funil" as const },
    nova: { texto: T.novaVersao, significado: "funil" as const },
    em_dia: { texto: T.emDia, significado: "concluido" as const },
  }[estado];
  const explica = {
    desligado: T.desligadoExplica,
    acompanha: T.acompanhaExplica,
    atualizando: T.atualizandoExplica,
    nova: T.novaExplica,
    em_dia: T.emDiaExplica,
  }[estado];

  return (
    <Card
      className={cn(
        "flex flex-col gap-2 p-4",
        estado === "desligado" && "border-error/40 bg-error-bg",
      )}
      data-testid="cartao-versao"
      data-versao-estado={estado}
    >
      <Cabecalho titulo={t(T.titulo)} />
      <div className="flex flex-wrap items-center gap-2">
        <Selo significado={selo.significado}>{t(selo.texto)}</Selo>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t(T.instalada)}</dt>
        <dd className="font-medium tabular-nums">{instalada}</dd>
        {estado === "nova" || estado === "atualizando" ? (
          <>
            <dt className="text-muted-foreground">{t(T.disponivel)}</dt>
            <dd className="font-medium tabular-nums">{nova}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-sm text-muted-foreground">{t(explica)}</p>
      {estado === "nova" ? (
        <NovaVersao
          notas={data.notes?.sections[0]?.body ?? ""}
          pedeAtencao={(data.notes?.requires_attention.length ?? 0) > 0}
          atualizar={() => atualizar.mutate()}
          iniciando={atualizar.isPending}
          erro={erro}
        />
      ) : null}
      <Link
        href="/admin/atualizacao"
        className={cn(
          "mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium",
          estado === "nova"
            ? "text-primary hover:underline"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t(estado === "desligado" ? T.verComoLigar : T.verAtualizacao)}
        <CaretRight size={12} aria-hidden />
      </Link>
    </Card>
  );
}

/** As notas da versão-alvo (recortadas) e o botão — ou o caminho para o aviso. */
function NovaVersao({
  notas,
  pedeAtencao,
  atualizar,
  iniciando,
  erro,
}: {
  notas: string;
  pedeAtencao: boolean;
  atualizar: () => void;
  iniciando: boolean;
  erro: string | null;
}) {
  const t = useT();
  const T = TEXTOS_DA_VERSAO_NO_PAINEL;
  const texto = markdownParaTextoSimples(notas).trim();
  return (
    <div className="space-y-2">
      {texto ? (
        <div data-testid="notas-da-versao">
          <p className="text-xs font-medium text-muted-foreground">{t(T.oQueMuda)}</p>
          <p className="line-clamp-4 text-sm whitespace-pre-line">{texto}</p>
        </div>
      ) : null}
      {pedeAtencao ? (
        <>
          <p className="rounded-md border border-warning bg-warning-bg p-2 text-sm text-warning-fg">
            {t(T.pedeAtencao)}
          </p>
          <Button asChild size="sm">
            <Link href="/admin/atualizacao">{t(T.lerAvisos)}</Link>
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={atualizar} disabled={iniciando}>
          {t(iniciando ? T.iniciando : T.atualizarAgora)}
        </Button>
      )}
      {erro ? <p className="text-sm text-error-fg">{erro}</p> : null}
    </div>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <ArrowCircleUp size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{titulo}</h2>
    </div>
  );
}

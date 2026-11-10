"use client";

import { usePathname } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { Check, Clock, Robot } from "@/lib/ui/icons";
import { preencher } from "@/lib/onboarding/ajuda";
import { cn } from "@/lib/utils";

import { TITULO } from "./fonte";
import { ICONE_DO_PASSO } from "./icones";

export type EstadoDoPasso = "feito" | "pulado" | "pendente";

export interface PassoDaTrilha {
  segmento: string;
  /** O nome da peça, ainda na chave em português: quem traduz é o cliente (`t`). */
  rotulo: string;
  /** Uma linha do que se faz no passo, já no idioma de quem olha. */
  resumo: string;
  minutos: number;
  estado: EstadoDoPasso;
}

/** Texto puro, já no idioma de quem olha: atravessa a fronteira servidor → cliente. */
export interface TextosDaTrilha {
  titulo: string;
  navegacao: string;
  funcionario: string;
  emTreinamento: string;
  prontoParaAtender: string;
  passoDe: string;
  faltam: string;
  faltamUm: string;
  tudoMontado: string;
  progressoSalvo: string;
  feito: string;
  pulado: string;
  atual: string;
  chipMinutos: string;
}

/**
 * A TRILHA: onde a pessoa está na montagem do funcionário, o que já foi, o que falta e quanto
 * tempo leva — num lugar só, sempre à vista.
 *
 * É a "Linha do Funil" (DESIGN.md) aplicada ao assistente, e o miolo é uma ILHA ESCURA nos dois temas,
 * como a faixa do menu (`data-theme="dark"`): o assistente é a primeira impressão e merece um lugar
 * com identidade, e a cor de destaque é a da marca resolvida — nenhum valor fixo aqui. No topo, um
 * crachá: o funcionário que está sendo montado, com o estado dele («em treinamento» até o fim, «pronto
 * para atender» depois). Os passos ficam ligados por um fio: etapas feitas em verde (deu certo), a
 * atual maior e acesa, as futuras vazadas.
 *
 * No celular a coluna vira uma barra escura no topo (nome do passo + um segmento por passo), porque seis
 * rótulos não cabem em 375 px e uma coluna lateral empurraria o formulário para baixo da dobra.
 *
 * Quem decide o que está "feito" é o estado gravado (`passos.ts`), nunca a posição na lista: estar
 * adiante não conclui o que ficou para trás. O passo ATUAL sai da rota.
 */
export function Trilha({ passos, textos }: { passos: PassoDaTrilha[]; textos: TextosDaTrilha }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const indice = passos.findIndex((p) => pathname.includes(`/${p.segmento}`));
  const total = passos.length;
  const resolvidos = passos.filter((p) => p.estado !== "pendente").length;
  const minutos = passos
    .filter((p) => p.estado === "pendente")
    .reduce((soma, p) => soma + p.minutos, 0);
  // Fora de qualquer passo (a tela final), o que sobra é a conclusão.
  const emPasso = indice >= 0;
  const atual = emPasso ? passos[indice] : null;
  const pronto = !emPasso && resolvidos === total;

  const faltam =
    minutos <= 0
      ? null
      : minutos === 1
        ? textos.faltamUm
        : preencher(textos.faltam, { m: minutos });
  const posicao = emPasso
    ? preencher(textos.passoDe, { n: indice + 1, total })
    : textos.tudoMontado;
  const estadoDoFuncionario = pronto ? textos.prontoParaAtender : textos.emTreinamento;

  return (
    <>
      {/* ── Celular e tablet estreito: uma barra escura, não uma coluna ── */}
      <div
        data-testid="trilha-celular"
        data-theme="dark"
        className="sticky top-0 z-20 bg-background px-4 pt-3 pb-3.5 text-foreground shadow-md lg:hidden"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <Robot size={20} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn(TITULO, "truncate text-base leading-tight")}>
              {atual ? t(atual.rotulo) : textos.tudoMontado}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {posicao}
              {faltam ? <> · {faltam}</> : null}
            </p>
          </div>
        </div>
        <ol aria-label={textos.navegacao} className="mt-3 flex gap-1.5">
          {passos.map((p, i) => (
            <li
              key={p.segmento}
              aria-current={i === indice ? "step" : undefined}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                i === indice
                  ? "bg-primary shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_70%,transparent)]"
                  : p.estado === "feito"
                    ? "bg-success"
                    : p.estado === "pulado"
                      ? "bg-border-strong"
                      : "bg-white/15",
              )}
            >
              <span className="sr-only">
                {t(p.rotulo)}
                {p.estado === "feito"
                  ? ` — ${textos.feito}`
                  : p.estado === "pulado"
                    ? ` — ${textos.pulado}`
                    : ""}
                {i === indice ? ` — ${textos.atual}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Computador: a coluna da trilha ── */}
      <nav aria-label={textos.navegacao} data-testid="trilha" className="hidden lg:block">
        <div className="sticky top-6 space-y-4">
          <div
            data-theme="dark"
            className="relative max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-background text-foreground shadow-lg ring-1 ring-white/10"
          >
            {/* O brilho da marca no alto do cartão: a cor de destaque resolvida, nunca um valor fixo. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(20rem_14rem_at_25%_0%,color-mix(in_srgb,var(--primary)_42%,transparent),transparent)]"
            />
            <div className="relative space-y-6 p-5">
              {/* O crachá do funcionário */}
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_color-mix(in_srgb,var(--primary)_80%,transparent)]"
                  >
                    <Robot size={30} weight="fill" />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <p className={cn(TITULO, "text-lg leading-none")}>{textos.funcionario}</p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        pronto ? "bg-success-bg text-success-fg" : "bg-white/10 text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          pronto ? "bg-success" : "bg-funil",
                        )}
                      />
                      {estadoDoFuncionario}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div
                    role="progressbar"
                    aria-label={textos.titulo}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={resolvidos}
                    aria-valuetext={posicao}
                    className="h-2 overflow-hidden rounded-full bg-white/15"
                  >
                    <div
                      className="h-full rounded-full bg-primary shadow-[0_0_14px_color-mix(in_srgb,var(--primary)_80%,transparent)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{
                        width: `${total === 0 ? 0 : Math.max(6, (resolvidos / total) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{posicao}</span>
                    {faltam ? <> · {faltam}</> : null}
                  </p>
                </div>
              </div>

              <ol>
                {passos.map((p, i) => {
                  const ehAtual = i === indice;
                  const ultimo = i === passos.length - 1;
                  const Icone = ICONE_DO_PASSO[p.segmento];
                  return (
                    <li
                      key={p.segmento}
                      aria-current={ehAtual ? "step" : undefined}
                      data-estado={ehAtual ? "atual" : p.estado}
                      className={cn("relative flex gap-3.5 pb-4 last:pb-0", ehAtual && "pb-5")}
                    >
                      {/* O fio entre este marcador e o próximo: cheio onde o caminho já foi andado. */}
                      {ultimo ? null : (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-10 bottom-1 left-[17px] w-0.5 rounded-full",
                            p.estado === "feito"
                              ? "bg-success/60"
                              : "border-l-2 border-dashed border-border-strong",
                          )}
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          "relative z-10 mt-0.5 flex shrink-0 items-center justify-center rounded-full font-mono text-sm font-medium tabular-nums transition-colors",
                          ehAtual
                            ? "h-9 w-9 bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_28%,transparent)]"
                            : "h-9 w-9",
                          !ehAtual &&
                            (p.estado === "feito"
                              ? "bg-success-bg text-success"
                              : p.estado === "pulado"
                                ? "border border-dashed border-border-strong text-text-subtle"
                                : "border border-border-strong text-muted-foreground"),
                        )}
                      >
                        {p.estado === "feito" && !ehAtual ? (
                          <Check size={16} weight="bold" />
                        ) : ehAtual && Icone ? (
                          <Icone size={18} weight="fill" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <p
                          className={cn(
                            "leading-snug",
                            ehAtual
                              ? cn(TITULO, "text-lg text-foreground")
                              : p.estado === "pendente"
                                ? "text-sm font-medium text-muted-foreground"
                                : "text-sm font-medium text-foreground",
                          )}
                        >
                          {t(p.rotulo)}
                          <span className="sr-only">
                            {p.estado === "feito"
                              ? ` — ${textos.feito}`
                              : p.estado === "pulado"
                                ? ` — ${textos.pulado}`
                                : ""}
                            {ehAtual ? ` — ${textos.atual}` : ""}
                          </span>
                        </p>
                        {p.estado === "feito" || p.estado === "pulado" ? (
                          <p
                            className={cn(
                              "mt-0.5 text-xs font-medium",
                              p.estado === "feito" ? "text-success" : "text-text-subtle",
                            )}
                          >
                            {p.estado === "feito" ? textos.feito : textos.pulado}
                          </p>
                        ) : (
                          <>
                            <p
                              className={cn(
                                "mt-0.5 leading-snug",
                                ehAtual
                                  ? "text-sm text-foreground/85"
                                  : "text-xs text-muted-foreground",
                              )}
                            >
                              {p.resumo}
                            </p>
                            {ehAtual ? (
                              <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-subtle">
                                <Clock aria-hidden size={12} weight="bold" />
                                {preencher(textos.chipMinutos, { n: p.minutos })}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <p className="px-2 text-xs leading-relaxed text-muted-foreground">
            {textos.progressoSalvo}
          </p>
        </div>
      </nav>
    </>
  );
}

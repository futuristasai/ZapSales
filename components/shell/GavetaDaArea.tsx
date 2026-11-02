"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { useT } from "@/hooks/i18n/useT";
import type { EntradaDaFaixa } from "@/lib/navigation/faixa";
import type { GrupoProjetado } from "@/lib/navigation/menu";
import type { NavDestination } from "@/lib/navigation/registry";
import { X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Uma tela na gaveta: ícone, nome, o termo técnico embaixo e a frase do que ela faz.
 *
 * A tela atual é marcada de TRÊS jeitos que não dependem de cor — `aria-current`, o
 * peso da fonte e a barra no canto —, como na lista do painel.
 */
function TelaDaGaveta({
  item,
  ativo,
  aoEscolher,
}: {
  item: NavDestination;
  ativo: boolean;
  aoEscolher: () => void;
}) {
  const t = useT();
  const Icone = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      onClick={aoEscolher}
      className={cn(
        "relative flex h-full items-start gap-3 rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
        ativo
          ? "border-accent bg-accent-soft before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent"
          : "bg-card hover:border-accent hover:bg-accent-soft",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-foreground">
        <Icone size={20} weight={ativo ? "fill" : "regular"} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm", ativo ? "font-bold" : "font-semibold")}>
          {t(item.label)}
        </span>
        {item.menu.termo ? (
          <span className="text-[11px] leading-3 text-text-subtle">{t(item.menu.termo)}</span>
        ) : null}
        <span className="mt-0.5 text-xs text-muted-foreground">{t(item.description)}</span>
      </span>
      {item.healthDot && <ConnectionHealthDot className="ml-auto shrink-0" />}
      {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
      {item.contador === "fila" && <ContadorDaFila compacto={false} />}
    </Link>
  );
}

function GrupoDaGaveta({
  grupo,
  hrefAtual,
  aoEscolher,
}: {
  grupo: GrupoProjetado;
  hrefAtual: string | null;
  aoEscolher: () => void;
}) {
  const t = useT();
  const tituloId = `gaveta-grupo-${grupo.id}`;
  return (
    <section aria-labelledby={tituloId} className="mt-4 first:mt-0">
      <h3
        id={tituloId}
        className="mb-2 flex items-center gap-2 px-1 text-sm font-bold after:h-px after:flex-1 after:bg-border"
      >
        {t(grupo.label)}
      </h3>
      {/* Uma coluna até a gaveta ter largura para duas: a medida é a da PRÓPRIA gaveta
          (container query na própria gaveta), e não a da janela. */}
      <ul className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2">
        {grupo.itens.map((item) => (
          <li key={item.href}>
            <TelaDaGaveta item={item} ativo={item.href === hrefAtual} aoEscolher={aoEscolher} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A GAVETA de uma área de Configurar ou de Resultados (issue #189, pai #183).
 *
 * Abre por cima da tela, ao lado da faixa, com o fundo escurecido, e traz as telas da
 * área agrupadas por tarefa — cada uma com o nome, o termo técnico e a frase do que
 * faz — em duas colunas (uma só quando ela não tem largura). Fecha pelo «×», por Esc,
 * por um clique fora e ao escolher uma tela.
 *
 * É um DIÁLOGO de verdade (Radix): o foco fica preso dentro enquanto está aberta, o
 * leitor de tela anuncia o nome da área, e o foco volta ao botão da faixa que a abriu
 * (`aoDevolverFoco`). Toda animação é `motion-safe:`.
 *
 * Não decide quem vê o quê: recebe a entrada já projetada (`faixaDoMenu`), e grupo
 * sem tela visível nem chega aqui.
 */
export function GavetaDaArea({
  entrada,
  hrefAtual,
  aoFechar,
  aoDevolverFoco,
}: {
  /** A área aberta, ou `null` com a gaveta fechada. */
  entrada: EntradaDaFaixa | null;
  /** O endereço da tela atual (`telaAtual`): uma só, a mais específica. */
  hrefAtual: string | null;
  aoFechar: () => void;
  aoDevolverFoco: () => void;
}) {
  const t = useT();
  const configurar = entrada ? entrada.id !== "resultados" : false;
  return (
    <DialogPrimitive.Root open={entrada !== null} onOpenChange={(aberta) => !aberta && aoFechar()}>
      <DialogPrimitive.Portal>
        {/* O fundo cobre a tela e deixa a faixa livre: ela é a âncora de onde a gaveta saiu. */}
        <DialogPrimitive.Overlay className="motion-safe:animate-in motion-safe:fade-in-0 fixed inset-y-0 right-0 left-20 z-50 bg-overlay" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            aoDevolverFoco();
          }}
          className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 @container fixed inset-y-0 left-20 z-50 flex w-[min(43.75rem,calc(100vw-6rem))] flex-col rounded-r-2xl border-r bg-card shadow-xl focus-visible:outline-hidden"
        >
          <header className="flex items-start gap-2 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg leading-tight font-semibold">
                {entrada ? t(entrada.label) : null}
              </DialogPrimitive.Title>
              {configurar ? (
                <p className="text-sm text-muted-foreground">{t("Configurar")}</p>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={t("Fechar")}
              title={t("Fechar")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-subtle hover:bg-accent-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {entrada?.grupos.map((g) => (
              <GrupoDaGaveta key={g.id} grupo={g} hrefAtual={hrefAtual} aoEscolher={aoFechar} />
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

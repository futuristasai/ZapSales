"use client";
import { useState } from "react";

import { AvisoDeConexaoNaFaixa } from "@/components/shell/AvisoDeConexaoNaFaixa";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { MenuDaConta } from "@/components/shell/MenuDaConta";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useMarcaDaBarra } from "@/components/shell/useMarcaDaBarra";
import { SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { useT } from "@/hooks/i18n/useT";
import type { EntradaDaFaixa, EntradaDaFaixaId, FaixaProjetada } from "@/lib/navigation/faixa";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A classe de todo botão da faixa. A faixa é uma ilha ESCURA nos dois temas (o
 * `data-theme="dark"` de `NavegacaoDoComputador`), então `text-muted-foreground`,
 * `text-foreground` e `bg-accent` aqui já são os do escuro — e a cor de destaque é a
 * da marca resolvida, nunca um valor fixo.
 */
const BOTAO =
  "relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-xs leading-tight text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export function MarcaDaFaixa() {
  const { nome, marcaDoProduto, icone, inicial } = useMarcaDaBarra();
  // O logo comprido do revendedor não cabe em 80px: ele mora no topo da tela
  // (`TopBar`). Aqui fica o que cabe — o símbolo do produto, o ícone que a
  // instalação subiu ou a inicial do nome.
  if (marcaDoProduto) return <SimboloDoProduto nome={nome} decorativo className="h-9 w-9" />;
  if (icone) {
    // <img> em vez de next/image de propósito: a URL vem de quem hospeda (banco ou
    // .env), e next/image exige allowlist de domínios fechada em build.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icone} alt="" aria-hidden className="h-9 w-9 rounded-md object-contain" />;
  }
  return (
    <span aria-hidden className="text-xl font-bold text-primary">
      {/* Spread e não `[0]`: nome começando com emoji ou acento composto quebraria
          no meio do code point. */}
      {[...nome][0]?.toUpperCase() ?? inicial}
    </span>
  );
}

function BotaoDaEntrada({
  entrada,
  apertado,
  atual,
  aoEscolher,
}: {
  entrada: EntradaDaFaixa;
  apertado: boolean;
  atual: boolean;
  aoEscolher: (id: EntradaDaFaixaId, gatilho: HTMLButtonElement) => void;
}) {
  const t = useT();
  const Icone = entrada.icone;
  const temFila = entrada.grupos.some((g) => g.itens.some((i) => i.contador === "fila"));
  const temSaude = entrada.grupos.some((g) => g.itens.some((i) => i.healthDot));
  return (
    <button
      type="button"
      data-entrada={entrada.id}
      aria-pressed={String(apertado) as "true" | "false"}
      aria-current={atual ? "true" : undefined}
      onClick={(e) => aoEscolher(entrada.id, e.currentTarget)}
      className={cn(
        BOTAO,
        apertado && "bg-accent/25 font-bold text-foreground",
        // «Aqui», sem cor: uma barra no canto, além do `aria-current`.
        atual &&
          "before:absolute before:top-2 before:bottom-2 before:-left-1.5 before:w-[3px] before:rounded-r-full before:bg-accent",
      )}
    >
      <Icone size={24} weight={apertado ? "fill" : "regular"} aria-hidden />
      <span>{t(entrada.label)}</span>
      {/* O ícone de Todo dia mostra SÓ a fila de conversas (Aguardando Humano fica na lista). */}
      {entrada.id === "todo-dia" && temFila ? <ContadorDaFila compacto={false} naFaixa /> : null}
      {temSaude ? <AvisoDeConexaoNaFaixa /> : null}
    </button>
  );
}

/**
 * A faixa do computador (issue #188): marca no topo, Todo dia, as quatro áreas de
 * Configurar, Resultados e, embaixo, Buscar e Você.
 *
 * Só desenha — as entradas vêm de `faixaDoMenu`, e quem guarda o que o painel
 * mostra é `NavegacaoDoComputador`.
 */
export function Faixa({
  faixa,
  escolhida,
  atual,
  aoEscolher,
  mostrarAtualizacao,
}: {
  faixa: FaixaProjetada;
  /** A entrada cujo painel está à vista (botão apertado), ou `null`. */
  escolhida: EntradaDaFaixaId | null;
  /** A entrada que guarda a tela em que a pessoa está. */
  atual: EntradaDaFaixaId | null;
  aoEscolher: (id: EntradaDaFaixaId, gatilho: HTMLButtonElement) => void;
  /** Painel recolhido: o aviso de atualização precisa de outro lugar para aparecer. */
  mostrarAtualizacao: boolean;
}) {
  const t = useT();
  const [buscando, setBuscando] = useState(false);
  const botao = (e: EntradaDaFaixa) => (
    <BotaoDaEntrada
      key={e.id}
      entrada={e}
      apertado={escolhida === e.id}
      atual={atual === e.id}
      aoEscolher={aoEscolher}
    />
  );
  return (
    <nav
      aria-label={t("Áreas do menu")}
      className="flex h-full w-20 shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto px-1.5 py-3"
    >
      <div className="mb-3 flex h-10 items-center justify-center">
        <MarcaDaFaixa />
      </div>
      {faixa.todoDia ? botao(faixa.todoDia) : null}
      {faixa.configurar.length > 0 && (
        <>
          <div role="separator" className="mx-2 mt-2 mb-1.5 h-px bg-white/15" />
          <p
            id="faixa-configurar"
            className="mb-1 text-center text-xs font-bold text-muted-foreground"
          >
            {t("Configurar")}
          </p>
          <div role="group" aria-labelledby="faixa-configurar" className="flex flex-col gap-0.5">
            {faixa.configurar.map(botao)}
          </div>
        </>
      )}
      {faixa.resultados ? (
        <>
          <div role="separator" className="mx-2 my-2 h-px bg-white/15" />
          {botao(faixa.resultados)}
        </>
      ) : null}
      <div className="min-h-2 flex-1" />
      <button type="button" onClick={() => setBuscando(true)} className={BOTAO}>
        <MagnifyingGlass size={24} aria-hidden />
        <span>{t("Buscar")}</span>
      </button>
      <MenuDaConta grupo={faixa.conta} className={BOTAO} />
      {mostrarAtualizacao ? <VersionFooter collapsed soAtualizacao /> : null}
      <CommandPalette open={buscando} onOpenChange={setBuscando} />
    </nav>
  );
}

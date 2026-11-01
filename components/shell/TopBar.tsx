"use client";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MarcaDaFaixa } from "./Faixa";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";
import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { useMarcaDaBarra } from "@/components/shell/useMarcaDaBarra";
import { cn } from "@/lib/utils";

/**
 * A marca por extenso no topo — "ZapSales by Futuristas" ou o logo do revendedor.
 *
 * A faixa do computador tem 80px (issue #188) e só comporta o símbolo, então o nome
 * e o logo ficam aqui. É a mesma marca que a faixa resolve (`useMarcaDaBarra`):
 *  - a do produto → o logotipo desenhado em SVG;
 *  - logo configurado (da organização ou da instalação) → a imagem, com a arte do
 *    tema escuro quando existe e a proteção de contraste quando não existe;
 *  - só nome → o nome em texto.
 *
 * Só no computador: no celular o topo é apertado e fica só o símbolo (`SimboloNoCelular`).
 */
export function MarcaNoTopo() {
  const { nome, logo, logoEscuro, marcaDoProduto } = useMarcaDaBarra();
  if (marcaDoProduto)
    return (
      <div data-testid="marca-no-topo" className="hidden md:block">
        <LogotipoDoProduto nome={nome} className="h-9 w-auto" />
      </div>
    );
  if (logo || logoEscuro) {
    return (
      <div
        data-testid="marca-no-topo"
        className={cn(
          "hidden rounded-md md:block",
          !logoEscuro && "dark:bg-white dark:px-2 dark:py-1 dark:shadow-sm",
        )}
      >
        {/* <img> em vez de next/image de propósito: a URL vem de quem hospeda (banco ou
            .env), e next/image exige allowlist de domínios fechada em build. Altura
            fixa e largura livre porque a arte enviada tem proporção desconhecida. */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nome}
            className={cn("h-7 w-auto max-w-[10rem] object-contain", logoEscuro && "dark:hidden")}
          />
        ) : (
          <span className="dark:hidden">{nome}</span>
        )}
        {logoEscuro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoEscuro}
            alt={nome}
            className="hidden h-7 w-auto max-w-[10rem] object-contain dark:block"
          />
        ) : null}
      </div>
    );
  }
  return (
    <span data-testid="marca-no-topo" className="hidden font-semibold tracking-tight md:block">
      {nome}
    </span>
  );
}

/**
 * No celular a navegação é a barra de baixo (issue #190), e o topo guarda a marca, a busca e o
 * menu da conta. O símbolo é o mesmo da faixa do computador (`MarcaDaFaixa`): o logo comprido do
 * revendedor não cabe em 390 px ao lado dos botões.
 */
function SimboloNoCelular() {
  return (
    <div
      data-testid="marca-no-celular"
      className="flex h-9 w-9 shrink-0 items-center justify-center md:hidden"
    >
      <MarcaDaFaixa />
    </div>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SimboloNoCelular />
        <MarcaNoTopo />
        <TenantSwitcher />
      </div>
      <div className="flex min-w-0 flex-1 justify-center md:max-w-md">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <UserMenu />
      </div>
    </header>
  );
}

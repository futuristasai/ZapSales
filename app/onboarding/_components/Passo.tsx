import type { ReactNode } from "react";

import { Selo } from "@/components/ui/selo";
import type { Idioma } from "@/lib/i18n/idiomas";
import { AJUDA_DOS_PASSOS, preencher, textoDoPasso, textosDaCasca } from "@/lib/onboarding/ajuda";
import { passosVisiveis } from "@/lib/onboarding/passos";
import { Clock, Lifebuoy } from "@/lib/ui/icons";

import { AjudaDoPasso } from "./AjudaDoPasso";
import { TITULO } from "./fonte";
import { ICONE_DO_PASSO } from "./icones";

/**
 * A MOLDURA DE UM PASSO: o mesmo cabeçalho, a mesma ajuda e o mesmo ritmo em todas as telas do
 * assistente.
 *
 * O cabeçalho diz o que a pessoa precisa para decidir ANTES de ler o formulário — em que ponto está,
 * quanto tempo leva e se pode ficar para depois — e tem uma âncora visual forte: um ladrilho com o
 * ícone do passo na cor da marca, o título grande na fonte de título (`fonte.ts`) e, à direita, o
 * número do passo em tamanho de pôster, só como contorno (a sequência carrega informação aqui: é
 * «passo 3 de 6»). Tamanho, peso e cor mudam de um nível para o outro de propósito: quem nunca viu o
 * sistema acha o título, depois a frase, depois o formulário, sem ler nada para descobrir a ordem.
 *
 * Estrutura: o cabeçalho ocupa a largura toda; abaixo, o conteúdo e a ajuda. A ajuda vem DEPOIS do
 * conteúdo no HTML (leitor de tela e celular chegam primeiro ao formulário) e só sobe para a coluna
 * da direita no `xl`, por posição de grade — um bloco só no DOM, sem duplicar texto.
 *
 * O título continua um `h2`: o `h1` é o nome da organização, no layout.
 */
export function Passo({
  segmento,
  titulo,
  descricao,
  idioma,
  children,
}: {
  segmento: string;
  titulo: string;
  descricao: string;
  idioma: Idioma;
  children: ReactNode;
}) {
  const passos = passosVisiveis();
  const indice = passos.findIndex((p) => p.segmento === segmento);
  const meta = AJUDA_DOS_PASSOS[segmento];
  const textos = textosDaCasca(idioma);
  const ajuda = textoDoPasso(segmento, idioma);
  const Icone = ICONE_DO_PASSO[segmento];

  return (
    <div className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <header className="relative xl:col-span-2">
        {indice >= 0 ? (
          <span
            aria-hidden
            className={`${TITULO} pointer-events-none absolute -top-4 right-0 hidden text-[7.5rem] leading-none text-transparent select-none [-webkit-text-stroke:2px_color-mix(in_srgb,var(--primary)_28%,transparent)] md:block`}
          >
            {String(indice + 1).padStart(2, "0")}
          </span>
        ) : null}
        <div className="relative flex items-start gap-4 sm:gap-5">
          {Icone ? (
            <span
              aria-hidden
              className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_28px_-10px_color-mix(in_srgb,var(--primary)_85%,transparent)] sm:h-14 sm:w-14"
            >
              <Icone size={28} weight="fill" />
            </span>
          ) : null}
          <div className="min-w-0 space-y-3 md:pr-36">
            <h2
              className={`${TITULO} max-w-[22ch] text-[2rem] leading-[1.05] text-balance sm:text-5xl`}
            >
              {titulo}
            </h2>
            <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
              {descricao}
            </p>
          </div>
        </div>
        {meta && indice >= 0 ? (
          <ul className="relative mt-5 flex flex-wrap items-center gap-2">
            <li className="lg:hidden">
              <Selo className="bg-primary/12 text-primary">
                {preencher(textos.passoDe, { n: indice + 1, total: passos.length })}
              </Selo>
            </li>
            <li>
              {/* Âmbar é a cor de espera e de tempo no produto (DESIGN.md: «funil»). */}
              <Selo significado="funil">
                <Clock aria-hidden size={12} weight="bold" />
                {preencher(textos.chipMinutos, { n: meta.minutos })}
              </Selo>
            </li>
            <li>
              {meta.podePular ? (
                <Selo>{textos.chipPulavel}</Selo>
              ) : (
                <Selo className="bg-foreground text-background">{textos.chipObrigatorio}</Selo>
              )}
            </li>
            {ajuda ? (
              <li className="xl:hidden">
                <a
                  href="#ajuda-do-passo"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Lifebuoy aria-hidden size={14} weight="bold" />
                  {textos.irParaAjuda}
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}
      </header>

      <div className="min-w-0 space-y-6">{children}</div>

      {ajuda ? <AjudaDoPasso texto={ajuda} textos={textos} /> : null}
    </div>
  );
}

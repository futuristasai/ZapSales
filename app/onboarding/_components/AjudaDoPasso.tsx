import type { TextoDoPasso, TextosDaCasca } from "@/lib/onboarding/ajuda";
import { CaretDown, Lightbulb } from "@/lib/ui/icons";

import { TITULO } from "./fonte";

/**
 * A AJUDA DETALHADA DO PASSO: para que serve, como preencher, as dúvidas que aparecem de verdade e
 * o que acontece se ficar para depois.
 *
 * É texto, não decoração. Cada bloco responde uma pergunta que quem instala faz parado diante do
 * campo — e as respostas moram em `lib/onboarding/ajuda.ts`, nos três idiomas, ao lado de quem as
 * confere com a tela.
 *
 * Visualmente é a «voz de quem ajuda»: um cartão tingido com a cor de destaque da marca (a mesma do
 * ladrilho do passo), com os números do «como preencher» em bolinhas cheias — o olho acha a lista de
 * passos antes de ler. As dúvidas usam `<details>` nativo: abre com teclado, funciona sem JavaScript e
 * não pesa no pacote. Ficam fechadas — a pergunta basta para a pessoa reconhecer a sua.
 */
export function AjudaDoPasso({ texto, textos }: { texto: TextoDoPasso; textos: TextosDaCasca }) {
  return (
    <aside
      id="ajuda-do-passo"
      aria-labelledby="ajuda-do-passo-titulo"
      className="scroll-mt-20 space-y-6 rounded-3xl border border-primary/20 bg-primary/[0.06] p-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto"
    >
      <h3 id="ajuda-do-passo-titulo" className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
        >
          <Lightbulb size={22} weight="fill" />
        </span>
        <span className={`${TITULO} text-xl leading-tight`}>{textos.ajudaDoPasso}</span>
      </h3>

      <section className="space-y-2">
        <h4 className="text-sm font-bold">{textos.paraQueServe}</h4>
        <p className="text-[0.9375rem] leading-relaxed text-foreground/80">{texto.paraQueServe}</p>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold">{textos.comoPreencher}</h4>
        <ol className="space-y-3">
          {texto.comoPreencher.map((linha, i) => (
            <li
              key={linha}
              className="flex gap-3 text-[0.9375rem] leading-relaxed text-foreground/80"
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-medium text-primary-foreground tabular-nums"
              >
                {i + 1}
              </span>
              <span>{linha}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold">{textos.duvidas}</h4>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
          {texto.duvidas.map((d) => (
            <details key={d.pergunta} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[0.9375rem] leading-snug font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                <span>{d.pergunta}</span>
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                >
                  <CaretDown size={12} weight="bold" />
                </span>
              </summary>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
                {d.resposta}
              </p>
            </details>
          ))}
        </div>
      </section>

      {texto.seDeixarParaDepois ? (
        <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-xs">
          <h4 className="text-sm font-bold">{textos.seDeixarParaDepois}</h4>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {texto.seDeixarParaDepois}
          </p>
        </section>
      ) : null}
    </aside>
  );
}

"use client";

import type { ComponentType, ReactNode } from "react";

import { Check, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { TITULO } from "./fonte";

export interface PontoDaOpcao {
  /** `bom` é o que a opção entrega; `atencao` é o que a pessoa precisa saber antes de escolher. */
  tipo: "bom" | "atencao";
  texto: string;
}

type Icone = ComponentType<{
  size?: number;
  weight?: "fill" | "bold" | "duotone";
  className?: string;
}>;

/**
 * UMA ESCOLHA DO ASSISTENTE: o cartão de opção, com a ajuda do lado da decisão.
 *
 * É o `<label>` envolvendo um radio nativo que o resto do produto já usa — não é `RadioGroup`, esse
 * componente não existe aqui, e trazê-lo criaria outro dialeto de escolha. O radio continua no DOM
 * (leitor de tela, teclado e testes o enxergam); só o desenho dele é trocado por um marcador grande,
 * que enche com a cor da marca e um «✓» quando a opção é a escolhida. A escolha é VISÍVEL de longe:
 * borda grossa, fundo tingido, sombra da cor de destaque e o ladrilho do ícone aceso.
 *
 * Duas camadas de ajuda, porque quem escolhe precisa de coisas diferentes em cada momento:
 *
 *  - `pontos`: SEMPRE visíveis. São o que separa uma opção da outra («bom para», «atenção»), para
 *    quem compara antes de clicar.
 *  - `detalhe`: aparece só quando a opção está marcada, dentro do próprio cartão e separado por um
 *    filete — a explicação de quem já escolheu e quer saber o que vai acontecer.
 */
export function Opcao({
  nome,
  valor,
  marcada,
  onEscolher,
  titulo,
  descricao,
  icone: Icone,
  pontos,
  detalhe,
  idDoCartao,
  idDoRadio,
  rotuloDoRadio,
  className,
}: {
  nome: string;
  valor: string;
  marcada: boolean;
  onEscolher: () => void;
  titulo: string;
  descricao?: string;
  icone?: Icone;
  pontos?: readonly PontoDaOpcao[];
  detalhe?: ReactNode;
  /** `data-testid` do cartão (o `<label>`). */
  idDoCartao?: string;
  /** `data-testid` do radio. */
  idDoRadio?: string;
  rotuloDoRadio?: string;
  className?: string;
}) {
  return (
    <label
      data-testid={idDoCartao}
      data-marcada={marcada ? "sim" : "nao"}
      className={cn(
        "group relative flex cursor-pointer items-start gap-4 rounded-2xl border-2 bg-surface p-4 transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out sm:p-5",
        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30",
        marcada
          ? "border-primary bg-primary/[0.06] shadow-[0_12px_30px_-16px_color-mix(in_srgb,var(--primary)_75%,transparent)]"
          : "border-border hover:-translate-y-px hover:border-primary/45 hover:shadow-sm motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {/* O radio de verdade fica POR CIMA do marcador desenhado: transparente, mas com o mesmo tamanho e
          clicável (leitor de tela, teclado e testes de tela o enxergam e clicam nele); só o desenho
          — vazio com contorno, cheio e com «✓» — é trocado. O clique no cartão inteiro continua
          valendo, porque o cartão é o `<label>`. */}
      <span className="relative mt-0.5 h-6 w-6 shrink-0">
        <input
          type="radio"
          name={nome}
          value={valor}
          checked={marcada}
          onChange={onEscolher}
          aria-label={rotuloDoRadio}
          data-testid={idDoRadio}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
            marcada
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-surface group-hover:border-primary/60",
          )}
        >
          {marcada ? <Check size={14} weight="bold" /> : null}
        </span>
      </span>
      {Icone ? (
        <span
          aria-hidden
          className={cn(
            "hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors sm:flex",
            marcada ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
          )}
        >
          <Icone size={24} weight={marcada ? "fill" : "duotone"} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn(TITULO, "block text-lg leading-snug")}>{titulo}</span>
        {descricao ? (
          <span className="mt-1 block text-[0.9375rem] leading-relaxed text-muted-foreground">
            {descricao}
          </span>
        ) : null}

        {pontos && pontos.length > 0 ? (
          <span className="mt-3.5 block space-y-2">
            {pontos.map((p) => (
              <span key={p.texto} className="flex items-start gap-2.5 text-sm leading-snug">
                {p.tipo === "bom" ? (
                  <span
                    aria-hidden
                    className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-fg"
                  >
                    <Check size={12} weight="bold" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-fg"
                  >
                    <Warning size={12} weight="bold" />
                  </span>
                )}
                <span className={p.tipo === "bom" ? "text-foreground" : "text-muted-foreground"}>
                  {p.texto}
                </span>
              </span>
            ))}
          </span>
        ) : null}

        {marcada && detalhe ? (
          <span className="mt-4 block space-y-2 rounded-xl bg-primary/[0.07] p-3.5 text-sm leading-relaxed text-muted-foreground">
            {detalhe}
          </span>
        ) : null}
      </span>
    </label>
  );
}

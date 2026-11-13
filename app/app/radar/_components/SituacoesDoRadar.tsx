"use client";
import type { ComponentType } from "react";

import { useT } from "@/hooks/i18n/useT";
import type { AtRiskData } from "@/hooks/leads/useAtRiskLeads";
import {
  FileText,
  ListChecks,
  PaperPlaneTilt,
  PencilSimple,
  Signpost,
  Warning,
  WarningOctagon,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { contagemDaVisao, type VisaoDoRadar } from "./visao-do-radar";

type Icone = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

interface Cartao {
  visao: VisaoDoRadar;
  rotulo: string;
  dica: string;
  icone: Icone;
  /** Cor do ícone e do número quando há o que ver. */
  tom: string;
}

/** Os negócios parados no funil: sempre visíveis, mesmo zerados. */
const NEGOCIOS: readonly Cartao[] = [
  {
    visao: "todos",
    rotulo: "Todos",
    dica: "Tudo que esfriou",
    icone: ListChecks,
    tom: "text-text",
  },
  {
    visao: "critico",
    rotulo: "Crítico",
    dica: "Parado demais",
    icone: WarningOctagon,
    tom: "text-error-fg",
  },
  {
    visao: "em_risco",
    rotulo: "Em risco",
    dica: "Esfriando",
    icone: Warning,
    tom: "text-warning-fg",
  },
  {
    visao: "em_voo",
    rotulo: "Em voo",
    dica: "Com retorno marcado",
    icone: PaperPlaneTilt,
    tom: "text-info-fg",
  },
];

/** O que não é negócio parado mas também espera alguém: só aparece quando há. */
const OUTRAS: readonly Cartao[] = [
  {
    visao: "sem_proximo_passo",
    rotulo: "Sem próximo passo",
    dica: "Demandas sem nada combinado",
    icone: Signpost,
    tom: "text-warning-fg",
  },
  {
    visao: "propostas_vencidas",
    rotulo: "Propostas vencidas",
    dica: "O cliente não decidiu",
    icone: FileText,
    tom: "text-warning-fg",
  },
  {
    visao: "propostas_para_revisar",
    rotulo: "Propostas para revisar",
    dica: "Rascunhos da IA",
    icone: PencilSimple,
    tom: "text-warning-fg",
  },
];

/**
 * Os contadores do radar, que agora ESCOLHEM a lista. Eram três etiquetas
 * (`Badge`) com cara de filtro e sem clique; quem clicava em "80 em voo" não
 * via nada mudar. Cada cartão é um botão de alternância (`aria-pressed`), e só
 * um fica ligado por vez.
 */
export function SituacoesDoRadar({
  dados,
  ativa,
  onEscolher,
}: {
  dados: AtRiskData;
  ativa: VisaoDoRadar;
  onEscolher: (visao: VisaoDoRadar) => void;
}) {
  const t = useT();
  const outras = OUTRAS.filter((c) => contagemDaVisao(dados, c.visao) > 0 || c.visao === ativa);

  return (
    <div className="flex flex-col gap-3" data-testid="radar-counts">
      <div
        role="group"
        aria-label={t("Negócios parados no funil")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {NEGOCIOS.map((c) => (
          <CartaoDeSituacao
            key={c.visao}
            cartao={c}
            quantos={contagemDaVisao(dados, c.visao)}
            ativo={ativa === c.visao}
            onEscolher={onEscolher}
          />
        ))}
      </div>

      {outras.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-text-muted" id="radar-outras-pendencias">
            {t("Também pedem atenção")}
          </p>
          <div
            role="group"
            aria-labelledby="radar-outras-pendencias"
            className="flex flex-wrap gap-2"
          >
            {outras.map((c) => (
              <PendenciaExtra
                key={c.visao}
                cartao={c}
                quantos={contagemDaVisao(dados, c.visao)}
                ativo={ativa === c.visao}
                onEscolher={onEscolher}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface PropsDoCartao {
  cartao: Cartao;
  quantos: number;
  ativo: boolean;
  onEscolher: (visao: VisaoDoRadar) => void;
}

const FOCO =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

function CartaoDeSituacao({ cartao, quantos, ativo, onEscolher }: PropsDoCartao) {
  const t = useT();
  const Icone = cartao.icone;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      data-testid={`radar-filtro-${cartao.visao}`}
      onClick={() => onEscolher(cartao.visao)}
      className={cn(
        "flex min-h-11 flex-col items-start gap-1 rounded-lg border p-3 text-left",
        "transition-colors duration-fast ease-out",
        FOCO,
        ativo
          ? "border-accent bg-accent-soft shadow-xs"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-elevated",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <Icone size={15} className={quantos > 0 ? cartao.tom : "text-text-subtle"} aria-hidden />
        {t(cartao.rotulo)}
      </span>
      <span
        className={cn(
          "text-2xl leading-7 font-semibold tabular-nums",
          quantos > 0 ? cartao.tom : "text-text-subtle",
        )}
      >
        {quantos}
      </span>
      {/* No celular a dica sai: quatro cartões em duas fileiras já tomam a
          primeira tela, e o rótulo mais o número dizem o essencial. */}
      <span className="hidden text-xs text-text-muted sm:block">{t(cartao.dica)}</span>
    </button>
  );
}

function PendenciaExtra({ cartao, quantos, ativo, onEscolher }: PropsDoCartao) {
  const t = useT();
  const Icone = cartao.icone;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      data-testid={`radar-filtro-${cartao.visao}`}
      onClick={() => onEscolher(cartao.visao)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm lg:min-h-9",
        "transition-colors duration-fast ease-out",
        FOCO,
        ativo
          ? "border-accent bg-accent-soft shadow-xs"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-elevated",
      )}
    >
      <Icone size={16} className={cartao.tom} aria-hidden />
      <span className={cn("font-semibold tabular-nums", cartao.tom)}>{quantos}</span>
      <span className="font-medium text-text">{t(cartao.rotulo)}</span>
      <span className="hidden text-xs text-text-muted sm:inline">· {t(cartao.dica)}</span>
    </button>
  );
}

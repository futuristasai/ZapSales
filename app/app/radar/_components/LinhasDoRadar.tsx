"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iniciaisDe } from "@/components/inbox/visual/AvatarDoContato";
import { useT } from "@/hooks/i18n/useT";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import type { AtRiskLead } from "@/hooks/leads/useAtRiskLeads";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import type {
  DemandaSemProximoPasso,
  PropostaEsperandoRevisao,
  PropostaVencidaSemRetomada,
  SituacaoNoRadar,
} from "@/lib/leads/radar-de-risco";
import {
  CalendarBlank,
  ChatCircle,
  ClockCountdown,
  FileText,
  Kanban,
  PaperPlaneTilt,
  UserCheck,
  UserCircle,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { destinosDaLinha, tempoDecorrido } from "./visao-do-radar";

const SITUACAO: Record<
  SituacaoNoRadar,
  {
    rotulo: string;
    selo: "error" | "warning" | "info";
    faixa: string;
    tempo: string;
    avatar: string;
  }
> = {
  critico: {
    rotulo: "Crítico",
    selo: "error",
    faixa: "bg-error",
    tempo: "font-medium text-error-fg",
    avatar: "bg-error-bg text-error-fg",
  },
  em_risco: {
    rotulo: "Em risco",
    selo: "warning",
    faixa: "bg-warning",
    tempo: "font-medium text-warning-fg",
    avatar: "bg-warning-bg text-warning-fg",
  },
  em_voo: {
    rotulo: "Em voo",
    selo: "info",
    faixa: "bg-info",
    tempo: "text-text-muted",
    avatar: "bg-info-bg text-info-fg",
  },
};

function followupWhen(iso: string, t: (texto: string) => string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return t("agora");
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 48) return `${t("em")} ${Math.max(1, hours)}h`;
  return `${t("em")} ${Math.round(hours / 24)}d`;
}

/**
 * O esqueleto de toda linha do radar — negócio, demanda ou proposta. Uma forma
 * só para as três listas: quem aprendeu a ler uma já sabe ler as outras.
 *
 * A área do texto é um link para o destino PRINCIPAL; os botões à direita
 * repetem esse destino por escrito e oferecem os outros. Nada de link dentro de
 * link: texto e botões são irmãos.
 */
function Linha({
  faixa,
  marca,
  href,
  children,
  acoes,
  ...resto
}: {
  /** Cor da faixa da esquerda: a urgência, lida antes de qualquer palavra. */
  faixa: string;
  /** O círculo da esquerda: iniciais de quem espera, ou o ícone do documento. */
  marca: ReactNode;
  href: string | null;
  children: ReactNode;
  acoes: ReactNode;
  "data-testid"?: string;
  "data-risk"?: string;
}) {
  const corpo = (
    <>
      {marca}
      <div className="min-w-0 flex-1">{children}</div>
    </>
  );
  return (
    <li
      {...resto}
      // `@3xl:` é consulta de CONTÊINER (a lista), não de janela: com o menu
      // lateral aberto a janela é larga e a lista não, e os botões espremiam o
      // nome. Abaixo de 768 px de LISTA os botões descem para baixo do texto.
      className="relative flex flex-col gap-2 py-3 pr-3 pl-5 transition-colors hover:bg-surface-elevated @3xl:flex-row @3xl:items-center @3xl:gap-3"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", faixa)} aria-hidden />
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-start gap-3 rounded-sm">
          {corpo}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{corpo}</div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] @3xl:pl-0">{acoes}</div>
    </li>
  );
}

function Iniciais({ nome, className }: { nome: string; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
    >
      {iniciaisDe(nome)}
    </span>
  );
}

/** Um dado de apoio da linha: ícone + texto, numa só unidade que não quebra. */
function Dado({
  icone,
  children,
  className,
}: {
  icone: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {icone}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Os dois botões de destino, com o nome de para onde levam. */
function BotoesDeDestino({ conversa, funil }: { conversa: string | null; funil: string | null }) {
  const t = useT();
  return (
    <>
      {conversa ? (
        <Button asChild size="sm" variant="secondary" data-testid="radar-abrir-conversa">
          <Link href={conversa}>
            <ChatCircle aria-hidden />
            {t("Abrir conversa")}
          </Link>
        </Button>
      ) : null}
      {funil ? (
        <Button
          asChild
          size="sm"
          variant={conversa ? "ghost" : "secondary"}
          data-testid="radar-ver-no-funil"
        >
          <Link href={funil}>
            <Kanban aria-hidden />
            {t("Ver no funil")}
          </Link>
        </Button>
      ) : null}
    </>
  );
}

export function LinhaDeNegocio({ lead }: { lead: AtRiskLead }) {
  const t = useT();
  const situacao = SITUACAO[lead.risk as SituacaoNoRadar] ?? SITUACAO.em_risco;
  const destinos = destinosDaLinha({
    conversation_id: lead.conversation_id,
    pipeline_id: lead.pipeline_id,
    lead_id: lead.id,
  });

  const claim = useClaimConversation();
  const qc = useQueryClient();

  // Dono do NEGÓCIO — humano OU agente (0070). Antes desta linha o radar lia só
  // `owner_user_id`, então um lead que a IA trabalha há dezenas de turnos aparecia
  // como "Sem dono" e mandava um humano resgatar o que já estava sendo tocado.
  // A distinção é a MESMA do card (OwnerBadge): geométrica, nunca ícone de robô —
  // uma fonte de verdade para "quem é o dono", em todas as telas.
  const dono =
    lead.owner_kind === "ai"
      ? `${t("Agente:")} ${lead.owner_agent_name ?? t("sem nome")}`
      : lead.owner_user_id || lead.assignee_kind === "user"
        ? t("Com atendente")
        : lead.assignee_kind === "ai"
          ? t("Assistente na conversa")
          : t("Sem dono");

  // "Assumir" é tirar da IA e trazer para si: continua valendo enquanto não há
  // dono HUMANO — dono agente não bloqueia o handoff, é justamente o caso dele.
  const ownedByHuman = Boolean(lead.owner_user_id) || lead.assignee_kind === "user";
  const canClaim = Boolean(lead.conversation_id) && !ownedByHuman;

  function handleClaim() {
    if (!lead.conversation_id) return;
    claim.mutate(
      { conversation_id: lead.conversation_id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["leads-at-risk"] });
          toast.success(t("Você assumiu a demanda"));
        },
      },
    );
  }

  // O NOME DA PESSOA é o que se procura na lista; o título do negócio explica
  // qual é o assunto. Sem contato, o título é tudo o que há e sobe para o lugar
  // do nome.
  const nome = lead.contact_name ?? lead.title;
  const ondeEsta = [lead.pipeline_name, lead.stage_name].filter(Boolean).join(" › ");

  return (
    <Linha
      data-testid="radar-item"
      data-risk={lead.risk}
      faixa={situacao.faixa}
      href={destinos.principal}
      marca={<Iniciais nome={nome} className={situacao.avatar} />}
      acoes={
        <>
          {canClaim ? (
            <Button
              size="sm"
              variant="outline"
              disabled={claim.isPending}
              onClick={handleClaim}
              data-testid="radar-claim"
            >
              <UserCheck aria-hidden />
              {t("Assumir")}
            </Button>
          ) : null}
          <BotoesDeDestino conversa={destinos.conversa} funil={destinos.funil} />
          {lead.agenda?.appointment_id ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/app/agenda?compromisso=${lead.agenda.appointment_id}`}>
                <CalendarBlank aria-hidden />
                {t("Ver compromisso")}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      {/* `div`, não `p`: o selo (`Badge`) é um `div`, e `div` dentro de `p` é HTML
          inválido — o navegador fecha o parágrafo antes e a hidratação reclama. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-semibold text-text" data-testid="radar-nome">
          {nome}
        </span>
        <Badge variant={situacao.selo} className="shrink-0 px-2 py-0 text-[11px]">
          {t(situacao.rotulo)}
        </Badge>
      </div>
      {lead.contact_name ? <p className="truncate text-sm text-text-muted">{lead.title}</p> : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <Dado icone={<ClockCountdown size={13} aria-hidden />} className={situacao.tempo}>
          {t("Parado há")} {tempoDecorrido(lead.hours_since_activity, t)}
        </Dado>
        {ondeEsta ? <Dado icone={<Kanban size={13} aria-hidden />}>{ondeEsta}</Dado> : null}
        <Dado icone={<UserCircle size={13} aria-hidden />}>
          <span data-testid="radar-assignee">{dono}</span>
        </Dado>
        {/* O RETORNO fecha a linha: é a resposta a "alguém vai voltar a falar com ele?". */}
        {lead.agenda?.appointment_id ? (
          <Dado icone={<CalendarBlank size={13} aria-hidden />} className="text-info-fg">
            {t(
              lead.agenda.motivo === "presenca_vencida"
                ? "Presença não confirmada · revise o compromisso"
                : lead.agenda.motivo === "presenca_pendente"
                  ? "Confirme a presença · cobrança aguardando"
                  : "Compromisso agendado · cobrança aguardando",
            )}
          </Dado>
        ) : lead.in_flight && lead.next_followup_at ? (
          <Dado icone={<PaperPlaneTilt size={13} aria-hidden />} className="text-info-fg">
            {t("Assistente retorna")} {followupWhen(lead.next_followup_at, t)}
          </Dado>
        ) : (
          <Dado icone={<Warning size={13} aria-hidden />} className="text-warning-fg">
            {t("Sem retorno agendado")}
          </Dado>
        )}
        {destinos.conversa ? null : <span>{t("Ainda sem conversa")}</span>}
      </p>
    </Linha>
  );
}

export function LinhaDeDemanda({ demanda }: { demanda: DemandaSemProximoPasso }) {
  const t = useT();
  const nome = demanda.contact_name ?? t("Contato sem nome");
  const destinos = destinosDaLinha(demanda);
  // Sem conversa e sem negócio ainda há a ficha da pessoa: nenhuma linha fica sem saída.
  const contato = `/app/contacts/${demanda.contact_id}`;
  return (
    <Linha
      data-testid="radar-demanda"
      faixa="bg-warning"
      href={destinos.principal ?? contato}
      marca={<Iniciais nome={nome} className="bg-warning-bg text-warning-fg" />}
      acoes={
        destinos.principal ? (
          <BotoesDeDestino conversa={destinos.conversa} funil={destinos.funil} />
        ) : (
          <Button asChild size="sm" variant="secondary">
            <Link href={contato}>
              <UserCircle aria-hidden />
              {t("Ver contato")}
            </Link>
          </Button>
        )
      }
    >
      <p className="truncate text-sm font-semibold text-text">{nome}</p>
      {demanda.assunto ? (
        <p className="truncate text-sm text-text-muted">{demanda.assunto}</p>
      ) : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <Dado
          icone={<ClockCountdown size={13} aria-hidden />}
          className="font-medium text-warning-fg"
        >
          {t("Aberta há")} {tempoDecorrido(demanda.horas_aberta, t)}
        </Dado>
        <Dado icone={<Warning size={13} aria-hidden />}>{t("Ninguém marcou o próximo passo")}</Dado>
      </p>
    </Linha>
  );
}

function IconeDeProposta() {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-fg"
    >
      <FileText size={18} />
    </span>
  );
}

function BotaoDaProposta({ href }: { href: string }) {
  const t = useT();
  return (
    <Button asChild size="sm" variant="secondary">
      <Link href={href}>
        <FileText aria-hidden />
        {t("Abrir proposta")}
      </Link>
    </Button>
  );
}

export function LinhaDePropostaVencida({ proposta }: { proposta: PropostaVencidaSemRetomada }) {
  const t = useT();
  const idioma = useIdioma();
  const href = `/app/proposals/${proposta.proposal_id}`;
  // `valid_until` é uma DATA sem hora: ao meio-dia para o fuso de quem lê não
  // empurrar o dia para a véspera.
  const venceu = proposta.valid_until
    ? new Date(`${proposta.valid_until}T12:00:00`).toLocaleDateString(tagDeIdioma(idioma))
    : null;
  return (
    <Linha
      faixa="bg-warning"
      href={href}
      marca={<IconeDeProposta />}
      acoes={<BotaoDaProposta href={href} />}
    >
      <p className="truncate text-sm font-semibold text-text">
        {proposta.numero != null && proposta.ano != null
          ? `${String(proposta.numero).padStart(4, "0")}/${proposta.ano}`
          : t("Proposta sem número")}
      </p>
      {venceu ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <Dado
            icone={<ClockCountdown size={13} aria-hidden />}
            className="font-medium text-warning-fg"
          >
            {t("Venceu em")} {venceu}
          </Dado>
        </p>
      ) : null}
    </Linha>
  );
}

export function LinhaDePropostaParaRevisar({ proposta }: { proposta: PropostaEsperandoRevisao }) {
  const t = useT();
  const href = `/app/proposals/${proposta.proposal_id}`;
  return (
    <Linha
      faixa="bg-warning"
      href={href}
      marca={<IconeDeProposta />}
      acoes={<BotaoDaProposta href={href} />}
    >
      <p className="truncate text-sm font-semibold text-text">
        {proposta.titulo ?? t("Proposta sem título")}
      </p>
      {proposta.contact_name ? (
        <p className="truncate text-sm text-text-muted">{proposta.contact_name}</p>
      ) : null}
    </Linha>
  );
}

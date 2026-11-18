"use client";
/**
 * O que o agente pode fazer — na língua de quem contrata um agente, não na de
 * quem escreve um.
 *
 * Antes desta tela o humano via `crm_move_lead_stage` em fonte monoespaçada,
 * agrupado por "Leitura / Escrita / Especiais". Isso descreve o código, não a
 * decisão: quem configura é dono de clínica, de loja, de imobiliária, e a
 * pergunta dele é "o que essa coisa vai fazer com meus clientes?".
 *
 * O caminho padrão é o PACOTE por jornada, e cada pacote ABRE e mostra as próprias
 * capacidades, separadas pelo tamanho do efeito (só consulta, altera dados, sem
 * volta), com a explicação, um exemplo de conversa, em que parte do sistema mexe e
 * quanto foi usada. Não há mais "modo avançado": era uma lista solta de 70 linhas,
 * sem grupo, que o dono do produto leu como a "aba Capacidades" que o aviso citava.
 * Quem procura uma capacidade pelo nome usa a busca do topo.
 *
 * Os avisos (acima do recomendado, capacidades parecidas) ficam numa faixa só, com a
 * contagem: eram três caixas empilhadas antes de qualquer pacote.
 *
 * As ferramentas externas NÃO moram aqui: são a seção seguinte do editor
 * (`FerramentasExternasDoAgente`). Elas só entram nesta tela como número, porque
 * ocupam o mesmo prompt e somam na contagem.
 *
 * A regra de quem entra por pacote NÃO mora aqui: vive em
 * `lib/mcp/tools/selecao-por-pacote.ts`, com teste. O componente chama e
 * renderiza. Regra dentro de `onChange` é regra que nunca é exercitada.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CaretDown,
  ChatCircle,
  Check,
  Eye,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Warning,
} from "@/lib/ui/icons";
import { SeloRecomendado } from "@/components/guia/FaixaRecomendada";
import { Selo } from "@/components/ui/selo";
import type { CapacidadeComUso } from "@/lib/ai/agents/uso-de-capacidades";
import {
  PACOTES,
  riscoMeta,
  type ToolBundle,
  type ToolRisk,
} from "@/lib/mcp/tools/pacotes";
import {
  TETO_MAXIMO_POR_AGENTE,
  TETO_RECOMENDADO_POR_AGENTE,
  acimaDoRecomendado,
  capacidadesAutomaticasDoPacote,
  capacidadesCriticasDoPacote,
  desligarPacote,
  estadoDoPacote,
  ligarPacote,
  vagasExigidasPeloPacote,
  textoDaContagem,
  vagasRestantes,
  type CapacidadeSelecionavel,
} from "@/lib/mcp/tools/selecao-por-pacote";
import { sobreposicoesLigadas } from "@/lib/mcp/tools/sobreposicoes";
import { useAbrirAbaDoAgente } from "./abrir-aba";

/** O que a rota `/api/v1/mcp/tools` serve (snake_case no wire). */
export interface McpToolMeta extends CapacidadeSelecionavel {
  id: string;
  description: string;
  category: string;
  requires_role: string;
  requires_scope: string;
  rotulo: string;
  explicacao: string;
  o_que_toca: string;
  risco: ToolRisk;
  pacotes: ReadonlyArray<ToolBundle>;
  /** `false` = capacidade do harness: mostra, explica e não deixa marcar. */
  marcavel: boolean;
  motivo_nao_marcavel: string | null;
  /** Uma conversa curta que mostra quando ela entra em ação (`exemplos-de-conversa.ts`). */
  exemplo?: string | null;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /**
   * Capacidades que ESTE papel não recebe no runtime, marcadas ou não (ex.:
   * `FORA_DO_OPERADOR`). Somem do catálogo em vez de aparecerem marcáveis:
   * uma caixa que se marca e não faz nada é promessa que a tela não cumpre.
   * Id já salvo com um destes valores é ignorado aqui (e pelo runtime), e sai
   * da versão na próxima vez que a lista for alterada.
   */
  ocultar?: readonly string[];
  /**
   * Quantas ferramentas EXTERNAS estão ligadas neste agente (#94). Elas ocupam o MESMO
   * prompt: o consumo mostrado, o aviso do recomendado e a recusa do máximo somam as
   * duas listas. A escolha delas mora na seção «Ferramentas externas».
   */
  qtdExternas?: number;
  /**
   * O agente que já existe, para mostrar ao lado de cada capacidade ligada quanto ela
   * foi usada (a mesma leitura da aba «Uso das capacidades»). Sem ele (criação, ou o
   * papel Operador, que tem outra lista), a linha de uso não aparece.
   */
  agentId?: string | null;
}

interface ApiResponse {
  data: {
    tools: Array<Omit<McpToolMeta, "name">>;
    /** Capacidades que a ORGANIZAÇÃO desligou (ex.: Propostas) — não são órfãs. */
    desligadas_pela_organizacao?: string[];
  };
}

/** O que a rota `/tool-usage` serve — o mesmo formato que a aba de uso lê. */
interface RespostaDeUso {
  data: { janela_em_dias: number; capacidades: CapacidadeComUso[] };
}

const TODOS_OS_PACOTES: ReadonlyArray<ToolBundle> = PACOTES.map((p) => p.id);
const ORDEM_DO_RISCO: ReadonlyArray<ToolRisk> = ["seguro", "atencao", "critico"];

const CLASSE_RISCO: Record<ToolRisk, string> = {
  seguro: "border-border/60 text-muted-foreground",
  atencao: "border-warning/40 text-warning-fg",
  critico: "border-destructive/40 text-destructive",
};
const ICONE_DO_RISCO: Record<ToolRisk, typeof Eye> = {
  seguro: Eye,
  atencao: PencilSimple,
  critico: Lock,
};

/** Para comparar o que a pessoa digitou com o texto da capacidade: sem acento, sem caixa. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function BadgeRisco({ risco }: { risco: ToolRisk }) {
  const t = useT();
  const meta = riscoMeta(risco);
  return (
    <Badge variant="outline" className={`text-[11px] ${CLASSE_RISCO[risco]}`} title={t(meta.explicacao)}>
      {t(meta.rotulo)}
    </Badge>
  );
}

/** Quanto a capacidade LIGADA foi usada — a mesma régua da aba «Uso das capacidades». */
function UsoDaCapacidade({ uso, janela }: { uso: CapacidadeComUso | undefined; janela: number }) {
  const t = useT();
  if (!uso || !uso.ligada) return null;
  if (uso.sinal === "nunca_usada") {
    return (
      <span
        data-testid={`uso-na-linha-${uso.name}`}
        data-sinal={uso.sinal}
        className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-warning-fg"
      >
        <Warning size={12} aria-hidden />
        {t("Nunca usada nos últimos")} {janela} {t("dias")}
      </span>
    );
  }
  if (uso.sinal === "so_falha" || uso.sinal === "falhando") {
    return (
      <span data-testid={`uso-na-linha-${uso.name}`} data-sinal={uso.sinal} className="text-destructive">
        {t("Falhou")} {uso.falhas} {t("de")} {uso.total} {uso.total === 1 ? t("vez") : t("vezes")}{" "}
        {t("nos últimos")} {janela} {t("dias")}
      </span>
    );
  }
  if (uso.total > 0) {
    return (
      <span data-testid={`uso-na-linha-${uso.name}`} data-sinal={uso.sinal}>
        {t("Usada")} <span className="font-mono tabular-nums">{uso.total}×</span> {t("nos últimos")}{" "}
        {janela} {t("dias")}
      </span>
    );
  }
  return null;
}

/** Ficha de uma capacidade — o que ela faz, quando entra, o que toca, quanto foi usada. */
function FichaCapacidade({
  capacidade,
  contexto,
  marcada,
  bloqueada,
  onToggle,
  disabled,
  mostrarRisco = true,
  mostrarNomeTecnico = false,
  pacoteAtual = null,
  uso,
  janela,
  parecidaCom,
  realcada = false,
}: {
  capacidade: McpToolMeta;
  /** Onde a ficha aparece (um pacote, a busca): a mesma capacidade pode estar em dois lugares. */
  contexto: string;
  marcada: boolean;
  bloqueada: boolean;
  onToggle: () => void;
  disabled?: boolean;
  mostrarRisco?: boolean;
  mostrarNomeTecnico?: boolean;
  /** Dentro de um pacote, os OUTROS pacotes em que ela também está. */
  pacoteAtual?: ToolBundle | null;
  uso?: CapacidadeComUso;
  janela: number;
  /** O rótulo da capacidade parecida que também está ligada, se houver. */
  parecidaCom?: string | null;
  realcada?: boolean;
}) {
  const t = useT();
  const idDaCaixa = `capacidade-${contexto}-${capacidade.name}`;
  const outrosPacotes = capacidade.pacotes
    .filter((p) => p !== pacoteAtual)
    .map((p) => PACOTES.find((x) => x.id === p)?.rotulo)
    .filter((r): r is string => Boolean(r))
    .map((r) => t(r));
  return (
    <div
      data-testid={`capacidade-${capacidade.name}`}
      data-marcada={marcada ? "sim" : "nao"}
      data-risco={capacidade.risco}
      data-realce={realcada ? "sim" : undefined}
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 transition-colors",
        realcada ? "bg-warning-bg" : "hover:bg-surface-elevated/50",
        bloqueada ? "opacity-60" : "",
      )}
    >
      <input
        id={idDaCaixa}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-md border-border accent-primary"
        checked={marcada}
        onChange={onToggle}
        disabled={disabled || (bloqueada && !marcada)}
        aria-label={t(capacidade.rotulo)}
        aria-describedby={`${idDaCaixa}-explicacao`}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={idDaCaixa} className="cursor-pointer text-sm font-medium">
          {t(capacidade.rotulo)}
        </label>
        {mostrarRisco ? <BadgeRisco risco={capacidade.risco} /> : null}
      </div>
      <p id={`${idDaCaixa}-explicacao`} className="col-start-2 max-w-[68ch] text-sm text-muted-foreground">
        {t(capacidade.explicacao)}
      </p>
      {capacidade.exemplo ? (
        <p
          data-testid={`exemplo-${capacidade.name}`}
          className="col-start-2 flex max-w-[68ch] gap-1.5 text-xs text-text-subtle italic"
        >
          <ChatCircle size={14} aria-hidden className="mt-px shrink-0 not-italic" />
          <span>{t(capacidade.exemplo)}</span>
        </p>
      ) : null}
      {capacidade.motivo_nao_marcavel ? (
        // O motivo do descarte, NA TELA. Antes disto o dono marcava e o engine
        // jogava fora; o aviso existia só no log do worker, que ninguém lê.
        <p
          data-testid={`motivo-nao-marcavel-${capacidade.name}`}
          className="col-start-2 text-xs text-info-fg"
        >
          {t(capacidade.motivo_nao_marcavel)}
        </p>
      ) : null}
      <p className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
        <span>
          {t("Mexe em:")} {t(capacidade.o_que_toca)}
        </span>
        {marcada ? <UsoDaCapacidade uso={uso} janela={janela} /> : null}
        {outrosPacotes.length > 0 ? (
          <span>
            {pacoteAtual ? t("Também em:") : t("Pacotes:")} {outrosPacotes.join(", ")}
          </span>
        ) : null}
      </p>
      {parecidaCom ? (
        <p className="col-start-2 flex gap-1.5 text-xs text-warning-fg">
          <Warning size={14} aria-hidden className="mt-px shrink-0" />
          <span>
            {t("Parecida com")} <strong>{parecidaCom}</strong>
            {t(", que também está ligada. Confira em Uso das capacidades se a IA troca uma pela outra.")}
          </span>
        </p>
      ) : null}
      {mostrarNomeTecnico ? (
        <code className="col-start-2 block font-mono text-[11px] text-muted-foreground" title={t("Como ela aparece para quem integra o sistema por fora.")}>
          {capacidade.name}
        </code>
      ) : null}
    </div>
  );
}

/**
 * A recusa por teto. `role="alert"` faz leitor de tela anunciar na hora; o
 * `scrollIntoView` garante que quem enxerga também veja — no topo ou dentro
 * do pacote, o aviso só serve se estiver na tela no momento do clique.
 */
export function AvisoTeto({ texto }: { texto: string }) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  React.useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [texto]);
  return (
    <p
      ref={ref}
      role="alert"
      data-testid="aviso-teto"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {texto}
    </p>
  );
}

/**
 * Acima do recomendado (issue #326), no pacote cujo clique cruzou a linha: a tela
 * DEIXA ligar e diz o que pode piorar e onde olhar. `role="status"`, não `alert`:
 * nada foi recusado, é informação. Mora DENTRO do pacote clicado pela mesma razão
 * da recusa: lá embaixo, com a tela rolada, a faixa do topo fica fora da vista.
 */
function AvisoAcimaDoRecomendado({ total }: { total: number }) {
  const t = useT();
  const abrirAba = useAbrirAbaDoAgente();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [total]);
  return (
    <div
      ref={ref}
      role="status"
      data-testid="aviso-acima-do-recomendado"
      className="space-y-1 rounded-md border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg"
    >
      <p>
        {t("Este agente está com")} {total} {t("capacidades, acima das")} {TETO_RECOMENDADO_POR_AGENTE}{" "}
        {t("recomendadas. A IA pode escolher a capacidade errada com mais frequência. Desligue o que ele não usa.")}
      </p>
      {abrirAba ? <BotaoAbrirUso onClick={() => abrirAba("capacidades")} /> : null}
    </div>
  );
}

function BotaoAbrirUso({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid="abrir-uso-das-capacidades"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-ia underline-offset-4 hover:underline"
    >
      {t("Abrir Uso das capacidades")}
      <ArrowRight size={14} aria-hidden />
    </button>
  );
}

/** A régua do consumo: até o recomendado na cor da marca, o que passa dele em âmbar. */
function ReguaDoConsumo({ total }: { total: number }) {
  const escala = Math.max(Math.ceil(TETO_RECOMENDADO_POR_AGENTE * 1.5), total);
  const ate = (Math.min(total, TETO_RECOMENDADO_POR_AGENTE) / escala) * 100;
  const alem = (Math.max(total - TETO_RECOMENDADO_POR_AGENTE, 0) / escala) * 100;
  const marca = (TETO_RECOMENDADO_POR_AGENTE / escala) * 100;
  return (
    <div aria-hidden className="relative h-1.5 rounded-full bg-surface-elevated">
      <div className="absolute inset-y-0 left-0 rounded-l-full bg-primary" style={{ width: `${ate}%` }} />
      {alem > 0 ? (
        <div className="absolute inset-y-0 rounded-r-full bg-warning" style={{ left: `${ate}%`, width: `${alem}%` }} />
      ) : null}
      <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${marca}% - 1px)` }} />
    </div>
  );
}

export function ToolPicker({
  value: valorSalvo,
  onChange,
  disabled,
  ocultar,
  qtdExternas = 0,
  agentId = null,
}: Props) {
  const t = useT();
  const abrirAba = useAbrirAbaDoAgente();
  const value = React.useMemo(
    () => (ocultar === undefined ? valorSalvo : valorSalvo.filter((id) => !ocultar.includes(id))),
    [valorSalvo, ocultar],
  );
  // `pacote` diz ONDE a recusa aconteceu. O aviso nascia só no topo do seletor,
  // e quem clicava num pacote lá embaixo (com a tela rolada) via o interruptor
  // não mudar e nada mais — o aviso ficava fora da tela e o clique parecia
  // quebrado. Recusa de pacote aparece dentro do pacote clicado.
  const [recusa, setRecusa] = React.useState<{ texto: string; pacote: ToolBundle | null } | null>(
    null,
  );
  /** O pacote cujo clique passou do recomendado — o aviso aparece dentro dele. */
  const [passouNoPacote, setPassouNoPacote] = React.useState<ToolBundle | null>(null);
  const [abertos, setAbertos] = React.useState<ReadonlySet<ToolBundle>>(new Set());
  const [busca, setBusca] = React.useState("");
  const [atencaoAberta, setAtencaoAberta] = React.useState(false);
  /** As capacidades que «Mostrar as duas» destacou na lista. */
  const [realce, setRealce] = React.useState<ReadonlySet<string>>(new Set());

  const query = useQuery({
    queryKey: ["mcp", "tools"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse>("/api/v1/mcp/tools");
      // `name` é o mesmo `id` — a regra de seleção fala em `name`, o wire em `id`.
      return {
        tools: res.data.tools.map((t) => ({ ...t, name: t.id })) as McpToolMeta[],
        desligadas: res.data.desligadas_pela_organizacao ?? [],
      };
    },
    staleTime: 60_000,
  });

  // A MESMA chave da aba «Uso das capacidades»: abrir uma depois da outra não busca de novo.
  // Sem permissão para ler o uso (a rota pede gerente), a linha de uso só não aparece.
  const usoQuery = useQuery({
    queryKey: ["ai", "agents", agentId, "tool-usage"],
    queryFn: async () => {
      const res = await apiClient.get<RespostaDeUso>(`/api/v1/ai/agents/${agentId}/tool-usage`);
      return res.data;
    },
    enabled: Boolean(agentId),
    staleTime: 30_000,
    retry: false,
  });
  const janela = usoQuery.data?.janela_em_dias ?? 30;
  const usoPorNome = React.useMemo(
    () => new Map((usoQuery.data?.capacidades ?? []).map((c) => [c.name, c])),
    [usoQuery.data],
  );

  const catalogo = React.useMemo<McpToolMeta[]>(
    () => (query.data?.tools ?? []).filter((c) => !(ocultar ?? []).includes(c.name)),
    [query.data, ocultar],
  );
  const desligadasPelaOrg = React.useMemo(
    () => new Set(query.data?.desligadas ?? []),
    [query.data],
  );
  const porNome = React.useMemo(
    () => new Map(catalogo.map((c) => [c.name, c])),
    [catalogo],
  );

  /**
   * Os pacotes que a casa recomenda, com o motivo (o guia do editor). "Atender" e "Passar
   * para um humano" valem para qualquer agente; "Vender" só para quem vende ou agenda, e a
   * frase diz isso: a tela não sabe o negócio, então não finge decidir por quem configura.
   */
  const motivoDaRecomendacao: Partial<Record<ToolBundle, string>> = {
    atender: t("Sem este pacote o agente não lê o histórico e pede que o cliente repita tudo."),
    escalar: t("Quando não souber, ele passa para uma pessoa em vez de arriscar uma resposta errada."),
    vender: t(
      "Se este agente vende ou agenda: sem este pacote o cliente conversa e ninguém da equipe vê que ele existe.",
    ),
  };

  const vagas = vagasRestantes(value, qtdExternas);
  const cheio = vagas <= 0;
  const totalLigadas = value.length + qtdExternas;
  const acima = acimaDoRecomendado(value, qtdExternas);
  const sobrepostas = sobreposicoesLigadas(value);
  const pontosDeAtencao = (acima ? 1 : 0) + (sobrepostas.length > 0 ? 1 : 0);

  /** Para cada capacidade ligada que tem uma parecida também ligada, o rótulo da outra. */
  const parecidaDe = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const s of sobrepostas) {
      mapa.set(s.a, t(porNome.get(s.b)?.rotulo ?? s.b));
      mapa.set(s.b, t(porNome.get(s.a)?.rotulo ?? s.a));
    }
    return mapa;
  }, [sobrepostas, porNome, t]);

  // A faixa de atenção nasce FECHADA (quem abre a tela já sabe o que configurou), e
  // abre sozinha quando um clique cria um ponto novo: ligar "Reter" e acender o par
  // parecido sem mostrar nada seria a mesma surpresa silenciosa que o #326 tirou.
  const pontosAntes = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!query.isSuccess) return;
    if (pontosAntes.current !== null && pontosDeAtencao > pontosAntes.current) setAtencaoAberta(true);
    pontosAntes.current = pontosDeAtencao;
  }, [pontosDeAtencao, query.isSuccess]);

  // «Mostrar as duas» rola até a primeira capacidade destacada.
  React.useEffect(() => {
    if (realce.size === 0) return;
    const alvo = document.querySelector<HTMLElement>('[data-tool-picker] [data-realce="sim"]');
    alvo?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [realce]);

  /** Ids salvos que o servidor não oferece mais — some da tela seria mentir. */
  const orfas = value.filter((id) => !porNome.has(id) && !desligadasPelaOrg.has(id));
  /** Ids salvos de capacidade que a organização desligou — voltam a valer ao ligar. */
  const desligadasSalvas = value.filter((id) => desligadasPelaOrg.has(id));

  /**
   * `vagasExigidas` é o que DECIDE, e por padrão é o tamanho do resultado.
   *
   * Ele existe separado porque ligar um pacote exige mais vagas do que o
   * resultado ocupa: as críticas do pacote não entram por ele, mas o humano
   * precisa poder marcá-las depois (issue #162). A primeira versão desta
   * correção contava as críticas só na MENSAGEM de recusa e deixava a decisão
   * em `proximo.length` — o número certo aparecia no texto e não mudava nada.
   * Medido na tela: com 3 ligadas, "Atender" (17 automáticas + 1 crítica)
   * chegava a 20, passava, e a crítica nascia desabilitada.
   */
  function aplicar(
    proximo: string[],
    motivoSeRecusar: string,
    vagasExigidas = proximo.length,
    pacote: ToolBundle | null = null,
  ) {
    if (vagasExigidas + qtdExternas > TETO_MAXIMO_POR_AGENTE) {
      setRecusa({ texto: motivoSeRecusar, pacote });
      return;
    }
    setRecusa(null);
    // Só o clique de pacote que CRUZOU o recomendado ganha o aviso no pacote;
    // quem já estava acima vê o ponto de atenção da faixa, e não um a cada clique.
    const cruzou =
      pacote !== null &&
      !acimaDoRecomendado(value, qtdExternas) &&
      acimaDoRecomendado(proximo, qtdExternas);
    setPassouNoPacote(cruzou ? pacote : null);
    onChange(proximo);
  }

  function alternarPacote(pacote: ToolBundle, ligar: boolean) {
    if (ligar) {
      const proximo = ligarPacote(value, catalogo, pacote);
      // O excedente conta as CRÍTICAS do pacote junto (issue #162): ligar o
      // pacote e deixar a crítica dele sem vaga é prometer uma escolha que o
      // produto não permite fazer — o checkbox nasce desabilitado, sem dizer
      // por quê. Ou cabe inteiro, com a vaga da crítica guardada, ou não liga
      // e a tela diz quantas faltam.
      const exigidas = vagasExigidasPeloPacote(value, catalogo, pacote);
      const excedente = exigidas + qtdExternas - TETO_MAXIMO_POR_AGENTE;
      aplicar(
        proximo,
        `${t("Ligar este pacote passaria de")} ${TETO_MAXIMO_POR_AGENTE} ${t("capacidades (faltam")} ${excedente} ${
          excedente === 1 ? t("vaga") : t("vagas")
        }${t("). Desligue um pacote que você usa menos antes.")}`,
        exigidas,
        pacote,
      );
    } else {
      setRecusa(null);
      setPassouNoPacote(null);
      onChange(desligarPacote(value, catalogo, pacote, TODOS_OS_PACOTES));
    }
  }

  function alternarCapacidade(name: string) {
    if (value.includes(name)) {
      setRecusa(null);
      setPassouNoPacote(null);
      onChange(value.filter((x) => x !== name));
      return;
    }
    // A regra mora aqui também, não só no `disabled` da caixa: ligar o que o
    // motor descarta é prometer o que não acontece, venha o clique de onde vier.
    if (porNome.get(name)?.marcavel === false) return;
    aplicar(
      [...catalogo.map((c) => c.name), ...orfas].filter(
        (n) => value.includes(n) || n === name,
      ),
      `${t("Você já ligou")} ${TETO_MAXIMO_POR_AGENTE} ${t("capacidades. Desligue uma antes de ligar outra.")}`,
    );
  }

  function alternarAberto(pacote: ToolBundle) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(pacote)) proximo.delete(pacote);
      else proximo.add(pacote);
      return proximo;
    });
  }

  /** Abre os pacotes das capacidades parecidas e as destaca: a pessoa vê as duas lado a lado. */
  function mostrarParecidas() {
    const nomes = new Set(sobrepostas.flatMap((s) => [s.a, s.b]));
    const pacotes = new Set<ToolBundle>();
    for (const nome of nomes) {
      const primeiro = porNome.get(nome)?.pacotes[0];
      if (primeiro) pacotes.add(primeiro);
    }
    setBusca("");
    setAbertos((atual) => new Set([...atual, ...pacotes]));
    setRealce(nomes);
  }

  function ficha(capacidade: McpToolMeta, contexto: string, extra: { pacoteAtual?: ToolBundle; mostrarRisco?: boolean; mostrarNomeTecnico?: boolean } = {}) {
    const marcada = value.includes(capacidade.name);
    return (
      <FichaCapacidade
        key={`${contexto}-${capacidade.name}`}
        capacidade={capacidade}
        contexto={contexto}
        marcada={marcada}
        // `marcavel` em toda ficha (#326): a capacidade do harness fica travada
        // mesmo longe do teto, e o clique não a liga.
        bloqueada={!marcada && (cheio || !capacidade.marcavel)}
        onToggle={() => alternarCapacidade(capacidade.name)}
        disabled={disabled}
        pacoteAtual={extra.pacoteAtual ?? null}
        mostrarRisco={extra.mostrarRisco ?? true}
        mostrarNomeTecnico={extra.mostrarNomeTecnico ?? false}
        uso={usoPorNome.get(capacidade.name)}
        janela={janela}
        parecidaCom={marcada ? (parecidaDe.get(capacidade.name) ?? null) : null}
        realcada={realce.has(capacidade.name)}
      />
    );
  }

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Carregando as capacidades…")}</p>;
  }
  if (query.isError) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {t("Não foi possível carregar as capacidades. Recarregue a página.")}
      </p>
    );
  }

  const termo = normalizar(busca.trim());
  const achadas = termo
    ? catalogo.filter((c) =>
        normalizar([t(c.rotulo), t(c.explicacao), t(c.o_que_toca), c.name].join(" ")).includes(termo),
      )
    : [];

  return (
    <div className="space-y-4" data-testid="tool-picker" data-tool-picker="">
      {/* A faixa: consumo contra o RECOMENDADO (o número que pede atenção) e os pontos de
          atenção numa linha só. O máximo só aparece quando chega: até lá ele não muda decisão. */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-surface-elevated/40 px-4 py-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <p className="text-sm">
              <strong data-testid="consumo-teto" data-acima={acima ? "sim" : "nao"} className="tabular-nums">
                {totalLigadas} {t("de")} {TETO_RECOMENDADO_POR_AGENTE}
              </strong>{" "}
              {t("capacidades recomendadas")}
            </p>
            <ReguaDoConsumo total={totalLigadas} />
            <p className="text-xs text-muted-foreground">
              {cheio
                ? `${t("Limite máximo de")} ${TETO_MAXIMO_POR_AGENTE} ${t("atingido. Desligue algo para ligar outra coisa.")}`
                : qtdExternas > 0
                  ? `${t("Inclui")} ${qtdExternas} ${qtdExternas === 1 ? t("ferramenta externa ligada") : t("ferramentas externas ligadas")}. ${t("Acima do recomendado a tela deixa ligar, mas a IA pode escolher errado com mais frequência.")}`
                  : t("Acima do recomendado a tela deixa ligar, mas a IA pode escolher errado com mais frequência.")}
            </p>
          </div>
          {pontosDeAtencao > 0 ? (
            <button
              type="button"
              data-testid="toggle-atencao"
              aria-expanded={atencaoAberta}
              aria-controls="lista-de-atencao"
              onClick={() => setAtencaoAberta((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-bg px-3 py-1.5 text-sm font-medium text-warning-fg"
            >
              <Warning size={16} aria-hidden />
              {pontosDeAtencao} {pontosDeAtencao === 1 ? t("ponto de atenção") : t("pontos de atenção")}
              <CaretDown size={14} aria-hidden className={cn("transition-transform", atencaoAberta ? "rotate-180" : "")} />
            </button>
          ) : (
            <Selo significado="concluido" data-testid="sem-pontos-de-atencao">
              <Check size={13} aria-hidden />
              {t("Tudo em ordem")}
            </Selo>
          )}
        </div>
        {pontosDeAtencao > 0 && atencaoAberta ? (
          <ul
            id="lista-de-atencao"
            data-testid="lista-de-atencao"
            className="divide-y divide-border border-t border-border bg-surface px-4"
          >
            {acima ? (
              <li data-testid="atencao-acima" className="flex gap-3 py-3 text-sm">
                <Warning size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <div className="space-y-1.5">
                  <p>
                    <strong>{t("Acima do recomendado.")}</strong> {t("Este agente está com")} {totalLigadas}{" "}
                    {t("capacidades, acima das")} {TETO_RECOMENDADO_POR_AGENTE}{" "}
                    {t("recomendadas. Com muitas, a IA escolhe a errada com mais frequência. As que ele nunca usou são as primeiras candidatas a desligar.")}
                  </p>
                  {abrirAba ? <BotaoAbrirUso onClick={() => abrirAba("capacidades")} /> : null}
                </div>
              </li>
            ) : null}
            {/* Sobreposição (issue #326): duas capacidades de pacotes diferentes que
                fazem quase a mesma coisa. Não manda desligar — diz o que observar. */}
            {sobrepostas.length > 0 ? (
              <li data-testid="aviso-sobreposicao" className="flex gap-3 py-3 text-sm">
                <Warning size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <div className="space-y-1.5">
                  <p className="font-semibold">{t("Capacidades parecidas ligadas juntas")}</p>
                  <ul className="space-y-1">
                    {sobrepostas.map((s) => (
                      <li key={`${s.a}+${s.b}`} data-testid={`sobreposicao-${s.a}-${s.b}`} className="text-muted-foreground">
                        <strong className="text-foreground">{t(porNome.get(s.a)?.rotulo ?? s.a)}</strong> {t("e")}{" "}
                        <strong className="text-foreground">{t(porNome.get(s.b)?.rotulo ?? s.b)}</strong>. {t(s.risco)}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">
                    {t("Se o Uso das capacidades mostrar que a IA usou uma no lugar da outra, desligue a que você usa menos.")}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <button
                      type="button"
                      data-testid="mostrar-parecidas"
                      onClick={mostrarParecidas}
                      className="inline-flex items-center gap-1 text-sm font-medium text-ia underline-offset-4 hover:underline"
                    >
                      {t("Mostrar as capacidades parecidas")}
                      <ArrowRight size={14} aria-hidden />
                    </button>
                    {abrirAba ? <BotaoAbrirUso onClick={() => abrirAba("capacidades")} /> : null}
                  </div>
                </div>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {recusa && recusa.pacote === null ? <AvisoTeto texto={recusa.texto} /> : null}

      {/* A busca substitui o antigo "modo avançado": acha qualquer capacidade pelo nome,
          pelo que ela faz ou pela parte do sistema em que mexe. */}
      <label
        htmlFor="busca-capacidade"
        className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-muted-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
      >
        <MagnifyingGlass size={16} aria-hidden />
        <span className="sr-only">{t("Procurar uma capacidade")}</span>
        <input
          id="busca-capacidade"
          data-testid="busca-capacidade"
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setRealce(new Set());
          }}
          placeholder={t("Procurar capacidade (ex.: agenda, funil)")}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-hidden placeholder:text-text-subtle"
        />
      </label>

      {termo ? (
        <div data-testid="resultado-da-busca" className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2">
            <p className="text-sm text-muted-foreground">
              {achadas.length === 0
                ? t("Nenhuma capacidade com esse nome. Tente outra palavra, como «agenda» ou «funil».")
                : `${achadas.length} ${achadas.length === 1 ? t("capacidade encontrada") : t("capacidades encontradas")}`}
            </p>
            <button
              type="button"
              onClick={() => setBusca("")}
              className="text-sm font-medium text-ia underline-offset-4 hover:underline"
            >
              {t("Limpar a busca")}
            </button>
          </div>
          {achadas.map((c) => ficha(c, "busca", { mostrarNomeTecnico: true }))}
        </div>
      ) : (
        /* Caminho padrão: pacotes por jornada, uma linha por pacote, que abre. */
        <div className="border-t border-border">
          {PACOTES.map((pacote) => {
            const automaticas = capacidadesAutomaticasDoPacote(catalogo, pacote.id);
            const criticas = capacidadesCriticasDoPacote(catalogo, pacote.id);
            const estado = estadoDoPacote(value, catalogo, pacote.id);
            const total = automaticas.length + criticas.length;
            const ligadas = [...automaticas, ...criticas].filter((n) => value.includes(n)).length;
            const vazio = total === 0;
            const aberto = abertos.has(pacote.id);
            // Todas as do pacote, inclusive a do harness: ela aparece com o motivo e travada.
            const doPacote = catalogo.filter((c) => c.pacotes.includes(pacote.id));

            return (
              <div
                key={pacote.id}
                data-testid={`pacote-${pacote.id}`}
                data-estado={estado}
                data-aberto={aberto ? "sim" : "nao"}
                className="border-b border-border"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <Switch
                    id={`pacote-${pacote.id}`}
                    data-testid={`switch-pacote-${pacote.id}`}
                    checked={estado === "ligado"}
                    onCheckedChange={(v) => alternarPacote(pacote.id, v)}
                    disabled={disabled || vazio}
                    aria-label={t(pacote.rotulo)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`pacote-${pacote.id}`} className="block cursor-pointer font-medium">
                        {t(pacote.rotulo)}
                      </label>
                      {estado === "parcial" ? (
                        <Badge variant="outline" className="text-[11px]">
                          {t("parcial")}
                        </Badge>
                      ) : null}
                      {motivoDaRecomendacao[pacote.id] ? <SeloRecomendado /> : null}
                    </div>
                    <p className="max-w-[68ch] text-sm text-muted-foreground">{t(pacote.explicacao)}</p>
                    {motivoDaRecomendacao[pacote.id] ? (
                      <p className="max-w-[68ch] text-sm text-ia" data-testid={`motivo-${pacote.id}`}>
                        {motivoDaRecomendacao[pacote.id]}
                      </p>
                    ) : null}
                    {!aberto && criticas.length > 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-text-subtle">
                        <Lock size={13} aria-hidden />
                        {criticas.length}{" "}
                        {criticas.length === 1
                          ? t("sem volta, que o pacote não liga: você marca ao abrir")
                          : t("sem volta, que o pacote não liga: você marca uma a uma ao abrir")}
                      </p>
                    ) : null}
                  </div>
                  {vazio ? (
                    <p className="col-start-2 text-xs text-muted-foreground sm:col-start-3" data-testid={`contagem-${pacote.id}`}>
                      {textoDaContagem(total, ligadas, t)}
                    </p>
                  ) : (
                    <button
                      type="button"
                      data-testid={`abrir-pacote-${pacote.id}`}
                      aria-expanded={aberto}
                      aria-controls={`capacidades-do-pacote-${pacote.id}`}
                      onClick={() => alternarAberto(pacote.id)}
                      className="col-start-2 inline-flex items-center gap-1.5 justify-self-start rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-elevated sm:col-start-3 sm:justify-self-end"
                    >
                      <span data-testid={`contagem-${pacote.id}`}>{textoDaContagem(total, ligadas, t)}</span>
                      <CaretDown size={13} aria-hidden className={cn("transition-transform", aberto ? "rotate-180" : "")} />
                    </button>
                  )}
                </div>

                {recusa && recusa.pacote === pacote.id ? (
                  <div className="pb-4">
                    <AvisoTeto texto={recusa.texto} />
                  </div>
                ) : null}
                {acima && passouNoPacote === pacote.id ? (
                  <div className="pb-4">
                    <AvisoAcimaDoRecomendado total={totalLigadas} />
                  </div>
                ) : null}

                {aberto ? (
                  <div
                    id={`capacidades-do-pacote-${pacote.id}`}
                    data-testid={`capacidades-do-pacote-${pacote.id}`}
                    className="space-y-4 pb-5 sm:pl-12"
                  >
                    {ORDEM_DO_RISCO.map((risco) => {
                      const doGrupo = doPacote.filter((c) => c.risco === risco);
                      if (doGrupo.length === 0) return null;
                      const Icone = ICONE_DO_RISCO[risco];
                      return (
                        <div key={risco} data-testid={`grupo-${pacote.id}-${risco}`} className="space-y-1">
                          <h4
                            className={cn(
                              "flex flex-wrap items-center gap-x-2 px-2 text-sm font-semibold",
                              risco === "critico" ? "text-destructive" : "",
                            )}
                          >
                            <Icone size={15} aria-hidden />
                            {t(riscoMeta(risco).rotulo)}
                            <span className="font-normal text-text-subtle">
                              · {t(DESCRICAO_DO_GRUPO[risco])} · {doGrupo.length}
                            </span>
                          </h4>
                          {doGrupo.map((c) => ficha(c, pacote.id, { pacoteAtual: pacote.id, mostrarRisco: false }))}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {desligadasSalvas.length > 0 ? (
        <p
          data-testid="capacidades-desligadas-pela-organizacao"
          className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          {t(
            "Propostas está desligada nesta organização: o rascunho automático de proposta fica guardado e volta a valer quando alguém ligar em Configurações › Propostas.",
          )}
        </p>
      ) : null}

      {orfas.length > 0 ? (
        <div
          data-testid="capacidades-orfas"
          className="space-y-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning-fg"
        >
          <p>
            {orfas.length === 1
              ? t("Uma capacidade ligada não existe mais")
              : `${orfas.length} ${t("capacidades ligadas não existem mais")}`}{" "}
            {t("nesta versão do sistema (")}
            {orfas.join(", ")}
            {t("). Elas continuam salvas, mas o agente não consegue usá-las.")}
          </p>
          <button
            type="button"
            data-testid="remover-orfas"
            disabled={disabled}
            onClick={() => {
              setRecusa(null);
              setPassouNoPacote(null);
              onChange(value.filter((id) => porNome.has(id)));
            }}
            className="font-medium underline underline-offset-4 disabled:opacity-50"
          >
            {t("Desligar")} {orfas.length === 1 ? t("essa capacidade") : t("essas capacidades")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A frase curta embaixo do nome de cada grupo, dentro de um pacote aberto. */
const DESCRICAO_DO_GRUPO: Record<ToolRisk, string> = {
  seguro: "nada muda no sistema",
  atencao: "dá para ver e desfazer pela tela",
  critico: "o pacote não liga por você: marque uma a uma",
};

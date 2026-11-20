"use client";
/**
 * A seção «Ferramentas externas» do editor do agente (issue #94).
 *
 * Lista as ferramentas que a organização cadastrou em Agente de IA › Ferramentas
 * externas (webhook de consulta ou ação, ou ferramenta de um servidor MCP) e deixa
 * marcar quais ESTE agente pode chamar. A marcação é dado da versão do agente
 * (rascunho, diff, histórico), igual às capacidades.
 *
 * Era um grupo escondido entre o último pacote de capacidades e o link do modo
 * avançado, e quando a organização não tinha nenhuma ferramenta o convite para
 * cadastrar era um link pequeno no fim de uma frase. Virou seção própria porque é
 * outro assunto: as capacidades são o que o agente faz DENTRO do sistema; isto é o
 * que ele alcança FORA dele, e só existe depois que alguém cadastra a conexão.
 *
 * Os links de cadastro abrem em OUTRA aba: navegar daqui perderia o rascunho que a
 * pessoa ainda não salvou. Ao voltar, a lista se atualiza sozinha (refetch ao focar).
 *
 * Contam no MESMO limite das capacidades (ocupam o mesmo prompt): o máximo é
 * conferido aqui, somando as capacidades ligadas que o editor informa.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { ArrowSquareOut, HardDrives, Plugs, Plus } from "@/lib/ui/icons";
import { FRASE_DA_TRAVA } from "@/lib/ai/ferramentas-externas/api/travas";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { TETO_MAXIMO_POR_AGENTE } from "@/lib/mcp/tools/selecao-por-pacote";
import { AvisoTeto } from "./ToolPicker";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Quantas capacidades do catálogo estão ligadas: somam no mesmo limite máximo. */
  capacidadesLigadas: number;
  disabled?: boolean;
}

/** O que a rota serve — o tipo do repositório, sem puxar o módulo de servidor para o browser. */
type FerramentaDaLista = Pick<
  FerramentaExterna,
  "id" | "name" | "agent_name" | "when_to_use" | "url" | "effect" | "require_approval" | "active" | "kind" | "mcp" | "api" | "unavailable_reason"
>;

const ONDE_CADASTRAR = "/app/ai/external-tools";
const ONDE_CONECTAR_MCP = "/app/ai/external-tools?aba=mcp";
const ONDE_CONECTAR_API = "/app/ai/external-tools?aba=apis";

function enderecoCurto(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Link que abre em outra aba, com o ícone e o aviso para leitor de tela. */
function LinkEmOutraAba({
  href,
  children,
  variante,
  testId,
}: {
  href: string;
  children: React.ReactNode;
  variante: "primary" | "outline";
  testId: string;
}) {
  const t = useT();
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      data-testid={testId}
      className={cn(buttonVariants({ variant: variante, size: "default" }), "gap-2")}
    >
      {children}
      <ArrowSquareOut size={14} aria-hidden />
      <span className="sr-only">{t("(abre em outra aba)")}</span>
    </Link>
  );
}

export function FerramentasExternasDoAgente({ value, onChange, capacidadesLigadas, disabled }: Props) {
  const t = useT();
  const [recusa, setRecusa] = React.useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ai", "external-tools"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: FerramentaDaLista[] }>("/api/v1/ai/external-tools");
      return res.data;
    },
    staleTime: 30_000,
    // Quem cadastra na outra aba e volta vê a ferramenta nova sem recarregar.
    refetchOnWindowFocus: "always",
  });

  const ferramentas = query.data ?? [];
  const conhecidas = new Set(ferramentas.map((f) => f.id));
  // Marcadas que o servidor não lista mais: não somem da tela (isso seria mentir). Só vale
  // DEPOIS de a lista chegar — durante o carregamento toda marcada pareceria órfã.
  const orfas = query.isSuccess ? value.filter((id) => !conhecidas.has(id)) : [];
  const semVagas = capacidadesLigadas + value.length >= TETO_MAXIMO_POR_AGENTE;
  const ligadas = value.filter((id) => conhecidas.has(id)).length;

  function alternar(id: string) {
    if (value.includes(id)) {
      setRecusa(null);
      onChange(value.filter((x) => x !== id));
      return;
    }
    // Marcar mais uma só passa se ainda há vaga; desmarcar sempre passa.
    if (capacidadesLigadas + value.length + 1 > TETO_MAXIMO_POR_AGENTE) {
      setRecusa(
        `${t("Você já ligou")} ${TETO_MAXIMO_POR_AGENTE} ${t("capacidades. Desligue uma antes de ligar outra.")}`,
      );
      return;
    }
    setRecusa(null);
    onChange([...value, id]);
  }

  return (
    <div data-testid="grupo-ferramentas-externas" className="space-y-4">
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando as ferramentas externas…")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Não foi possível carregar as ferramentas externas. Recarregue a página.")}
        </p>
      ) : ferramentas.length === 0 ? (
        <div
          data-testid="sem-ferramentas-externas"
          className="grid justify-items-start gap-3 rounded-xl border border-dashed border-border-strong p-5"
        >
          <span aria-hidden className="flex size-10 items-center justify-center rounded-lg bg-surface-elevated text-muted-foreground">
            <Plugs size={22} weight="duotone" />
          </span>
          <h3 className="font-semibold">{t("Você ainda não cadastrou nenhuma ferramenta externa.")}</h3>
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            {t("Com uma ferramenta externa o agente consulta outro sistema no meio da conversa, ou faz uma ação lá. Por exemplo:")}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            <li>{t("ver se um produto tem no estoque do seu sistema de gestão;")}</li>
            <li>{t("buscar como está um pedido na sua loja virtual;")}</li>
            <li>{t("emitir a segunda via de um boleto (esta pede a sua aprovação a cada vez).")}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <LinkEmOutraAba href={ONDE_CADASTRAR} variante="primary" testId="cadastrar-ferramenta-externa">
              <Plus size={16} aria-hidden />
              {t("Cadastrar uma ferramenta externa")}
            </LinkEmOutraAba>
            <LinkEmOutraAba href={ONDE_CONECTAR_API} variante="outline" testId="conectar-api">
              <Plugs size={16} aria-hidden />
              {t("Conectar uma API")}
            </LinkEmOutraAba>
            <LinkEmOutraAba href={ONDE_CONECTAR_MCP} variante="outline" testId="conectar-servidor-mcp">
              <HardDrives size={16} aria-hidden />
              {t("Conectar um servidor MCP")}
            </LinkEmOutraAba>
          </div>
          <p className="text-xs text-text-subtle">
            {t("Abre em outra aba, para você não perder o que mudou aqui. Ao voltar, a ferramenta já aparece nesta lista para você ligar.")}
          </p>
        </div>
      ) : (
        <>
          <p data-testid="resumo-ferramentas-externas" className="text-sm text-muted-foreground">
            {ferramentas.length}{" "}
            {ferramentas.length === 1 ? t("cadastrada na empresa") : t("cadastradas na empresa")} ·{" "}
            <strong className="text-foreground">
              {ligadas} {ligadas === 1 ? t("ligada neste agente") : t("ligadas neste agente")}
            </strong>
            . {t("Só as ligadas aqui ficam ao alcance dele.")}
          </p>
          <div className="divide-y divide-border border-y border-border">
            {ferramentas.map((f) => {
              const marcada = value.includes(f.id);
              // Desativada: só dá para DESMARCAR. A que altera dados pode ser ligada — o que a segura é
              // o pedido de aprovação, na hora da chamada. A de servidor MCP também não liga quando o
              // recurso está desligado ou o servidor desativado (o motor não a monta).
              const naoLiga = !f.active || f.unavailable_reason !== null;
              const pedeAprovacao = decidirSePedeAprovacao({
                effect: f.effect,
                // API (#372): a chave que VALE, com a trava «aprovação sempre obrigatória» da organização.
                requireApproval: f.api ? f.api.approval_in_effect : f.require_approval,
                modo: "ao_vivo",
              }).pede;
              const idDaCaixa = `ferramenta-externa-caixa-${f.id}`;
              return (
                <div
                  key={f.id}
                  data-testid={`ferramenta-externa-${f.id}`}
                  data-marcada={marcada ? "sim" : "nao"}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-1 py-3",
                    naoLiga && !marcada ? "opacity-60" : "",
                  )}
                >
                  <input
                    id={idDaCaixa}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-md border-border accent-primary"
                    checked={marcada}
                    onChange={() => alternar(f.id)}
                    disabled={disabled || (!marcada && (naoLiga || semVagas))}
                    aria-label={f.name}
                  />
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label htmlFor={idDaCaixa} className="cursor-pointer text-sm font-medium">
                      {f.name}
                    </label>
                    <Badge variant="outline" className="border-border/60 text-[11px] text-muted-foreground">
                      {f.effect === "consulta" ? t("Só consulta") : t("Altera dados")}
                    </Badge>
                    {pedeAprovacao ? (
                      <Badge variant="outline" className="border-border/60 text-[11px] text-muted-foreground">
                        {t("Pede aprovação")}
                      </Badge>
                    ) : null}
                    {f.mcp ? (
                      <Badge variant="outline" className="border-border/60 text-[11px] text-muted-foreground" data-testid={`ferramenta-mcp-${f.id}`}>
                        {t("Servidor MCP")}
                      </Badge>
                    ) : null}
                    {f.kind === "api" ? (
                      <Badge variant="outline" className="border-border/60 text-[11px] text-muted-foreground" data-testid={`ferramenta-api-${f.id}`}>
                        {t("API")}
                      </Badge>
                    ) : null}
                    {!f.active ? (
                      <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                        {t("Desativada")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="col-start-2 max-w-[68ch] text-sm text-muted-foreground">{f.when_to_use}</p>
                  <p className="col-start-2 font-mono text-xs text-text-subtle">
                    {f.mcp ? (f.mcp.server_name ?? t("servidor MCP")) : enderecoCurto(f.url)}
                  </p>
                  {f.unavailable_reason === "mcp_desligado" ? (
                    <p className="col-start-2 text-xs text-info-fg" data-testid={`indisponivel-${f.id}`}>
                      {t("Os servidores MCP estão desligados: o agente não usa esta ferramenta até um administrador ligar de novo em Ferramentas externas › Servidores MCP.")}
                    </p>
                  ) : f.unavailable_reason === "servidor_desativado" ? (
                    <p className="col-start-2 text-xs text-info-fg" data-testid={`indisponivel-${f.id}`}>
                      {t("O servidor desta ferramenta está desativado: o agente não a usa até um administrador reativar.")}
                    </p>
                  ) : f.unavailable_reason === "config_ilegivel" ? (
                    <p className="col-start-2 text-xs text-info-fg" data-testid={`indisponivel-${f.id}`}>
                      {t("O cadastro desta API está ilegível: o agente não a usa até alguém salvar o cadastro de novo em Ferramentas externas › APIs.")}
                    </p>
                  ) : f.unavailable_reason !== null ? (
                    <p className="col-start-2 text-xs text-info-fg" data-testid={`indisponivel-${f.id}`}>
                      {t("O agente não usa esta API agora.")} {t(FRASE_DA_TRAVA[f.unavailable_reason])}
                    </p>
                  ) : !f.active ? (
                    <p className="col-start-2 text-xs text-info-fg">
                      {t("Desativada: o agente não a usa até alguém reativar em Ferramentas externas.")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {recusa ? <AvisoTeto texto={recusa} /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <LinkEmOutraAba href={ONDE_CADASTRAR} variante="outline" testId="cadastrar-ferramenta-externa">
              <Plus size={16} aria-hidden />
              {t("Cadastrar outra ferramenta")}
            </LinkEmOutraAba>
            <LinkEmOutraAba href={ONDE_CONECTAR_MCP} variante="outline" testId="conectar-servidor-mcp">
              <HardDrives size={16} aria-hidden />
              {t("Conectar um servidor MCP")}
            </LinkEmOutraAba>
          </div>
          <p className="text-xs text-text-subtle">
            {t("Contam no mesmo limite das capacidades do agente. Os links abrem em outra aba, para você não perder o que mudou aqui.")}
          </p>
        </>
      )}

      {orfas.length > 0 ? (
        <div
          data-testid="ferramentas-externas-orfas"
          className="space-y-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning-fg"
        >
          <p>
            {t(
              "Uma ferramenta externa marcada nesta versão não existe mais. Ela continua salva, mas o agente não consegue usá-la.",
            )}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((id) => conhecidas.has(id)))}
            className="font-medium underline underline-offset-4 disabled:opacity-50"
          >
            {t("Desmarcar")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

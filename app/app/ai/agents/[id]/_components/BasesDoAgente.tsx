"use client";

import { useT } from "@/hooks/i18n/useT";
/**
 * O QUE ESTE ASSISTENTE CONSULTA ANTES DE RESPONDER (0181).
 *
 * Até aqui não existia superfície nenhuma para isto: o acervo pertencia ao
 * agente e a única tela do produto resolvia o agente por `is_default` — como
 * TODO agente criado pela interface nasce `is_default: false`, cadastrar
 * material para qualquer assistente que não fosse o semeado no bootstrap era
 * impossível pela tela, e o indexador ainda o gravava no agente errado.
 *
 * Três coisas que esta seção faz de propósito, no molde de `FunisDoAgente`:
 *
 *  1. **Nomeia o estado vazio.** Nenhum material marcado é LEGÍTIMO (é o
 *     default, e é falha fechada), mas quem publica e não marca nada concluiria
 *     que quebrou. A frase diz o que acontece, não o que falta.
 *  2. **Avisa quando existe acervo e ele está todo de fora.** É o caso que
 *     produz o pior silêncio: a organização pagou para preparar material, o
 *     assistente atende, e responde de improviso sobre um assunto que está
 *     escrito.
 *  3. **Mostra o material que ainda não foi preparado.** Marcar um material que
 *     não virou trecho nenhum é uma promessa que não se cumpre — ele aparece na
 *     lista e o agente não acha nada nele.
 *  4. **Devolve à tela o material ARQUIVADO que ficou marcado (issue #774).**
 *     O vínculo material-agente não pode travar o ARQUIVAMENTO: quem arquiva está
 *     certo, e é a tela do agente que precisa se adaptar. Antes, o acervo chegava
 *     já filtrado por `is_active` e o id marcado não tinha caixinha nenhuma para
 *     desmarcar — o dono ficava com o salvar recusando ("um dos materiais marcados
 *     não existe mais, ou foi arquivado") e sem caminho de volta pela tela.
 *     Arquivado E marcado agora APARECE, com selo e com o desmarcar a um clique;
 *     arquivado e NÃO marcado continua fora, e não conta como material do
 *     assistente em nenhum aviso.
 *  5. **Deixa o caminho para o acervo sempre à vista.** No editor esta é a parte
 *     "Cérebro do agente": a que mais muda a resposta. O link para cadastrar
 *     material aparecia só no estado vazio ou num aviso — quem tinha um material
 *     e queria o segundo não achava por onde. "Adicionar material" e "Abrir o
 *     acervo" ficam no topo da lista, e cada material é uma linha inteira
 *     clicável, com o tipo e se ele já foi preparado.
 */
import * as React from "react";
import Link from "next/link";

import type { Icon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canonizarTipoDeFonte, rotuloDoTipo, type TipoDeFonteId } from "@/lib/ai/rag/tipos-de-fonte";
import {
  ArrowSquareOut,
  Brain,
  ChatsCircle,
  Check,
  FileText,
  Globe,
  Plus,
  Question,
  Storefront,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Onde o material se cadastra. `?novo=1` já abre a janela de adicionar. */
const ACERVO = "/app/ai/knowledge/sources";

const ICONE_DO_TIPO: Record<TipoDeFonteId, Icon> = {
  faq: Question,
  documento: FileText,
  conversas: ChatsCircle,
  catalogo: Storefront,
  site: Globe,
};

export interface MaterialDoAcervo {
  id: string;
  name: string;
  source_type: string;
  chunks_count: number;
  last_index_status: string | null;
  /**
   * `false` = arquivado no acervo.
   *
   * Opcional de propósito: a página só carrega a coluna de quem está marcado e
   * ficou fora da lista viva. AUSENTE quer dizer material vivo, nunca arquivado —
   * o contrário esconderia material de quem não manda a coluna.
   */
  is_active?: boolean;
}

interface Props {
  materiais: MaterialDoAcervo[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** A seção do editor já dá título e introdução; aqui eles sairiam repetidos. */
  semTitulo?: boolean;
  /**
   * Chamado quando a pessoa VOLTA a esta aba depois de abrir o acervo em outra.
   *
   * O acervo abre em aba nova de propósito: no mesmo lugar, quem estava no meio de
   * uma edição perderia o que não salvou. A volta é o momento de buscar a lista de
   * novo — o editor passa `router.refresh()`, e o material recém-criado aparece
   * aqui sem recarregar a página nem perder o formulário.
   */
  onVoltouDoAcervo?: () => void;
}

export function BasesDoAgente({
  materiais,
  value,
  onChange,
  disabled = false,
  semTitulo = false,
  onVoltouDoAcervo,
}: Props) {
  const t = useT();
  const marcados = new Set(value);
  const abriuOAcervo = React.useRef(false);

  React.useEffect(() => {
    if (!onVoltouDoAcervo) return;
    function aoVoltar(): void {
      if (document.visibilityState !== "visible" || !abriuOAcervo.current) return;
      abriuOAcervo.current = false;
      onVoltouDoAcervo?.();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [onVoltouDoAcervo]);

  function marcarIdaAoAcervo(): void {
    abriuOAcervo.current = true;
  }

  function alternar(id: string, marcado: boolean): void {
    const proximo = new Set(marcados);
    if (marcado) proximo.add(id);
    else proximo.delete(id);
    onChange([...proximo]);
  }

  // Arquivado só entra na lista quando está MARCADO — é o que devolve ao dono a
  // caixinha para desmarcar. Arquivado e não marcado fica fora: ele não é mais
  // material deste assistente e não pode reaparecer como se fosse.
  const visiveis = materiais.filter((m) => m.is_active !== false || marcados.has(m.id));
  // O acervo VIVO é a régua dos avisos e da contagem: um arquivado não pode
  // virar "material que este assistente deixou de ler" nem entrar no "ainda não
  // foi preparado" — foi arquivado de propósito, e cobrar preparo dele seria
  // pedir que o dono consertasse uma decisão dele mesmo.
  const ativos = materiais.filter((m) => m.is_active !== false);
  const arquivadosMarcados = visiveis.filter((m) => m.is_active === false);
  const semPreparo = ativos.filter((m) => marcados.has(m.id) && (m.chunks_count ?? 0) === 0);
  const acervoTodoDeFora = ativos.length > 0 && value.length === 0;
  const ligados = ativos.filter((m) => marcados.has(m.id)).length;

  function desmarcarArquivados(): void {
    const arquivados = new Set(arquivadosMarcados.map((m) => m.id));
    onChange(value.filter((id) => !arquivados.has(id)));
  }

  /** "Adicionar" e "Abrir o acervo": sempre à vista, não só quando algo falta. */
  function acoesDoAcervo(principal: boolean) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link
            href={`${ACERVO}?novo=1`}
            target="_blank"
            rel="noopener"
            onClick={marcarIdaAoAcervo}
            data-testid="cerebro-adicionar-material"
          >
            <Plus size={16} weight="bold" aria-hidden />
            {principal ? t("Adicionar o primeiro material") : t("Adicionar material")}
            <span className="sr-only"> ({t("abre em outra aba")})</span>
          </Link>
        </Button>
        {principal ? null : (
          <Button asChild variant="outline">
            <Link
              href={ACERVO}
              target="_blank"
              rel="noopener"
              onClick={marcarIdaAoAcervo}
              data-testid="cerebro-abrir-acervo"
            >
              {t("Abrir o acervo")}
              <ArrowSquareOut size={15} aria-hidden />
              <span className="sr-only"> ({t("abre em outra aba")})</span>
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {semTitulo ? null : (
        <div>
          <h3 className="text-sm font-semibold">{t("O que ele consulta antes de responder")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Marque o material do seu negócio que este assistente pode ler. Ele procura ali antes de responder, em vez de improvisar — e cita de onde tirou.",
            )}
          </p>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div
          className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-ia/35 px-5 py-6 sm:flex-row sm:items-center"
          data-testid="agente-sem-acervo"
        >
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ia-fundo text-ia"
          >
            <Brain size={26} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold">{t("Você ainda não cadastrou nenhum material.")}</p>
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              {t("Comece pelo que ele mais vai precisar")}{" "}
              {t("— as perguntas que se repetem, e a política que você mais explica.")}
            </p>
          </div>
          {acoesDoAcervo(true)}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" data-testid="cerebro-contagem">
              <span className="font-semibold tabular-nums">{ligados}</span>{" "}
              {t("de")} <span className="tabular-nums">{ativos.length}</span>{" "}
              {ativos.length === 1
                ? t("material do acervo ligado a este agente")
                : t("materiais do acervo ligados a este agente")}
            </p>
            {acoesDoAcervo(false)}
          </div>

          <div className="space-y-2" data-testid="agente-bases">
            {visiveis.map((m) => {
              const marcado = marcados.has(m.id);
              const tipo = canonizarTipoDeFonte(m.source_type);
              const IconeDoTipo = tipo ? ICONE_DO_TIPO[tipo] : FileText;
              const preparado = (m.chunks_count ?? 0) > 0;
              const arquivado = m.is_active === false;
              const detalhe = [
                // O tipo some quando ele É o nome ("Conversas anteriores" é as duas coisas).
                tipo && t(rotuloDoTipo(tipo)) !== m.name ? t(rotuloDoTipo(tipo)) : null,
                preparado
                  ? `${m.chunks_count} ${m.chunks_count === 1 ? t("trecho") : t("trechos")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={m.id}
                  data-marcado={marcado ? "sim" : "nao"}
                  className={cn(
                    "relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 transition-colors",
                    marcado
                      ? "border-ia/40 bg-ia-fundo"
                      : "border-border hover:border-foreground/30 hover:bg-surface-elevated/50",
                    disabled ? "opacity-60" : "",
                  )}
                >
                  {/* `input` nativo, como o ToolPicker e o FunisDoAgente ao lado: o
                      repo não tem componente de checkbox, e introduzir um só para
                      esta seção criaria duas aparências para o mesmo controle na
                      MESMA página. A linha inteira é clicável pelo rótulo esticado. */}
                  <input
                    id={`base-${m.id}`}
                    data-testid={`base-${m.id}`}
                    type="checkbox"
                    className="relative z-10 size-4 shrink-0 rounded-md border-border accent-primary"
                    checked={marcado}
                    onChange={(e) => alternar(m.id, e.target.checked)}
                    disabled={disabled}
                    aria-label={m.name}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      marcado ? "bg-surface text-ia" : "bg-surface-elevated text-muted-foreground",
                    )}
                  >
                    <IconeDoTipo size={18} weight="duotone" />
                  </span>
                  <Label
                    htmlFor={`base-${m.id}`}
                    className={cn(
                      "min-w-0 flex-1 basis-40 font-normal after:absolute after:inset-0 after:rounded-lg after:content-['']",
                      disabled ? "" : "cursor-pointer",
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    {/* Singular e plural viram CHAVES separadas em vez de um sufixo
                        concatenado: em português o plural de "trecho" é +s, em
                        espanhol "fragmento"/"fragmentos" muda a palavra inteira, e
                        um `${…}s` no fim não tem como dizer isso. */}
                    {detalhe ? (
                      <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>
                    ) : null}
                  </Label>
                  {arquivado ? (
                    <span
                      data-testid={`base-${m.id}-arquivado`}
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-fg"
                    >
                      <Warning size={12} weight="bold" aria-hidden />
                      {t("arquivado no acervo")}
                    </span>
                  ) : !preparado ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-fg">
                      <Warning size={12} weight="bold" aria-hidden />
                      {t("ainda não preparado")}
                    </span>
                  ) : marcado ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ia">
                      <Check size={12} weight="bold" aria-hidden />
                      {t("Ele lê")}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {value.length === 0 && visiveis.length > 0 ? (
        <p data-testid="agente-sem-base-marcada" className="text-xs text-muted-foreground">
          {t(
            "Sem nenhum material marcado, ele conversa normalmente — mas responde só com o que o modelo já sabe, e a ferramenta de busca nem entra na conversa dele.",
          )}
        </p>
      ) : null}

      {acervoTodoDeFora ? (
        <p
          data-testid="agente-acervo-de-fora"
          className="flex items-start gap-1.5 text-sm text-warning-fg"
        >
          <Warning size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {t("Você tem")} {ativos.length} {ativos.length === 1 ? t("material") : t("materiais")}{" "}
            {t(
              "no acervo e este assistente não lê nenhum. Ele vai responder de improviso sobre assuntos que já estão escritos.",
            )}
          </span>
        </p>
      ) : null}

      {arquivadosMarcados.length > 0 ? (
        <p data-testid="agente-base-arquivada-marcada" className="text-xs text-warning-fg">
          {arquivadosMarcados.length === 1
            ? t("Um material marcado aqui foi arquivado no acervo — o agente não lê mais ele.")
            : t(
                "Materiais marcados aqui foram arquivados no acervo — o agente não lê mais eles.",
              )}{" "}
          <button
            type="button"
            data-testid="agente-base-arquivada-desmarcar"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={desmarcarArquivados}
            disabled={disabled}
          >
            {t("Desmarque para voltar a salvar.")}
          </button>
        </p>
      ) : null}

      {semPreparo.length > 0 ? (
        <p data-testid="agente-base-sem-preparo" className="text-xs text-warning-fg">
          {semPreparo.length === 1
            ? `"${semPreparo[0]?.name}" ${t("está marcado mas ainda não foi preparado — o agente não vai achar nada nele.")}`
            : `${semPreparo.length} ${t("materiais marcados ainda não foram preparados — o agente não vai achar nada neles.")}`}{" "}
          <Link
            href={ACERVO}
            target="_blank"
            rel="noopener"
            onClick={marcarIdaAoAcervo}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t("Ver o acervo")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

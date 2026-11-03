"use client";
/**
 * A galeria de modelos aprovados da campanha OFICIAL.
 *
 * Escolher modelo pelo nome técnico (`DESAFIO JUNHO 2025 | AULAS AGENDADAS 2`)
 * não funciona quando a conta tem dezenas deles: o operador escolhe pelo
 * CONTEÚDO. Cada cartão traz nome, categoria (Utilidade ou Marketing), idioma e as
 * primeiras linhas do texto aprovado; a busca olha nome e texto, e o filtro separa
 * por categoria.
 *
 * Controlada de propósito, como `MensagemOficial`: quem busca os modelos e guarda
 * a escolha é a tela da campanha.
 *
 * Dois atalhos moram aqui porque o operador chega com a lista vazia ou sem o
 * modelo que queria:
 *
 * - "Criar novo modelo" abre o editor em OUTRA ABA — o editor ocupa a página
 *   inteira, e sair da campanha perderia o que já foi preenchido. Só o
 *   administrador cria modelo (o gerente opera a campanha, mas o modelo gasta a
 *   reputação do número): para os demais o atalho vira a nota "peça a um
 *   administrador", e nunca um botão que devolveria 403.
 * - "Atualizar lista" RECARREGA o que o ZapSales já guarda. Sincronizar com a Meta
 *   é do administrador, em Conexões; a aprovação chega por aviso da Meta.
 */
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import {
  categoriaConhecida,
  contarPorFiltro,
  filtrarModelos,
  FILTROS_DE_CATEGORIA,
  resumoDoTexto,
  type FiltroDeCategoria,
} from "@/lib/campanhas/galeria-de-modelos";
import type { ModeloParaCampanha } from "@/lib/campanhas/modelos-da-campanha";
import { ArrowsClockwise, ArrowSquareOut, CheckCircle, MagnifyingGlass } from "@/lib/ui/icons";

/** O editor de modelos (Conexões › API Oficial › Templates da Meta › Novo modelo). */
export const CAMINHO_DO_EDITOR_DE_MODELO = "/app/connections/modelos/novo";

/** A categoria como o operador a lê. Cada frase é literal em `t()` de propósito. */
export function RotuloDaCategoria({ categoria }: { categoria: string | null }) {
  const t = useT();
  switch (categoriaConhecida(categoria)) {
    case "UTILITY":
      return <>{t("Utilidade")}</>;
    case "MARKETING":
      return <>{t("Marketing")}</>;
    case "AUTHENTICATION":
      return <>{t("Autenticação")}</>;
    default:
      return <>{t("Sem categoria")}</>;
  }
}

interface Props {
  modelos: ModeloParaCampanha[];
  carregando: boolean;
  modeloId: string;
  onModelo: (id: string) => void;
  /** O papel do operador alcança o editor de modelos (administrador). */
  podeCriarModelo?: boolean;
  /** Recarrega a lista guardada. Em branco, o botão não aparece. */
  onAtualizar?: () => void;
  atualizando?: boolean;
}

export function GaleriaDeModelos({
  modelos,
  carregando,
  modeloId,
  onModelo,
  podeCriarModelo = false,
  onAtualizar,
  atualizando = false,
}: Props) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<FiltroDeCategoria>("todas");

  const contagem = useMemo(() => contarPorFiltro(modelos), [modelos]);
  const visiveis = useMemo(
    () => filtrarModelos(modelos, { busca, categoria }),
    [modelos, busca, categoria],
  );

  // O filtro é escrito literal a cada caso: a frase precisa estar em `t()` para a cerca de tradução.
  function nomeDoFiltro(f: FiltroDeCategoria): string {
    if (f === "UTILITY") return t("Utilidade");
    if (f === "MARKETING") return t("Marketing");
    return t("Todos");
  }

  return (
    <div className="space-y-3" data-testid="galeria-de-modelos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id="rotulo-da-galeria" className="text-sm font-medium">
          {t("Modelo aprovado")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {onAtualizar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAtualizar}
              disabled={atualizando || carregando}
              data-testid="atualizar-modelos"
            >
              <ArrowsClockwise size={14} aria-hidden />
              {atualizando ? t("Atualizando…") : t("Atualizar lista")}
            </Button>
          )}
          {podeCriarModelo && (
            <Button asChild type="button" variant="outline" size="sm">
              <a
                href={CAMINHO_DO_EDITOR_DE_MODELO}
                target="_blank"
                rel="noreferrer"
                data-testid="criar-modelo"
              >
                <ArrowSquareOut size={14} aria-hidden />
                {t("Criar novo modelo")}
              </a>
            </Button>
          )}
        </div>
      </div>

      {!podeCriarModelo && (
        <p className="text-sm text-muted-foreground" data-testid="criar-modelo-so-admin">
          {t("Para criar um modelo novo, peça a um administrador da sua conta.")}
        </p>
      )}

      {modelos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <MagnifyingGlass
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar por nome ou texto")}
              aria-label={t("Buscar modelo")}
              className="pl-8"
            />
          </div>
          <div
            role="group"
            aria-label={t("Filtrar por categoria")}
            className="flex flex-wrap gap-1.5"
          >
            {FILTROS_DE_CATEGORIA.map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={categoria === f ? "default" : "outline"}
                aria-pressed={categoria === f}
                onClick={() => setCategoria(f)}
              >
                {nomeDoFiltro(f)} · {contagem[f]}
              </Button>
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted-foreground">{t("Carregando modelos…")}</p>
      ) : modelos.length === 0 ? (
        <p className="text-sm text-warning-fg">
          {t(
            "Nenhum modelo aprovado na conta deste número. Crie ou sincronize em Conexões › Modelos.",
          )}
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="galeria-sem-resultado">
          {t("Nenhum modelo com esse filtro.")}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby="rotulo-da-galeria"
          className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2"
        >
          {visiveis.map((m) => {
            const escolhido = m.id === modeloId;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={escolhido}
                onClick={() => onModelo(m.id)}
                data-testid="cartao-de-modelo"
                className={
                  "flex flex-col gap-1.5 rounded-md border p-3 text-left text-sm transition-colors " +
                  (escolhido
                    ? "border-accent-500 bg-accent-soft"
                    : "border-border bg-surface hover:bg-surface-elevated")
                }
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-medium break-words">{m.name}</span>
                  {escolhido && (
                    <CheckCircle
                      size={16}
                      weight="fill"
                      aria-hidden
                      className="shrink-0 text-accent"
                    />
                  )}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={categoriaConhecida(m.category) === "MARKETING" ? "warning" : "info"}
                  >
                    <RotuloDaCategoria categoria={m.category} />
                  </Badge>
                  <Badge variant="neutral" className="font-mono">
                    {m.language}
                  </Badge>
                </span>
                {m.texto !== "" && (
                  <span className="text-muted-foreground">{resumoDoTexto(m.texto)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

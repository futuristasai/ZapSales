"use client";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { Faixa } from "@/components/shell/Faixa";
import { ENDERECO_DO_MANUAL } from "@/lib/navigation/manual";
import { PainelDoMenu } from "@/components/shell/PainelDoMenu";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import {
  entradaDaTela,
  telaAtual,
  faixaDoMenu,
  type EntradaDaFaixa,
  type EntradaDaFaixaId,
} from "@/lib/navigation/faixa";
import { menuDoPapel } from "@/lib/navigation/menu";
import { BookOpen, CaretDoubleLeft, CaretDoubleRight, CaretLeft } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A navegação do computador: a faixa à esquerda e, ao lado dela, o painel (issue #188).
 *
 * O painel abre em Todo dia e mostra a lista da entrada que a pessoa escolhe na
 * faixa. Pode ser RECOLHIDO — sobra só a faixa — e então a escolha de uma entrada
 * abre o painel POR CIMA da tela, até a pessoa escolher uma tela, apertar Esc ou
 * clicar fora. Nenhum caminho deixa de existir por causa do recolhimento: todas as
 * telas continuam a um clique.
 *
 * ⚠️ HIDRATAÇÃO. `painelRecolhido` vem do servidor (o cookie, lido no layout) e é o
 * ÚNICO insumo do primeiro desenho: nada aqui lê `localStorage` nem a largura da
 * janela antes do mount, porque servidor e navegador pintariam estados diferentes
 * — o defeito que a barra lateral já teve (React #418 e a barra por cima da lista).
 * O estado interno só muda por clique.
 */
export function NavegacaoDoComputador({ painelRecolhido }: { painelRecolhido: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const [, startTransition] = useTransition();

  const faixa = useMemo(
    () =>
      faixaDoMenu(
        menuDoPapel(
          user.is_platform_admin && !user.support,
          activeOrg?.role ?? null,
          activeOrg?.interface_settings,
          activeOrg?.modulos_ligados ?? [],
          activeOrg?.capacidades_ligadas ?? [],
        ),
      ),
    [
      user.is_platform_admin,
      user.support,
      activeOrg?.role,
      activeOrg?.interface_settings,
      activeOrg?.modulos_ligados,
      activeOrg?.capacidades_ligadas,
    ],
  );
  const entradas = useMemo(
    () =>
      [faixa.todoDia, ...faixa.configurar, faixa.resultados].filter(
        (e): e is EntradaDaFaixa => !!e,
      ),
    [faixa],
  );

  const [recolhido, setRecolhido] = useState(painelRecolhido);
  const [escolhidaId, setEscolhidaId] = useState<EntradaDaFaixaId>("todo-dia");
  /** Só vale com o painel recolhido: ele está aberto por cima da tela. */
  const [sobre, setSobre] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLElement | null>(null);
  const lista = useRef<HTMLElement>(null);

  // A entrada que sumiu (o papel mudou, o módulo foi desligado) cai em Todo dia.
  const escolhida = entradas.find((e) => e.id === escolhidaId) ?? entradas[0] ?? null;
  const painelAberto = !recolhido || sobre;

  function escolher(id: EntradaDaFaixaId, botao: HTMLButtonElement) {
    gatilho.current = botao;
    if (recolhido) {
      if (sobre && escolhida?.id === id) setSobre(false);
      else {
        setEscolhidaId(id);
        setSobre(true);
      }
      return;
    }
    // Apertar de novo a área que já está à vista volta para Todo dia.
    setEscolhidaId(escolhida?.id === id && id !== "todo-dia" ? "todo-dia" : id);
  }

  function alternarRecolhimento() {
    const estavaRecolhido = recolhido;
    setRecolhido(!estavaRecolhido);
    setSobre(false);
    startTransition(() => toggleSidebar(estavaRecolhido));
  }

  // Aberto por cima da tela, o painel recebe o foco: no DOM ele vem DEPOIS da faixa inteira, e quem
  // usa só o teclado passaria por Buscar e Você antes de chegar à lista. Esc devolve o foco ao botão.
  useEffect(() => {
    if (recolhido && sobre) lista.current?.querySelector<HTMLElement>("a")?.focus();
  }, [recolhido, sobre, escolhidaId]);

  // O painel por cima da tela fecha com Esc e com um clique fora dele.
  useEffect(() => {
    if (!recolhido || !sobre) return;
    function aoApertar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSobre(false);
      gatilho.current?.focus();
    }
    function aoClicarFora(e: PointerEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setSobre(false);
    }
    document.addEventListener("keydown", aoApertar);
    document.addEventListener("pointerdown", aoClicarFora);
    return () => {
      document.removeEventListener("keydown", aoApertar);
      document.removeEventListener("pointerdown", aoClicarFora);
    };
  }, [recolhido, sobre]);

  const aoNavegar = recolhido ? () => setSobre(false) : undefined;

  return (
    <div ref={raiz} className="relative flex h-full">
      {/* Fundo no tema da página; o miolo é uma ilha escura nos dois temas (a faixa
          azul-noite), então os tokens de dentro já são os do escuro. */}
      <div className="h-full bg-neutral-900 dark:bg-neutral-950">
        <div data-theme="dark" className="h-full text-foreground">
          <Faixa
            faixa={faixa}
            escolhida={painelAberto ? (escolhida?.id ?? null) : null}
            atual={entradaDaTela(faixa, pathname)}
            aoEscolher={escolher}
            mostrarAtualizacao={recolhido}
          />
        </div>
      </div>
      {painelAberto && escolhida ? (
        <section
          aria-label={t(escolhida.label)}
          className={cn(
            "flex h-full w-[20.5rem] flex-col border-r bg-card",
            recolhido &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 absolute top-0 left-20 z-40 shadow-xl",
          )}
        >
          <header className="flex items-start gap-1 px-3 pt-4 pb-2">
            {escolhida.id !== "todo-dia" ? (
              <button
                type="button"
                aria-label={t("Voltar para Todo dia")}
                title={t("Voltar para Todo dia")}
                onClick={() => setEscolhidaId("todo-dia")}
                className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent-soft hover:text-foreground"
              >
                <CaretLeft size={18} aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0 flex-1 px-1">
              <h2 className="text-base leading-tight font-semibold">{t(escolhida.label)}</h2>
              {faixa.configurar.some((e) => e.id === escolhida.id) ? (
                <p className="text-xs text-muted-foreground">{t("Configurar")}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={alternarRecolhimento}
              aria-label={recolhido ? t("Fixar o painel ao lado") : t("Recolher o painel")}
              title={
                recolhido ? t("Fixar o painel ao lado") : t("Recolher o painel (fica só a faixa)")
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-subtle hover:bg-accent-soft hover:text-foreground"
            >
              {recolhido ? (
                <CaretDoubleRight size={18} aria-hidden />
              ) : (
                <CaretDoubleLeft size={18} aria-hidden />
              )}
            </button>
          </header>
          <nav
            ref={lista}
            aria-label={t("Navegação principal")}
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
          >
            <PainelDoMenu
              entrada={escolhida}
              hrefAtual={telaAtual(faixa, pathname)}
              aoNavegar={aoNavegar}
            />
          </nav>
          <footer className="border-t p-2">
            <a
              href={ENDERECO_DO_MANUAL}
              target="_blank"
              rel="noopener"
              onClick={aoNavegar}
              className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground"
            >
              <BookOpen size={18} aria-hidden />
              <span>{t("Manual")}</span>
            </a>
            <VersionFooter collapsed={false} onNavigate={aoNavegar} />
          </footer>
        </section>
      ) : null}
    </div>
  );
}

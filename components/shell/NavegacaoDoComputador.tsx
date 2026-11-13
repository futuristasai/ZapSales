"use client";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { DestaqueDoManual } from "@/components/shell/DestaqueDoManual";
import { Faixa } from "@/components/shell/Faixa";
import { GavetaDaArea } from "@/components/shell/GavetaDaArea";
import { PainelDoMenu } from "@/components/shell/PainelDoMenu";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import {
  entradaDaTela,
  telaAtual,
  faixaDoMenu,
  type EntradaDaFaixaId,
} from "@/lib/navigation/faixa";
import { menuDoPapel } from "@/lib/navigation/menu";
import { CaretDoubleLeft, CaretDoubleRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A navegação do computador: a faixa à esquerda e, ao lado dela, o painel (issue #188).
 *
 * O painel é SEMPRE a mesa de Todo dia. As áreas de Configurar e Resultados não o
 * trocam: abrem a gaveta (issue #189), por cima da tela, e ao escolher uma tela ou
 * fechá-la o painel continua onde estava. O painel pode ser RECOLHIDO — sobra só a
 * faixa — e então Todo dia abre o painel POR CIMA da tela, até a pessoa escolher uma
 * tela, apertar Esc ou clicar fora. Nenhum caminho deixa de existir por causa do
 * recolhimento: todas as telas continuam a um clique.
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

  const [recolhido, setRecolhido] = useState(painelRecolhido);
  /** A área cuja gaveta está aberta, ou `null`. */
  const [gavetaId, setGavetaId] = useState<EntradaDaFaixaId | null>(null);
  /** Só vale com o painel recolhido: ele está aberto por cima da tela. */
  const [sobre, setSobre] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLElement | null>(null);
  const lista = useRef<HTMLElement>(null);

  // A área que sumiu (o papel mudou, o módulo foi desligado) fecha a gaveta.
  const gaveta =
    gavetaId === null
      ? null
      : (faixa.configurar.find((e) => e.id === gavetaId) ??
        (faixa.resultados?.id === gavetaId ? faixa.resultados : null));
  // E o id velho não fica de pé: se a área voltar, a gaveta não reabre sozinha.
  if (gavetaId !== null && gaveta === null) setGavetaId(null);
  // Quem não tem tela em Todo dia (a interface da empresa as escondeu) ainda tem o painel fixado,
  // com o botão de recolher, o destaque do Manual e o aviso de versão — só sem a lista.
  const todoDia = faixa.todoDia;
  const painelAberto = !recolhido || sobre;

  function escolher(id: EntradaDaFaixaId, botao: HTMLButtonElement) {
    gatilho.current = botao;
    if (id !== "todo-dia") {
      // A gaveta cobre a tela inteira: o painel que estava por cima dela não tem o que fazer ali.
      setSobre(false);
      setGavetaId(id);
      return;
    }
    // Fixado, o painel já é Todo dia; só recolhido ele abre e fecha por cima da tela.
    if (recolhido) setSobre(!sobre);
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
  }, [recolhido, sobre]);

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
            escolhida={gaveta ? gaveta.id : painelAberto ? "todo-dia" : null}
            atual={entradaDaTela(faixa, pathname)}
            aoEscolher={escolher}
            mostrarAtualizacao={recolhido}
          />
        </div>
      </div>
      {painelAberto ? (
        <section
          aria-label={t(todoDia ? todoDia.label : "Navegação principal")}
          className={cn(
            "flex h-full w-[20.5rem] flex-col border-r bg-card",
            recolhido &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 absolute top-0 left-20 z-40 shadow-xl",
          )}
        >
          <header className="flex items-start gap-1 px-3 pt-4 pb-2">
            <div className="min-w-0 flex-1 px-1">
              {todoDia ? (
                <h2 className="text-base leading-tight font-semibold">{t(todoDia.label)}</h2>
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
          {todoDia ? (
            <nav
              ref={lista}
              aria-label={t("Navegação principal")}
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
            >
              <PainelDoMenu
                entrada={todoDia}
                hrefAtual={telaAtual(faixa, pathname)}
                aoNavegar={aoNavegar}
              />
              {/* O Manual fecha a lista, com título próprio: no rodapé ninguém o via. */}
              <div className="mt-3">
                <DestaqueDoManual aoNavegar={aoNavegar} />
              </div>
            </nav>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              <DestaqueDoManual aoNavegar={aoNavegar} />
            </div>
          )}
          <footer className="border-t p-2 empty:hidden">
            <VersionFooter collapsed={false} onNavigate={aoNavegar} />
          </footer>
        </section>
      ) : null}
      <GavetaDaArea
        entrada={gaveta}
        hrefAtual={telaAtual(faixa, pathname)}
        aoFechar={() => setGavetaId(null)}
        aoDevolverFoco={() => gatilho.current?.focus()}
      />
    </div>
  );
}

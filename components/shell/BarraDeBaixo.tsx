"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";

import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { FolhaDoMenu } from "@/components/shell/FolhaDoMenu";
import { PainelDoMenu } from "@/components/shell/PainelDoMenu";
import { useFaixaDoPapel } from "@/components/shell/useFaixaDoPapel";
import { useT } from "@/hooks/i18n/useT";
import { barraDeBaixoDoMenu, type AbaDaBarra, type AbaDaBarraId } from "@/lib/navigation/celular";
import { entradaDaTela, telaAtual } from "@/lib/navigation/faixa";
import { usePecaDoRodape } from "@/lib/ui/rodape-ocupado";
import { cn } from "@/lib/utils";

/**
 * A GEOMETRIA da barra, escrita uma vez: a barra e a peça que declara o que ela ocupa
 * (`ReservaDoRodape`) usam a mesma classe, para a reserva ser exatamente a altura que a pessoa
 * vê — incluindo a faixa do indicador de início dos aparelhos que a têm.
 */
const GEOMETRIA = "box-content h-14 border-t pb-[env(safe-area-inset-bottom)]";
const ALTURA_DA_BARRA = 56;

const ABA =
  "relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-hidden";

/** Mesmo corte do `md:` do Tailwind: a partir de 768 px o computador usa a faixa e o painel. */
const CONSULTA_DO_COMPUTADOR = "(min-width: 768px)";

/** Sem `matchMedia` (um ambiente de teste, um navegador muito antigo) a janela conta como computador. */
function consultaDoComputador(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(CONSULTA_DO_COMPUTADOR) : null;
}

function assinarCelular(aoMudar: () => void) {
  const consulta = consultaDoComputador();
  consulta?.addEventListener("change", aoMudar);
  return () => consulta?.removeEventListener("change", aoMudar);
}

/**
 * Que janela é esta? `desconhecida` no servidor e na primeira pintura do navegador, para os dois
 * desenharem o mesmo (a barra em si é desenhada nos dois e escondida por CSS acima de 768 px).
 */
type Janela = "desconhecida" | "celular" | "computador";

function useJanela(): Janela {
  return useSyncExternalStore(
    assinarCelular,
    (): Janela => {
      const consulta = consultaDoComputador();
      if (!consulta) return "desconhecida";
      return consulta.matches ? "computador" : "celular";
    },
    (): Janela => "desconhecida",
  );
}

/**
 * A barra é uma peça FIXA do rodapé, e quem a desenha declara o que ela ocupa
 * (`lib/ui/rodape-ocupado.tsx`, issue #1305): a casca desconta isso do `<main>` e o Inbox, que
 * mede a própria altura, encolhe a grade — nada fica atrás das abas. Só existe no celular; com a
 * janela larga a peça sai e a reserva volta a zero.
 */
function ReservaDoRodape() {
  const ancora = usePecaDoRodape({
    dono: "components/shell/BarraDeBaixo.tsx",
    distancia: 0,
    altura: ALTURA_DA_BARRA,
  });
  return (
    <div
      ref={ancora}
      aria-hidden
      className={cn("pointer-events-none invisible fixed inset-x-0 bottom-0", GEOMETRIA)}
    />
  );
}

function Aba({
  aba,
  atual,
  aberta,
  aoAbrir,
}: {
  aba: AbaDaBarra;
  atual: boolean;
  aberta: boolean;
  aoAbrir: (id: AbaDaBarraId, botao: HTMLButtonElement) => void;
}) {
  const t = useT();
  const Icone = aba.icone;
  const destaque = atual || aberta;
  // «Aqui» sem depender de cor: peso da fonte, ícone cheio e uma barra no alto, além do aria-current.
  const classes = cn(
    ABA,
    destaque
      ? "font-bold text-foreground before:absolute before:top-0 before:h-[3px] before:w-10 before:rounded-b-full before:bg-accent"
      : "text-muted-foreground hover:text-foreground",
  );
  const miolo = (
    <>
      <span className="relative inline-flex">
        <Icone size={24} weight={destaque ? "fill" : "regular"} aria-hidden />
        {aba.tipo === "link" && aba.contador === "fila" ? (
          <ContadorDaFila compacto={false} naFaixa className="top-[-6px] right-[-14px]" />
        ) : null}
      </span>
      <span className="max-w-full truncate">{t(aba.label)}</span>
    </>
  );

  if (aba.tipo === "link") {
    return (
      <Link href={aba.href} aria-current={atual ? "page" : undefined} className={classes}>
        {miolo}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={aberta}
      aria-current={atual ? "true" : undefined}
      onClick={(e) => aoAbrir(aba.id, e.currentTarget)}
      className={classes}
    >
      {miolo}
    </button>
  );
}

/**
 * O menu do celular (issue #190, pai #183): uma barra de baixo com Conversas (e a fila),
 * Todo dia, Configurar e Resultados. Conversas vai direto à tela; as outras abrem uma folha com
 * a lista — Configurar com as quatro áreas e seus grupos por tarefa. Substitui a gaveta lateral
 * que o celular tinha; busca e menu da conta ficam no topo (`TopBar`).
 *
 * Só desenha: as abas vêm de `barraDeBaixoDoMenu`, que reagrupa o menu projetado por papel. No
 * computador a barra não aparece (CSS), e a faixa com o painel (`NavegacaoDoComputador`) faz o
 * mesmo papel.
 */
export function BarraDeBaixo() {
  const t = useT();
  const pathname = usePathname();
  const faixa = useFaixaDoPapel();
  const janela = useJanela();
  const abas = barraDeBaixoDoMenu(faixa);
  const [abertaId, setAbertaId] = useState<AbaDaBarraId | null>(null);
  const gatilho = useRef<HTMLElement | null>(null);

  const hrefAtual = telaAtual(faixa, pathname);
  const entradaAtual = entradaDaTela(faixa, pathname);
  const conversasAtual = abas.some((a) => a.tipo === "link" && a.href === hrefAtual);
  const ehAtual = (aba: AbaDaBarra): boolean =>
    aba.tipo === "link"
      ? aba.href === hrefAtual
      : // Conversas mora em Todo dia, mas é ela a aba atual quando a tela é a dela.
        aba.entradas.some((e) => e.id === entradaAtual) &&
        !(aba.id === "todo-dia" && conversasAtual);

  if (abas.length === 0) return null;
  const aberta = abas.find((a) => a.id === abertaId);
  const fechar = () => setAbertaId(null);

  return (
    <>
      <nav
        aria-label={t("Menu do celular")}
        className={cn("fixed inset-x-0 bottom-0 z-40 flex bg-card md:hidden", GEOMETRIA)}
      >
        {abas.map((aba) => (
          <Aba
            key={aba.id}
            aba={aba}
            atual={ehAtual(aba)}
            aberta={abertaId === aba.id}
            aoAbrir={(id, botao) => {
              gatilho.current = botao;
              setAbertaId(id);
            }}
          />
        ))}
      </nav>
      {janela === "celular" ? <ReservaDoRodape /> : null}
      {/* Girar o aparelho passa dos 768 px: no computador a navegação é a faixa, e uma folha
          esquecida por cima dela cobriria a tela sem ter como ser alcançada. */}
      {aberta && aberta.tipo === "folha" && janela !== "computador" ? (
        <FolhaDoMenu titulo={t(aberta.label)} gatilho={gatilho} aoFechar={fechar}>
          <nav aria-label={t(aberta.label)}>
            {aberta.id === "configurar"
              ? aberta.entradas.map((area) => (
                  <div key={area.id} role="group" aria-labelledby={`folha-area-${area.id}`}>
                    <h3
                      id={`folha-area-${area.id}`}
                      className="mt-3 border-b px-3 pt-1 pb-1.5 text-base font-semibold first:mt-0"
                    >
                      {t(area.label)}
                    </h3>
                    <PainelDoMenu entrada={area} hrefAtual={hrefAtual} aoNavegar={fechar} />
                  </div>
                ))
              : aberta.entradas.map((entrada) => (
                  <PainelDoMenu
                    key={entrada.id}
                    entrada={entrada}
                    hrefAtual={hrefAtual}
                    aoNavegar={fechar}
                  />
                ))}
          </nav>
        </FolhaDoMenu>
      ) : null}
    </>
  );
}

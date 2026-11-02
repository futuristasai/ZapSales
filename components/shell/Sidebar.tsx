"use client";
import { NavegacaoDoComputador } from "@/components/shell/NavegacaoDoComputador";

/**
 * A navegação do COMPUTADOR: a faixa e o painel (issue #188). O celular tem a barra de baixo
 * (`BarraDeBaixo`, issue #190); o menu de gaveta lateral que ele tinha, e o `SidebarContent`
 * que o desenhava, deixaram de existir.
 *
 * `collapsed` é o painel recolhido (o cookie que `toggleSidebar` grava, lido no layout).
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      // ⚠️ `sticky`, e NUNCA `fixed`.
      //
      // Com `fixed` a barra sai do fluxo: ela não ocupa lugar nenhum na linha,
      // e quem afastava o conteúdo era um `md:ml-16`/`md:ml-60` do lado de lá.
      // Duas medidas para a mesma coisa, em componentes diferentes — e no dia
      // em que discordassem (largura de 60 com margem de 16), a barra passava
      // POR CIMA da lista de conversas, escondendo o começo de cada linha.
      //
      // Foi assim que apareceu numa instalação real: a barra expandida, com as
      // etiquetas legíveis, e a lista atrás dela cortada. Um F5 "consertava",
      // que é a assinatura de servidor e navegador terem pintado estados
      // diferentes — e `AppShell` e `Sidebar` são ambos `"use client"`.
      //
      // `sticky top-0 h-screen` dá o mesmo efeito visual (a barra não rola com
      // a página) e ela VOLTA a ocupar lugar: sobra para o conteúdo exatamente
      // o que ela não usou, e não há segunda medida para discordar. A faixa e o
      // painel fixado ocupam lugar JUNTOS; o painel recolhido que se abre por
      // cima da tela é `absolute` DENTRO desta caixa, nunca `fixed`.
      //
      // `shrink-0` porque item de flex encolhe por padrão, e uma barra espremida
      // para caber é o mesmo defeito por outro caminho.
      className="sticky top-0 z-30 flex h-screen shrink-0"
    >
      <NavegacaoDoComputador painelRecolhido={collapsed} />
    </aside>
  );
}

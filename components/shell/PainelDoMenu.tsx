"use client";
import { ItemDoMenu } from "@/components/shell/ItemDoMenu";
import { useT } from "@/hooks/i18n/useT";
import type { EntradaDaFaixa } from "@/lib/navigation/faixa";
import type { GrupoProjetado } from "@/lib/navigation/menu";
import { cn } from "@/lib/utils";

/** Os dois grupos que formam a «mesa de trabalho»; os demais de Todo dia ficam fora dela. */
const GRUPOS_DA_MESA: readonly string[] = ["leads", "gestao-de-clientes"];

function Subtitulo({ children, daMesa, id }: { children: string; daMesa: boolean; id: string }) {
  return (
    <h3
      id={id}
      className={cn(
        "px-3 pt-3 pb-1 text-xs font-bold first:pt-1",
        daMesa ? "text-foreground" : "text-text-subtle",
      )}
    >
      {children}
    </h3>
  );
}

function Grupo({
  grupo,
  atual,
  daMesa,
  aoNavegar,
}: {
  grupo: GrupoProjetado;
  atual: (href: string) => boolean;
  daMesa: boolean;
  aoNavegar?: () => void;
}) {
  const t = useT();
  const tituloId = `menu-grupo-${grupo.id}`;
  return (
    <section aria-labelledby={tituloId}>
      <Subtitulo id={tituloId} daMesa={daMesa}>
        {t(grupo.label)}
      </Subtitulo>
      <ul className="space-y-0.5">
        {grupo.itens.map((item) => (
          <li key={item.href}>
            <ItemDoMenu item={item} ativo={atual(item.href)} aoNavegar={aoNavegar} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O que o painel lista: a MESA de Todo dia.
 *
 * Leads e Gestão de Clientes CRM juntos numa caixa, com os contadores, e depois «Se a
 * sua empresa usa» fora dela — que só existe na empresa que ligou Propostas. As áreas de
 * Configurar e Resultados não passam por aqui: elas abrem a gaveta (`GavetaDaArea`, issue #189).
 * O destaque do Manual, que fecha o painel do computador, é de quem monta o painel
 * (`NavegacaoDoComputador`), e não daqui: a folha do celular reusa esta lista para todas as abas.
 *
 * Não decide quem vê o quê: recebe os grupos já projetados (`faixaDoMenu`).
 */
export function PainelDoMenu({
  entrada,
  hrefAtual,
  aoNavegar,
}: {
  /** A entrada Todo dia. */
  entrada: EntradaDaFaixa;
  /** O endereço da tela atual (`telaAtual`): uma só, a mais específica. */
  hrefAtual: string | null;
  aoNavegar?: () => void;
}) {
  const atual = (href: string) => href === hrefAtual;
  const mesa = entrada.grupos.filter((g) => GRUPOS_DA_MESA.includes(g.id));
  const resto = entrada.grupos.filter((g) => !GRUPOS_DA_MESA.includes(g.id));
  return (
    <div className="space-y-3">
      {mesa.length > 0 && (
        <div
          data-testid="mesa-de-trabalho"
          className="space-y-1 rounded-xl border border-accent/20 bg-accent-soft/40 p-1.5"
        >
          {mesa.map((g) => (
            <Grupo key={g.id} grupo={g} atual={atual} daMesa aoNavegar={aoNavegar} />
          ))}
        </div>
      )}
      {resto.map((g) => (
        <Grupo key={g.id} grupo={g} atual={atual} daMesa={false} aoNavegar={aoNavegar} />
      ))}
    </div>
  );
}

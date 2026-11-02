import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";
import type { InterfaceSettings } from "@/lib/navigation/interface";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { Painel } from "@/components/ui/painel";
import type { Role } from "@/lib/auth/types";
import { permissaoDaCapacidade } from "@/lib/extensions/capacidades";
import { portasLegiveis } from "@/lib/extensions/portas-legiveis";
import { localize, type ExtensionManifest } from "@/lib/extensions/manifest";
import type { ExtensionGuideView } from "@/lib/extensions/view";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";
import type { PaginaDeAreaHref } from "@/lib/navigation/catalogo";
import { secoesDaPaginaDeArea } from "@/lib/navigation/menu";
import { PAGINAS } from "@/lib/navigation/registry";
import { BookOpen, CaretRight, Lightbulb, ListChecks, Warning } from "@/lib/ui/icons";

interface NavHubProps {
  interfaceSettings?: InterfaceSettings;
  /**
   * Módulos opcionais ligados na instalação. OBRIGATÓRIO: quando era opcional,
   * ausente queria dizer "não filtra", e o hub de IA mostrava a porta de um
   * módulo desligado — o clique dava 404 (revisão do #1573, B1).
   */
  modulosLigados: readonly ModuloOpcional[];
  /** Capacidades que a organização ligou. Ausente = o hub não filtra por capacidade. */
  capacidadesLigadas?: readonly CapacidadeDaOrganizacao[];
  /** Qual página de área é esta — o título, o subtítulo e os grupos vêm de `PAGINAS_DE_AREA`. */
  pagina: PaginaDeAreaHref;
  isPlatformAdmin: boolean;
  role: Role | null;
  extensionGuides?: ExtensionGuideView[];
  extensionsUnavailable?: boolean;
  /**
   * Idioma da interface. `traduzir` é pura — roda em Server Component sem
   * provider. O default mantém os demais hubs (ex.: /app/ai) como estão até
   * que a página deles passe o locale; o que não tem entrada no dicionário
   * degrada para pt-BR, que é o comportamento de antes.
   */
  locale?: Idioma;
}

const EXTENSION_ICONS: Record<ExtensionManifest["display"]["icon"], typeof ListChecks> = {
  ListChecks,
  BookOpen,
  Lightbulb,
};

/**
 * Uma página de área (`/app/crm`, `/app/ai`, `/app/analise`, `/app/settings`): o
 * inventário dos grupos por tarefa que ela declara em `PAGINAS_DE_AREA`, cada tela
 * com a frase que explica para que serve.
 *
 * Não é mais o caminho principal do menu (issue #192) — o menu leva a qualquer tela
 * sem passar por aqui —, mas o endereço continua abrindo e a busca ⌘K a acha. As
 * seções são os MESMOS grupos do menu, com os mesmos nomes; não há segunda lista.
 */
/**
 * `aria-labelledby` separa múltiplos ids por ESPAÇO — então um id com espaço
 * ("hub-ia-Ensinar o agente") vira três referências quebradas e a seção fica sem
 * rótulo acessível. O slug é o que mantém a região anunciável.
 */
function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function NavHub({
  pagina,
  isPlatformAdmin,
  role,
  interfaceSettings,
  modulosLigados,
  capacidadesLigadas,
  locale = IDIOMA_PADRAO,
  extensionGuides = [],
  extensionsUnavailable = false,
}: NavHubProps) {
  const secoes = secoesDaPaginaDeArea(
    pagina,
    isPlatformAdmin,
    role,
    interfaceSettings,
    modulosLigados,
    capacidadesLigadas,
  );
  const { label, description } = PAGINAS.find((p) => p.href === pagina) ?? { label: "", description: "" };

  return (
    <CorpoDaPagina largura="lista" className="gap-8">
      <CabecalhoDePagina titulo={traduzir(label, locale)} descricao={traduzir(description, locale)} />

      {secoes.map((grupo) => (
        <div key={grupo.id} className="space-y-3">
          {/* Título de seção de verdade, não um rótulo miúdo em caixa alta: é o que diz, em palavras, a
              tarefa do grupo ("Montar o agente", "O seu funil"). */}
          <h2 id={`hub-${slug(pagina)}-${grupo.id}`} className="text-base font-semibold tracking-tight">
            {traduzir(grupo.label, locale)}
          </h2>
          <Painel aria-labelledby={`hub-${slug(pagina)}-${grupo.id}`} semRecuo>
            <ul className="divide-y divide-border">
              {grupo.itens.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden focus-visible:ring-inset"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted transition-colors group-hover:text-accent">
                        <Icon size={22} weight="duotone" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{traduzir(item.label, locale)}</span>
                          {item.menu.termo ? (
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {traduzir(item.menu.termo, locale)}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {traduzir(item.description, locale)}
                        </span>
                      </span>
                      <CaretRight
                        size={16}
                        aria-hidden
                        className="shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Painel>
        </div>
      ))}

      {pagina === "/app/crm" && (extensionGuides.length > 0 || extensionsUnavailable) ? (
        <section aria-labelledby="hub-crm-orientacoes-instaladas" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="hub-crm-orientacoes-instaladas" className="text-base font-semibold tracking-tight">
                {traduzir("Orientações instaladas", locale)}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {traduzir(
                  "Guias adicionados depois da instalação, sem acesso aos dados do CRM.",
                  locale,
                )}
              </p>
            </div>
            <Link
              href="/app/extensions"
              className="text-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden"
            >
              {traduzir("Gerenciar extensões", locale)}
            </Link>
          </div>

          {extensionsUnavailable ? (
            <Card className="flex gap-3 border-warning/40 bg-warning-bg p-4">
              <Warning
                size={20}
                weight="duotone"
                aria-hidden
                className="mt-0.5 shrink-0 text-warning-fg"
              />
              <div>
                <h3 className="text-sm font-semibold">
                  {traduzir("Não foi possível conferir as orientações instaladas", locale)}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {traduzir(
                    "Abra Extensões para tentar novamente e ver o estado registrado no servidor.",
                    locale,
                  )}
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {extensionGuides.flatMap((guide) =>
                guide.manifest.contributions.crm_cards.map((contribution) => {
                  const Icon = EXTENSION_ICONS[contribution.icon];
                  const compact = guide.configuration.density === "compact";
                  return (
                    <Link
                      key={`${guide.installation_id}:${contribution.id}`}
                      href={`/app/extensions/${encodeURIComponent(guide.installation_id)}?card=${encodeURIComponent(contribution.id)}`}
                      data-testid={`extension-contribution-${guide.installation_id}-${contribution.id}`}
                      className="block rounded-lg focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                    >
                      <Card
                        className={`flex h-full gap-3 transition-colors hover:border-border-strong ${compact ? "p-3" : "p-4"}`}
                      >
                        <Icon
                          size={20}
                          weight="duotone"
                          aria-hidden
                          className="mt-0.5 shrink-0 text-accent"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                            {localize(guide.manifest.display.title, locale).text}
                          </p>
                          <h3 className="mt-0.5 text-sm font-semibold">
                            {localize(contribution.title, locale).text}
                          </h3>
                          {guide.configuration.show_description ? (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {localize(contribution.description, locale).text}
                            </p>
                          ) : null}
                          {localize(contribution.title, locale).fallback ||
                          (guide.configuration.show_description &&
                            localize(contribution.description, locale).fallback) ? (
                            <p className="mt-1 text-[11px] text-warning-fg">
                              {traduzir("Texto disponível em português.", locale)}
                            </p>
                          ) : null}
                          <p className="mt-2 text-[11px] text-text-subtle">
                            {portasLegiveis(
                              [permissaoDaCapacidade(contribution.action.capability)],
                              (texto) => traduzir(texto, locale),
                            )}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  );
                }),
              )}
            </div>
          )}
        </section>
      ) : null}
    </CorpoDaPagina>
  );
}

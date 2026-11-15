"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import {
  CATALOGO_DO_ADMIN,
  GRUPOS_DO_ADMIN,
  itemAtualDoAdmin,
  type ItemDoAdmin,
} from "@/lib/admin/catalogo";
import { SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { useT } from "@/hooks/i18n/useT";

import { ICONES_DO_ADMIN } from "./icones-do-admin";

interface AdminSidebarProps {
  userEmail: string;
  /** "mobile" = conteúdo desta MESMA navegação dentro do drawer que `AdminShell`
   * abre abaixo de `lg` — mesmo padrão de `components/shell/Sidebar.tsx`. */
  variant?: "desktop" | "mobile";
}

/**
 * O menu da área de administração da instalação. Os itens NÃO moram aqui: saem do
 * catálogo `lib/admin/catalogo.ts` (issue #308), o mesmo que o cabeçalho de cada
 * tela e o título da aba leem. Este componente só desenha.
 *
 * ── Grupos ────────────────────────────────────────────────────────────────────
 *
 * Cinco grupos com título, para achar a tela pelo assunto. O título do grupo é
 * `sticky` dentro da área que rola: numa tela de notebook baixa, quem rola continua
 * vendo em que grupo está (história 21).
 *
 * ── A dica ────────────────────────────────────────────────────────────────────
 *
 * No computador, cada item abre uma dica de uma frase ao passar o mouse OU ao
 * receber foco do teclado — o Radix Tooltip faz as duas coisas, e o Provider já
 * mora na casca (`AdminShell`). Na gaveta do celular não há dica: no toque não
 * existe "passar o mouse", e a ajuda vive no cabeçalho de cada tela. A dica também
 * vai para `aria-describedby` (é o que o Radix faz com o conteúdo aberto), então
 * leitor de tela ouve a frase no foco.
 *
 * ── Tons ──────────────────────────────────────────────────────────────────────
 *
 * O ícone de um item inativo leva o tom do grupo (`--color-grupo-*`). O item ATIVO
 * herda a cor do texto do destaque, como antes: a cor da marca do revendedor
 * continua sendo a que marca "você está aqui", e o tom do grupo não compete com ela.
 */
export function AdminSidebar({ userEmail, variant = "desktop" }: AdminSidebarProps) {
  const t = useT();
  const isMobile = variant === "mobile";
  const pathname = usePathname();
  // Por PROP do servidor, e nunca `branding()`: aquela função lê fontes
  // diferentes nos dois lados da fronteira (`window.__PUBLIC_ENV__` no
  // navegador, `process.env` no servidor), e desde que o layout raiz passou a
  // injetar a marca do BANCO as duas divergem — o nome renderizado no SSR não
  // batia com o hidratado, que é hydration mismatch. Ver `lib/branding/contexto.tsx`.
  const marca = useMarcaDaInstalacao();
  // Uma tela atual só, inclusive nas subpáginas (`/admin/tenants/<id>/health` → Empresas).
  const atual = itemAtualDoAdmin(pathname);

  // Provider próprio: a barra não pode depender de quem a desenha para as dicas não
  // quebrarem (a casca já tem um, mas o teste de hidratação e a gaveta a desenham sozinha).
  // Provider aninhado é inofensivo no Radix.
  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex flex-col border-r bg-card",
          isMobile
            ? "h-full w-full"
            : "sticky top-10 hidden h-[calc(100dvh-2.5rem)] w-64 shrink-0 lg:flex",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {/* O nome já está escrito ao lado — o símbolo é reforço, não legenda. */}
          {marcaEhADoProduto(marca) && (
            <SimboloDoProduto nome={marca.name} decorativo className="h-8 w-8" />
          )}
          <div className="flex flex-col">
            <span className="text-xs tracking-wider text-muted-foreground uppercase">
              {marca.name}
            </span>
            <span className="text-sm font-semibold tracking-tight">
              {t("Administração da instalação")}
            </span>
          </div>
        </div>
        <nav
          className="flex-1 overflow-y-auto px-2 pb-2"
          aria-label={t("Navegação da administração")}
        >
          {GRUPOS_DO_ADMIN.map((grupo) => {
            const itens = CATALOGO_DO_ADMIN.filter((i) => i.grupo === grupo.id);
            const idDoTitulo = `grupo-admin-${variant}-${grupo.id}`;
            return (
              <section key={grupo.id} aria-labelledby={idDoTitulo} data-grupo={grupo.id}>
                <h2
                  id={idDoTitulo}
                  className="sticky top-0 z-10 bg-card px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {t(grupo.label)}
                </h2>
                <ul className="space-y-px">
                  {itens.map((item) => (
                    <li key={item.href}>
                      <ItemDoMenu
                        item={item}
                        tom={grupo.tom}
                        ativo={atual?.href === item.href}
                        comDica={!isMobile}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
        <div className="shrink-0 space-y-1 border-t p-3">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <ArrowRight size={14} aria-hidden />
            <span>{t("Voltar para a sua empresa")}</span>
          </Link>
          <p className="truncate px-2 text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ItemDoMenu({
  item,
  tom,
  ativo,
  comDica,
}: {
  item: ItemDoAdmin;
  tom: string;
  ativo: boolean;
  comDica: boolean;
}) {
  const t = useT();
  const Icone = ICONES_DO_ADMIN[item.icone];
  const link = (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      data-href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm leading-snug transition-colors",
        ativo
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icone
        size={18}
        weight={ativo ? "fill" : "regular"}
        className={cn("shrink-0", !ativo && tom)}
        aria-hidden
      />
      <span className="min-w-0">{t(item.label)}</span>
    </Link>
  );
  if (!comDica) return link;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" align="center" className="max-w-64 text-pretty">
        {t(item.dica)}
      </TooltipContent>
    </Tooltip>
  );
}

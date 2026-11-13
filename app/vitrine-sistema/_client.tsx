"use client";

import { AuthProvider } from "@/hooks/auth/AuthProvider";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { Sidebar } from "@/components/shell/Sidebar";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { SeletorDeFunil } from "@/components/kanban/SeletorDeFunil";
import { Button } from "@/components/ui/button";
import { Painel } from "@/components/ui/painel";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import { ICONES_DO_PRODUTO } from "@/components/icons/produto";
import { ChatCircle, Funnel, Kanban, Robot, Signpost, Tray } from "@/lib/ui/icons";
import type { IconWeight } from "@phosphor-icons/react";
import { MENU_GRUPOS } from "@/lib/navigation/catalogo";
import { NAV_DESTINATIONS, PAGINAS } from "@/lib/navigation/registry";

const ORG_ID = "00000000-0000-4000-8000-000000000001";

/** Os funis de uma clínica, para o seletor do quadro: um nome comprido de propósito. */
const FUNIS_DE_EXEMPLO = [
  { id: "funil-1", name: "Matrículas" },
  { id: "funil-2", name: "Implantes" },
  { id: "funil-3", name: "Ortodontia e alinhadores invisíveis para adultos" },
  { id: "funil-4", name: "Clareamento" },
  { id: "funil-5", name: "Pós-venda" },
];

const USUARIO = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "ana.paula@exemplo.invalid",
  full_name: "Ana Paula",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR",
  organizations: [{ organization_id: ORG_ID, organization_name: "Clínica Sorriso Vivo", role: "admin" }],
} as unknown as AuthUser;

const ORGANIZACAO = {
  orgId: ORG_ID,
  name: "Clínica Sorriso Vivo",
  role: "admin",
  visibility_mode: "all",
  modulos_ligados: [],
  capacidades_ligadas: [],
} as unknown as ActiveOrg;

function Quadro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * A VITRINE DO SISTEMA.
 *
 * O menu desenhado aqui é o REAL (`components/shell/Sidebar`), com o catálogo real de destinos; só a
 * sessão é de mentira. Os contadores e a saúde da conexão buscam na rede e, sem servidor, não
 * desenham nada — o que se mede aqui é a casca, não o dado.
 */
export function VitrineDoSistema() {
  const grupos = MENU_GRUPOS.map((g) => ({
    grupo: g,
    destinos: NAV_DESTINATIONS.filter((d) => d.menu.grupo === g.id).sort((a, b) => a.menu.ordem - b.menu.ordem),
  }));
  return (
    <AuthProvider user={USUARIO} activeOrg={ORGANIZACAO}>
      <main className="mx-auto max-w-[1400px] space-y-10 p-6 text-foreground">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Vitrine do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Peças reais da casca com dados de exemplo. Cada peça nova entra aqui antes de entrar numa tela.
          </p>
        </header>

        <Quadro titulo="Menu do computador: painel aberto (o padrão) e recolhido (escolha da pessoa)">
          <div className="flex items-start gap-6" data-vitrine="menus">
            <div className="h-[820px] overflow-hidden rounded-lg border" data-vitrine="menu-expandido">
              <div className="h-full [&>aside]:h-full">
                <Sidebar collapsed={false} />
              </div>
            </div>
            <div className="h-[820px] overflow-hidden rounded-lg border" data-vitrine="menu-recolhido">
              <div className="h-full [&>aside]:h-full">
                <Sidebar collapsed />
              </div>
            </div>
          </div>
        </Quadro>

        <Quadro titulo="Cabeçalho do quadro, com o seletor para trocar de funil">
          <div className="rounded-lg border bg-card p-6" data-vitrine="cabecalho-do-quadro">
            {/* O mesmo arranjo de `app/app/pipelines/[id]/_client.tsx`: nome, seletor e o botão. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 truncate text-2xl font-semibold tracking-tight">Matrículas</p>
                <SeletorDeFunil funis={FUNIS_DE_EXEMPLO} atualId="funil-1" />
              </div>
              <Button className="shrink-0">Novo Lead</Button>
            </div>
          </div>
        </Quadro>

        <Quadro titulo="Cabeçalho de página, com o botão Como funciona">
          <div className="rounded-lg border bg-card p-6" data-vitrine="cabecalho">
            <CabecalhoDePagina
              titulo="Funis"
              descricao="Os funis pelos quais seus clientes passam, da primeira conversa até fechar negócio."
              ajuda={<ComoFunciona chave="funis" pagina="Funis" />}
              acoes={<Button size="sm">Novo funil</Button>}
            />
          </div>
        </Quadro>

        <Quadro titulo="Ícones próprios do produto, ao lado do Phosphor">
          <div className="space-y-4" data-vitrine="icones-proprios">
            {(
              [
                ["FunilEmEtapas", "a Linha do Funil", [Kanban, Funnel]],
                ["AgenteEmConversa", "o agente de IA numa conversa", [Robot]],
                ["PassagemParaHumano", "a IA entrega a conversa a uma pessoa", [Signpost]],
                ["FilaDeEspera", "quem espera atendimento", [Tray]],
                ["JanelaDe24h", "a janela de 24 horas da API Oficial", [ChatCircle]],
              ] as const
            ).map(([nome, significado, vizinhos]) => {
              const Proprio = ICONES_DO_PRODUTO[nome];
              return (
                <div key={nome} className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border bg-card p-4" data-icone-proprio={nome}>
                  <div className="w-64">
                    <p className="text-sm font-semibold">{nome}</p>
                    <p className="text-xs text-muted-foreground">{significado}</p>
                  </div>
                  {(["regular", "bold", "duotone", "fill"] as IconWeight[]).map((peso) => (
                    <div key={peso} className="flex flex-col items-center gap-2">
                      <div className="flex items-end gap-3">
                        <Proprio size={16} weight={peso} aria-hidden />
                        <Proprio size={24} weight={peso} aria-hidden />
                        <Proprio size={48} weight={peso} aria-hidden />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{peso}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-2 border-l pl-8 text-muted-foreground">
                    <div className="flex items-end gap-3">
                      {vizinhos.map((Vizinho, i) => (
                        <Vizinho key={i} size={48} aria-hidden />
                      ))}
                    </div>
                    <span className="text-[11px]">Phosphor, para comparar</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Quadro>

        <Quadro titulo="Selos: a cor diz uma coisa só">
          <div className="flex flex-wrap gap-2" data-vitrine="selos">
            {(
              [
                ["ia", "IA atendendo"],
                ["humano", "Em atendimento: Ana Paula"],
                ["funil", "Na fila · 12 minutos"],
                ["concluido", "Aceito"],
                ["falha", "Falhou ao enviar"],
                ["neutro", "admin"],
              ] as [SignificadoDoSelo, string][]
            ).map(([significado, texto]) => (
              <Selo key={significado} significado={significado}>
                {texto}
              </Selo>
            ))}
          </div>
        </Quadro>

        <Quadro titulo="Painel, com cabeçalho e tabela encostada nas bordas">
          <div className="max-w-3xl" data-vitrine="painel">
            <Painel titulo="Membros" descricao="Quem trabalha aqui e o que cada pessoa pode fazer." acoes={<Button size="sm">Convidar membros</Button>} semRecuo>
              <ul className="divide-y divide-border text-sm">
                {[
                  ["Ana Paula", "Gestora", "concluido", "Aceito"],
                  ["Bruno Lima", "Atendente", "funil", "Convite pendente"],
                ].map(([nome, papel, significado, estado]) => (
                  <li key={nome} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium">{nome}</p>
                      <p className="text-xs text-muted-foreground">{papel}</p>
                    </div>
                    <Selo significado={significado as SignificadoDoSelo}>{estado}</Selo>
                  </li>
                ))}
              </ul>
            </Painel>
          </div>
        </Quadro>

        <Quadro titulo="Folha de ícones: um por destino">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-vitrine="folha-de-icones">
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Páginas de área</h3>
              <ul className="space-y-1.5">
                {PAGINAS.map((p) => {
                  const Icone = p.icon;
                  return (
                    <li key={p.href} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Icone size={20} aria-hidden />
                      {p.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            {grupos.map(({ grupo, destinos }) => {
              return (
                <div key={grupo.id} className="space-y-2 rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-semibold">{grupo.label}</h3>
                  <ul className="space-y-1.5">
                    {destinos.map((d) => {
                      const Icone = d.icon;
                      return (
                        <li key={d.href} className="flex items-center gap-3 text-sm" data-icone={d.icon.displayName ?? ""}>
                          <Icone size={20} aria-hidden />
                          {d.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Quadro>
      </main>
    </AuthProvider>
  );
}

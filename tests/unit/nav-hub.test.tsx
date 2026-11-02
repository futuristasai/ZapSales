/**
 * O hub é a vitrine de um grupo: mostra TUDO que ele tem, com descrição,
 * organizado pela jornada de quem usa. É onde as sete telas que só existiam
 * atrás das abas de IA passam a ser descobertas.
 *
 * A permissão é do registro (`navegacao-registry.test.ts`); aqui é o desenho.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { NavHub } from "@/components/shell/NavHub";
import { DICIONARIO } from "@/lib/i18n/dicionario";
import type { ExtensionGuideView } from "@/lib/extensions/view";
import { secoesDaPaginaDeArea } from "@/lib/navigation/menu";

afterEach(cleanup);

describe("NavHub", () => {
  const extensionGuide: ExtensionGuideView = {
    organization_id: "00000000-0000-4000-8000-000000000001",
    installation_id: "00000000-0000-4000-8000-000000000002",
    version: "1.0.0",
    revision: 3,
    configuration: { density: "compact", show_description: false },
    manifest: {
      format_version: 1,
      profile: "declarative",
      publisher: "equipe-exemplo",
      name: "rotina-comercial",
      version: "1.0.0",
      license: "MIT",
      host_api: { min: 1, max: 2 },
      permissions: ["navigation.tasks"],
      dependencies: [],
      data: { mode: "none" },
      display: {
        title: { "pt-BR": "Rotina comercial", es: "Rutina comercial" },
        summary: { "pt-BR": "Organize os próximos passos." },
        category: "sales",
        icon: "ListChecks",
      },
      configuration: { density: "comfortable", show_description: true },
      contributions: {
        crm_cards: [
          {
            id: "primeiro-passo",
            title: { "pt-BR": "Comece por aqui", es: "Empieza aquí" },
            description: { "pt-BR": "Uma descrição que a configuração esconde." },
            icon: "Lightbulb",
            blocks: [],
            action: { label: { "pt-BR": "Abrir tarefas" }, capability: "tasks.open" },
          },
        ],
      },
    },
  };

  it("apresenta o Agente nas três tarefas do menu, na ordem", () => {
    render(<NavHub modulosLigados={[]} pagina="/app/ai" isPlatformAdmin role={null} />);
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toEqual([
      "Montar o agente",
      "Ensinar o agente",
      "Conectar a IA",
      "Leads",
      "Equipe e IA",
      "Quando algo dá errado",
    ]);
  });

  it("desenterra Conhecimento, que só existia atrás das abas", () => {
    render(<NavHub modulosLigados={[]} pagina="/app/ai" isPlatformAdmin role={null} />);
    const link = screen.getByRole("link", { name: /Conhecimento/ });
    expect(link).toHaveAttribute("href", "/app/ai/knowledge/sources");
  });

  it("cada card explica para que serve — é o que o menu não cabe dizer", () => {
    render(<NavHub modulosLigados={[]} pagina="/app/ai" isPlatformAdmin role={null} />);
    const link = screen.getByRole("link", { name: /Conhecimento/ });
    expect(link.textContent).toMatch(/consulta antes de responder/i);
  });

  it("mostra tudo o que o menu mostra nesses grupos — é inventário, não sobra", () => {
    render(<NavHub modulosLigados={[]} pagina="/app/ai" isPlatformAdmin role={null} />);
    expect(screen.getByRole("link", { name: /Agentes/ })).toBeTruthy();
  });

  it("o viewer vê Extensões e Dados de outro sistema; a seção aparece filtrada, sem Chaves de acesso nem LGPD", () => {
    /**
     * Esta asserção dizia `not.toContain("Dados e acesso")`, e passava porque os
     * DOIS destinos daquela seção eram `admin`. "Dados de outro sistema" entrou nela sem
     * `minRole` (o banco externo é lido por qualquer autenticado — decisão do
     * dono no #1130), e a seção passou a existir para o `viewer`.
     *
     * O que se quer provar continua sendo a filtragem por papel, e ela fica mais
     * forte aqui do que na forma antiga: a seção RENDERIZA e ainda assim os dois
     * destinos de `admin` não estão nela. Sumir a seção inteira é caso de
     * `tests/unit/navegacao-registry.test.ts`, onde a propriedade é afirmada
     * sobre todo grupo e todo papel, em vez de sobre uma seção nomeada.
     */
    render(
      <NavHub modulosLigados={["banco_externo"]} pagina="/app/settings" isPlatformAdmin={false} role="viewer" />,
    );
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toContain("Você");
    expect(secoes).toContain("Plano e regras");
    expect(secoes).toContain("Outros sistemas");
    expect(screen.getByRole("link", { name: /Extensões/ })).toHaveAttribute(
      "href",
      "/app/extensions",
    );
    expect(screen.getByRole("link", { name: /Dados de outro sistema/ })).toHaveAttribute(
      "href",
      "/app/integracao-dados",
    );
    expect(screen.queryByRole("link", { name: /Chaves de acesso/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /LGPD/ })).toBeNull();
  });

  it("a porta do banco externo só existe com o módulo ligado na instalação (doc 37)", () => {
    // Desligado: some para TODO papel, inclusive o admin da empresa — quem liga
    // é quem administra o servidor. Para o viewer, a seção inteira some junto,
    // porque "Dados de outro sistema" era a única porta dela ao alcance dele.
    render(
      <NavHub pagina="/app/settings" isPlatformAdmin={false} role="admin" modulosLigados={[]} />,
    );
    expect(screen.queryByRole("link", { name: /Dados de outro sistema/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Chaves de acesso/ })).toBeTruthy();
    cleanup();

    render(
      <NavHub pagina="/app/settings" isPlatformAdmin={false} role="viewer" modulosLigados={[]} />,
    );
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).not.toContain("Outros sistemas");
    cleanup();

    render(
      <NavHub
        pagina="/app/settings"
        isPlatformAdmin={false}
        role="viewer"
        modulosLigados={["banco_externo"]}
      />,
    );
    expect(screen.getByRole("link", { name: /Dados de outro sistema/ })).toHaveAttribute(
      "href",
      "/app/integracao-dados",
    );
  });

  it("a porta de Propostas no hub do CRM some com a capacidade desligada e volta ligada", () => {
    render(
      <NavHub pagina="/app/crm" isPlatformAdmin={false} role="admin" modulosLigados={[]} capacidadesLigadas={[]} />,
    );
    expect(screen.queryByRole("link", { name: /Propostas/ })).toBeNull();
    cleanup();

    render(
      <NavHub
        pagina="/app/crm"
        isPlatformAdmin={false}
        role="admin"
        modulosLigados={[]}
        capacidadesLigadas={["propostas"]}
      />,
    );
    expect(screen.getByRole("link", { name: /Propostas/ })).toHaveAttribute("href", "/app/proposals");
  });

  it("agrupa os cards sob a própria seção, não numa lista solta", () => {
    render(<NavHub modulosLigados={[]} pagina="/app/ai" isPlatformAdmin role={null} />);
    const ensinar = screen.getByRole("region", { name: "Ensinar o agente" });
    expect(within(ensinar).getByRole("link", { name: /Memória/ })).toBeTruthy();
    expect(within(ensinar).queryByRole("link", { name: /Chave da IA/ })).toBeNull();
  });

  it("traduz o conteúdo do hub quando a página entrega o idioma", () => {
    render(
      <NavHub modulosLigados={[]}
        pagina="/app/ai"
        isPlatformAdmin
        role={null}
        locale="es"
      />,
    );

    expect(
      screen.getByText("Todo lo que define quién atiende por ti, y cómo dar seguimiento a lo que hace."),
    ).toBeTruthy();
    // As três primeiras seções são as do agente, em espanhol; as outras três (Leads, Equipe e IA,
    // Quando algo dá errado) vêm do mesmo menu e têm a tradução cobrada por i18n-catalogo-do-menu.
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .slice(0, 3)
        .map((h) => h.textContent?.trim()),
    ).toEqual(["Configurar el agente", "Enseñar al agente", "Conectar la IA"]);
    expect(
      screen.getByRole("link", { name: /Clave de la IA.*La clave del proveedor de IA/ }),
    ).toBeTruthy();
  });

  it("todo texto registrado na página do Agente tem tradução em espanhol", () => {
    const textos = secoesDaPaginaDeArea("/app/ai", true, "admin").flatMap(({ label, itens }) => [
      label,
      ...itens.flatMap((item) => [item.label, item.description]),
    ]);

    expect(textos.filter((texto) => !DICIONARIO[texto]?.es)).toEqual([]);
  });

  it("integra contribuições tipadas no CRM sem aceitar destino vindo do pacote", () => {
    render(
      <NavHub modulosLigados={[]}
        pagina="/app/crm"
        isPlatformAdmin={false}
        role="viewer"
        locale="es"
        extensionGuides={[extensionGuide]}
      />,
    );

    const contribution = screen.getByRole("link", { name: /Empieza aquí/ });
    expect(contribution).toHaveAttribute(
      "href",
      "/app/extensions/00000000-0000-4000-8000-000000000002?card=primeiro-passo",
    );
    expect(contribution).not.toHaveTextContent("Uma descrição que a configuração esconde.");
    expect(screen.getByText("Abre Tareas; no lee tus datos.")).toBeInTheDocument();
  });

  it("expõe falha de leitura das contribuições sem derrubar o hub do CRM", () => {
    render(
      <NavHub modulosLigados={[]}
        pagina="/app/crm"
        isPlatformAdmin={false}
        role="viewer"
        extensionsUnavailable
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Não foi possível conferir as orientações instaladas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gerenciar extensões" })).toHaveAttribute(
      "href",
      "/app/extensions",
    );
  });
});

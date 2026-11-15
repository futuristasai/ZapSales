/**
 * MÓDULO DE TABELA SE INSTALA EM RECURSOS OPCIONAIS (issue #308, histórias 24–27).
 *
 * "Módulos" ocupava um item inteiro do menu para um botão só. O botão passou a morar
 * no bloco Módulos de Recursos opcionais, onde o módulo já aparecia listado. O que
 * importa a quem decide: entender, ANTES de clicar, que instalar cria tabelas e vale
 * para todas as empresas, e ver "Instalado em <data>" depois.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/extensions/api-client", () => ({ requestExtensionApi: vi.fn() }));

import { ModulosManager } from "@/components/modulos/ModulosManager";
import { RECURSOS_OPCIONAIS } from "@/lib/recursos-opcionais/catalogo";

const HONORARIOS = {
  slug: "honorarios",
  nome: "Honorários",
  descricao: "Contratos de honorários com parcelas e o controle do que já foi pago.",
};

afterEach(cleanup);

describe("bloco de módulos de Recursos opcionais", () => {
  it("antes de instalar: o botão e o aviso de que cria tabelas e vale para todas as empresas", () => {
    render(<ModulosManager inicial={{ disponiveis: [HONORARIOS], instalados: [] }} />);
    expect(screen.getByRole("button", { name: "Instalar" })).toBeInTheDocument();
    const aviso = screen.getByTestId("aviso-honorarios");
    expect(aviso.textContent).toMatch(/cria as tabelas/i);
    expect(aviso.textContent).toMatch(/todas as empresas/i);
    expect(aviso.textContent).toMatch(/não se desinstala/i);
  });

  it("depois de instalar: «Instalado em <data>» no lugar do botão", () => {
    render(
      <ModulosManager
        inicial={{
          disponiveis: [HONORARIOS],
          instalados: [
            {
              modulo: "honorarios",
              estado: "ativo",
              instalado_em: "2026-11-15T12:00:00Z",
              reaplicado_em: null,
              motivo_suspensao: null,
            },
          ],
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Instalar" })).toBeNull();
    expect(screen.getByTestId("modulo-honorarios").textContent).toMatch(
      /Instalado em 15\/11\/2026/,
    );
  });

  it("o recurso do módulo de tabela aponta para o bloco de módulos, não para a tela que saiu", () => {
    const honorarios = RECURSOS_OPCIONAIS.find((r) => r.id === "modulo:honorarios");
    expect(honorarios?.href).toBe("/admin/sistema#modulos");
  });

  it("as mensagens de «instale o módulo» apontam para Recursos opcionais", () => {
    const raiz = join(__dirname, "..", "..");
    const fontes = [
      "app/api/v1/honorarios/contratos/route.ts",
      "app/api/v1/honorarios/contratos/[id]/parcelas/route.ts",
      "app/api/v1/honorarios/parcelas/[id]/pagar/route.ts",
      "lib/mcp/tools/honorarios.ts",
    ].map((f) => readFileSync(join(raiz, f), "utf8"));
    for (const fonte of fontes) {
      expect(fonte).toContain("Recursos opcionais");
      expect(fonte).not.toContain("Configurações da instalação › Módulos");
    }
  });
});

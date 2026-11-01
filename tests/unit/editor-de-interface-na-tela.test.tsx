import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import { destinosDaInterface, INTERFACE_COMPLETA, type InterfaceSettings } from "@/lib/navigation/interface";

/**
 * O EDITOR DE INTERFACE POR EMPRESA, pela superfície (issue #191, pai #183).
 *
 * O que a pessoa vê ao abrir «Personalizar áreas visíveis»: os blocos e as áreas do
 * menu novo, os nomes novos com o termo técnico embaixo, e nenhuma porta essencial
 * — porque escondê-la trancaria o dono do lado de fora das configurações.
 */

afterEach(cleanup);

function Editor({ onChange }: { onChange?: (v: InterfaceSettings) => void }) {
  const [value, setValue] = useState<InterfaceSettings>(INTERFACE_COMPLETA);
  return (
    <InterfaceEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      role="admin"
    />
  );
}

function abrir() {
  render(<Editor />);
  fireEvent.click(screen.getByText("Personalizar áreas visíveis", { exact: false }));
}

describe("editor de interface — as opções pelo menu novo", () => {
  it("lista por bloco e área do menu novo, com o nome novo e o termo técnico embaixo", () => {
    abrir();
    for (const bloco of ["Todo dia", "Configurar", "Resultados"]) {
      expect(screen.getByRole("heading", { name: bloco }), `bloco ${bloco}`).toBeTruthy();
    }
    for (const area of ["Vender", "Agente", "Conexões", "Empresa"]) {
      expect(screen.getByRole("heading", { name: area }), `área ${area}`).toBeTruthy();
    }
    // O nome novo, não o de antes — e o termo técnico dentro do mesmo rótulo.
    const chave = screen.getByRole("checkbox", { name: /Chave da IA/ });
    expect(chave.closest("label")?.textContent).toMatch(/API key/);
    expect(screen.getByRole("checkbox", { name: /Avisar outros sistemas/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /^Credenciais/ })).toBeNull();
    // Os grupos antigos do menu não voltam.
    expect(screen.queryByText(/^Agente de IA$/)).toBeNull();
    expect(screen.queryByText(/^Canais$/)).toBeNull();
  });

  it("não oferece as portas essenciais (Perfil, Segurança, Equipe, Dados da empresa)", () => {
    abrir();
    for (const nome of ["Perfil", "Segurança", "Equipe", "Dados da empresa"]) {
      expect(
        screen.queryByRole("checkbox", { name: new RegExp(`^${nome}`) }),
        `${nome} é uma porta essencial e não pode ser escondida`,
      ).toBeNull();
    }
    // Controle: a lista não está vazia por acidente.
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(20);
  });

  it("desmarcar uma tela grava a escolha sem ela — e as essenciais seguem no menu", () => {
    const mudancas: InterfaceSettings[] = [];
    render(<Editor onChange={(v) => mudancas.push(v)} />);
    fireEvent.click(screen.getByText("Personalizar áreas visíveis", { exact: false }));

    const configurar = screen.getByRole("heading", { name: "Configurar" }).closest("section")!;
    fireEvent.click(within(configurar).getByRole("checkbox", { name: /Chave da IA/ }));

    const gravado = mudancas.at(-1)!;
    expect(gravado.destinos, "escolha personalizada").toBeDefined();
    expect(gravado.destinos).not.toContain("/app/ai/credentials");
    expect(gravado.destinos).toContain("/app/inbox");

    // O que a empresa vai ver com esta escolha: a tela escondida some, a porta de
    // volta (Dados da empresa) e as outras essenciais ficam.
    const visiveis = destinosDaInterface(gravado, false, "admin").map((d) => d.href);
    expect(visiveis).not.toContain("/app/ai/credentials");
    expect(visiveis).toEqual(
      expect.arrayContaining(["/app/settings/tenant", "/app/team", "/app/settings/profile", "/app/settings/security"]),
    );
  });
});

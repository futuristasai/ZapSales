/**
 * Os comandos que as telas mandam rodar na VPS têm de existir de verdade (#173).
 *
 * As telas Atualização e Cadastro mandavam rodar `bash kit/update.sh` — arquivo
 * que nunca esteve no kit — e o e2e confirmava o texto errado, de modo que o
 * defeito passava verde. Esta cerca lê o `kit/` em vez de acreditar na prosa:
 * se o script citado sumir, ou a variável que fixa a versão for renomeada, quem
 * reprova é este arquivo, antes de o dono do servidor copiar um comando que
 * responde "No such file or directory".
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COMANDO_DE_ATUALIZAR,
  ENDERECO_DO_OBTER,
  comandoDeVolta,
} from "@/lib/atualizacao/comandos";

const RAIZ = process.cwd();
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

describe("comandos de atualização das telas", () => {
  it("o script que o comando baixa existe no kit", () => {
    const nome = ENDERECO_DO_OBTER.split("/").pop()!;
    expect(nome).toBe("obter.sh");
    expect(existsSync(join(RAIZ, "kit", nome))).toBe(true);
  });

  it("o endereço é o mesmo do guia de instalação", () => {
    expect(ler("docs/runbooks/instalacao-vps-limpa.md")).toContain(
      `curl -fsSL ${ENDERECO_DO_OBTER} | sudo bash`,
    );
  });

  it("a variável que fixa a versão é a que o obter.sh lê", () => {
    expect(ler("kit/obter.sh")).toContain("ZAPSALES_REF");
    expect(comandoDeVolta("1.0.0")).toBe(
      `curl -fsSL ${ENDERECO_DO_OBTER} | sudo ZAPSALES_REF=v1.0.0 bash`,
    );
  });

  it("não promete opções que o kit não tem", () => {
    const todos = [COMANDO_DE_ATUALIZAR, comandoDeVolta("1.0.0"), comandoDeVolta("dev-abc")];
    for (const comando of todos) {
      expect(comando).not.toMatch(/update\.sh|--to\b|--force\b/);
    }
    for (const opcao of ["--to", "--force"]) {
      expect(ler("kit/instalar.sh")).not.toContain(` ${opcao}) `);
      expect(ler("kit/obter.sh")).not.toContain(` ${opcao}) `);
    }
  });

  it("volta para a versão que funcionava; sem saber qual, só atualiza", () => {
    expect(comandoDeVolta("v1.1.0")).toContain("ZAPSALES_REF=v1.1.0");
    expect(comandoDeVolta(undefined)).toBe(COMANDO_DE_ATUALIZAR);
    expect(comandoDeVolta("sha-63b9520")).toBe(COMANDO_DE_ATUALIZAR);
    expect(comandoDeVolta("1.0.0; rm -rf /")).toBe(COMANDO_DE_ATUALIZAR);
  });

  it("nenhuma das duas telas manda rodar um script que não existe", () => {
    for (const tela of [
      "app/app/settings/atualizacao/_components/UpdatePanel.tsx",
      "app/admin/(protected)/cadastro/page.tsx",
    ]) {
      expect(ler(tela), tela).not.toMatch(/bash\s+\S*(update|restore)\.sh/);
    }
    // Se um dia o kit ganhar um destes nomes, esta cerca precisa ser revista.
    expect(existsSync(join(RAIZ, "kit", "update.sh"))).toBe(false);
    expect(existsSync(join(RAIZ, "kit", "restore.sh"))).toBe(false);
    // O guia que a tela cita existe de verdade.
    expect(existsSync(join(RAIZ, "docs/runbooks/backup-e-restauracao.md"))).toBe(true);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { arquivosDeCodigo, caminhoRelativo } from "./helpers/varrer-codigo";

// Entre `ai_agents` e `ai_agent_versions` há DUAS chaves estrangeiras:
// `ai_agent_versions.agent_id → ai_agents` e
// `ai_agents.published_version_id → ai_agent_versions`. Um embed do PostgREST
// sem o nome da relação (`ai_agent_versions(...)`, `ai_agent_versions!inner(...)`,
// `ai_agents(...)` partindo das versões) é AMBÍGUO e volta como erro PGRST201.
//
// O erro não estoura: o `select` devolve `data: null`, e quem lê `data ?? []`
// recebe uma lista vazia. Foi assim que o acervo passou a dizer
// "Consultado por: nenhum assistente ainda" em todo material, inclusive nos que
// o agente publicado consultava. A forma certa nomeia a chave:
// `ai_agent_versions!ai_agents_published_version_id_fkey(...)` ou
// `ai_agent_versions!ai_agent_versions_agent_id_fkey(...)`.

const RAIZES = ["app", "lib", "workers", "components", "hooks"] as const;
const ARQUIVOS = arquivosDeCodigo(RAIZES);

// `ai_agent_versions(` ou `ai_agent_versions!inner(` / `!left(` — sem nome de chave.
// O `into ` à frente é SQL cru de INSERT, não embed: fica de fora. Embutir
// `ai_agents` a partir de OUTRA tabela (ex.: `agent:ai_agents(id, name)` num
// número de telefone) tem uma relação só e não entra aqui.
const EMBED_AMBIGUO = /\bai_agent_versions(!(inner|left))?\(/g;

function achados(): string[] {
  const out: string[] = [];
  for (const arq of ARQUIVOS) {
    const linhas = readFileSync(arq, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      // só o que está dentro de string (select do PostgREST); comentário e SQL ficam de fora
      if (!/["'`]/.test(linha) || /^\s*(\/\/|\*)/.test(linha)) return;
      for (const m of linha.matchAll(EMBED_AMBIGUO)) {
        const antes = linha.slice(0, m.index);
        if (/\binto\s+$/i.test(antes) || /references\s+$/i.test(antes)) continue;
        out.push(`${caminhoRelativo(arq)}:${i + 1}: ${linha.trim()}`);
      }
    });
  }
  return out;
}

describe("embed entre agente e versão nomeia a chave estrangeira", () => {
  it("a varredura alcança código de verdade", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(500);
  });

  it("nenhum select embute ai_agent_versions sem dizer qual relação", () => {
    expect(achados()).toEqual([]);
  });

  it("a sonda pega a forma que quebrou o acervo e deixa passar a forma nomeada", () => {
    const quebrada = `.select("id, name, ai_agent_versions!inner(id, knowledge_source_ids)")`;
    const nomeada = `.select("id, publicada:ai_agent_versions!ai_agents_published_version_id_fkey(id)")`;
    expect([...quebrada.matchAll(EMBED_AMBIGUO)]).toHaveLength(1);
    expect([...nomeada.matchAll(EMBED_AMBIGUO)]).toHaveLength(0);
  });
});

// Guarda os materiais da demonstração no bucket do acervo (`ai-policy`), no mesmo lugar onde a
// rota de "colar texto" guarda um documento: <org>/<nome>.md. Roda DENTRO do container do app,
// que já tem a URL interna do Supabase e a service key no ambiente — nada disso sai dali.
//
// Uso: docker cp como-a-julia-vende.md aurora-empresas.md subir-materiais.mjs zapsales-app-1:/tmp/
//      docker exec zapsales-app-1 node /tmp/subir-materiais.mjs <uuid da org>
import { readFileSync } from "node:fs";

const org = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(org ?? "")) throw new Error("passe o uuid da organização");
const base = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !chave) throw new Error("rode dentro do container do app");

for (const nome of ["como-a-julia-vende", "aurora-empresas"]) {
  const caminho = `${org}/demo-vendedor-${nome}.md`;
  const r = await fetch(`${base}/storage/v1/object/ai-policy/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, "Content-Type": "text/markdown", "x-upsert": "true" },
    body: readFileSync(`/tmp/${nome}.md`),
  });
  process.stdout.write(`${caminho} → ${r.status}\n`);
  if (!r.ok) throw new Error(await r.text());
}

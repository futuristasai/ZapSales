/**
 * Gera `tests/fixtures/licenca/selos-de-exemplo.json`, o conjunto de selos de exemplo que o
 * aplicativo e o servidor de licenças consomem (contrato, seção 6).
 *
 * Uso: `pnpm exec tsx scripts/gerar-selos-de-exemplo.ts` (a partir da raiz do repositório).
 * Depois: `pnpm exec prettier --write tests/fixtures/licenca/selos-de-exemplo.json`.
 *
 * É determinístico: a chave é de teste e o Ed25519 não usa aleatoriedade, então rodar de novo
 * sem mudar o gerador não altera um byte. Um teste reprova se o arquivo divergir do gerador.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { montarConjuntoDeExemplo } from "../tests/support/licenca-selos-de-exemplo";

async function main() {
  const destino = path.resolve(process.cwd(), "tests/fixtures/licenca/selos-de-exemplo.json");
  mkdirSync(path.dirname(destino), { recursive: true });
  const conjunto = await montarConjuntoDeExemplo();
  writeFileSync(destino, `${JSON.stringify(conjunto, null, 2)}\n`, "utf8");
  process.stdout.write(`${conjunto.selos.length} selos gravados em ${destino}\n`);
}

void main();

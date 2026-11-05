/**
 * Gera `tests/fixtures/licenca/selos-de-exemplo.json`, o conjunto de selos de exemplo que o
 * aplicativo e o servidor de licenças consomem (contrato, seção 6).
 *
 * Uso: `pnpm exec tsx tests/support/gerar-selos-de-exemplo.ts` (a partir da raiz do repositório).
 * (O arquivo gerado fica fora do Prettier, de propósito: ver `.prettierignore`.)
 *
 * É determinístico: a chave é de teste e o Ed25519 não usa aleatoriedade, então rodar de novo
 * sem mudar o gerador não altera um byte. Um teste reprova se o arquivo divergir do gerador.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { montarConjuntoDeExemplo } from "./licenca-selos-de-exemplo";

async function main() {
  const destino = path.resolve(process.cwd(), "tests/fixtures/licenca/selos-de-exemplo.json");
  mkdirSync(path.dirname(destino), { recursive: true });
  const conjunto = await montarConjuntoDeExemplo();
  // Cada selo numa linha só, com o `aviso` (`gitleaks:allow`) ao lado: o detector de segredos
  // lê linha a linha, e o marcador só vale na linha do achado. O arquivo está no
  // `.prettierignore` justamente porque o Prettier quebraria esta linha.
  const { selos, ...cabecalho } = conjunto;
  const texto = JSON.stringify(cabecalho, null, 2).replace(
    /\n\}$/,
    `,\n  "selos": [\n${selos.map((s) => `    ${JSON.stringify(s)}`).join(",\n")}\n  ]\n}`,
  );
  writeFileSync(destino, `${texto}\n`, "utf8");
  process.stdout.write(`${conjunto.selos.length} selos gravados em ${destino}\n`);
}

void main();

/**
 * Troca o modo da trava de licença desta instalação. Quem chama é o `kit/licenca-modo.sh`, por dentro do
 * contêiner do worker:
 *
 *   ZAPSALES_LICENCA_MODO=valendo tsx scripts/definir-modo-da-licenca.ts
 *
 * Imprime `LICENCA_MODO=…` e sai com o código de `lib/licenca/modo-kit.ts`.
 */
import { definirModoPeloKit } from "@/lib/licenca/modo-kit";

async function main(): Promise<void> {
  const { codigoDeSaida, linha } = await definirModoPeloKit(process.env.ZAPSALES_LICENCA_MODO);
  process.stdout.write(`${linha}\n`);
  process.exit(codigoDeSaida);
}

void main();

/**
 * Ativa a licença desta instalação. Quem chama é o `kit/instalar.sh` (e o `kit/ativar-licenca.sh`, para
 * quem instalou sem os dados da compra), por dentro do contêiner do worker:
 *
 *   ZAPSALES_LICENCA_EMAIL=… ZAPSALES_LICENCA_TRANSACAO=… tsx scripts/ativar-licenca.ts
 *
 * Os dados da compra chegam por VARIÁVEL DE AMBIENTE — nunca por argumento, que apareceria em `ps` e no
 * histórico do shell. Imprime uma linha `LICENCA=…` e sai com o código de `lib/licenca/ativar-kit.ts`.
 */
import { ativarPeloKit } from "@/lib/licenca/ativar-kit";

async function main(): Promise<void> {
  const { codigoDeSaida, linha } = await ativarPeloKit({
    email: process.env.ZAPSALES_LICENCA_EMAIL,
    codigoTransacao: process.env.ZAPSALES_LICENCA_TRANSACAO,
  });
  process.stdout.write(`${linha}\n`);
  process.exit(codigoDeSaida);
}

void main();

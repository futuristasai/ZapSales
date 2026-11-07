/**
 * A ponte entre o instalador (shell) e a ativação (TypeScript).
 *
 * O `kit/instalar.sh` chama `scripts/ativar-licenca.ts`, que chama isto. O shell só entende duas coisas:
 * um código de saída e UMA linha `LICENCA=…`. Esta função faz a tradução — e é pura o bastante para ser
 * testada sem banco nem rede (o ativador entra como parâmetro).
 *
 * Códigos de saída (o shell decide a mensagem; ninguém aqui decide se a instalação continua — ela continua
 * SEMPRE, no estado "ativação pendente", ADR-0005 D-7):
 *   0  ativada            10  o servidor recusou (a compra não existe, não foi aprovada, está bloqueada)
 *   11 não foi possível (rede, resposta torta, gravação) — tentar de novo depois
 *   12 faltou dado ou veio torto — nem chega a falar com o servidor
 *
 * O e-mail e o código da compra nunca saem daqui: nem na linha, nem em log. E o texto livre do servidor
 * também não — a linha só carrega códigos do contrato (`[a-z_]+`), qualquer outra coisa vira `outro`.
 */
import { ativarLicenca, type DadosDaCompra, type ResultadoDaAtivacao } from "./ativar";

export interface EntradaDoKit {
  email?: string | undefined;
  codigoTransacao?: string | undefined;
}

export interface DesfechoDoKit {
  codigoDeSaida: 0 | 10 | 11 | 12;
  /** `LICENCA=<desfecho>[:<detalhe>]` — nunca o e-mail nem o código da compra. */
  linha: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** O contrato diz `HP…`; quem decide se o código existe é o servidor. Aqui só barramos o que não é um código. */
const CODIGO_DA_COMPRA = /^[A-Za-z0-9_-]{4,64}$/;
const CODIGO_DO_CONTRATO = /^[a-z][a-z0-9_]{0,63}$/;

export async function ativarPeloKit(
  entrada: EntradaDoKit,
  ativar: (compra: DadosDaCompra) => Promise<ResultadoDaAtivacao> = ativarLicenca,
): Promise<DesfechoDoKit> {
  const email = (entrada.email ?? "").trim();
  const codigoTransacao = (entrada.codigoTransacao ?? "").trim();
  if (!EMAIL.test(email) || !CODIGO_DA_COMPRA.test(codigoTransacao)) {
    return { codigoDeSaida: 12, linha: "LICENCA=dados_invalidos" };
  }

  let resultado: ResultadoDaAtivacao;
  try {
    resultado = await ativar({ email, codigoTransacao });
  } catch {
    return { codigoDeSaida: 11, linha: "LICENCA=falhou:inesperada" };
  }

  switch (resultado.resultado) {
    case "ativada":
      return { codigoDeSaida: 0, linha: `LICENCA=ativada:${resultado.tipo}` };
    case "recusada": {
      const codigo = CODIGO_DO_CONTRATO.test(resultado.codigo) ? resultado.codigo : "outro";
      return { codigoDeSaida: 10, linha: `LICENCA=recusada:${codigo}` };
    }
    case "falhou":
      return { codigoDeSaida: 11, linha: `LICENCA=falhou:${resultado.motivo}` };
  }
}

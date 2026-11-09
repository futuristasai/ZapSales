/**
 * Quais chaves públicas o aplicativo aceita para conferir um selo.
 *
 * A lista de PRODUÇÃO é fixa, escrita aqui e portanto dentro da imagem. O aplicativo NUNCA
 * baixa chave em tempo de execução: quem controlasse o DNS ou o TLS do servidor de licenças
 * injetaria a chave dele e fabricaria selo válido. Rotacionar é lançar uma versão que aceita as
 * duas chaves por um período (cada chave tem o seu `kid`).
 *
 * Fora de produção (testes, CI, desenvolvimento) quem chama pode acrescentar chaves de TESTE.
 * Em produção, `extras` é ignorado de propósito: não existe configuração, variável de ambiente
 * ou argumento que faça a imagem de produção aceitar uma chave que não esteja nesta lista.
 *
 * A chave privada correspondente NUNCA entra em repositório: mora só no ambiente do servidor de
 * licenças (ADR-0005, D-6).
 */
import type { ChavePublica } from "./selo";

/**
 * Chaves públicas de produção — as que o servidor de licenças publica em
 * `GET /api/v1/chaves-publicas` (issue #223). Só a parte PÚBLICA: a privada vive apenas no ambiente
 * do servidor. A lista é fixa na imagem de propósito: se o app buscasse a chave em tempo de execução,
 * quem controlasse o DNS ou o TLS do servidor injetaria a chave dele e fabricaria selo válido.
 *
 * Lista vazia rejeita todo selo com `chave_desconhecida` (lado seguro) — e, na prática, impede
 * qualquer ativação, porque a ativação confere o selo que o servidor devolve. Para rotacionar, acrescente
 * a chave nova AQUI numa versão que aceite as duas (cada uma tem o seu `kid`).
 */
export const CHAVES_DE_PRODUCAO: readonly ChavePublica[] = [
  {
    kid: "lic-2026-11",
    jwk: { kty: "OKP", crv: "Ed25519", x: "utryaWg74ko3mEbT3uWGv9QpA7olucyJcdgvqbyxCag" },
  },
];

export interface OpcoesDeChaves {
  /** `true` na imagem de produção (quem chama decide, normalmente por `NODE_ENV`). */
  producao: boolean;
  /** Chaves de teste. Só valem fora de produção. */
  extras?: readonly ChavePublica[];
}

/**
 * A lista de chaves que `verificarSelo` recebe. A de produção vem sempre primeiro, de modo que
 * uma chave extra com o mesmo `kid` nunca a sobrepõe.
 */
export function chavesAceitas({ producao, extras = [] }: OpcoesDeChaves): readonly ChavePublica[] {
  if (producao) return CHAVES_DE_PRODUCAO;
  return [...CHAVES_DE_PRODUCAO, ...extras];
}

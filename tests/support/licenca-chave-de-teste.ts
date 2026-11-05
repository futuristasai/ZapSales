/**
 * Chave de TESTE do selo de licença — para o aplicativo e para o servidor de licenças
 * produzirem e conferirem selos de exemplo SEM depender de chave de produção.
 *
 * ⚠️ Esta chave é PÚBLICA por desenho (a semente está aqui, à vista) e NUNCA vale em produção:
 * a lista de produção (`lib/licenca/chaves.ts`) não a contém e ignora chave extra. Quem a usa em
 * outro lugar está fazendo teste, não segurança. O Ed25519 é determinístico (RFC 8032): a mesma
 * semente e o mesmo conteúdo produzem sempre os mesmos bytes, e é isso que permite versionar os
 * selos de exemplo e provar que o arquivo versionado não divergiu do gerador.
 */
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

import { CompactSign } from "jose";

import type { ChavePublica } from "@/lib/licenca/selo";

export const KID_DE_TESTE = "teste-1";

const SEMENTE = createHash("sha256")
  .update("zapsales: chave de TESTE do selo de licenca, nunca usar em producao")
  .digest();

/** Prefixo DER de uma chave privada Ed25519 em PKCS#8; os 32 bytes seguintes são a semente. */
const PREFIXO_PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

const chavePrivada = createPrivateKey({
  key: Buffer.concat([PREFIXO_PKCS8_ED25519, SEMENTE]),
  format: "der",
  type: "pkcs8",
});

const jwkPublico = createPublicKey(chavePrivada).export({ format: "jwk" });

export const chavePublicaDeTeste: ChavePublica = {
  kid: KID_DE_TESTE,
  jwk: { kty: jwkPublico.kty, crv: jwkPublico.crv, x: jwkPublico.x },
};

export type CabecalhoDeTeste = { alg: string; typ: string; kid: string };

export const CABECALHO_PADRAO: CabecalhoDeTeste = {
  alg: "EdDSA",
  typ: "zapsales-selo",
  kid: KID_DE_TESTE,
};

/** Assina um conteúdo com a chave de teste. O cabeçalho pode ser trocado para fabricar selo defeituoso. */
export async function assinarParaTeste(
  carga: Record<string, unknown>,
  cabecalho: CabecalhoDeTeste = CABECALHO_PADRAO,
): Promise<string> {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(carga)))
    .setProtectedHeader(cabecalho)
    .sign(chavePrivada);
}

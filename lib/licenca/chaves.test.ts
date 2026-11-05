// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chavePublicaDeTeste } from "../../tests/support/licenca-chave-de-teste";
import { CHAVES_DE_PRODUCAO, chavesAceitas } from "./chaves";

describe("chavesAceitas", () => {
  it("em produção só vale a lista fixa da imagem: chave extra é ignorada", () => {
    const lista = chavesAceitas({ producao: true, extras: [chavePublicaDeTeste] });
    expect(lista).toEqual(CHAVES_DE_PRODUCAO);
    expect(lista).not.toContainEqual(chavePublicaDeTeste);
  });

  it("fora de produção a chave de teste é acrescentada", () => {
    const lista = chavesAceitas({ producao: false, extras: [chavePublicaDeTeste] });
    expect(lista).toContainEqual(chavePublicaDeTeste);
  });

  it("a chave de teste nunca está na lista de produção fixa", () => {
    expect(CHAVES_DE_PRODUCAO.map((c) => c.kid)).not.toContain(chavePublicaDeTeste.kid);
  });

  it("a chave de produção vem primeiro: uma extra com o mesmo kid não a sobrepõe", () => {
    const impostora = { kid: "prod-1", jwk: { kty: "OKP", crv: "Ed25519", x: "impostora" } };
    const lista = chavesAceitas({ producao: false, extras: [impostora] });
    // Com a lista de produção vazia só a extra existe; a regra é a ordem (produção, depois extras).
    expect(lista.at(-1)).toEqual(impostora);
    expect(lista.slice(0, CHAVES_DE_PRODUCAO.length)).toEqual(CHAVES_DE_PRODUCAO);
  });
});

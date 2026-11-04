import { describe, expect, it } from "vitest";

import { condicaoDaBuscaDeContato } from "./busca-de-contato";

describe("condicaoDaBuscaDeContato", () => {
  it("abaixo do piso de dois caracteres não vai ao banco", () => {
    expect(condicaoDaBuscaDeContato("a")).toBeNull();
    expect(condicaoDaBuscaDeContato("  ")).toBeNull();
    expect(condicaoDaBuscaDeContato("()")).toBeNull();
  });

  it("procura em nome, nome exibido, e-mail, telefone e etiqueta", () => {
    const c = condicaoDaBuscaDeContato("maria")!;
    expect(c).toContain("name.ilike.%maria%");
    expect(c).toContain("display_name.ilike.%maria%");
    expect(c).toContain("email.ilike.%maria%");
    expect(c).toContain("phone_number.ilike.%maria%");
    expect(c).toContain('tags.cs."{\\"maria\\"}"');
  });

  it("curinga digitado é literal e parêntese não quebra o filtro", () => {
    const c = condicaoDaBuscaDeContato("a_b%(x")!;
    expect(c).toContain("name.ilike.%a\\_b\\%");
    expect(c).not.toMatch(/name\.ilike\.[^,]*[()]/);
  });

  it("vírgula digitada não injeta condição extra", () => {
    const c = condicaoDaBuscaDeContato("silva, maria")!;
    // Cada condição começa com uma coluna conhecida; "maria" sozinho não pode abrir uma.
    for (const parte of c.split(/,(?=(?:name|display_name|email|phone_number|tags)\.)/)) {
      expect(parte).toMatch(/^(name|display_name|email|phone_number|tags)\./);
    }
  });

  it("telefone sem o 55 também acha o cadastro com o código do país", () => {
    const c = condicaoDaBuscaDeContato("11 98888-7777")!;
    expect(c).toMatch(/phone_number\.ilike\.%55119888877\d*%|phone_number\.ilike\.%5511988887777%/);
  });
});

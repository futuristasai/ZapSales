import { describe, expect, it } from "vitest";

import {
  conferirEnderecoModelo,
  conferirModeloDoCorpo,
  hostDoModelo,
  marcadoresDe,
  marcadoresDoCadastro,
  montarPedido,
  type EntradaDaMontagem,
} from "./montagem";
import type { ConfigDaApi } from "./tipos";

function config(mudanca: Partial<ConfigDaApi> = {}): ConfigDaApi {
  return {
    metodo: "GET",
    cabecalhos: [],
    corpo: { modo: "campos", modelo: null },
    credencial: { tipo: "nenhuma", cabecalho: null, usuario: null },
    campos_resposta: [],
    dados_contato: [],
    limite_por_conversa: 5,
    limite_por_dia: 200,
    pausa_apos_falhas: 5,
    ...mudanca,
  };
}

function entrada(mudanca: Partial<EntradaDaMontagem> & { config?: ConfigDaApi } = {}): EntradaDaMontagem {
  return {
    urlModelo: "https://api.loja.example/pedidos/{{numero}}",
    config: config(),
    argumentos: { numero: "4512" },
    contato: {},
    credencial: null,
    ...mudanca,
  };
}

function montado(e: EntradaDaMontagem) {
  const m = montarPedido(e);
  if (!m.ok) throw new Error(`não montou: ${m.motivo}`);
  return m;
}

describe("o endereço-modelo — o host nunca é marcador", () => {
  it("aceita marcador no caminho e na consulta", () => {
    expect(conferirEnderecoModelo("https://api.loja.example/pedidos/{{numero}}?detalhe={{detalhe}}", false)).toBeNull();
  });

  it("recusa marcador no host, no subdomínio e na porta", () => {
    expect(conferirEnderecoModelo("https://{{site}}/pedidos", false)).toBe("marcador_no_host");
    expect(conferirEnderecoModelo("https://{{loja}}.loja.example/pedidos", false)).toBe("marcador_no_host");
    expect(conferirEnderecoModelo("https://api.loja.example:{{porta}}/pedidos", false)).toBe("marcador_no_host");
    // Sem caminho nenhum, o marcador depois do host continua sendo host.
    expect(conferirEnderecoModelo("https://api.loja.example{{resto}}", false)).toBe("marcador_no_host");
  });

  it("recusa http em produção, usuário e senha embutidos e texto que não é endereço", () => {
    expect(conferirEnderecoModelo("http://api.loja.example/x", false)).toBe("https");
    expect(conferirEnderecoModelo("http://api.loja.example/x", true)).toBeNull();
    expect(conferirEnderecoModelo("https://usuario:senha@api.loja.example/x", false)).toBe("credencial_embutida");
    expect(conferirEnderecoModelo("api.loja.example/x", false)).toBe("invalido");
  });

  it("conferir duas vezes dá a mesma resposta (a expressão não guarda posição entre chamadas)", () => {
    const modelo = "https://{{site}}/pedidos";
    expect(conferirEnderecoModelo(modelo, false)).toBe("marcador_no_host");
    expect(conferirEnderecoModelo(modelo, false)).toBe("marcador_no_host");
  });

  it("devolve o host do modelo em minúsculas", () => {
    expect(hostDoModelo("https://API.Loja.Example/pedidos/{{numero}}")).toBe("api.loja.example");
    expect(hostDoModelo("nada")).toBeNull();
  });
});

describe("marcadores", () => {
  it("lista sem repetir, na ordem", () => {
    expect(marcadoresDe("/a/{{x}}/b/{{ y }}?z={{x}}")).toEqual(["x", "y"]);
  });

  it("junta os do endereço e os do modelo do corpo", () => {
    expect(
      marcadoresDoCadastro("https://a.example/{{id}}", { corpo: { modo: "modelo", modelo: '{"n":"{{nome}}","t":"{{contato_telefone}}"}' } }),
    ).toEqual(["id", "nome", "contato_telefone"]);
    // Em modo «campos» o modelo não conta, mesmo que tenha ficado texto lá.
    expect(marcadoresDoCadastro("https://a.example/{{id}}", { corpo: { modo: "campos", modelo: "{{x}}" } })).toEqual(["id"]);
  });
});

describe("montar o endereço", () => {
  it("troca o marcador do caminho pelo valor codificado", () => {
    expect(montado(entrada({ argumentos: { numero: "A 1/2" } })).pedido.url).toBe("https://api.loja.example/pedidos/A%201%2F2");
  });

  it("um valor não consegue subir de pasta nem mudar o destino", () => {
    for (const numero of ["..", ".", "", "   "]) {
      const m = montarPedido(entrada({ argumentos: { numero } }));
      expect(m.ok).toBe(false);
      if (!m.ok) expect(m.motivo).toBe("valor_invalido_no_endereco");
    }
    // Barra, arroba e cerquilha entram codificados: continuam sendo UM trecho do caminho.
    const url = new URL(montado(entrada({ argumentos: { numero: "../../admin@evil.example#x" } })).pedido.url);
    expect(url.hostname).toBe("api.loja.example");
    expect(url.pathname).toBe("/pedidos/..%2F..%2Fadmin%40evil.example%23x");
  });

  it("campo do caminho sem valor não monta", () => {
    const m = montarPedido(entrada({ argumentos: {} }));
    expect(m).toEqual({ ok: false, motivo: "campo_do_endereco_vazio", campo: "numero" });
  });

  it("na consulta, o par de um campo opcional não preenchido sai inteiro", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/pedidos?status={{status}}&cliente={{cliente}}&fixo=1",
        argumentos: { status: "pago" },
      }),
    );
    expect(m.pedido.url).toBe("https://api.loja.example/pedidos?status=pago&fixo=1");
  });

  it("método sem corpo: os campos que o endereço não cita vão como consulta", () => {
    const m = montado(
      entrada({ urlModelo: "https://api.loja.example/produtos", argumentos: { busca: "camisa azul", pagina: 2, ativo: true } }),
    );
    expect(m.pedido.url).toBe("https://api.loja.example/produtos?busca=camisa%20azul&pagina=2&ativo=true");
    expect(m.pedido.corpo).toBeNull();
  });
});

describe("montar o corpo", () => {
  it("modo «campos»: o que o endereço levou não se repete no corpo", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/pedidos/{{numero}}/itens",
        config: config({ metodo: "POST" }),
        argumentos: { numero: "4512", produto: "camisa", quantidade: 3 },
      }),
    );
    expect(JSON.parse(m.pedido.corpo ?? "")).toEqual({ produto: "camisa", quantidade: 3 });
    expect(m.pedido.headers["content-type"]).toBe("application/json");
  });

  it("modo «modelo»: o valor entra na árvore com o tipo dele, e campo opcional ausente sai", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/pedidos",
        config: config({
          metodo: "POST",
          corpo: {
            modo: "modelo",
            modelo: '{"item":{"sku":"{{produto}}","qtd":"{{quantidade}}","obs":"{{obs}}"},"nota":"Pedido de {{produto}}","urgente":"{{urgente}}"}',
          },
        }),
        argumentos: { produto: "camisa", quantidade: 3, urgente: false },
      }),
    );
    expect(JSON.parse(m.pedido.corpo ?? "")).toEqual({
      item: { sku: "camisa", qtd: 3 },
      nota: "Pedido de camisa",
      urgente: false,
    });
  });

  it("um valor não fecha a aspa nem acrescenta campo ao corpo", () => {
    const veneno = '", "admin": true, "x": "';
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/pedidos",
        config: config({ metodo: "POST", corpo: { modo: "modelo", modelo: '{"nome":"{{nome}}","frase":"Olá {{nome}}"}' } }),
        argumentos: { nome: veneno },
      }),
    );
    const corpo = JSON.parse(m.pedido.corpo ?? "") as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toEqual(["frase", "nome"]);
    expect(corpo.nome).toBe(veneno);
  });

  it("o modelo precisa ser JSON com objeto ou lista na raiz", () => {
    expect(conferirModeloDoCorpo('{"a":"{{x}}"}')).toBeNull();
    expect(conferirModeloDoCorpo('[{"a":"{{x}}"}]')).toBeNull();
    expect(conferirModeloDoCorpo('{"a": {{x}} }')).toBe("json_invalido");
    expect(conferirModeloDoCorpo('"só texto"')).toBe("nao_objeto");
  });
});

describe("o dado do contato vem do sistema, e só o que a ferramenta declara", () => {
  it("entra pelo marcador quando declarado", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/clientes/{{contato_telefone}}/pedidos",
        config: config({ dados_contato: ["telefone"] }),
        argumentos: {},
        contato: { telefone: "5511999990000", nome: "Maria" },
      }),
    );
    expect(m.pedido.url).toBe("https://api.loja.example/clientes/5511999990000/pedidos");
  });

  it("marcador de dado NÃO declarado não monta — a organização deixou de liberar", () => {
    const m = montarPedido(
      entrada({
        urlModelo: "https://api.loja.example/clientes/{{contato_telefone}}/pedidos",
        config: config({ dados_contato: [] }),
        argumentos: {},
        contato: { telefone: "5511999990000" },
      }),
    );
    expect(m).toEqual({ ok: false, motivo: "dado_do_contato_nao_liberado", campo: "contato_telefone" });
  });

  it("o que o agente preencher com o nome de um dado do contato é IGNORADO", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/clientes/{{contato_telefone}}",
        config: config({ dados_contato: ["telefone"] }),
        // O modelo tentando escolher de quem é o telefone.
        argumentos: { contato_telefone: "5500000000000" },
        contato: { telefone: "5511999990000" },
      }),
    );
    expect(m.pedido.url).toBe("https://api.loja.example/clientes/5511999990000");
  });

  it("modo «campos»: o dado declarado vai no corpo com o nome do marcador, e só ele", () => {
    const m = montado(
      entrada({
        urlModelo: "https://api.loja.example/atendimentos",
        config: config({ metodo: "POST", dados_contato: ["telefone", "nome"] }),
        argumentos: { assunto: "troca" },
        contato: { telefone: "5511999990000", nome: "Maria", email: "maria@example.com" },
      }),
    );
    expect(JSON.parse(m.pedido.corpo ?? "")).toEqual({ assunto: "troca", contato_telefone: "5511999990000", contato_nome: "Maria" });
  });
});

describe("cabeçalhos e credencial", () => {
  const base = { urlModelo: "https://api.loja.example/x", argumentos: {} };

  it("Bearer, cabeçalho próprio e usuário e senha", () => {
    expect(
      montado(entrada({ ...base, config: config({ credencial: { tipo: "bearer", cabecalho: null, usuario: null } }), credencial: "abc" })).pedido
        .headers.authorization,
    ).toBe("Bearer abc");
    expect(
      montado(
        entrada({ ...base, config: config({ credencial: { tipo: "cabecalho", cabecalho: "X-API-Key", usuario: null } }), credencial: "abc" }),
      ).pedido.headers["x-api-key"],
    ).toBe("abc");
    expect(
      montado(entrada({ ...base, config: config({ credencial: { tipo: "basic", cabecalho: null, usuario: "loja" } }), credencial: "s3" })).pedido
        .headers.authorization,
    ).toBe(`Basic ${Buffer.from("loja:s3").toString("base64")}`);
  });

  it("cabeçalho fixo entra; reservado e com quebra de linha não (defesa em profundidade)", () => {
    const m = montado(
      entrada({
        ...base,
        config: config({
          cabecalhos: [
            { nome: "Accept-Version", valor: "2024-01" },
            { nome: "Host", valor: "evil.example" },
            { nome: "X-Injetado", valor: "a\r\nAuthorization: Bearer roubada" },
          ],
        }),
      }),
    );
    expect(m.pedido.headers["accept-version"]).toBe("2024-01");
    expect(m.pedido.headers.host).toBeUndefined();
    expect(m.pedido.headers["x-injetado"]).toBeUndefined();
  });

  it("o id do pedido aprovado vai como Idempotency-Key", () => {
    expect(montado(entrada({ ...base, idDeEntrega: "pedido-1" })).pedido.headers["idempotency-key"]).toBe("pedido-1");
  });

  it("o resumo para a tela de teste não tem a credencial nem cabeçalho nenhum", () => {
    const m = montado(
      entrada({ ...base, config: config({ credencial: { tipo: "bearer", cabecalho: null, usuario: null } }), credencial: "segredo-da-api" }),
    );
    expect(JSON.stringify(m.resumo)).not.toContain("segredo-da-api");
    expect(Object.keys(m.resumo).sort()).toEqual(["body", "method", "url"]);
  });
});

import { describe, expect, it } from "vitest";

import { foraDoRecomendadoNaFerramenta } from "./recomendado";
import { selecionarCamposDaResposta } from "./resposta";
import {
  RECOMENDADO,
  VALORES_DO_NIVEL,
  afrouxa,
  configDeApiSchema,
  dominioValido,
  foraDoRecomendado,
  hostPermitido,
  lerSegurancaDasApis,
  mesclarSeguranca,
  mudancaDeSegurancaSchema,
  nivelEmVigor,
  opcoesDe,
  type SegurancaDasApis,
} from "./seguranca";
import { chaveDeAprovacaoEmVigor, travaDaFerramenta } from "./travas";
import type { ConfigDaApi } from "./tipos";

const ACEITE = { em: "2026-11-20T12:00:00.000Z", por: "11111111-1111-4111-8111-111111111111" };

function ligada(mudanca: Partial<SegurancaDasApis> = {}): SegurancaDasApis {
  return { ...RECOMENDADO, ligado: true, aceite: ACEITE, ...mudanca };
}

const CONFIG: Pick<ConfigDaApi, "dados_contato" | "corpo"> = { dados_contato: [], corpo: { modo: "campos", modelo: null } };

describe("a segurança das APIs nasce desligada e na posição recomendada", () => {
  it("sem nada gravado: desligada, sem aceite, tudo recomendado", () => {
    const lida = lerSegurancaDasApis({});
    expect(lida.ligado).toBe(false);
    expect(lida.aceite).toBeNull();
    expect(opcoesDe(lida)).toEqual(RECOMENDADO);
    expect(foraDoRecomendado(opcoesDe(lida))).toEqual([]);
    expect(nivelEmVigor(lida)).toBe("mais_seguro");
  });

  it("a posição recomendada é a mais fechada de cada opção", () => {
    expect(RECOMENDADO).toEqual({
      quem_cadastra: "admin",
      dominios_permitidos: [],
      somente_consulta: true,
      aprovacao_obrigatoria: true,
      dados_do_contato: [],
      quem_aprova: "admin",
      avisar_administrador: true,
    });
  });

  it("JSON torto NUNCA afrouxa: vira desligada e recomendada", () => {
    for (const torto of [
      { api_externa: "sim" },
      { api_externa: { ligado: true } }, // ligado sem aceite
      { api_externa: { ligado: true, aceite: ACEITE, somente_consulta: "não" } },
      { api_externa: { ligado: true, aceite: ACEITE, quem_cadastra: "viewer" } },
      { api_externa: { ligado: true, aceite: ACEITE, dominios_permitidos: ["https://com-esquema.example/x"] } },
      null,
      "texto",
    ]) {
      const lida = lerSegurancaDasApis(torto);
      expect(lida.ligado).toBe(false);
      expect(opcoesDe(lida)).toEqual(RECOMENDADO);
    }
  });

  it("o `exigir_duas_etapas` gravado pela v1.6.0 é descartado na leitura", () => {
    const lida = lerSegurancaDasApis({ api_externa: { ligado: true, aceite: ACEITE, exigir_duas_etapas: true } });
    expect(lida.ligado).toBe(true);
    expect(lida).not.toHaveProperty("exigir_duas_etapas");
  });

  it("ligar exige o aceite", () => {
    expect(configDeApiSchema.safeParse({ ligado: true }).success).toBe(false);
    expect(configDeApiSchema.safeParse({ ligado: true, aceite: ACEITE }).success).toBe(true);
  });
});

describe("nível de segurança — calculado dos valores, nunca guardado", () => {
  it("os valores de um nível correspondem a ele", () => {
    expect(nivelEmVigor(VALORES_DO_NIVEL.mais_seguro)).toBe("mais_seguro");
    expect(nivelEmVigor(VALORES_DO_NIVEL.equilibrado)).toBe("equilibrado");
  });

  it("qualquer outra combinação é «personalizado»", () => {
    expect(nivelEmVigor({ ...VALORES_DO_NIVEL.mais_seguro, avisar_administrador: false })).toBe("personalizado");
  });

  it("o nível equilibrado NUNCA deixa o agente alterar sem aprovação", () => {
    expect(VALORES_DO_NIVEL.equilibrado.somente_consulta).toBe(false);
    expect(VALORES_DO_NIVEL.equilibrado.aprovacao_obrigatoria).toBe(true);
  });

  it("aplicar um nível muda as opções dele; a opção citada ao lado vence o nível", () => {
    const carimbo = { em: ACEITE.em, por: ACEITE.por };
    const proxima = configDeApiSchema.parse(mesclarSeguranca(ligada(), { nivel: "equilibrado", quem_aprova: "admin" }, carimbo));
    expect(proxima.somente_consulta).toBe(false);
    expect(proxima.quem_aprova).toBe("admin");
    // Sem a opção ao lado, vale o que o nível diz.
    expect(configDeApiSchema.parse(mesclarSeguranca(ligada(), { nivel: "equilibrado" }, carimbo)).quem_aprova).toBe("manager");
    // A lista de endereços e os dados do contato são DADO da organização: o nível não toca.
    const comDados = ligada({ dominios_permitidos: ["api.loja.example"], dados_do_contato: ["telefone"] });
    const depois = configDeApiSchema.parse(mesclarSeguranca(comDados, { nivel: "mais_seguro" }, carimbo));
    expect(depois.dominios_permitidos).toEqual(["api.loja.example"]);
    expect(depois.dados_do_contato).toEqual(["telefone"]);
  });
});

describe("fora do recomendado e afrouxar", () => {
  it("lista só o que saiu da posição recomendada", () => {
    expect(foraDoRecomendado({ ...RECOMENDADO, somente_consulta: false, quem_aprova: "manager" })).toEqual(["somente_consulta", "quem_aprova"]);
  });

  it("afrouxar é sair do recomendado; voltar a ele não é", () => {
    const frouxa = { ...RECOMENDADO, aprovacao_obrigatoria: false };
    expect(afrouxa("aprovacao_obrigatoria", RECOMENDADO, frouxa)).toBe(true);
    expect(afrouxa("aprovacao_obrigatoria", frouxa, RECOMENDADO)).toBe(false);
    expect(afrouxa("aprovacao_obrigatoria", frouxa, frouxa)).toBe(false);
  });

  it("o corpo da mudança é estrito: não escolhe organização, aceite forjado nem campo desconhecido", () => {
    expect(mudancaDeSegurancaSchema.safeParse({ organization_id: "x", somente_consulta: false }).success).toBe(false);
    expect(mudancaDeSegurancaSchema.safeParse({ aceite: ACEITE }).success).toBe(false);
    expect(mudancaDeSegurancaSchema.safeParse({ nivel: "personalizado" }).success).toBe(false);
    expect(mudancaDeSegurancaSchema.safeParse({}).success).toBe(false);
    expect(mudancaDeSegurancaSchema.safeParse({ somente_consulta: false }).success).toBe(true);
  });
});

describe("endereços permitidos", () => {
  it("lista vazia libera qualquer endereço público", () => {
    expect(hostPermitido("qualquer.example", [])).toBe(true);
  });

  it("nome exato libera só ele; curinga libera os subdomínios, não o próprio nome nem um sufixo parecido", () => {
    expect(hostPermitido("api.loja.example", ["api.loja.example"])).toBe(true);
    expect(hostPermitido("outra.loja.example", ["api.loja.example"])).toBe(false);
    expect(hostPermitido("api.loja.example", ["*.loja.example"])).toBe(true);
    expect(hostPermitido("a.b.loja.example", ["*.loja.example"])).toBe(true);
    expect(hostPermitido("loja.example", ["*.loja.example"])).toBe(false);
    expect(hostPermitido("evilloja.example", ["*.loja.example"])).toBe(false);
    expect(hostPermitido("api.loja.example.evil.example", ["*.loja.example"])).toBe(false);
  });

  it("só o nome do site é um endereço válido", () => {
    for (const ok of ["api.loja.example", "*.loja.example", "API.Loja.Example"]) expect(dominioValido(ok)).toBe(true);
    for (const ruim of ["https://api.loja.example", "api.loja.example/pedidos", "api.loja.example:8443", "localhost", "*", "*.example", "10.0.0.1"]) {
      expect(dominioValido(ruim)).toBe(false);
    }
  });
});

describe("as travas valem na execução", () => {
  const consulta = { efeito: "consulta" as const, urlModelo: "https://api.loja.example/pedidos/{{numero}}", config: CONFIG };
  const altera = { ...consulta, efeito: "altera" as const };

  it("recurso desligado barra tudo", () => {
    expect(travaDaFerramenta(lerSegurancaDasApis({}), consulta)).toBe("recurso_desligado");
  });

  it("«somente consulta» barra a que altera e deixa a consulta", () => {
    expect(travaDaFerramenta(ligada(), consulta)).toBeNull();
    expect(travaDaFerramenta(ligada(), altera)).toBe("somente_consulta");
    expect(travaDaFerramenta(ligada({ somente_consulta: false }), altera)).toBeNull();
  });

  it("endereço fora da lista barra — inclusive ferramenta cadastrada antes de a lista existir", () => {
    expect(travaDaFerramenta(ligada({ dominios_permitidos: ["api.erp.example"] }), consulta)).toBe("endereco_nao_permitido");
    expect(travaDaFerramenta(ligada({ dominios_permitidos: ["*.loja.example"] }), consulta)).toBeNull();
  });

  it("dado do contato não liberado barra: o declarado E o usado num marcador", () => {
    const declara = { ...consulta, config: { ...CONFIG, dados_contato: ["telefone" as const] } };
    expect(travaDaFerramenta(ligada(), declara)).toBe("dado_do_contato_nao_liberado");
    expect(travaDaFerramenta(ligada({ dados_do_contato: ["telefone"] }), declara)).toBeNull();
    // Marcador usado sem estar declarado (linha escrita por fora da tela) também barra.
    const usa = { ...consulta, urlModelo: "https://api.loja.example/clientes/{{contato_email}}" };
    expect(travaDaFerramenta(ligada({ dados_do_contato: ["telefone"] }), usa)).toBe("dado_do_contato_nao_liberado");
  });

  it("«aprovação sempre obrigatória» vence a chave desligada da ferramenta que altera", () => {
    expect(chaveDeAprovacaoEmVigor({ aprovacao_obrigatoria: true }, "altera", false)).toBe(true);
    expect(chaveDeAprovacaoEmVigor({ aprovacao_obrigatoria: true }, "altera", null)).toBe(true);
    // Consulta não é tocada pela trava; e sem a trava vale a chave da ferramenta.
    expect(chaveDeAprovacaoEmVigor({ aprovacao_obrigatoria: true }, "consulta", false)).toBe(false);
    expect(chaveDeAprovacaoEmVigor({ aprovacao_obrigatoria: false }, "altera", false)).toBe(false);
  });
});

describe("fora do recomendado numa ferramenta", () => {
  const limites = { limite_por_conversa: 5, limite_por_dia: 200, pausa_apos_falhas: 5 };

  it("tudo no padrão: nada fora", () => {
    expect(foraDoRecomendadoNaFerramenta({ metodo: "GET", efeito: "consulta", pedeAprovacao: false, config: limites })).toEqual([]);
    expect(foraDoRecomendadoNaFerramenta({ metodo: "POST", efeito: "altera", pedeAprovacao: true, config: limites })).toEqual([]);
  });

  it("ação que altera sem aprovação, POST como consulta, sem limite e sem pausa", () => {
    expect(foraDoRecomendadoNaFerramenta({ metodo: "POST", efeito: "altera", pedeAprovacao: false, config: limites })).toEqual(["efeito_e_aprovacao"]);
    expect(foraDoRecomendadoNaFerramenta({ metodo: "POST", efeito: "consulta", pedeAprovacao: false, config: limites })).toEqual(["efeito_e_aprovacao"]);
    expect(
      foraDoRecomendadoNaFerramenta({
        metodo: "GET",
        efeito: "consulta",
        pedeAprovacao: false,
        config: { limite_por_conversa: null, limite_por_dia: 200, pausa_apos_falhas: null },
      }),
    ).toEqual(["limite_de_uso", "pausa_automatica"]);
  });
});

describe("o que o agente lê da resposta", () => {
  const resposta = JSON.stringify({
    status: "enviado",
    cliente: { nome: "Maria", cpf: "000.000.000-00" },
    itens: [
      { titulo: "Camisa", preco: 50 },
      { titulo: "Calça", preco: 90 },
    ],
  });

  it("sem escolha, a resposta segue inteira", () => {
    expect(selecionarCamposDaResposta(resposta, [])).toBe(resposta);
  });

  it("com escolha, só os caminhos pedidos chegam — o CPF fica de fora", () => {
    const lido = selecionarCamposDaResposta(resposta, ["status", "cliente.nome", "itens.titulo", "itens.0.preco", "nao_existe"]);
    expect(JSON.parse(lido)).toEqual({ status: "enviado", "cliente.nome": "Maria", "itens.titulo": ["Camisa", "Calça"], "itens.0.preco": 50 });
    expect(lido).not.toContain("000.000.000-00");
  });

  it("resposta que não é JSON segue como veio; caminho torto é ignorado; `constructor` não é dado", () => {
    expect(selecionarCamposDaResposta("pedido enviado", ["status"])).toBe("pedido enviado");
    expect(selecionarCamposDaResposta(resposta, ["../x", "a b"])).toBe(resposta);
    expect(selecionarCamposDaResposta(resposta, ["constructor", "cliente.__proto__"])).toBe("{}");
  });
});

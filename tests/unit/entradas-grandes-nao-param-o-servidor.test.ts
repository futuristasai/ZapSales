import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extrairTextoPrincipal } from "@/lib/ai/rag/ingest/site-extrair";
import {
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_DATA_ROWS,
  parseImportFile,
  XLSX_MAX_XML_BYTES,
} from "@/lib/crm-b2b/spreadsheet";
import {
  comecaComPalavraDeSaida,
  ehOptOutProvavel,
  ehPedidoDeOptOut,
  normalizarTexto,
  TETO_DE_ANALISE_POR_PONTA,
} from "@/lib/opt-out/deteccao";

/**
 * ENTRADA GRANDE NÃO PARA O SERVIDOR (#269).
 *
 * Três portas por onde texto de fora chega a código que roda no processo
 * principal: a detecção de pedido de saída (toda mensagem recebida), o leitor
 * de planilha XLSX (upload) e o extrator de texto de sites (base de
 * conhecimento do agente). Nas três, uma entrada montada de propósito custava
 * tempo QUADRÁTICO no tamanho.
 *
 * Os tetos de tempo abaixo são folgados de propósito — o que se mede é a
 * diferença entre "milissegundos" e "o processo ficou parado": antes desta
 * correção, os mesmos textos de 65 mil caracteres levavam dezenas de segundos.
 */
const TETO_MS = 1_500;

function cronometrar<T>(f: () => T): { ms: number; valor: T } {
  const inicio = performance.now();
  const valor = f();
  return { ms: performance.now() - inicio, valor };
}

describe("detecção de pedido de saída — tempo", () => {
  const N = 65_000; // o maior texto que o WhatsApp entrega
  const HOSTIS: Array<[string, string]> = [
    ["espaços depois de 'pare de me mandar'", "pare de me mandar" + " ".repeat(N) + "x"],
    ["quebras de linha depois de 'pare de me mandar'", "pare de me mandar" + "\n".repeat(N) + "x"],
    ["tabulações depois de 'não me mande mais'", "não me mande mais" + "\t".repeat(N) + "x"],
    ["espaços depois de 'no me escriba mas'", "no me escriba mas" + " ".repeat(N) + "x"],
    ["espaços de vários tipos misturados", "pare de me mandar" + "  \t\n ".repeat(N / 5) + "x"],
    ["a frase inteira repetida, com objeto que a desarma", "pare de mandar o pedido ".repeat(N / 24)],
    ["só espaços", " ".repeat(N)],
    ["um megabyte de espaços (aviso forjado, acima do teto do WhatsApp)", "pare de me mandar" + " ".repeat(1_000_000)],
  ];

  it.each(HOSTIS)("%s", (_nome, texto) => {
    for (const funcao of [ehPedidoDeOptOut, ehOptOutProvavel, comecaComPalavraDeSaida]) {
      const { ms } = cronometrar(() => funcao(texto));
      expect(ms, funcao.name).toBeLessThan(TETO_MS);
    }
  });
});

describe("detecção de pedido de saída — o sentido não mudou", () => {
  it("espaços repetidos e quebras de linha no meio da frase não escondem o pedido", () => {
    expect(ehPedidoDeOptOut("pare   de \n\n me    mandar\tmensagem")).toBe(true);
    expect(ehPedidoDeOptOut("não\nquero\nmais\nmensagens")).toBe(true);
    expect(ehPedidoDeOptOut("  STOP  ")).toBe(true);
    expect(ehPedidoDeOptOut("S T O P")).toBe(true);
  });

  it("pedido de saída no FIM de uma mensagem longa continua detectado", () => {
    const longa = "Bom dia, tudo bem? ".repeat(2_000) + "Por favor, pare de me mandar mensagem.";
    expect(longa.length).toBeGreaterThan(2 * TETO_DE_ANALISE_POR_PONTA);
    expect(ehPedidoDeOptOut(longa)).toBe(true);
  });

  it("pedido de saída no COMEÇO de uma mensagem longa continua detectado", () => {
    const longa = "Pare de me mandar mensagem. " + "Já falei isso antes. ".repeat(2_000);
    expect(ehPedidoDeOptOut(longa)).toBe(true);
  });

  it("mensagem longa sem pedido continua sem pedido", () => {
    const longa = "Tem como parar a dor? Qual o horário de atendimento? ".repeat(1_000);
    expect(ehPedidoDeOptOut(longa)).toBe(false);
  });

  it("o recorte não fabrica um pedido juntando o fim de uma ponta com o começo da outra", () => {
    const meio = "x".repeat(3 * TETO_DE_ANALISE_POR_PONTA);
    // A 1ª ponta termina em "pare de me"; a 2ª começa em "mandar mensagem".
    const comeco = "a".repeat(TETO_DE_ANALISE_POR_PONTA - "pare de me".length - 1) + " pare de me";
    const fim = "mandar mensagem " + "b".repeat(TETO_DE_ANALISE_POR_PONTA - "mandar mensagem ".length);
    const texto = comeco + meio + fim;
    const normalizado = normalizarTexto(texto);
    expect(normalizado).toContain("pare de me | mandar mensagem");
    expect(ehPedidoDeOptOut(texto)).toBe(false);
    expect(ehOptOutProvavel(texto)).toBe(false);
  });

  it("o recorte não transforma duas pontas numa palavra isolada", () => {
    // Letras das pontas: "st" + "op". Sem a guarda, viraria "stop".
    const texto = "st" + " ".repeat(10) + "1".repeat(3 * TETO_DE_ANALISE_POR_PONTA) + " op";
    expect(ehPedidoDeOptOut(texto)).toBe(false);
  });

  it("o texto normalizado nunca passa de duas pontas e uma emenda", () => {
    expect(normalizarTexto("a ".repeat(100_000)).length).toBeLessThanOrEqual(2 * TETO_DE_ANALISE_POR_PONTA + 3);
    expect(normalizarTexto("Olá,   tudo\n\nbem?")).toBe("ola, tudo bem?");
  });
});

/* ─────────────────────────────── XLSX ─────────────────────────────── */

function xlsx(partes: Record<string, string | Uint8Array>): ArrayBuffer {
  const zip = zipSync(
    Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])),
  );
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="x"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const RELS = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const aba = (corpo: string) => `<?xml version="1.0"?><worksheet><sheetData>${corpo}</sheetData></worksheet>`;
const linha = (...valores: string[]) =>
  `<row>${valores.map((v) => `<c t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`;
const BOA = aba(linha("Empresa", "Telefone") + linha("Silva", "85999991111"));

const planilha = (extra: Record<string, string | Uint8Array> = {}, sheet1 = BOA) =>
  xlsx({
    "xl/workbook.xml": WORKBOOK,
    "xl/_rels/workbook.xml.rels": RELS,
    "xl/worksheets/sheet1.xml": sheet1,
    ...extra,
  });

describe("leitor de XLSX — tamanho", () => {
  it("CONTROLE: a planilha pequena é lida", async () => {
    const lida = await parseImportFile(planilha(), "leads.xlsx");
    expect(lida).toEqual({
      ok: true,
      sheet: { headers: ["Empresa", "Telefone"], rows: [["Silva", "85999991111"]] },
    });
  });

  it("aba que descompacta acima do teto é recusada, rápido e com mensagem", async () => {
    const gigante = new Uint8Array(XLSX_MAX_XML_BYTES + 1).fill(32);
    const zip = planilha({}, "");
    const comGigante = xlsx({
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": gigante,
    });
    expect(zip.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(comGigante.byteLength, "o zip precisa caber no teto do upload para o caso valer").toBeLessThan(
      2 * 1024 * 1024,
    );

    const { ms, valor } = cronometrar(() => parseImportFile(comGigante, "bomba.xlsx"));
    expect(await valor).toEqual({ ok: false, error: "Planilha grande demais para importar de uma vez." });
    expect(ms).toBeLessThan(TETO_MS);
  }, 60_000);

  it("o teto é sobre a SOMA: aba e tabela de textos abaixo do teto cada uma, acima juntas", { timeout: 60_000 }, async () => {
    const metade = new Uint8Array(Math.floor(XLSX_MAX_XML_BYTES * 0.6)).fill(32);
    const arquivo = xlsx({
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": metade,
      "xl/sharedStrings.xml": metade,
    });
    expect(await parseImportFile(arquivo, "soma.xlsx")).toEqual({
      ok: false,
      error: "Planilha grande demais para importar de uma vez.",
    });
  });

  it("abas que não são a primeira não contam e não são descompactadas", async () => {
    // Dez abas extras de 8 MB cada: cada uma cabe no teto, as dez juntas passam
    // quatro vezes dele. Se contassem (ou viessem para a memória), seria recusa.
    const extra = new Uint8Array(8 * 1024 * 1024).fill(32);
    const outras = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`xl/worksheets/sheet${i + 2}.xml`, extra] as const),
    );
    expect(10 * extra.byteLength).toBeGreaterThan(XLSX_MAX_XML_BYTES);
    const arquivo = planilha(outras);
    expect(arquivo.byteLength).toBeLessThan(2 * 1024 * 1024);

    const { ms, valor } = cronometrar(() => parseImportFile(arquivo, "muitas-abas.xlsx"));
    const lida = await valor;
    expect(lida.ok).toBe(true);
    expect(ms).toBeLessThan(TETO_MS);
    // O tempo medido é só o da leitura; o teto maior do caso é para MONTAR o zip.
  }, 60_000);

  it("índice (workbook.xml) gigante é recusado", async () => {
    const arquivo = xlsx({
      "xl/workbook.xml": new Uint8Array(2 * 1024 * 1024).fill(32),
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": BOA,
    });
    expect(await parseImportFile(arquivo, "indice.xlsx")).toEqual({
      ok: false,
      error: "Planilha grande demais para importar de uma vez.",
    });
  });

  it("referência de coluna gigante é recusada em vez de pedir milhões de colunas vazias", async () => {
    const arquivo = planilha({}, aba(linha("Empresa") + `<row><c r="ZZZZZZZZ2" t="inlineStr"><is><t>x</t></is></c></row>`));
    const { ms, valor } = cronometrar(() => parseImportFile(arquivo, "coluna.xlsx"));
    expect(await valor).toEqual({ ok: false, error: `Máximo de ${IMPORT_MAX_COLUMNS} colunas.` });
    expect(ms).toBeLessThan(TETO_MS);
  });

  it("a última coluna permitida ainda é lida", async () => {
    // GR = coluna 200 (índice 199).
    const arquivo = planilha({}, aba(linha("Empresa") + `<row><c r="GR2" t="inlineStr"><is><t>fim</t></is></c></row>`));
    const lida = await parseImportFile(arquivo, "borda.xlsx");
    expect(lida.ok).toBe(true);
  });

  it("linhas demais: recusa sem montar a planilha inteira", async () => {
    const muitas = aba(linha("Empresa") + linha("x").repeat(IMPORT_MAX_DATA_ROWS + 500));
    const { ms, valor } = cronometrar(() => parseImportFile(planilha({}, muitas), "linhas.xlsx"));
    expect(await valor).toEqual({ ok: false, error: `Máximo de ${IMPORT_MAX_DATA_ROWS} linhas de dados.` });
    expect(ms).toBeLessThan(TETO_MS);
  });
});

describe("leitor de XLSX — tempo com XML malformado", () => {
  // Uma abertura repetida e nenhum fechamento: com busca preguiçosa até o
  // fechamento, cada tentativa varria o arquivo até o fim.
  const REPETICOES = 400_000;
  const MALFORMADOS: Array<[string, Record<string, string>, string]> = [
    ["<si> sem fechamento na tabela de textos", { "xl/sharedStrings.xml": "<sst>" + "<si>".repeat(REPETICOES) }, BOA],
    ["<row> sem fechamento na aba", {}, aba("<row>".repeat(REPETICOES))],
    ["<c> sem fechamento dentro de uma linha", {}, aba("<row>" + "<c>".repeat(REPETICOES) + "</row>")],
    ["<t> sem fechamento dentro de uma célula", {}, aba(`<row><c t="inlineStr"><is>${"<t>".repeat(REPETICOES)}</is></c></row>`)],
    ["<v> sem fechamento dentro de uma célula", {}, aba(`<row><c>${"<v>".repeat(REPETICOES)}</c></row>`)],
    ["abertura de tag que nunca termina", {}, aba("<row " + "a".repeat(REPETICOES))],
  ];

  it.each(MALFORMADOS)("%s", async (_nome, extra, sheet1) => {
    const arquivo = planilha(extra, sheet1);
    const { ms, valor } = cronometrar(() => parseImportFile(arquivo, "malformado.xlsx"));
    const lida = await valor;
    // Planilha sem dados legíveis: recusa com mensagem, nunca exceção.
    expect(lida.ok === false || lida.sheet.rows.length >= 0).toBe(true);
    expect(ms).toBeLessThan(TETO_MS);
  });

  it("índice com milhares de <sheet sem fechamento", async () => {
    const arquivo = xlsx({
      "xl/workbook.xml": "<workbook>" + "<sheet ".repeat(100_000),
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": BOA,
    });
    const { ms } = cronometrar(() => parseImportFile(arquivo, "indice-malformado.xlsx"));
    expect(ms).toBeLessThan(TETO_MS);
  });
});

/* ─────────────────────────── extrator de sites ─────────────────────────── */

describe("extrator de texto de sites — tempo", () => {
  // 2 MB é o teto de uma página (`KB_SITE_MAX_BYTES`): o pior caso que chega aqui.
  const N = 2 * 1024 * 1024;
  const PAGINAS: Array<[string, string]> = [
    ["espaços dentro de um parágrafo", `<html><body><p>a${" ".repeat(N)}b</p></body></html>`],
    ["tabulações dentro de um parágrafo", `<html><body><p>a${"\t".repeat(N)}b</p></body></html>`],
    ["espaços e quebras alternados", `<html><body><p>a${" \n".repeat(N / 2)}b</p></body></html>`],
    ["espaços entre blocos", `<html><body>${`<p>a</p>${" ".repeat(1_000)}`.repeat(Math.floor(N / 1_010))}</body></html>`],
  ];

  // Teto próprio, mais alto: aqui a página inteira de 2 MB é percorrida e vira
  // até um milhão de linhas — trabalho proporcional ao tamanho, que nesta
  // máquina fica perto de 2 s. Antes da correção o mesmo caso não terminava em
  // uma hora; é essa diferença que o teto separa.
  const TETO_DA_PAGINA_MS = 8_000;

  it.each(PAGINAS)("%s", { timeout: 60_000 }, (_nome, html) => {
    const { ms } = cronometrar(() => extrairTextoPrincipal(html));
    expect(ms).toBeLessThan(TETO_DA_PAGINA_MS);
  });

  it("o texto extraído não mudou: espaços repetidos seguem virando um, e bloco segue virando linha", () => {
    const r = extrairTextoPrincipal(
      "<html><body><h1>Título</h1><p>um    dois\t\ttrês</p>   <p>quatro</p>\n\n<p>  cinco  </p></body></html>",
    );
    expect(r.texto.split("\n").filter((l) => l !== "")).toEqual(["Título", "um dois três", "quatro", "cinco"]);
  });
});

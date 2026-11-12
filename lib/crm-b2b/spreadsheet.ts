/**
 * Leitura de planilha para o import de empresas e pessoas — CSV e XLSX.
 *
 * CSV reusa o parser do importador de contatos (`lib/contacts/csv.ts`): RFC 4180,
 * detecta `;` do Excel em português, decodifica Latin-1.
 *
 * XLSX é lido com `fflate`, que JÁ está instalado (o pacote de skills descompacta
 * com ele). O PR original trazia `exceljs` só para isto: MIT, mas 21,8 MB
 * desempacotado, nove dependências diretas (archiver, unzipper, jszip, tmp…) e
 * ~100 pacotes novos no lockfile, para ler a PRIMEIRA aba de uma planilha. Um
 * `.xlsx` é um zip de XML; o que se lê aqui é o mínimo desse formato: a primeira
 * aba do `workbook.xml`, a tabela de textos compartilhados e as células. O que
 * fica de fora de propósito: fórmula (vale o último valor calculado, que o Excel
 * grava), estilo, data (sai o número de série; nenhum campo importado é data) e
 * `.xls` binário antigo — este é recusado com mensagem, em vez de virar lixo.
 */
import { strFromU8, unzipSync } from "fflate";

import { decodificarCsv, parseCsv } from "@/lib/contacts/csv";

export type SheetMatrix = { headers: string[]; rows: string[][] };

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_DATA_ROWS = 2_000;
/** Largura máxima de uma linha. Uma célula `r="ZZZZZZ1"` sozinha pediria milhões de colunas vazias. */
export const IMPORT_MAX_COLUMNS = 200;
/**
 * Teto do XML DESCOMPACTADO, somando tudo o que é lido do zip (a aba e a tabela
 * de textos). Os 2 MB do upload são do zip; XML repetitivo comprime 100x, e sem
 * este teto um arquivo pequeno vira centenas de megabytes de memória no
 * servidor. É a SOMA, e não o maior arquivo: o teto por arquivo deixava passar
 * cem abas de 40 MB cada.
 */
export const XLSX_MAX_XML_BYTES = 20 * 1024 * 1024;
/** `workbook.xml` e o arquivo de relações só dizem qual é a primeira aba. */
const XLSX_MAX_INDICE_BYTES = 1024 * 1024;

type Leitura = { ok: true; sheet: SheetMatrix } | { ok: false; error: string };

export function isXlsxFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".xlsx");
}

export function isCsvFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".csv");
}

export async function parseImportFile(bytes: ArrayBuffer, filename: string): Promise<Leitura> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) {
    return { ok: false, error: `Arquivo maior que ${IMPORT_MAX_BYTES} bytes.` };
  }
  if (isXlsxFilename(filename)) return parseXlsx(bytes);
  if (isCsvFilename(filename)) return parseCsvBytes(bytes);
  return { ok: false, error: "Formato não suportado — envie .csv ou .xlsx." };
}

/** Cabeçalho + linhas, cada linha aparada ou completada até a largura do cabeçalho. */
function matrizParaPlanilha(matrix: string[][]): Leitura {
  if (matrix.length < 2) {
    return { ok: false, error: "Preciso de cabeçalho e ao menos uma linha de dados." };
  }
  const headers = matrix[0]!.map((h) => h.trim());
  const rows = matrix.slice(1);
  if (rows.length > IMPORT_MAX_DATA_ROWS) {
    return { ok: false, error: `Máximo de ${IMPORT_MAX_DATA_ROWS} linhas de dados.` };
  }
  const width = headers.length;
  const normalized = rows.map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });
  return { ok: true, sheet: { headers, rows: normalized } };
}

function parseCsvBytes(bytes: ArrayBuffer): Leitura {
  const decoded = decodificarCsv(bytes);
  if ("erro" in decoded) return { ok: false, error: decoded.erro };
  return matrizParaPlanilha(parseCsv(decoded.texto));
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificarXml(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (inteira, e: string) => {
    if (e[0] === "#") {
      const codigo = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    return ENTIDADES[e.toLowerCase()] ?? inteira;
  });
}

const ehEspaco = (codigo: number) => codigo === 32 || codigo === 9 || codigo === 10 || codigo === 13;

/**
 * Cada elemento `<tag …>…</tag>` ou `<tag …/>` de um XML, na ordem, em tempo
 * LINEAR no tamanho do texto.
 *
 * Era `matchAll` com `[\s\S]*?` até o fechamento. Num XML malformado — uma
 * abertura repetida milhares de vezes e nenhum fechamento — cada tentativa
 * varria o texto até o fim, e o custo era quadrático: megabytes de XML paravam
 * o servidor por minutos (#269). Aqui a busca só anda para a frente, e a
 * primeira abertura sem fechamento encerra a leitura: não há mais elemento
 * completo dali em diante.
 */
function* elementos(xml: string, tag: string): Generator<{ attrs: string; corpo: string }> {
  const abre = `<${tag}`;
  const fecha = `</${tag}>`;
  let pos = 0;
  for (;;) {
    const inicio = xml.indexOf(abre, pos);
    if (inicio < 0) return;
    const depoisDoNome = xml.charCodeAt(inicio + abre.length);
    // `<c` também começa `<col` e `<cols`: o nome da tag tem de acabar aqui.
    if (depoisDoNome !== 62 /* > */ && depoisDoNome !== 47 /* / */ && !ehEspaco(depoisDoNome)) {
      pos = inicio + abre.length;
      continue;
    }
    const fimDaAbertura = xml.indexOf(">", inicio + abre.length);
    if (fimDaAbertura < 0) return;
    if (xml.charCodeAt(fimDaAbertura - 1) === 47 /* / */) {
      yield { attrs: xml.slice(inicio + abre.length, fimDaAbertura - 1), corpo: "" };
      pos = fimDaAbertura + 1;
      continue;
    }
    const fechamento = xml.indexOf(fecha, fimDaAbertura + 1);
    if (fechamento < 0) return;
    yield {
      attrs: xml.slice(inicio + abre.length, fimDaAbertura),
      corpo: xml.slice(fimDaAbertura + 1, fechamento),
    };
    pos = fechamento + fecha.length;
  }
}

/** O texto de um `<si>` ou `<is>`: todos os `<t>`, inclusive os de texto rico (`<r><t>`). */
function textoDosRuns(xml: string): string {
  let out = "";
  for (const t of elementos(xml, "t")) out += decodificarXml(t.corpo);
  return out;
}

/** "A" → 0, "Z" → 25, "AA" → 26. Além de `IMPORT_MAX_COLUMNS` devolve o próprio teto. */
function indiceDaColuna(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
    if (n > IMPORT_MAX_COLUMNS) return IMPORT_MAX_COLUMNS;
  }
  return n - 1;
}

function valorDaCelula(attrs: string, corpo: string, compartilhados: string[]): string {
  const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
  if (tipo === "inlineStr") return textoDosRuns(corpo);
  let v: string | undefined;
  for (const el of elementos(corpo, "v")) {
    v = el.corpo;
    break;
  }
  if (v === undefined) return "";
  if (tipo === "s") return compartilhados[Number(v)] ?? "";
  if (tipo === "b") return v === "1" ? "TRUE" : "FALSE";
  if (tipo === "str" || tipo === "e" || tipo === "d") return decodificarXml(v);
  // Número: `String(Number(v))` desfaz o "1.1222333000181E+13" que alguns
  // geradores gravam para um CNPJ ou telefone digitado como número.
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : v;
}

const GRANDE_DEMAIS = "Planilha grande demais para importar de uma vez.";
const ILEGIVEL = "Não consegui ler o arquivo XLSX.";

/**
 * Descompacta do zip só os arquivos pedidos, recusando quando a soma do
 * tamanho DESCOMPACTADO deles passa do teto. `null` = zip ilegível.
 */
function abrir(
  zip: Uint8Array,
  quer: (nome: string) => boolean,
  teto: number,
): { arquivos: Record<string, Uint8Array>; passouDoTeto: boolean } | null {
  let total = 0;
  let passouDoTeto = false;
  try {
    const arquivos = unzipSync(zip, {
      filter: (f) => {
        if (passouDoTeto || !quer(f.name)) return false;
        total += f.originalSize;
        if (total > teto) passouDoTeto = true;
        return !passouDoTeto;
      },
    });
    return { arquivos, passouDoTeto };
  } catch {
    return null;
  }
}

function parseXlsx(bytes: ArrayBuffer): Leitura {
  const zip = new Uint8Array(bytes);
  const WORKBOOK = "xl/workbook.xml";
  const RELS = "xl/_rels/workbook.xml.rels";
  const TEXTOS = "xl/sharedStrings.xml";

  // 1ª passada: só o índice, para saber QUAL aba ler. As outras abas nunca são
  // descompactadas — antes vinham todas para a memória e só uma era lida.
  const indice = abrir(zip, (nome) => nome === WORKBOOK || nome === RELS, XLSX_MAX_INDICE_BYTES);
  if (indice === null) return { ok: false, error: ILEGIVEL };
  if (indice.passouDoTeto) return { ok: false, error: GRANDE_DEMAIS };
  const workbook = indice.arquivos[WORKBOOK] ? strFromU8(indice.arquivos[WORKBOOK]) : null;
  if (workbook === null) return { ok: false, error: ILEGIVEL };

  // A PRIMEIRA aba na ordem das abas, que não é necessariamente `sheet1.xml`.
  let rid: string | undefined;
  for (const sheet of elementos(workbook, "sheet")) {
    rid = /\br:id="([^"]+)"/.exec(sheet.attrs)?.[1];
    if (rid !== undefined) break;
  }
  const rels = indice.arquivos[RELS] ? strFromU8(indice.arquivos[RELS]) : "";
  let alvo: string | undefined;
  for (const rel of elementos(rels, "Relationship")) {
    if (rel.attrs.includes(`Id="${rid}"`)) alvo = /Target="([^"]+)"/.exec(rel.attrs)?.[1];
  }
  const caminho = alvo ? `xl/${alvo.replace(/^\/?xl\//, "").replace(/^\//, "")}` : "xl/worksheets/sheet1.xml";

  // 2ª passada: a aba escolhida e a tabela de textos, com o teto sobre a soma.
  const dados = abrir(zip, (nome) => nome === caminho || nome === TEXTOS, XLSX_MAX_XML_BYTES);
  if (dados === null) return { ok: false, error: ILEGIVEL };
  if (dados.passouDoTeto) return { ok: false, error: GRANDE_DEMAIS };
  const aba = dados.arquivos[caminho] ? strFromU8(dados.arquivos[caminho]) : null;
  if (aba === null) return { ok: false, error: "Planilha vazia." };

  const compartilhados: string[] = [];
  if (dados.arquivos[TEXTOS]) {
    for (const si of elementos(strFromU8(dados.arquivos[TEXTOS]), "si")) {
      compartilhados.push(textoDosRuns(si.corpo));
    }
  }

  const matriz: string[][] = [];
  for (const linha of elementos(aba, "row")) {
    const celulas: string[] = [];
    for (const c of elementos(linha.corpo, "c")) {
      const ref = /\br="([A-Z]+\d*)"/i.exec(c.attrs)?.[1];
      const i = ref ? indiceDaColuna(ref) : celulas.length;
      if (i >= IMPORT_MAX_COLUMNS) {
        return { ok: false, error: `Máximo de ${IMPORT_MAX_COLUMNS} colunas.` };
      }
      while (celulas.length < i) celulas.push("");
      celulas[i] = valorDaCelula(c.attrs, c.corpo, compartilhados);
    }
    if (celulas.some((v) => v.trim() !== "")) matriz.push(celulas);
    // +1 pelo cabeçalho. Para aqui em vez de montar a matriz inteira só para
    // `matrizParaPlanilha` recusá-la depois.
    if (matriz.length > IMPORT_MAX_DATA_ROWS + 1) {
      return { ok: false, error: `Máximo de ${IMPORT_MAX_DATA_ROWS} linhas de dados.` };
    }
  }
  return matrizParaPlanilha(matriz);
}

/** Sugere mapeamento por apelidos comuns de coluna. */
const ALIASES: Record<string, string[]> = {
  company_name: ["empresa", "company", "company_name", "nome da empresa", "razao", "razão social"],
  legal_name: ["razao social", "razão social", "legal_name", "razao_social"],
  trade_name: ["nome fantasia", "fantasia", "trade_name", "nome_fantasia"],
  cnpj: ["cnpj"],
  person_name: ["pessoa", "decisor", "contato", "nome", "person", "person_name", "nome do contato"],
  job_title: ["cargo", "job_title", "função", "funcao", "titulo"],
  phone: ["telefone", "phone", "celular", "whatsapp", "fone"],
  email: ["email", "e-mail", "mail"],
};

export type MappingField =
  | "company_name"
  | "legal_name"
  | "trade_name"
  | "cnpj"
  | "person_name"
  | "job_title"
  | "phone"
  | "email";

export function suggestColumnMapping(headers: string[]): Partial<Record<MappingField, string>> {
  const out: Partial<Record<MappingField, string>> = {};
  const lower = headers.map((h) => ({ raw: h, key: h.trim().toLowerCase() }));
  for (const [field, aliases] of Object.entries(ALIASES) as [MappingField, string[]][]) {
    const hit = lower.find((h) => aliases.includes(h.key));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

export function applyMapping(
  headers: string[],
  row: string[],
  mapping: Partial<Record<MappingField, string>>,
): Record<MappingField, string> {
  const idx = new Map(headers.map((h, i) => [h, i]));
  const get = (field: MappingField): string => {
    const col = mapping[field];
    if (!col) return "";
    const i = idx.get(col);
    if (i === undefined) return "";
    return (row[i] ?? "").trim();
  };
  return {
    company_name: get("company_name"),
    legal_name: get("legal_name"),
    trade_name: get("trade_name"),
    cnpj: get("cnpj"),
    person_name: get("person_name"),
    job_title: get("job_title"),
    phone: get("phone"),
    email: get("email"),
  };
}

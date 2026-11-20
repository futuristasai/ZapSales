/**
 * A MONTAGEM do pedido de uma ferramenta de API (issue #372): do que a pessoa cadastrou
 * (endereço-modelo, método, cabeçalhos, corpo) e do que o agente preencheu, sai o pedido
 * HTTP exato. Pura: não toca rede, banco nem relógio — é o que permite exercitar cada regra
 * de segurança sem um servidor do outro lado.
 *
 * As regras que este arquivo sustenta, e os testes medem:
 *
 *  - O HOST NUNCA É MARCADOR. O endereço-modelo só aceita `{{campo}}` depois do host: o modelo
 *    preenche o número do pedido, nunca para ONDE a chamada vai. E o endereço final é conferido
 *    de novo contra o host do modelo.
 *  - TODO VALOR ENTRA CODIFICADO. No caminho e na consulta, `encodeURIComponent`; um valor que
 *    é só pontos (`..`) é recusado (subiria de pasta na API do outro sistema). No corpo, o
 *    modelo é JSON de verdade: os valores entram na ÁRVORE e não no texto, então nenhum valor
 *    fecha uma aspa ou acrescenta um campo.
 *  - O DADO DO CONTATO vem do sistema (`contato`), nunca do modelo, e só entra o que a
 *    ferramenta declara (`config.dados_contato`). Marcador de dado não liberado não monta.
 *  - A CREDENCIAL só existe aqui, no cabeçalho, no instante da chamada. O `resumo` devolvido
 *    para a tela de teste não a contém.
 */
import {
  CABECALHOS_RESERVADOS,
  MARCADOR_DO_CONTATO,
  METODOS_COM_CORPO,
  type ConfigDaApi,
  type ContatoDaConversa,
  type DadoDoContato,
  type MetodoDaApi,
} from "./tipos";

/** `{{campo}}` — o mesmo desenho no endereço e no corpo. */
const MARCADOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g;
/** Sem a bandeira global: `test` com `g` guarda posição entre chamadas e mente na segunda. */
const TEM_MARCADOR = /\{\{\s*[A-Za-z_][A-Za-z0-9_-]*\s*\}\}/;
const SO_UM_MARCADOR =/^\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}$/;

/** Os nomes dos marcadores de um texto, sem repetição, na ordem em que aparecem. */
export function marcadoresDe(texto: string): string[] {
  const nomes: string[] = [];
  for (const achado of texto.matchAll(MARCADOR)) {
    const nome = achado[1] as string;
    if (!nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

export type ProblemaDoEndereco = "invalido" | "https" | "credencial_embutida" | "marcador_no_host";

/** A parte do endereço que vem antes do caminho: esquema, host e porta. */
function origemDoModelo(modelo: string): string {
  const depoisDoEsquema = modelo.indexOf("://");
  if (depoisDoEsquema < 0) return modelo;
  const resto = modelo.slice(depoisDoEsquema + 3);
  const fim = resto.search(/[/?#]/);
  return modelo.slice(0, depoisDoEsquema + 3) + (fim < 0 ? resto : resto.slice(0, fim));
}

/** O endereço-modelo com os marcadores trocados por um valor inofensivo, para conferir a FORMA. */
function modeloComoUrl(modelo: string): URL | null {
  try {
    return new URL(modelo.replace(MARCADOR, "x"));
  } catch {
    return null;
  }
}

/** O host (com porta) do endereço-modelo, em minúsculas — é o que a lista de endereços permitidos confere. */
export function hostDoModelo(modelo: string): string | null {
  const url = modeloComoUrl(modelo);
  return url ? url.hostname.toLowerCase() : null;
}

/** A forma do endereço-modelo. `null` = pode ser gravado. Quem decide se é ALCANÇÁVEL é a rede segura. */
export function conferirEnderecoModelo(modelo: string, permitirHttp: boolean): ProblemaDoEndereco | null {
  if (TEM_MARCADOR.test(origemDoModelo(modelo))) return "marcador_no_host";
  const url = modeloComoUrl(modelo);
  if (!url) return "invalido";
  if (url.username !== "" || url.password !== "") return "credencial_embutida";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && permitirHttp)) return "https";
  return null;
}

export type ProblemaDoCorpo = "json_invalido" | "nao_objeto";

/** O modelo do corpo é JSON de verdade (os marcadores ficam DENTRO de textos) e a raiz é um objeto ou uma lista. */
export function conferirModeloDoCorpo(modelo: string): ProblemaDoCorpo | null {
  let lido: unknown;
  try {
    lido = JSON.parse(modelo);
  } catch {
    return "json_invalido";
  }
  return lido !== null && typeof lido === "object" ? null : "nao_objeto";
}

/** Os marcadores que um cadastro usa, em qualquer lugar (endereço e modelo do corpo). */
export function marcadoresDoCadastro(urlModelo: string, config: Pick<ConfigDaApi, "corpo">): string[] {
  const nomes = marcadoresDe(urlModelo);
  if (config.corpo.modo === "modelo" && config.corpo.modelo) {
    for (const nome of marcadoresDe(config.corpo.modelo)) if (!nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

/** O dado do contato que um marcador pede, ou `null` se o marcador é um campo do agente. */
export function dadoDoMarcador(nome: string): DadoDoContato | null {
  for (const [dado, marcador] of Object.entries(MARCADOR_DO_CONTATO) as Array<[DadoDoContato, string]>) {
    if (marcador === nome) return dado;
  }
  return null;
}

export interface PedidoMontado {
  metodo: MetodoDaApi;
  url: string;
  headers: Record<string, string>;
  corpo: string | null;
}

/** O que a tela de teste mostra do que foi enviado: sem a credencial e sem nenhum cabeçalho. */
export interface ResumoDoPedido {
  method: MetodoDaApi;
  url: string;
  body: unknown;
}

export type MotivoDaMontagem =
  | "campo_do_endereco_vazio"
  | "valor_invalido_no_endereco"
  | "marcador_desconhecido"
  | "dado_do_contato_nao_liberado"
  | "endereco_invalido"
  | "corpo_invalido";

export type Montagem =
  | { ok: true; pedido: PedidoMontado; resumo: ResumoDoPedido }
  | { ok: false; motivo: MotivoDaMontagem; campo?: string };

export interface EntradaDaMontagem {
  urlModelo: string;
  config: ConfigDaApi;
  /** O que o agente preencheu, JÁ validado contra os campos da ferramenta. */
  argumentos: Record<string, unknown>;
  /** Lido pelo sistema da conversa em curso. Nunca vem do modelo. */
  contato: ContatoDaConversa;
  /** A credencial em claro, ou `null` (API sem credencial). */
  credencial: string | null;
  /** O id do pedido aprovado: vai como `Idempotency-Key`, para quem recebe poder deduplicar. */
  idDeEntrega?: string;
}

class FalhaDeMontagem extends Error {
  constructor(
    readonly motivo: MotivoDaMontagem,
    readonly campo?: string,
  ) {
    super(motivo);
  }
}

type Valor = string | number | boolean;

function ehValor(v: unknown): v is Valor {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * Os valores que os marcadores podem usar: os campos do agente e os dados do contato que ESTA
 * ferramenta declara. Um marcador de dado do contato não declarado lança — fecha a porta de
 * um cadastro antigo continuar enviando o que a organização deixou de liberar.
 */
function resolvedor(entrada: EntradaDaMontagem): (nome: string) => Valor | undefined {
  const liberados = new Set(entrada.config.dados_contato);
  return (nome) => {
    const dado = dadoDoMarcador(nome);
    if (dado) {
      if (!liberados.has(dado)) throw new FalhaDeMontagem("dado_do_contato_nao_liberado", nome);
      const valor = entrada.contato[dado];
      return typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
    }
    if (!(nome in entrada.argumentos)) {
      // Campo opcional que o agente não preencheu chega como ausente; marcador que não é campo
      // nenhum do cadastro é erro de cadastro, e quem confere isso é o esquema, na gravação.
      return undefined;
    }
    const valor = entrada.argumentos[nome];
    return ehValor(valor) ? valor : undefined;
  };
}

function montarEndereco(
  entrada: EntradaDaMontagem,
  valorDe: (nome: string) => Valor | undefined,
  usados: Set<string>,
): string {
  const modelo = entrada.urlModelo;
  const cerquilha = modelo.indexOf("#");
  const semFragmento = cerquilha < 0 ? modelo : modelo.slice(0, cerquilha);
  const interrogacao = semFragmento.indexOf("?");
  const caminhoModelo = interrogacao < 0 ? semFragmento : semFragmento.slice(0, interrogacao);
  const consultaModelo = interrogacao < 0 ? "" : semFragmento.slice(interrogacao + 1);

  const caminho = caminhoModelo.replace(MARCADOR, (_inteiro, nome: string) => {
    usados.add(nome);
    const valor = valorDe(nome);
    if (valor === undefined) throw new FalhaDeMontagem("campo_do_endereco_vazio", nome);
    const texto = String(valor).trim();
    // Vazio quebraria o caminho; só pontos subiria de pasta na API do outro sistema.
    if (texto === "" || /^\.+$/.test(texto)) throw new FalhaDeMontagem("valor_invalido_no_endereco", nome);
    return encodeURIComponent(texto);
  });

  const pares: string[] = [];
  for (const par of consultaModelo.split("&")) {
    if (par === "") continue;
    let ausente = false;
    const montado = par.replace(MARCADOR, (_inteiro, nome: string) => {
      usados.add(nome);
      const valor = valorDe(nome);
      if (valor === undefined) {
        ausente = true;
        return "";
      }
      return encodeURIComponent(String(valor));
    });
    // Campo opcional não preenchido: o par inteiro sai, em vez de mandar `?filtro=`.
    if (!ausente) pares.push(montado);
  }

  // Método sem corpo: os campos que o endereço não cita vão como `?campo=valor`.
  if (!METODOS_COM_CORPO.has(entrada.config.metodo)) {
    for (const [nome, bruto] of Object.entries(entrada.argumentos)) {
      if (usados.has(nome) || !ehValor(bruto)) continue;
      pares.push(`${encodeURIComponent(nome)}=${encodeURIComponent(String(bruto))}`);
      usados.add(nome);
    }
  }

  return pares.length > 0 ? `${caminho}?${pares.join("&")}` : caminho;
}

const AUSENTE = Symbol("ausente");

/** Troca os marcadores DENTRO da árvore do modelo. Um texto que é só o marcador recebe o valor com o tipo dele. */
function preencherArvore(no: unknown, valorDe: (nome: string) => Valor | undefined, usados: Set<string>): unknown {
  if (typeof no === "string") {
    const inteiro = SO_UM_MARCADOR.exec(no);
    if (inteiro) {
      const nome = inteiro[1] as string;
      usados.add(nome);
      const valor = valorDe(nome);
      return valor === undefined ? AUSENTE : valor;
    }
    return no.replace(MARCADOR, (_inteiro, nome: string) => {
      usados.add(nome);
      const valor = valorDe(nome);
      return valor === undefined ? "" : String(valor);
    });
  }
  if (Array.isArray(no)) {
    return no.map((item) => preencherArvore(item, valorDe, usados)).filter((item) => item !== AUSENTE);
  }
  if (no !== null && typeof no === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(no)) {
      const preenchido = preencherArvore(valor, valorDe, usados);
      // Campo opcional não preenchido: a chave sai do corpo, em vez de ir `null` ou vazia.
      if (preenchido !== AUSENTE) saida[chave] = preenchido;
    }
    return saida;
  }
  return no;
}

function montarCorpo(
  entrada: EntradaDaMontagem,
  valorDe: (nome: string) => Valor | undefined,
  usadosNoEndereco: ReadonlySet<string>,
): unknown {
  if (!METODOS_COM_CORPO.has(entrada.config.metodo)) return null;
  if (entrada.config.corpo.modo === "modelo") {
    let arvore: unknown;
    try {
      arvore = JSON.parse(entrada.config.corpo.modelo ?? "");
    } catch {
      throw new FalhaDeMontagem("corpo_invalido");
    }
    const preenchido = preencherArvore(arvore, valorDe, new Set());
    return preenchido === AUSENTE ? {} : preenchido;
  }
  // Modo «campos»: o que o endereço já levou não se repete no corpo.
  const corpo: Record<string, unknown> = {};
  for (const [nome, bruto] of Object.entries(entrada.argumentos)) {
    if (usadosNoEndereco.has(nome) || !ehValor(bruto)) continue;
    corpo[nome] = bruto;
  }
  for (const dado of entrada.config.dados_contato) {
    const marcador = MARCADOR_DO_CONTATO[dado];
    if (usadosNoEndereco.has(marcador)) continue;
    const valor = valorDe(marcador);
    if (valor !== undefined) corpo[marcador] = valor;
  }
  return corpo;
}

function cabecalhos(entrada: EntradaDaMontagem, temCorpo: boolean): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  for (const c of entrada.config.cabecalhos) {
    const nome = c.nome.toLowerCase();
    // Defesa em profundidade: o esquema já recusa estes na gravação.
    if (CABECALHOS_RESERVADOS.has(nome) || /[\r\n]/.test(c.valor)) continue;
    headers[nome] = c.valor;
  }
  if (temCorpo) headers["content-type"] = "application/json";
  if (entrada.idDeEntrega) headers["idempotency-key"] = entrada.idDeEntrega;
  const { tipo, cabecalho, usuario } = entrada.config.credencial;
  const credencial = entrada.credencial;
  if (credencial && tipo === "bearer") headers.authorization = `Bearer ${credencial}`;
  if (credencial && tipo === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${usuario ?? ""}:${credencial}`, "utf8").toString("base64")}`;
  }
  if (credencial && tipo === "cabecalho" && cabecalho) headers[cabecalho.toLowerCase()] = credencial;
  return headers;
}

/** Monta o pedido. Nunca lança: o que não monta volta como `ok: false` com o motivo. */
export function montarPedido(entrada: EntradaDaMontagem): Montagem {
  try {
    const valorDe = resolvedor(entrada);
    const usados = new Set<string>();
    const url = montarEndereco(entrada, valorDe, usados);

    let final: URL;
    try {
      final = new URL(url);
    } catch {
      return { ok: false, motivo: "endereco_invalido" };
    }
    // O endereço montado continua no host que a pessoa cadastrou. Um valor não muda o destino.
    if (final.hostname.toLowerCase() !== hostDoModelo(entrada.urlModelo)) {
      return { ok: false, motivo: "endereco_invalido" };
    }

    const arvore = montarCorpo(entrada, valorDe, usados);
    const corpo = arvore === null ? null : JSON.stringify(arvore);
    return {
      ok: true,
      pedido: { metodo: entrada.config.metodo, url: final.toString(), headers: cabecalhos(entrada, corpo !== null), corpo },
      resumo: { method: entrada.config.metodo, url: final.toString(), body: arvore },
    };
  } catch (err) {
    if (err instanceof FalhaDeMontagem) return { ok: false, motivo: err.motivo, ...(err.campo ? { campo: err.campo } : {}) };
    return { ok: false, motivo: "endereco_invalido" };
  }
}

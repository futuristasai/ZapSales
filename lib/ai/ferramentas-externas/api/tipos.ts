/**
 * API genérica como ferramenta do agente (issue #372): o terceiro tipo de ferramenta externa,
 * ao lado do webhook (#94) e do servidor MCP (#96). Aqui a pessoa cadastra os dados da API
 * PRONTA de outro sistema — método, endereço, credencial, corpo — e o agente a chama direto,
 * sem intermediário.
 *
 * Client-safe: zero import de zod, supabase ou next/headers. O vocabulário daqui é o que o
 * Zod de `esquema.ts` valida e o que o jsonb `agent_external_tools.api_config` guarda.
 */

/** Os métodos HTTP aceitos. `GET` nasce «só consulta»; os demais nascem «altera dados». */
export const METODOS_DA_API = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type MetodoDaApi = (typeof METODOS_DA_API)[number];

/** Só estes levam corpo. `GET` e `DELETE` mandam os campos no endereço. */
export const METODOS_COM_CORPO: ReadonlySet<MetodoDaApi> = new Set<MetodoDaApi>(["POST", "PUT", "PATCH"]);

/**
 * Como a credencial viaja. Sempre em CABEÇALHO — credencial em query string vaza em log de
 * servidor e de proxy, e fica fora desta entrega.
 *
 *  - `nenhuma`   — API aberta.
 *  - `bearer`    — `Authorization: Bearer <credencial>`.
 *  - `cabecalho` — um cabeçalho com o nome que a pessoa informou (`X-API-Key`) e o valor cru.
 *  - `basic`     — `Authorization: Basic base64(usuario:credencial)`.
 */
export const TIPOS_DE_CREDENCIAL = ["nenhuma", "bearer", "cabecalho", "basic"] as const;
export type TipoDeCredencial = (typeof TIPOS_DE_CREDENCIAL)[number];

/** O que o corpo leva: todos os campos como um objeto JSON, ou um modelo que a pessoa escreveu. */
export const MODOS_DO_CORPO = ["campos", "modelo"] as const;
export type ModoDoCorpo = (typeof MODOS_DO_CORPO)[number];

/**
 * Os dados da CONVERSA que podem ser enviados a outro sistema. Quem preenche é o sistema, a
 * partir da conversa em curso — nunca o modelo. É o que impede o agente de consultar o pedido
 * de outra pessoa a pedido de quem digita um número qualquer.
 */
export const DADOS_DO_CONTATO = ["telefone", "nome", "email"] as const;
export type DadoDoContato = (typeof DADOS_DO_CONTATO)[number];

/** O nome do marcador de cada dado do contato (`{{contato_telefone}}`) e a chave no corpo em modo «campos». */
export const MARCADOR_DO_CONTATO: Record<DadoDoContato, string> = {
  telefone: "contato_telefone",
  nome: "contato_nome",
  email: "contato_email",
};

export const ROTULO_DO_DADO_DO_CONTATO: Record<DadoDoContato, string> = {
  telefone: "Telefone",
  nome: "Nome",
  email: "E-mail",
};

export const LIMITES_DA_API = {
  cabecalhos: { max: 5 },
  nomeDoCabecalho: { max: 40 },
  valorDoCabecalho: { max: 300 },
  modeloDoCorpo: { max: 4000 },
  credencial: { min: 1, max: 2000 },
  usuario: { max: 200 },
  camposDaResposta: { max: 10 },
  caminhoDaResposta: { max: 80 },
  /** Quantos itens de uma lista da resposta chegam ao agente quando o caminho passa por ela. */
  itensDeLista: 20,
  limitePorConversa: { min: 1, max: 50, padrao: 5 },
  limitePorDia: { min: 1, max: 5000, padrao: 200 },
  pausaAposFalhas: { min: 2, max: 20, padrao: 5 },
  opcoesDoCampo: { max: 20, tamanho: 60 },
} as const;

/** A janela dos dois limites de uso: as últimas 24 horas (corrida, sem virada de dia). */
export const JANELA_DO_LIMITE_HORAS = 24;

export interface CabecalhoFixo {
  nome: string;
  valor: string;
}

/** O que `agent_external_tools.api_config` guarda de uma ferramenta de API. Nunca a credencial. */
export interface ConfigDaApi {
  metodo: MetodoDaApi;
  /** Cabeçalhos sem segredo que vão em toda chamada (`Accept`, versão da API). */
  cabecalhos: CabecalhoFixo[];
  corpo: { modo: ModoDoCorpo; modelo: string | null };
  credencial: {
    tipo: TipoDeCredencial;
    /** Só em `cabecalho`: o nome do cabeçalho que leva a credencial. */
    cabecalho: string | null;
    /** Só em `basic`: o usuário (a senha é a credencial cifrada). */
    usuario: string | null;
  };
  /** Os caminhos da resposta que chegam ao agente (`status`, `cliente.nome`). Vazio = a resposta inteira, cortada. */
  campos_resposta: string[];
  /** Os dados do contato que ESTA ferramenta envia, dentro do que a organização liberou. */
  dados_contato: DadoDoContato[];
  /** Chamadas por conversa nas últimas 24 h. `null` = sem limite (fora do recomendado). */
  limite_por_conversa: number | null;
  /** Chamadas no total nas últimas 24 h. `null` = sem limite (fora do recomendado). */
  limite_por_dia: number | null;
  /** Falhas seguidas que pausam a ferramenta sozinha. `null` = nunca pausa (fora do recomendado). */
  pausa_apos_falhas: number | null;
}

/** O que a ferramenta de API precisa para SAIR: a config, mais o que só existe na hora da chamada. */
export interface DestinoApi {
  config: ConfigDaApi;
  /** `true` = há credencial cifrada gravada. Havendo e não a tendo lido, a chamada não sai. */
  temCredencial: boolean;
}

/** Os dados do contato da conversa em curso, lidos pelo sistema. `null` = não há (o campo fica vazio). */
export type ContatoDaConversa = Partial<Record<DadoDoContato, string | null>>;

/** Os cabeçalhos que a pessoa NÃO pode fixar: o protocolo ou a credencial cuidam deles. */
export const CABECALHOS_RESERVADOS: ReadonlySet<string> = new Set([
  "host",
  "content-length",
  "content-type",
  "connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "authorization",
  "cookie",
  "expect",
]);

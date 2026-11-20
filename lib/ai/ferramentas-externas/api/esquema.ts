/**
 * O esquema do CADASTRO de uma ferramenta de API (issue #372): o que a rota aceita e o que o
 * jsonb `agent_external_tools.api_config` guarda.
 *
 *  - `criarApiSchema` / `editarApiSchema` — a entrada da ROTA. Zod estrito: o corpo nunca
 *    escolhe a organização, o id nem o identificador que o modelo vê.
 *  - `configDaApiLida` — a leitura DEFENSIVA do jsonb. Quem lê do banco (cadastro e motor) usa
 *    esta: linha escrita por fora da tela, com formato estranho, vira «ferramenta ilegível» e
 *    fica FORA do turno — nunca um pedido montado pela metade.
 *
 * A credencial NÃO faz parte da config: viaja sozinha (`credencial`), é cifrada e nunca volta.
 */
import { z } from "zod";

import { parametroSchema } from "../esquema";
import { EFEITOS_DA_FERRAMENTA, LIMITES_DA_FERRAMENTA, VALIDADE_DO_PEDIDO_HORAS } from "../tipos";
import { conferirEnderecoModelo, conferirModeloDoCorpo, dadoDoMarcador, marcadoresDe } from "./montagem";
import { CAMINHO_DA_RESPOSTA } from "./resposta";
import {
  CABECALHOS_RESERVADOS,
  DADOS_DO_CONTATO,
  LIMITES_DA_API,
  METODOS_COM_CORPO,
  METODOS_DA_API,
  MODOS_DO_CORPO,
  TIPOS_DE_CREDENCIAL,
  type ConfigDaApi,
} from "./tipos";

const NOME_DE_CABECALHO = /^[A-Za-z][A-Za-z0-9-]*$/;

const nomeDeCabecalhoSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITES_DA_API.nomeDoCabecalho.max)
  .regex(NOME_DE_CABECALHO, "Use só letras, números e hífen no nome do cabeçalho.")
  .refine((nome) => !CABECALHOS_RESERVADOS.has(nome.toLowerCase()), "Este cabeçalho é reservado.");

const cabecalhoSchema = z
  .object({
    nome: nomeDeCabecalhoSchema,
    // Sem quebra de linha (injetaria outro cabeçalho) e sem marcador (cabeçalho é fixo).
    valor: z
      .string()
      .trim()
      .min(1)
      .max(LIMITES_DA_API.valorDoCabecalho.max)
      .refine((valor) => !/[\r\n]/.test(valor) && marcadoresDe(valor).length === 0, "Valor de cabeçalho inválido."),
  })
  .strict();

const cabecalhosSchema = z
  .array(cabecalhoSchema)
  .max(LIMITES_DA_API.cabecalhos.max)
  .refine((lista) => new Set(lista.map((c) => c.nome.toLowerCase())).size === lista.length, {
    message: "Dois cabeçalhos têm o mesmo nome.",
  });

const credencialSchema = z
  .object({
    tipo: z.enum(TIPOS_DE_CREDENCIAL),
    cabecalho: nomeDeCabecalhoSchema.nullable().default(null),
    usuario: z.string().trim().min(1).max(LIMITES_DA_API.usuario.max).nullable().default(null),
  })
  .strict()
  .refine((c) => (c.tipo === "cabecalho") === (c.cabecalho !== null), {
    message: "Informe o nome do cabeçalho que leva a credencial.",
  })
  .refine((c) => (c.tipo === "basic") === (c.usuario !== null), { message: "Informe o usuário." });

const corpoSchema = z
  .object({
    modo: z.enum(MODOS_DO_CORPO),
    modelo: z.string().max(LIMITES_DA_API.modeloDoCorpo.max).nullable().default(null),
  })
  .strict()
  .refine((c) => (c.modo === "modelo") === (c.modelo !== null && c.modelo.trim() !== ""), {
    message: "Escreva o modelo do corpo.",
  })
  .refine((c) => c.modo !== "modelo" || conferirModeloDoCorpo(c.modelo ?? "") === null, {
    message: "O modelo do corpo precisa ser um JSON válido.",
  });

/** `null` = sem limite. É uma escolha explícita, fora do recomendado. */
function limite(faixa: { min: number; max: number }) {
  return z.number().int().min(faixa.min).max(faixa.max).nullable();
}

const configBase = {
  metodo: z.enum(METODOS_DA_API),
  cabecalhos: cabecalhosSchema.default([]),
  corpo: corpoSchema.default({ modo: "campos", modelo: null }),
  credencial: credencialSchema.default({ tipo: "nenhuma", cabecalho: null, usuario: null }),
  campos_resposta: z
    .array(z.string().trim().max(LIMITES_DA_API.caminhoDaResposta.max).regex(CAMINHO_DA_RESPOSTA))
    .max(LIMITES_DA_API.camposDaResposta.max)
    .default([]),
  dados_contato: z
    .array(z.enum(DADOS_DO_CONTATO))
    .default([])
    .transform((lista) => [...new Set(lista)]),
  limite_por_conversa: limite(LIMITES_DA_API.limitePorConversa).default(LIMITES_DA_API.limitePorConversa.padrao),
  limite_por_dia: limite(LIMITES_DA_API.limitePorDia).default(LIMITES_DA_API.limitePorDia.padrao),
  pausa_apos_falhas: limite(LIMITES_DA_API.pausaAposFalhas).default(LIMITES_DA_API.pausaAposFalhas.padrao),
};

/** A config como o banco a guarda. Leitura defensiva: fora do schema = ferramenta ilegível. */
export const configDaApiLida = z.object(configBase).strict();

export function lerConfigDaApi(bruto: unknown): ConfigDaApi | null {
  const lido = configDaApiLida.safeParse(bruto);
  return lido.success ? (lido.data as ConfigDaApi) : null;
}

const parametrosSchema = z
  .array(parametroSchema)
  .max(LIMITES_DA_FERRAMENTA.parametros.max)
  .refine((lista) => new Set(lista.map((p) => p.nome)).size === lista.length, { message: "Dois campos têm o mesmo nome." })
  // O nome de um dado do contato é do sistema: um campo do agente com esse nome deixaria o modelo
  // preencher «o telefone do contato», que é exatamente o que a opção existe para impedir.
  .refine((lista) => lista.every((p) => dadoDoMarcador(p.nome) === null), {
    message: "Este nome de campo é reservado para um dado do contato.",
  });

/**
 * O endereço-modelo: `https`, sem usuário e senha, e com marcadores só DEPOIS do host. `http` só
 * fora de produção. Quem decide se o endereço é alcançável é a rede segura, na rota.
 */
export const enderecoDaApiSchema = z
  .string()
  .trim()
  .max(LIMITES_DA_FERRAMENTA.url.max)
  .refine((valor) => conferirEnderecoModelo(valor, process.env.NODE_ENV !== "production") === null, {
    message: "Informe um endereço completo que comece com https://, sem usuário e senha, e com os campos só depois do nome do site.",
  });

const credencialEmClaro = z.string().min(LIMITES_DA_API.credencial.min).max(LIMITES_DA_API.credencial.max);

const camposDoCadastro = {
  nome: z.string().trim().min(LIMITES_DA_FERRAMENTA.nome.min).max(LIMITES_DA_FERRAMENTA.nome.max),
  quando_usar: z.string().trim().min(LIMITES_DA_FERRAMENTA.quandoUsar.min).max(LIMITES_DA_FERRAMENTA.quandoUsar.max),
  url: enderecoDaApiSchema,
  parametros: parametrosSchema,
  efeito: z.enum(EFEITOS_DA_FERRAMENTA),
  pedir_aprovacao: z.boolean(),
  validade_horas: z.number().int().min(VALIDADE_DO_PEDIDO_HORAS.min).max(VALIDADE_DO_PEDIDO_HORAS.max),
};

/** Os marcadores citados existem? Cada um é um campo do agente ou um dado do contato que a ferramenta declara. */
function marcadoresConhecidos(c: {
  url: string;
  parametros: Array<{ nome: string }>;
  config: { corpo: { modo: string; modelo: string | null }; dados_contato: string[] };
}): boolean {
  const campos = new Set(c.parametros.map((p) => p.nome));
  const declarados = new Set(c.config.dados_contato);
  const citados = [...marcadoresDe(c.url), ...(c.config.corpo.modo === "modelo" ? marcadoresDe(c.config.corpo.modelo ?? "") : [])];
  return citados.every((nome) => {
    const dado = dadoDoMarcador(nome);
    return dado ? declarados.has(dado) : campos.has(nome);
  });
}

/** Método sem corpo não leva modelo de corpo. */
function corpoCombinaComOMetodo(c: { config: { metodo: (typeof METODOS_DA_API)[number]; corpo: { modo: string } } }): boolean {
  return METODOS_COM_CORPO.has(c.config.metodo) || c.config.corpo.modo === "campos";
}

export const criarApiSchema = z
  .object({
    nome: camposDoCadastro.nome,
    quando_usar: camposDoCadastro.quando_usar,
    url: camposDoCadastro.url,
    parametros: camposDoCadastro.parametros.default([]),
    /** Ausente = o padrão do método: `GET` só consulta, os demais alteram. */
    efeito: camposDoCadastro.efeito.optional(),
    pedir_aprovacao: camposDoCadastro.pedir_aprovacao.optional(),
    validade_horas: camposDoCadastro.validade_horas.optional(),
    config: z.object(configBase).strict(),
    /** A credencial em claro. Cifrada na gravação; nunca volta. Obrigatória quando o tipo não é `nenhuma`. */
    credencial: credencialEmClaro.optional(),
  })
  .strict()
  .refine((c) => (c.config.credencial.tipo === "nenhuma") === (c.credencial === undefined), {
    message: "Informe a credencial da API.",
    path: ["credencial"],
  })
  .refine(marcadoresConhecidos, { message: "O endereço ou o corpo cita um campo que não existe.", path: ["url"] })
  .refine(corpoCombinaComOMetodo, { message: "Este método não leva corpo.", path: ["config", "corpo"] });
export type CriarApiInput = z.infer<typeof criarApiSchema>;

/**
 * A edição manda o cadastro INTEIRO de novo (a tela é um formulário só), menos a credencial:
 * ausente = fica a que está gravada; presente = troca. `ativa` liga, desliga e tira da pausa.
 */
export const editarApiSchema = z
  .object({
    nome: camposDoCadastro.nome.optional(),
    quando_usar: camposDoCadastro.quando_usar.optional(),
    url: camposDoCadastro.url.optional(),
    parametros: camposDoCadastro.parametros.optional(),
    efeito: camposDoCadastro.efeito.optional(),
    pedir_aprovacao: camposDoCadastro.pedir_aprovacao.optional(),
    validade_horas: camposDoCadastro.validade_horas.optional(),
    config: z.object(configBase).strict().optional(),
    credencial: credencialEmClaro.optional(),
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((corpo) => Object.keys(corpo).length > 0, { message: "Nada para alterar." })
  // Endereço, campos e config andam juntos: mudar um sem os outros deixaria marcador sem campo.
  .refine(
    (c) => {
      const partes = [c.url, c.parametros, c.config].filter((parte) => parte !== undefined).length;
      return partes === 0 || partes === 3;
    },
    { message: "Envie o endereço, os campos e a configuração juntos." },
  )
  .refine((c) => c.config === undefined || marcadoresConhecidos({ url: c.url ?? "", parametros: c.parametros ?? [], config: c.config }), {
    message: "O endereço ou o corpo cita um campo que não existe.",
    path: ["url"],
  })
  .refine((c) => c.config === undefined || corpoCombinaComOMetodo({ config: c.config }), {
    message: "Este método não leva corpo.",
    path: ["config", "corpo"],
  });
export type EditarApiInput = z.infer<typeof editarApiSchema>;

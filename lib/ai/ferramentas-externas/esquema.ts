/**
 * O esquema da ferramenta externa: o que a pessoa cadastra e o que o agente
 * preenche. Dois lados, uma fonte:
 *
 *  - `criarFerramentaSchema` / `editarFerramentaSchema` — a entrada da ROTA. Zod
 *    estrito: o corpo nunca escolhe a organização, a chave de assinatura nem o id.
 *  - `esquemaDeEntrada` / `validarArgumentos` — o que o MODELO recebe como
 *    definição da ferramenta e a conferência do que ele preencheu. "O agente só
 *    chama com dados válidos": o SDK valida na borda, e `validarArgumentos`
 *    confere de novo dentro da execução (defesa em profundidade) devolvendo uma
 *    frase que ENSINA o modelo — erro de biblioteca não ensina nada.
 */
import { z } from "zod";

import {
  EFEITOS_DA_FERRAMENTA,
  LIMITES_DA_FERRAMENTA,
  PREFIXO_DO_NOME_NO_AGENTE,
  TIPOS_DE_PARAMETRO,
  VALIDADE_DO_PEDIDO_HORAS,
  type ParametroDaFerramenta,
} from "./tipos";

/** Tamanho máximo do nome que o modelo vê (`ext_` + identificador). */
const MAX_NOME_NO_AGENTE = 40;

export function nomeNoAgente(slug: string): string {
  return `${PREFIXO_DO_NOME_NO_AGENTE}${slug}`;
}

/**
 * O identificador que o modelo usa para chamar a ferramenta, derivado do nome que
 * a pessoa escreveu: sem acento, sem pontuação, em minúsculas e único dentro da
 * organização. A pessoa nunca digita nem vê isto — é o contrato com o modelo.
 */
export function slugDaFerramenta(nome: string, emUso: ReadonlySet<string>): string {
  const limite = MAX_NOME_NO_AGENTE - PREFIXO_DO_NOME_NO_AGENTE.length;
  let base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base === "") base = "ferramenta";
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, limite).replace(/_+$/g, "");
  if (!emUso.has(base)) return base;
  for (let n = 2; ; n++) {
    const sufixo = `_${n}`;
    const candidato = `${base.slice(0, limite - sufixo.length).replace(/_+$/g, "")}${sufixo}`;
    if (!emUso.has(candidato)) return candidato;
  }
}

const nomeDoCampo = z
  .string()
  .trim()
  .min(1)
  .max(LIMITES_DA_FERRAMENTA.nomeDoParametro.max)
  .regex(/^[a-z][a-z0-9_]*$/, "Use só letras minúsculas sem acento, números e _ (ex.: codigo_produto).");

/** Os valores permitidos de um campo (issue #372): lista fechada para texto, faixa para número. */
const valoresPermitidos = {
  opcoes: z
    .array(z.string().trim().min(1).max(LIMITES_DA_FERRAMENTA.opcoesDoParametro.tamanho))
    .min(1)
    .max(LIMITES_DA_FERRAMENTA.opcoesDoParametro.max)
    .optional(),
  minimo: z.number().finite().optional(),
  maximo: z.number().finite().optional(),
};

/** A lista só faz sentido em texto, a faixa só em número, e o mínimo não passa do máximo. */
function valoresCoerentes(p: { tipo: string; opcoes?: string[]; minimo?: number; maximo?: number }): boolean {
  if (p.opcoes !== undefined && p.tipo !== "texto") return false;
  if ((p.minimo !== undefined || p.maximo !== undefined) && p.tipo !== "numero" && p.tipo !== "inteiro") return false;
  if (p.minimo !== undefined && p.maximo !== undefined && p.minimo > p.maximo) return false;
  return true;
}

export const parametroSchema = z
  .object({
    nome: nomeDoCampo,
    tipo: z.enum(TIPOS_DE_PARAMETRO),
    descricao: z
      .string()
      .trim()
      .min(LIMITES_DA_FERRAMENTA.descricaoDoParametro.min)
      .max(LIMITES_DA_FERRAMENTA.descricaoDoParametro.max),
    obrigatorio: z.boolean().default(true),
    ...valoresPermitidos,
  })
  .strict()
  .refine(valoresCoerentes, { message: "Os valores permitidos não combinam com o tipo do campo." });

/**
 * A leitura DEFENSIVA do jsonb `parameters`: quem lê do banco usa esta (cadastro e motor).
 *
 * O nome do campo é lido com a regra LARGA: uma ferramenta de servidor MCP (issue #96) traz os
 * nomes que o servidor escolheu (`customerId`), e o cadastro por webhook, que continua exigindo
 * minúsculas ao CRIAR (`parametroSchema`), grava um subconjunto desta regra.
 */
const parametroLidoSchema = z
  .object({
    nome: z.string().min(1).max(LIMITES_DA_FERRAMENTA.nomeDoParametro.max).regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
    tipo: z.enum(TIPOS_DE_PARAMETRO),
    descricao: z
      .string()
      .trim()
      .min(LIMITES_DA_FERRAMENTA.descricaoDoParametro.min)
      .max(LIMITES_DA_FERRAMENTA.descricaoDoParametro.max),
    obrigatorio: z.boolean().default(true),
    ...valoresPermitidos,
  })
  .strict();
export const parametrosLidos = z.array(parametroLidoSchema);

const parametrosSchema = z
  .array(parametroSchema)
  .max(LIMITES_DA_FERRAMENTA.parametros.max)
  .refine((lista) => new Set(lista.map((p) => p.nome)).size === lista.length, {
    message: "Dois campos têm o mesmo nome.",
  });

/**
 * HTTPS, sem usuário e senha embutidos. `http` só fora de produção (o contrato de
 * sempre do webhook de saída). Quem decide se o ENDEREÇO é alcançável é a rede
 * segura (`lib/net/rede-segura`), na gravação e a cada chamada — aqui é só forma.
 */
export const urlDaFerramentaSchema = z
  .string()
  .trim()
  .max(LIMITES_DA_FERRAMENTA.url.max)
  .refine((valor) => {
    try {
      const url = new URL(valor);
      if (url.username !== "" || url.password !== "") return false;
      return url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production");
    } catch {
      return false;
    }
  }, "Informe um endereço completo que comece com https:// e sem usuário e senha.");

const efeitoSchema = z.enum(EFEITOS_DA_FERRAMENTA);

/**
 * A chave «pedir aprovação». AUSENTE quer dizer «o padrão do efeito»: ação que altera
 * pede, consulta não. `true`/`false` é uma decisão explícita de quem cadastra — e só
 * a rota de manager+ a recebe, nunca o modelo.
 */
const pedirAprovacaoSchema = z.boolean();
/** Horas que o pedido espera por um humano. Ausente = o padrão da casa (24 h). */
const validadeSchema = z
  .number()
  .int()
  .min(VALIDADE_DO_PEDIDO_HORAS.min)
  .max(VALIDADE_DO_PEDIDO_HORAS.max);

const camposDeCadastro = {
  nome: z.string().trim().min(LIMITES_DA_FERRAMENTA.nome.min).max(LIMITES_DA_FERRAMENTA.nome.max),
  quando_usar: z.string().trim().min(LIMITES_DA_FERRAMENTA.quandoUsar.min).max(LIMITES_DA_FERRAMENTA.quandoUsar.max),
  url: urlDaFerramentaSchema,
  parametros: parametrosSchema,
};

export const criarFerramentaSchema = z
  .object({
    ...camposDeCadastro,
    efeito: efeitoSchema.default("consulta"),
    pedir_aprovacao: pedirAprovacaoSchema.optional(),
    validade_horas: validadeSchema.optional(),
  })
  .strict();
export type CriarFerramentaInput = z.infer<typeof criarFerramentaSchema>;

export const editarFerramentaSchema = z
  .object({
    nome: camposDeCadastro.nome.optional(),
    quando_usar: camposDeCadastro.quando_usar.optional(),
    url: camposDeCadastro.url.optional(),
    parametros: camposDeCadastro.parametros.optional(),
    efeito: efeitoSchema.optional(),
    pedir_aprovacao: pedirAprovacaoSchema.optional(),
    validade_horas: validadeSchema.optional(),
    ativa: z.boolean().optional(),
  })
  .strict()
  .refine((corpo) => Object.keys(corpo).length > 0, { message: "Nada para alterar." });
export type EditarFerramentaInput = z.infer<typeof editarFerramentaSchema>;

function naFaixa(numero: z.ZodNumber, p: ParametroDaFerramenta): z.ZodNumber {
  let campo = numero;
  if (p.minimo !== undefined) campo = campo.min(p.minimo);
  if (p.maximo !== undefined) campo = campo.max(p.maximo);
  return campo;
}

function campoDoModelo(p: ParametroDaFerramenta): z.ZodType {
  let campo: z.ZodType;
  switch (p.tipo) {
    case "texto":
      campo =
        p.opcoes && p.opcoes.length > 0
          ? z.enum(p.opcoes as [string, ...string[]])
          : z.string().max(LIMITES_DA_FERRAMENTA.textoPreenchido.max);
      break;
    case "numero":
      campo = naFaixa(z.number().finite(), p);
      break;
    case "inteiro":
      campo = naFaixa(z.number().int(), p);
      break;
    case "booleano":
      campo = z.boolean();
      break;
  }
  campo = campo.describe(p.descricao);
  return p.obrigatorio ? campo : campo.optional();
}

/** A definição de entrada que o modelo recebe: um campo por parâmetro declarado, e nada além. */
export function esquemaDeEntrada(parametros: ReadonlyArray<ParametroDaFerramenta>) {
  return z.object(Object.fromEntries(parametros.map((p) => [p.nome, campoDoModelo(p)]))).strict();
}

export type ArgumentosValidados =
  | { ok: true; valor: Record<string, string | number | boolean | undefined> }
  | { ok: false; mensagem: string };

/**
 * Confere o que o modelo preencheu. A mensagem de recusa diz o que preencher, em
 * português e sem o vocabulário da biblioteca de validação: ela volta ao modelo
 * como resultado da ferramenta, e é com ela que ele corrige a próxima tentativa.
 */
export function validarArgumentos(
  parametros: ReadonlyArray<ParametroDaFerramenta>,
  bruto: unknown,
): ArgumentosValidados {
  const lido = esquemaDeEntrada(parametros).safeParse(bruto ?? {});
  if (lido.success) return { ok: true, valor: lido.data as Record<string, string | number | boolean | undefined> };
  const problemas = lido.error.issues.map((issue) => {
    const campo = issue.path.length > 0 ? String(issue.path[0]) : null;
    if (issue.code === "unrecognized_keys") return `não existe o campo ${issue.keys.map((k) => `"${k}"`).join(", ")}`;
    if (campo === null) return "os dados precisam ser um objeto";
    const declarado = parametros.find((p) => p.nome === campo);
    const ausente = issue.code === "invalid_type" && (issue as { input?: unknown }).input === undefined;
    if (ausente) return `falta o campo "${campo}"`;
    return `o campo "${campo}" precisa ser ${declarado ? descricaoDoValor(declarado) : "válido"}`;
  });
  return {
    ok: false,
    mensagem: `Não chamei o sistema externo: ${[...new Set(problemas)].join("; ")}. Preencha os campos conforme a definição da ferramenta e tente de novo.`,
  };
}

/** O que o campo aceita, com a lista ou a faixa de valores permitidos quando houver. */
function descricaoDoValor(p: ParametroDaFerramenta): string {
  if (p.tipo === "texto" && p.opcoes && p.opcoes.length > 0) {
    return `um destes valores: ${p.opcoes.map((o) => `"${o}"`).join(", ")}`;
  }
  const base = descricaoDoTipo(p.tipo);
  if (p.tipo !== "numero" && p.tipo !== "inteiro") return base;
  if (p.minimo !== undefined && p.maximo !== undefined) return `${base} entre ${p.minimo} e ${p.maximo}`;
  if (p.minimo !== undefined) return `${base} a partir de ${p.minimo}`;
  if (p.maximo !== undefined) return `${base} de até ${p.maximo}`;
  return base;
}

function descricaoDoTipo(tipo: ParametroDaFerramenta["tipo"]): string {
  switch (tipo) {
    case "texto":
      return `um texto de até ${LIMITES_DA_FERRAMENTA.textoPreenchido.max} caracteres`;
    case "numero":
      return "um número";
    case "inteiro":
      return "um número inteiro";
    case "booleano":
      return "verdadeiro ou falso";
  }
}

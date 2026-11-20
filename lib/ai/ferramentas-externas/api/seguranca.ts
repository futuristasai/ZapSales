/**
 * A SEGURANÇA DAS APIs da organização — `organizations.settings.api_externa` (issue #372).
 *
 * Mesmo molde do interruptor dos servidores MCP (`../mcp/config.ts`): recurso OPCIONAL que
 * manda dado da conversa a um sistema de terceiro, com interruptor por organização, DESLIGADO
 * por padrão e aceite registrado de quem ligou. Não há migration — o Zod abaixo é o schema
 * central do caminho.
 *
 * ═══ LEITURA NUNCA LANÇA, E FALHA NA POSIÇÃO MAIS SEGURA ═══
 *
 * Quem lê é o motor do agente, a cada turno que cita uma ferramenta de API, e as rotas, antes
 * de cada efeito. JSON fora do schema vira «desligado, tudo na posição recomendada»: uma opção
 * torta não pode AFROUXAR nada por acidente. Ligado sem aceite também vale como desligado.
 *
 * ═══ NASCE NA POSIÇÃO RECOMENDADA ═══
 *
 * Toda opção tem uma posição recomendada (`RECOMENDADO`), e é nela que a organização nasce.
 * Sair dela é uma decisão explícita, que a tela avisa antes de salvar, marca enquanto durar e
 * a auditoria registra. O «nível de segurança» NÃO é guardado: é calculado dos valores
 * (DIRC — calcular), então ele nunca diverge do que está em vigor.
 *
 * Client-safe: zod é o único import de execução, e a tela usa o mesmo schema.
 */
import { z } from "zod";

import { DADOS_DO_CONTATO, type DadoDoContato } from "./tipos";

/** Quem pode cadastrar/editar APIs e quem pode aprovar o que o agente quer executar. */
export const PAPEIS_DA_API = ["admin", "manager"] as const;
export type PapelDaApi = (typeof PAPEIS_DA_API)[number];

export const LIMITES_DA_SEGURANCA = {
  dominios: { max: 30 },
  dominio: { max: 253 },
} as const;

/**
 * Um endereço permitido: `api.loja.com.br` (só ele) ou `*.loja.com.br` (qualquer subdomínio).
 * Sem esquema, sem caminho, sem porta: o que se libera é o SITE.
 */
const DOMINIO = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizarDominio(bruto: string): string {
  return bruto.trim().toLowerCase();
}

export function dominioValido(bruto: string): boolean {
  const d = normalizarDominio(bruto);
  return d.length <= LIMITES_DA_SEGURANCA.dominio.max && DOMINIO.test(d);
}

/** O host cabe na lista? Lista vazia = qualquer endereço público. */
export function hostPermitido(host: string, dominios: readonly string[]): boolean {
  if (dominios.length === 0) return true;
  const h = host.toLowerCase();
  return dominios.some((d) => (d.startsWith("*.") ? h.endsWith(d.slice(1)) && h.length > d.length - 1 : h === d));
}

const dominiosSchema = z
  .array(z.string().transform(normalizarDominio).refine(dominioValido))
  .max(LIMITES_DA_SEGURANCA.dominios.max)
  .transform((lista) => [...new Set(lista)]);

const dadosDoContatoSchema = z.array(z.enum(DADOS_DO_CONTATO)).transform((lista) => [...new Set(lista)]);

/** As opções que a pessoa escolhe. O interruptor e o aceite ficam ao lado (`configSchema`). */
const opcoesSchema = z.object({
  /** Só administrador (recomendado) ou gerente também. */
  quem_cadastra: z.enum(PAPEIS_DA_API).default("admin"),
  /** Vazia = qualquer endereço público. Preenchida = só estes, no cadastro e a cada chamada. */
  dominios_permitidos: dominiosSchema.default([]),
  /** Trava: nenhuma ferramenta de API «altera dados» é cadastrada nem executada. */
  somente_consulta: z.boolean().default(true),
  /** Trava: ferramenta que altera sempre espera aprovação, qualquer que seja a chave dela. */
  aprovacao_obrigatoria: z.boolean().default(true),
  /** Quais dados da conversa PODEM sair. Cada ferramenta escolhe dentro disto. */
  dados_do_contato: dadosDoContatoSchema.default([]),
  /** Quem aprova na Central o que uma ferramenta de API quer executar. */
  quem_aprova: z.enum(PAPEIS_DA_API).default("admin"),
  /** Cadastrar, editar, testar e mexer nesta tela exige sessão com a segunda etapa provada. */
  exigir_duas_etapas: z.boolean().default(true),
  /** Abre aviso na Central a cada mudança de cadastro ou de segurança e a cada ação executada sem aprovação. */
  avisar_administrador: z.boolean().default(true),
});

export type OpcoesDeSeguranca = z.infer<typeof opcoesSchema>;

export const configDeApiSchema = opcoesSchema
  .extend({
    ligado: z.boolean().default(false),
    /** Quem aceitou que o agente envie dados a sistemas de terceiros, e quando. */
    aceite: z.object({ em: z.string().datetime(), por: z.string().uuid() }).nullable().default(null),
    alterado_em: z.string().datetime().optional(),
    alterado_por: z.string().uuid().optional(),
  })
  .refine((c) => !c.ligado || c.aceite !== null, { message: "ligar as APIs exige o aceite do administrador" });

export type SegurancaDasApis = z.infer<typeof configDeApiSchema>;

/** A posição recomendada de cada opção — a mesma em que a organização nasce. */
export const RECOMENDADO: OpcoesDeSeguranca = {
  quem_cadastra: "admin",
  dominios_permitidos: [],
  somente_consulta: true,
  aprovacao_obrigatoria: true,
  dados_do_contato: [],
  quem_aprova: "admin",
  exigir_duas_etapas: true,
  avisar_administrador: true,
};

const DESLIGADA: SegurancaDasApis = { ...RECOMENDADO, ligado: false, aceite: null };

/** Lê a config de `organizations.settings`. NUNCA lança; ilegível ⇒ desligada e na posição recomendada. */
export function lerSegurancaDasApis(settings: unknown): SegurancaDasApis {
  const bruto =
    settings !== null && typeof settings === "object" ? (settings as Record<string, unknown>).api_externa : undefined;
  const lido = configDeApiSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : { ...DESLIGADA };
}

// ─── Nível de segurança ──────────────────────────────────────────────────────

export const NIVEIS_DE_SEGURANCA = ["mais_seguro", "equilibrado", "personalizado"] as const;
export type NivelDeSeguranca = (typeof NIVEIS_DE_SEGURANCA)[number];

/** As opções que um nível decide. A lista de endereços e os dados do contato são DADO da organização, não nível. */
type OpcoesDoNivel = Pick<
  OpcoesDeSeguranca,
  "quem_cadastra" | "somente_consulta" | "aprovacao_obrigatoria" | "quem_aprova" | "exigir_duas_etapas" | "avisar_administrador"
>;

export const VALORES_DO_NIVEL: Record<Exclude<NivelDeSeguranca, "personalizado">, OpcoesDoNivel> = {
  // Só consulta, tudo com administrador e com a segunda etapa. É a posição recomendada.
  mais_seguro: {
    quem_cadastra: "admin",
    somente_consulta: true,
    aprovacao_obrigatoria: true,
    quem_aprova: "admin",
    exigir_duas_etapas: true,
    avisar_administrador: true,
  },
  // O agente pode alterar dados lá, mas NUNCA sem um humano aprovar; gerente aprova.
  equilibrado: {
    quem_cadastra: "admin",
    somente_consulta: false,
    aprovacao_obrigatoria: true,
    quem_aprova: "manager",
    exigir_duas_etapas: false,
    avisar_administrador: true,
  },
};

const CHAVES_DO_NIVEL = Object.keys(VALORES_DO_NIVEL.mais_seguro) as Array<keyof OpcoesDoNivel>;

/** O nível que os valores em vigor correspondem. Calculado, nunca guardado. */
export function nivelEmVigor(opcoes: OpcoesDoNivel): NivelDeSeguranca {
  for (const nivel of ["mais_seguro", "equilibrado"] as const) {
    if (CHAVES_DO_NIVEL.every((chave) => opcoes[chave] === VALORES_DO_NIVEL[nivel][chave])) return nivel;
  }
  return "personalizado";
}

// ─── Fora do recomendado ─────────────────────────────────────────────────────

/** As opções da organização que têm uma posição recomendada (e um risco ao sair dela). */
export const OPCOES_COM_RECOMENDACAO = [
  "quem_cadastra",
  "somente_consulta",
  "aprovacao_obrigatoria",
  "quem_aprova",
  "exigir_duas_etapas",
  "avisar_administrador",
] as const satisfies ReadonlyArray<keyof OpcoesDeSeguranca>;
export type OpcaoComRecomendacao = (typeof OPCOES_COM_RECOMENDACAO)[number];

/** Quais opções da organização estão fora da posição recomendada. */
export function foraDoRecomendado(opcoes: OpcoesDeSeguranca): OpcaoComRecomendacao[] {
  return OPCOES_COM_RECOMENDACAO.filter((chave) => opcoes[chave] !== RECOMENDADO[chave]);
}

/**
 * A mudança AFROUXA a opção? É a pergunta que decide o aviso de risco antes de salvar, o aviso
 * ao administrador e a exigência da segunda etapa para desligar a própria exigência.
 */
export function afrouxa(chave: OpcaoComRecomendacao, antes: OpcoesDeSeguranca, depois: OpcoesDeSeguranca): boolean {
  return antes[chave] === RECOMENDADO[chave] && depois[chave] !== RECOMENDADO[chave];
}

// ─── Mudança ─────────────────────────────────────────────────────────────────

export const mudancaDeSegurancaSchema = z
  .object({
    ligado: z.boolean().optional(),
    /** O administrador marcou o aceite nesta chamada. */
    aceitar: z.literal(true).optional(),
    /** Aplica os valores de um nível de uma vez. As opções citadas ao lado vencem o nível. */
    nivel: z.enum(["mais_seguro", "equilibrado"]).optional(),
    quem_cadastra: z.enum(PAPEIS_DA_API).optional(),
    dominios_permitidos: z.array(z.string().max(LIMITES_DA_SEGURANCA.dominio.max)).max(LIMITES_DA_SEGURANCA.dominios.max).optional(),
    somente_consulta: z.boolean().optional(),
    aprovacao_obrigatoria: z.boolean().optional(),
    dados_do_contato: z.array(z.enum(DADOS_DO_CONTATO)).optional(),
    quem_aprova: z.enum(PAPEIS_DA_API).optional(),
    exigir_duas_etapas: z.boolean().optional(),
    avisar_administrador: z.boolean().optional(),
  })
  .strict()
  .refine((corpo) => Object.keys(corpo).length > 0, { message: "Nada para alterar." });

export type MudancaDeSeguranca = z.infer<typeof mudancaDeSegurancaSchema>;

/** A próxima config, sem tocar o banco. Quem valida o resultado é `configDeApiSchema`. */
export function mesclarSeguranca(
  atual: SegurancaDasApis,
  mudanca: MudancaDeSeguranca,
  carimbo: { em: string; por: string },
): unknown {
  const { aceitar, nivel, ligado, ...opcoes } = mudanca;
  return {
    ...atual,
    ...(nivel ? VALORES_DO_NIVEL[nivel] : {}),
    ...opcoes,
    ...(ligado !== undefined ? { ligado } : {}),
    ...(aceitar === true ? { aceite: { em: carimbo.em, por: carimbo.por } } : {}),
    alterado_em: carimbo.em,
    alterado_por: carimbo.por,
  };
}

/** Só as opções (sem interruptor, aceite e carimbos) — o que a tela e a auditoria comparam. */
export function opcoesDe(config: SegurancaDasApis): OpcoesDeSeguranca {
  return {
    quem_cadastra: config.quem_cadastra,
    dominios_permitidos: config.dominios_permitidos,
    somente_consulta: config.somente_consulta,
    aprovacao_obrigatoria: config.aprovacao_obrigatoria,
    dados_do_contato: config.dados_do_contato,
    quem_aprova: config.quem_aprova,
    exigir_duas_etapas: config.exigir_duas_etapas,
    avisar_administrador: config.avisar_administrador,
  };
}

/** Os dados do contato que a organização liberou e a ferramenta pede — a interseção é o que sai. */
export function dadosLiberados(config: SegurancaDasApis, pedidos: readonly DadoDoContato[]): DadoDoContato[] {
  const liberados = new Set(config.dados_do_contato);
  return pedidos.filter((d) => liberados.has(d));
}

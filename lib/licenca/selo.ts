/**
 * Conferência do SELO de licença — a autorização assinada que o servidor de licenças emite.
 *
 * Contrato e motivos: `docs/specs/licenca-contrato-entre-as-pontas-v1.md` (seção 1) e a
 * ADR-0005. Este módulo é PURO: não lê relógio, banco, rede nem ambiente. Quem o chama diz
 * qual é o "agora" (em segundos Unix, UTC), qual é a instalação e quais chaves valem. É assim
 * que o prazo é testável com relógio simulado e que o módulo roda em qualquer runtime
 * (Node, edge do `proxy.ts`, worker).
 *
 * ─── Por que NUNCA lança ─────────────────────────────────────────────────────
 *
 * Quem decide se a instalação opera confere um selo vindo de fora (arquivo, banco, resposta
 * de rede). Entrada torta, chave mal formada ou uma falha inesperada têm de virar
 * "selo rejeitado" — nunca uma exceção que alguém trate como "sem selo, funciona". A falha
 * é SEMPRE para o lado da rejeição.
 *
 * ─── As dez conferências, nesta ordem (a primeira falha rejeita) ─────────────
 *
 *  1. três partes, cabeçalho JSON válido;
 *  2. `alg` e `typ` exatos (rejeita `none`, `HS256`…);
 *  3. `kid` está na lista de chaves que a CHAMADA entrega (a imagem fixa essa lista);
 *  4. a assinatura confere;
 *  5. o payload passa pelo esquema estrito (campo desconhecido rejeita);
 *  6. `v` e `iss` são os esperados;
 *  7. `sub` é a instalação desta máquina;
 *  8. `tipo` e `exp` são coerentes;
 *  9. `exp` > agora (só o temporário vence);
 * 10. `iat` não passa de 5 minutos além do agora.
 */
import { compactVerify, decodeProtectedHeader, importJWK, type JWK } from "jose";
import { z } from "zod";

/** Quem assina: o `iss` exato de todo selo. */
export const EMISSOR_DO_SELO = "zapsales-licencas";

/** O `typ` exato do cabeçalho. */
export const TIPO_DO_CABECALHO = "zapsales-selo";

/** Única versão do formato que este código entende. */
export const VERSAO_DO_SELO = 1;

/** Quanto o `iat` pode estar adiante do agora (relógio levemente diferente entre as pontas). */
export const TOLERANCIA_DE_EMISSAO_S = 300;

/** Selo legítimo tem ~300 caracteres; o teto barra entrada absurda antes de qualquer parse. */
const TAMANHO_MAXIMO = 4096;

export type TipoDeSelo = "temporario" | "permanente";

/** O conteúdo de um selo, já validado. Não há campo de modalidade nem de limite: o selo é único. */
const esquemaDoSelo = z.strictObject({
  v: z.number().int(),
  iss: z.string(),
  sub: z.uuidv4(),
  lic: z.uuidv4(),
  tipo: z.enum(["temporario", "permanente"]),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative().optional(),
  jti: z.uuidv4(),
});
export type Selo = z.infer<typeof esquemaDoSelo>;

export type MotivoDeRejeicao =
  | "formato_invalido"
  | "cabecalho_invalido"
  | "chave_desconhecida"
  | "assinatura_invalida"
  | "payload_invalido"
  | "versao_nao_suportada"
  | "emissor_invalido"
  | "instalacao_diferente"
  | "tipo_incoerente"
  | "expirado"
  | "emitido_no_futuro"
  /** Chave configurada mal formada, `agora` inválido ou falha inesperada: rejeita do mesmo jeito. */
  | "erro_interno";

export type ResultadoDoSelo = { ok: true; selo: Selo } | { ok: false; motivo: MotivoDeRejeicao };

/** Uma chave pública aceita. A lista que vale vem de `chaves.ts`; aqui ela é só um argumento. */
export interface ChavePublica {
  kid: string;
  /** JWK público Ed25519: `{ kty: "OKP", crv: "Ed25519", x }`. */
  jwk: JWK;
}

export interface OpcoesDeVerificacao {
  /** Chaves aceitas, já decididas por quem chama (produção ou não). */
  chaves: readonly ChavePublica[];
  /** UUID desta instalação. O selo de outra instalação é rejeitado. */
  instalacaoId: string;
  /**
   * O "agora" EFETIVO, em segundos Unix UTC. Quem chama o calcula como o maior entre o relógio
   * local e o maior horário já visto: relógio que volta não estende selo nenhum.
   */
  agora: number;
}

function rejeitar(motivo: MotivoDeRejeicao): ResultadoDoSelo {
  return { ok: false, motivo };
}

/** Confere um selo. Nunca lança: toda falha vira `{ ok: false, motivo }`. */
export async function verificarSelo(
  entrada: string,
  opcoes: OpcoesDeVerificacao,
): Promise<ResultadoDoSelo> {
  try {
    return await conferir(entrada, opcoes);
  } catch {
    return rejeitar("erro_interno");
  }
}

async function conferir(
  entrada: string,
  { chaves, instalacaoId, agora }: OpcoesDeVerificacao,
): Promise<ResultadoDoSelo> {
  if (!Number.isFinite(agora)) return rejeitar("erro_interno");

  // 1. três partes e cabeçalho JSON. A assinatura pode vir vazia (`alg: none`): isso é pego em 2.
  if (typeof entrada !== "string" || entrada.length === 0 || entrada.length > TAMANHO_MAXIMO) {
    return rejeitar("formato_invalido");
  }
  const partes = entrada.split(".");
  if (partes.length !== 3 || partes[0] === "" || partes[1] === "") {
    return rejeitar("formato_invalido");
  }
  let cabecalho: ReturnType<typeof decodeProtectedHeader>;
  try {
    cabecalho = decodeProtectedHeader(entrada);
  } catch {
    return rejeitar("formato_invalido");
  }

  // 2. algoritmo e tipo exatos. Qualquer outro `alg` (inclusive `none`) rejeita.
  if (
    cabecalho.alg !== "EdDSA" ||
    cabecalho.typ !== TIPO_DO_CABECALHO ||
    typeof cabecalho.kid !== "string"
  ) {
    return rejeitar("cabecalho_invalido");
  }

  // 3. só vale chave que quem chama entregou. Chave dentro do próprio selo (`jwk`, `jku`) é ignorada.
  const chave = chaves.find((c) => c.kid === cabecalho.kid);
  if (!chave) return rejeitar("chave_desconhecida");

  // 4. assinatura. Chave configurada torta é defeito nosso (erro_interno), não do selo.
  let chaveImportada: Awaited<ReturnType<typeof importJWK>>;
  try {
    chaveImportada = await importJWK(chave.jwk, "EdDSA");
  } catch {
    return rejeitar("erro_interno");
  }
  let carga: Uint8Array;
  try {
    ({ payload: carga } = await compactVerify(entrada, chaveImportada, { algorithms: ["EdDSA"] }));
  } catch {
    return rejeitar("assinatura_invalida");
  }

  // 5. esquema estrito.
  let bruto: unknown;
  try {
    bruto = JSON.parse(new TextDecoder().decode(carga));
  } catch {
    return rejeitar("payload_invalido");
  }
  const lido = esquemaDoSelo.safeParse(bruto);
  if (!lido.success) return rejeitar("payload_invalido");
  const selo = lido.data;

  // 6. versão e emissor.
  if (selo.v !== VERSAO_DO_SELO) return rejeitar("versao_nao_suportada");
  if (selo.iss !== EMISSOR_DO_SELO) return rejeitar("emissor_invalido");

  // 7. a instalação desta máquina (UUID não distingue maiúscula de minúscula).
  if (selo.sub.toLowerCase() !== instalacaoId.toLowerCase()) {
    return rejeitar("instalacao_diferente");
  }

  // 8. temporário tem `exp`; permanente não tem.
  if (selo.tipo === "temporario" && selo.exp === undefined) return rejeitar("tipo_incoerente");
  if (selo.tipo === "permanente" && selo.exp !== undefined) return rejeitar("tipo_incoerente");

  // 9. só o temporário vence; `exp` igual ao agora já é vencido.
  if (selo.exp !== undefined && selo.exp <= agora) return rejeitar("expirado");

  // 10. emissão no futuro além da tolerância indica relógio das pontas muito diferente.
  if (selo.iat > agora + TOLERANCIA_DE_EMISSAO_S) return rejeitar("emitido_no_futuro");

  return { ok: true, selo };
}

/**
 * Como a instalação RECEBE um selo do servidor de licenças — o que `renovar.ts` e `ativar.ts` têm em comum.
 *
 * O servidor é de fora: o que ele diz só vale depois de conferido. O `tipo` e as datas da resposta HTTP são
 * conveniência (contrato, seção 3); quem manda é o selo assinado, conferido com as chaves que vão dentro da
 * imagem. Resposta que discorda do próprio selo é recusada inteira — não se escolhe qual das duas versões
 * acreditar.
 */
import { z } from "zod";

import { proximaConsulta, type Aleatorio } from "./agenda";
import { segundosDe } from "./estado";
import { verificarSelo, type ChavePublica, type MotivoDeRejeicao, type Selo } from "./selo";

/** O `data` de `POST /licenca/renovar`. Campos desconhecidos são ignorados (contrato, seção 7). */
export const esquemaDaRenovacao = z.object({
  selo: z.string().min(1).max(4096),
  tipo: z.enum(["temporario", "permanente"]),
  proxima_consulta_em: z.string().nullish(),
  janela_termina_em: z.string().nullish(),
});

/** O `data` de `POST /licenca/ativar`: o mesmo, mais a credencial mostrada uma única vez. */
export const esquemaDaAtivacao = esquemaDaRenovacao.extend({
  credencial: z.string().min(1).max(256),
});

export interface SeloRecebido {
  readonly selo: Selo;
  /** O texto do selo, como chegou — é o que se grava. */
  readonly texto: string;
  /** O "agora" a gravar: o efetivo, ou o `iat` do selo se o servidor estiver à frente. */
  readonly agora: number;
  readonly janelaTerminaEm: number | null;
  /** `null` para o permanente: depois dele o app não consulta mais. */
  readonly proximaConsultaEm: number | null;
}

export type ResultadoDoRecebimento =
  | { readonly ok: true; readonly recebido: SeloRecebido }
  | { readonly ok: false; readonly motivo: MotivoDeRejeicao | "tipo_diverge" };

export interface OpcoesDoRecebimento {
  readonly chaves: readonly ChavePublica[];
  readonly instalacaoId: string;
  /** O agora efetivo (`max(relógio local, maior horário visto)`), em segundos. */
  readonly agora: number;
  readonly aleatorio?: Aleatorio | undefined;
}

export async function receberSelo(
  dados: z.infer<typeof esquemaDaRenovacao>,
  { chaves, instalacaoId, agora, aleatorio }: OpcoesDoRecebimento,
): Promise<ResultadoDoRecebimento> {
  const conferido = await verificarSelo(dados.selo, { chaves, instalacaoId, agora });
  if (!conferido.ok) return { ok: false, motivo: conferido.motivo };
  const { selo } = conferido;
  if (selo.tipo !== dados.tipo) return { ok: false, motivo: "tipo_diverge" };
  return {
    ok: true,
    recebido: {
      selo,
      texto: dados.selo,
      // Um servidor até 5 min à frente passa pela tolerância de emissão; o horário visto avança com ele.
      agora: Math.max(agora, selo.iat),
      janelaTerminaEm: segundosDe(dados.janela_termina_em),
      proximaConsultaEm:
        selo.tipo === "permanente"
          ? null
          : proximaConsulta(selo.iat, segundosDe(dados.proxima_consulta_em), aleatorio),
    },
  };
}

/**
 * O interruptor do modo sombra, pela linha de comando do OPERADOR (`kit/licenca-modo.sh`).
 *
 * ADR-0005 D-7: a trava nasce em modo `sombra` (calcula e registra, nunca restringe) e só passa a `valendo`
 * na fase "Ligar", por decisão do dono. Este é o único caminho para trocar — não há tela nem API: quem tem
 * root na máquina decide, como decide sobre qualquer outra configuração da instalação.
 *
 * Contrato com o shell: uma linha `LICENCA_MODO=…` e um código de saída (0 gravou, 11 não foi possível,
 * 12 valor inválido). Valor desconhecido NUNCA vira um modo: um erro de digitação não pode ligar a trava.
 */
import { definirModo, garantirEstado } from "./armazem";

export interface DesfechoDoModo {
  codigoDeSaida: 0 | 11 | 12;
  linha: string;
}

type Gravador = (
  modo: "sombra" | "valendo",
) => Promise<{ ok: true } | { ok: false; motivo: string }>;

/** A linha do estado nasce na primeira leitura; um instalador recém-subido pode ainda não a ter criado. */
async function gravarGarantindoEstado(modo: "sombra" | "valendo") {
  const leitura = await garantirEstado();
  if (!leitura.ok) return { ok: false as const, motivo: leitura.motivo };
  return definirModo(modo);
}

export async function definirModoPeloKit(
  entrada: string | undefined,
  gravar: Gravador = gravarGarantindoEstado,
): Promise<DesfechoDoModo> {
  const modo = (entrada ?? "").trim().toLowerCase();
  if (modo !== "sombra" && modo !== "valendo") {
    return { codigoDeSaida: 12, linha: "LICENCA_MODO=invalido" };
  }
  try {
    const r = await gravar(modo);
    if (!r.ok) return { codigoDeSaida: 11, linha: `LICENCA_MODO=falhou:${r.motivo}` };
    return { codigoDeSaida: 0, linha: `LICENCA_MODO=${modo}` };
  } catch {
    return { codigoDeSaida: 11, linha: "LICENCA_MODO=falhou:inesperada" };
  }
}

/**
 * Capacidades que se sobrepõem: duas portas para quase o mesmo efeito, em
 * pacotes DIFERENTES (issue #326).
 *
 * Com o teto de 27 virando aviso, o dono passou a poder ligar dois pacotes que
 * antes não cabiam juntos — e é aí que nascem os pares em que a IA precisa
 * escolher entre duas ferramentas parecidas. Cada par daqui traz o que observar,
 * porque o conserto não é "desligue uma": as duas têm uso legítimo, e quem decide
 * é o que o painel de uso mostrar.
 *
 * ⚠️ SÓ PAR DE PACOTES DIFERENTES. Um par dentro do MESMO pacote é desenho da casa
 * (o pacote liga os dois juntos, de propósito), e o aviso apareceria para todo
 * mundo que liga aquele pacote — aviso que aparece sempre ensina a não ler aviso.
 * Cerca: `tests/unit/sobreposicoes.test.ts`.
 *
 * O critério de entrada é EVIDÊNCIA, não semelhança de nome. Cada par cita por
 * que existe; sem motivo concreto, não entra.
 *
 * Client-safe: só nomes e texto.
 */

export interface Sobreposicao {
  /** `name` das duas capacidades, como no catálogo. */
  a: string;
  b: string;
  /** O que pode dar errado, na língua de quem configura. Passa por `t()`. */
  risco: string;
}

export const SOBREPOSICOES: ReadonlyArray<Sobreposicao> = [
  {
    // A description de `crm_book_appointment` (lib/mcp/tools/agendamento.ts) já
    // precisa dizer ao modelo "NÃO use para voltar a falar com o cliente depois —
    // isso é retorno": a confusão foi observada a ponto de virar instrução.
    a: "crm_book_appointment",
    b: "crm_schedule_followup",
    risco:
      "As duas marcam algo para depois. A IA pode reservar a agenda de alguém da equipe quando o cliente só pediu para ser procurado mais tarde — ou o contrário.",
  },
  {
    // Mesmo efeito de marcar da linha de cima, pelo caminho que consulta e marca
    // numa chamada só — e é o caminho que a descrição chama de preferido.
    a: "crm_find_and_book_appointment",
    b: "crm_schedule_followup",
    risco:
      "As duas marcam algo para depois. A IA pode reservar a agenda de alguém da equipe quando o cliente só pediu para ser procurado mais tarde — ou o contrário.",
  },
  {
    // `crm_close_demand` move a oportunidade para o estágio terminal; mover para a
    // etapa de ganho ou perda pelo `crm_move_lead_stage` chega ao mesmo lugar sem
    // exigir o motivo da perda.
    a: "crm_move_lead_stage",
    b: "crm_close_demand",
    risco:
      "As duas podem levar o negócio para ganho ou perdido. Pela primeira, a perda pode ficar sem o motivo registrado.",
  },
  {
    // `crm_retomar_lead` abre um negócio novo a partir de um encerrado, guardando
    // o vínculo; `crm_create_lead` abre um do zero, sem o histórico.
    a: "crm_create_lead",
    b: "crm_retomar_lead",
    risco:
      "As duas abrem um negócio. Se a IA criar do zero quando devia retomar um encerrado, o histórico daquele cliente fica separado.",
  },
];

/** Os pares em que as duas capacidades estão ligadas, na ordem declarada. */
export function sobreposicoesLigadas(selecionadas: ReadonlyArray<string>): Sobreposicao[] {
  const ligadas = new Set(selecionadas);
  return SOBREPOSICOES.filter((s) => ligadas.has(s.a) && ligadas.has(s.b));
}

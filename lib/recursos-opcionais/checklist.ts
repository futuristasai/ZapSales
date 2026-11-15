/**
 * "SUA INSTALAÇÃO ESTÁ PRONTA?" — o checklist do Painel da administração (issue #308).
 *
 * Sem lista própria: os itens são os recursos do catálogo de Recursos opcionais que
 * declaram `checklist`, e o estado é o mesmo `estadoDoRecurso` daquela tela. Se um dia
 * as duas telas discordarem, o defeito é do catálogo e aparece num lugar só.
 *
 * Função pura: o Painel (servidor) busca as fontes com `detectarServidor()` e passa aqui.
 */
import {
  RECURSOS_OPCIONAIS,
  estadoDoRecurso,
  type EstadoDoRecurso,
  type FontesDeEstado,
  type RecursoOpcional,
} from "./catalogo";

export interface ItemDoChecklist {
  recurso: RecursoOpcional;
  nivel: "obrigatorio" | "opcional";
  estado: EstadoDoRecurso;
  /** Só `ligado` conta como feito. "Não consegui ler" nunca vira feito nem falta. */
  feito: boolean;
}

export interface ChecklistDaInstalacao {
  itens: ItemDoChecklist[];
  /** Todo obrigatório feito — o que falta é escolha, não defeito. */
  essencialPronto: boolean;
  tudoPronto: boolean;
  faltamObrigatorios: number;
  faltamOpcionais: number;
  naoLidos: number;
}

export function checklistDaInstalacao(fontes: FontesDeEstado): ChecklistDaInstalacao {
  const itens = RECURSOS_OPCIONAIS.filter((r) => r.checklist)
    .sort((a, b) => a.checklist!.ordem - b.checklist!.ordem)
    .map((recurso): ItemDoChecklist => {
      const estado = estadoDoRecurso(recurso, fontes);
      return { recurso, nivel: recurso.checklist!.nivel, estado, feito: estado === "ligado" };
    });
  const pendentes = itens.filter((i) => !i.feito && i.estado !== "nao_lido");
  const naoLidos = itens.filter((i) => i.estado === "nao_lido").length;
  const obrigatoriosFeitos = itens.filter((i) => i.nivel === "obrigatorio").every((i) => i.feito);
  return {
    itens,
    essencialPronto: obrigatoriosFeitos,
    tudoPronto: itens.every((i) => i.feito),
    faltamObrigatorios: pendentes.filter((i) => i.nivel === "obrigatorio").length,
    faltamOpcionais: pendentes.filter((i) => i.nivel === "opcional").length,
    naoLidos,
  };
}

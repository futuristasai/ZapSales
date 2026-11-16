/**
 * A situação de uma empresa em palavras, e a cor do selo — UMA vez para a área de
 * administração (issue #309). Eram três mapas iguais (lista de empresas, ficha da
 * empresa, detalhe do registro de ações), e trocar um rótulo pedia mexer nos três.
 *
 * `onboarding` não existe no banco: é derivado (empresa ativa que ainda não concluiu os
 * primeiros passos) por quem tem a data de conclusão à mão. As chaves de tradução são o
 * texto em português (`lib/i18n/dicionario.ts` e os catálogos de `lib/i18n/traducoes/`).
 */
export type VarianteDoSelo = "success" | "info" | "warning" | "error" | "neutral";

export const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = {
  active: "Ativo",
  onboarding: "Onboarding",
  suspended: "Suspenso",
  redacted: "Redigido",
};

export const SELO_DA_SITUACAO: Readonly<Record<string, VarianteDoSelo>> = {
  active: "success",
  onboarding: "info",
  suspended: "warning",
  redacted: "error",
};

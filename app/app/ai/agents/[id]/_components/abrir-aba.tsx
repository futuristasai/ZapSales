"use client";
/**
 * Deixa uma parte do formulário abrir outra aba do agente.
 *
 * Nasceu de um aviso que mandava «acompanhar na aba Capacidades» sem dizer onde
 * ela estava: o dono do produto procurou a aba dentro da própria seção e achou que
 * era a lista avançada. Um aviso que manda olhar em outro lugar precisa levar até
 * lá com um clique. As abas moram em `AgentTabs`, que fornece a função; fora dele
 * (a criação do agente, que não tem abas) o contexto é `null` e o botão some.
 */
import * as React from "react";

/** As abas que alguém de dentro do formulário pode querer abrir. */
export type AbaAbrivelDoAgente = "capacidades";

export const AbrirAbaDoAgente = React.createContext<((aba: AbaAbrivelDoAgente) => void) | null>(
  null,
);

export function useAbrirAbaDoAgente(): ((aba: AbaAbrivelDoAgente) => void) | null {
  return React.useContext(AbrirAbaDoAgente);
}

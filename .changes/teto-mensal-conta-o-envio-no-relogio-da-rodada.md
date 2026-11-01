---
impacto: nada_mudou
secao: corrigido
titulo: O teto de gasto mensal da campanha conta cada envio no mesmo relógio da rodada
---

A linha que registra o custo estimado de cada mensagem enviada passou a levar a hora da própria rodada
da campanha (a mesma que já marca o envio), em vez da hora do banco de dados. O teto de gasto mensal da
empresa soma só o que foi gasto no mês da rodada; com as duas horas sempre iguais, um envio que acabou
de sair nunca deixa de contar contra o teto. Em uso normal os dois relógios coincidem e nada muda na
tela nem no valor cobrado.

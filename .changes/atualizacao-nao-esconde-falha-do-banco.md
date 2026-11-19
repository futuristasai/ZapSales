---
impacto: nada_mudou
secao: corrigido
titulo: Atualização que falha no banco não termina mais como se tivesse dado certo
---

Ao atualizar, o instalador reaplica a estrutura do banco com o sistema em uso. Se o
banco interrompesse esse passo no meio (acontece quando a atualização e uma ação de
alguém da equipe disputam a mesma tabela no mesmo instante), o instalador seguia em
frente e avisava «Pronto», deixando o banco pela metade. O sintoma era a tela de
Conversas mostrando «Erro interno. Tente de novo em instantes» até a atualização seguinte.

Agora, quando o banco interrompe o passo por essa disputa, o instalador o repete
sozinho, até três vezes. Se ainda assim não concluir, a atualização para e avisa a
falha, em vez de terminar como se estivesse tudo certo. A restauração de backup ganhou
a mesma conferência.

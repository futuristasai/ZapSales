---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar não refaz mais centenas de regras do banco que não mudaram
---

Toda atualização reaplica a estrutura do banco, e até aqui ela apagava e recriava cerca
de 230 regras de acesso e 170 gatilhos, mesmo quando nenhum deles tinha mudado. Cada
uma dessas trocas bloqueia a tabela por um instante (e as tabelas de login junto), com a
equipe usando o sistema.

Agora a atualização confere cada regra e cada gatilho e só refaz o que realmente mudou.
Numa atualização comum, nenhum é refeito. As regras e os gatilhos que ficam no banco são
exatamente os mesmos de antes.

A primeira atualização para esta versão ainda refaz tudo uma vez, para registrar o que
está aplicado. Da seguinte em diante, não.

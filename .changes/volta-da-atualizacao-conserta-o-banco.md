---
impacto: nada_mudou
secao: corrigido
titulo: Atualização que falha no banco e volta sozinha não deixa mais o banco pela metade
---

Quando uma atualização falha, o sistema volta sozinho para a versão anterior. Se a falha
tinha sido justamente no passo que atualiza a estrutura do banco, o programa voltava, mas
o banco ficava entre as duas versões, e telas podiam dar erro até alguém rodar a
atualização de novo. Agora, nesse caso, a volta também reaplica a estrutura do banco da
versão anterior antes de religar o sistema. Se nem isso der certo, a volta avisa que
falhou, em vez de dizer que está tudo de volta.

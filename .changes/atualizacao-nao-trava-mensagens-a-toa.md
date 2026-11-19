---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar não bloqueia mais a tabela de mensagens quando não há nada a ajustar
---

Toda atualização passava por um ajuste antigo que carimba mensagens recebidas antes de
uma mudança no controle de atendimentos. Para fazer isso com segurança ele pausava, por
um instante, um mecanismo interno da tabela de mensagens, o que segura a chegada e o
envio de mensagens enquanto dura. O ajuste fazia essa pausa em toda atualização, mesmo
sem nenhuma mensagem antiga para carimbar, que é o caso de quem já atualizou uma vez.

Agora a pausa só acontece quando existe mensagem a carimbar. E mensagem de grupo fica de
fora desse ajuste, como já ficava quando chega: antes ela era carimbada na atualização
seguinte, o que não combinava com o resto do sistema.

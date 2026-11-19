---
impacto: nada_mudou
secao: corrigido
titulo: Pedido de agendamento que ninguém confirmou volta a liberar o horário
---

Quando um tipo de agendamento pede confirmação, o pedido do cliente segura o horário
até alguém decidir, e depois do prazo (24 horas, por padrão) o sistema deveria cancelar
o pedido sozinho e devolver o horário à agenda. Esse cancelamento automático falhava em
silêncio: o pedido vencido continuava ocupando o horário para sempre, e o próximo
cliente ouvia que não havia vaga. Agora o pedido vencido é cancelado e o horário volta
a aparecer como livre.

---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode usar a API pronta de outro sistema, com opções de segurança que você escolhe
---

Em **Agente de IA › Ferramentas externas** há uma aba nova, **APIs**. Nela você cadastra a
API de outro sistema — a sua loja virtual, o seu ERP, o seu CRM — informando o endereço, a
operação e a chave de acesso que esse sistema fornece. O agente passa a consultar ou a
fazer algo lá durante a conversa, sem precisar de um intermediário como Make ou n8n.

O recurso vem **desligado**. Ao ligar, a segurança nasce no nível **«Mais seguro»**: o
agente só consulta, só administrador cadastra e nada é alterado em outro sistema. São 17
opções, e cada uma mostra na tela o que faz, um exemplo, a posição recomendada e o risco
de sair dela. Sair da posição recomendada pede uma confirmação e deixa a opção marcada
como «Fora do recomendado».

O que você pode configurar:

- **Na organização:** quem cadastra APIs, quais sites podem ser chamados, se o agente só
  consulta, se toda alteração exige aprovação, quais dados do cliente podem ser enviados,
  quem aprova, se mexer nas APIs exige a verificação em duas etapas e se o administrador
  é avisado a cada mudança.
- **Em cada API:** se ela consulta ou altera dados, se pede aprovação e por quanto tempo,
  quais dados do cliente recebe, o que o agente lê da resposta, o limite de uso por
  conversa e por dia, os valores permitidos em cada campo e a pausa automática quando a
  API falha várias vezes seguidas.

A chave de acesso é guardada cifrada e nunca é mostrada de novo. O telefone, o nome e o
e-mail do cliente, quando liberados, são preenchidos pelo sistema com os dados de quem
está na conversa — o agente não escolhe. Nesta versão a API precisa aceitar uma chave
fixa; sistemas que exigem um login que se renova sozinho (como Mercado Livre e Bling)
ainda não são atendidos.

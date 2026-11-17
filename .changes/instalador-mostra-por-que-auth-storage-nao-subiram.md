---
impacto: nada_mudou
secao: corrigido
titulo: A instalação mostra por que o login e os arquivos não subiram
---

Quando o login ou o armazenamento de arquivos não terminavam de preparar o banco,
a instalação parava dizendo só para rodar `docker compose logs auth storage`, e o
motivo ficava escondido na VPS. Agora, antes de parar, ela mostra na tela a
situação dos dois serviços e as linhas do log que explicam a falha, com senhas e
chaves mascaradas. No instalador guiado, essas linhas vão junto para a ficha da
instalação, e o suporte enxerga a causa sem pedir acesso à máquina.

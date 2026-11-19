---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar com a equipe trabalhando não bloqueia mais o banco inteiro por alguns instantes
---

A cada atualização o sistema reconferia as regras que protegem os dados quando o suporte
acessa uma organização em modo somente leitura, e fazia isso do jeito mais pesado:
apagava e recriava essas regras em quase todas as tabelas de uma vez, bloqueando cada
uma delas (as de login inclusive) enquanto durava. Quem estivesse usando o sistema
naquele instante esperava, e num cruzamento de azar a atualização era interrompida no
meio. Foi o que deixou a tela de Conversas em erro em 19/11/2026.

Agora a atualização só mexe na regra que está faltando ou errada. Numa instalação em
dia, que é o caso de quase toda atualização, ela confere e não bloqueia nada.

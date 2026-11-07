---
impacto: capacidade_nova
secao: adicionado
titulo: Novo comando para ver e trocar o modo da trava de licença (padrão: só observa)
---

A instalação ganhou o comando `sudo kit/licenca-modo.sh`, que mostra o modo da trava de licença e permite trocá-lo: `sombra` (o padrão — calcula e registra, **nunca restringe**) ou `valendo` (recusa a instalação ativada cuja licença venceu ou foi bloqueada; os dados e a exportação continuam disponíveis). **Nada muda para quem não usa o comando:** toda instalação continua em `sombra`. Um valor digitado errado não troca nada, e cada troca fica registrada no log do instalador com quem pediu.

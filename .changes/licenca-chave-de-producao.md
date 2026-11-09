---
impacto: nada_mudou
secao: corrigido
titulo: A ativação da licença passa a funcionar numa instalação nova
---

A instalação ativava a licença contra o servidor de licenças, mas rejeitava o selo que ele devolvia, porque a lista de chaves de produção da imagem estava vazia. O resultado era «Licença: ativação pendente — falha local ao ativar», mesmo com a compra válida. A chave pública do servidor de licenças agora vem na imagem. O sistema sempre funcionou nesse estado, e a trava de licença continua em modo sombra: nada é bloqueado.

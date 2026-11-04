---
impacto: exige_acao
secao: alterado
titulo: O ZapSales passa a ser publicado em um endereço novo no GitHub — rode a atualização uma vez
---

O código e as imagens do ZapSales mudaram de endereço: o repositório agora é `github.com/futuristasai/ZapSales` e as imagens são publicadas em `ghcr.io/futuristasai/…`. Nada muda dentro do sistema — telas, dados e configurações seguem exatamente como estavam.

A atualização do kit (`kit/instalar.sh`, o mesmo comando de sempre) já grava o endereço novo no `.env` sozinha, sem você editar nada. Os endereços antigos continuam existindo, mas **não recebem mais versões novas**.

## Requer atenção

Rode a atualização do kit **uma vez** (o comando de instalação, de novo, na VPS). Quem não rodar continua funcionando na versão atual, mas **não recebe mais atualizações**, porque o endereço antigo das imagens deixou de ser publicado.

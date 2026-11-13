---
impacto: capacidade_nova
secao: adicionado
titulo: Riscos de Perda — resgatar quem esfriou com um disparo em massa
---

A tela **Riscos de Perda** ganhou o botão **Resgatar com disparo em massa**, acima da lista. Ele leva as pessoas da situação escolhida (Todos, Crítico, Em risco ou Em voo) para uma campanha.

- O botão **não envia nada**: guarda as pessoas numa lista salva, com a situação, o dia e a hora no nome, e abre a tela de nova campanha com elas já no público. Dali em diante é o disparo de sempre, pela API Oficial ou por QR code.
- Em **Todos**, quem está em voo fica de fora, porque já tem retorno marcado; a janela diz quantos. Em **Em voo**, a janela avisa antes de seguir.
- Todas as proteções do disparo continuam valendo: quem pediu para não receber, quem está sem telefone e quem já está em outra campanha não entram, e a tela de campanha diz quantos ficaram de fora e por quê.
- O botão aparece para gerente e administrador, que são quem cria campanha.

A tela de nova campanha passou a aceitar uma lista salva no endereço (`/app/campaigns/new?lista=<id>`): a lista entra no público sozinha, pelo mesmo caminho do botão **Usar esta lista**.

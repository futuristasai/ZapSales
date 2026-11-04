---
impacto: capacidade_nova
secao: adicionado
titulo: No disparo em massa, dá para guardar as pessoas escolhidas como uma lista com nome e usá-la em outra campanha
---

No cartão **Público** de uma campanha, a caixa **Listas salvas** guarda o público que você montou — as pessoas marcadas na tabela e as que vieram da planilha — com um **nome**, para trazê-lo de volta em outra campanha sem refazer a busca. **Usar esta lista** soma as pessoas às já marcadas; **Excluir** apaga só a lista (as pessoas e as campanhas que já a usaram não mudam).

A lista é **fixa**: guarda quem estava marcado, não um filtro. E ela **nunca fura as proteções**: ao usá-la, quem pediu para não receber, está anonimizado, não tem telefone ou já está em outra campanha fica de fora, e a tela diz quantas pessoas ficaram de fora e por quê. Salvar, usar e excluir é com gerente ou administrador; cada organização vê só as suas listas, até 200.

**O que muda para quem já instalou:** a atualização cria duas tabelas novas no banco (`campaign_audience_lists` e `campaign_audience_list_members`) sozinha, sem nenhuma ação sua. Junto, a escolha de milhares de pessoas marcadas à mão deixou de montar uma consulta grande demais para o banco — ela agora vai em blocos.

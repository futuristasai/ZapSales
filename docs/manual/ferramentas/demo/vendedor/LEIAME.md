# Loja Aurora vendedora — dados de demonstração

Transforma o agente "Atendente da Loja" da organização de demonstração (`manual-demo`, Loja Aurora) numa
vendedora: catálogo com descrição de venda, cérebro (acervo) com roteiro de vendas e vendas
corporativas, funil "Vendas pelo WhatsApp", funil "Aurora Empresas", agenda da consultora corporativa
e conversas de exemplo do agente vendendo e marcando reunião com uma pessoa da equipe.

Tudo é fictício. Nada envia mensagem: o canal da demonstração é o inerte criado por `../semear.sql`.

## Ordem

Roda depois dos scripts da pasta de cima (`semear.sql`, `semear-config.sql`, `semear-massa.sql`,
`semear-ia-montar.sql`). Cada script recusa rodar duas vezes na mesma organização e aceita
`-v fim=rollback` para ensaiar (faz tudo, mostra o resumo e desfaz).

```bash
ORG=<uuid da organização>
# 1. catálogo, funis, agenda, conversas, negócios e reuniões (marca os eventos como consumidos)
docker cp semear-vendedor.sql zapsales-db-1:/tmp/
docker exec zapsales-db-1 psql -U postgres -X -q -v org=$ORG -v fim=commit -f /tmp/semear-vendedor.sql

# 2. guarda os dois documentos no bucket do acervo (roda no container do app)
for f in como-a-julia-vende.md aurora-empresas.md subir-materiais.mjs; do docker cp $f zapsales-app-1:/tmp/; done
docker exec zapsales-app-1 node /tmp/subir-materiais.mjs $ORG

# 3. cadastra os materiais, publica a versão vendedora do agente
docker cp semear-materiais.sql zapsales-db-1:/tmp/; docker cp instrucoes-da-julia.txt zapsales-db-1:/tmp/
docker exec zapsales-db-1 psql -U postgres -X -q -v org=$ORG -v fim=commit -f /tmp/semear-materiais.sql
```

No passo 3 os eventos `knowledge_source.updated` ficam pendentes **de propósito**: o indexador prepara os
trechos com a chave de embedding da própria organização (centavos). Sem chave de embedding cadastrada,
os materiais ficam parados em "aguardando".

## O que fica

| Onde | O quê |
|---|---|
| Catálogo | 33 produtos ativos, com descrição de vendedor; 4 kits corporativos (`KIT-CORP-*`) |
| Acervo | "Como a Júlia vende" e "Aurora Empresas — vendas corporativas" (documentos), 8 perguntas novas no FAQ; a "Tabela de preços" (PDF sem texto) é arquivada |
| Funil "Vendas pelo WhatsApp" | o antigo "Pedidos": Novo contato → Em atendimento → Produto apresentado → Aguardando pagamento → Pago / Perdido. As etapas de logística são arquivadas e os pedidos que estavam nelas viram ganhos |
| Funil "Aurora Empresas" | Interesse → Reunião agendada → Proposta enviada → Negociação → Fechado / Perdido |
| Agenda | tipo "Reunião — Aurora Empresas" (`reuniao-corporativa`, 30 min, lembrete desligado) com a Camila Nunes; jornada dela publicada de segunda a sexta, 9h–12h e 14h–18h |
| Conversas | 11 roteiros (venda com complemento, presente, carrinho abandonado, dúvida de tamanho, perda por preço e cinco corporativas), cada uma com o negócio na etapa certa; 4 reuniões marcadas pelo agente (1 futura, 3 realizadas) |
| Agente | versão nova publicada: instruções de vendedora (`instrucoes-da-julia.txt`), ferramentas de funil e agenda, os dois funis e 5 materiais. `is_active` não muda |

## Desfazer

A organização inteira sai com `../apagar.sh`. Para voltar só este pacote, restaure a cópia do banco
feita antes de aplicar (`pg_restore`), ou republique a versão anterior do agente pela tela.

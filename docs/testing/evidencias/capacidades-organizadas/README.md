# «O que o agente pode fazer» organizado — evidência (PR #336, v1.5.0)

**01–05: vitrine local** com os componentes reais e a rede interceptada, antes do merge.

**10–13: produção** (`zapsales.futuristas.app`, versão `f2df37d`), em 2026-11-18, com uma organização e um
usuário temporários criados para a prova e apagados no fim (conferido: `org=0 user=0`). A tela é a de
**novo agente**, que usa as mesmas duas seções. Num tenant novo não há número conectado, e não se cria um na VPS.
A tela de edição, com a aba «Uso das capacidades», é provada pelo e2e do CI (`capacidades-do-agente.spec.ts`).

Medido pelo roteiro, não a olho:

| Medida | Resultado |
|---|---|
| Pacote «Vender» aberto | 3 grupos (só consulta, altera dados, sem volta) |
| Exemplo de «Marcar consulta ou sessão» | «Cliente escolhe «quinta às 15h» → o agente reserva o horário com a Dra. Paula…» |
| Busca por «whatsapp» | 2 capacidades encontradas |
| «Ferramentas externas» no índice lateral | presente |
| «Cadastrar uma ferramenta externa» | `href=/app/ai/external-tools`, `target=_blank`; a nova aba abre e o editor continua em `/app/ai/agents/new` |
| Rolagem lateral no celular (390 px) | 0 |

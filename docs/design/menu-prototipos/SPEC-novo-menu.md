# Novo menu de navegação: pensado pela rotina de quem atende

## Problem Statement

Quem usa o ZapSales todo dia é o atendente, o vendedor, o gerente e o dono de uma pequena ou média empresa. Quase nenhum deles é técnico.

Hoje o menu é organizado pelas áreas do sistema (Atendimento, CRM, Agente de IA, Canais, Análise, Organização), e não pelo que a pessoa faz no dia. Na prática:

- Só 15 das 63 telas aparecem no menu lateral. As outras 48 ficam atrás de links "Ver tudo em…" e de Configurações. Para achar a tela de trocar a chave da IA ou de ajustar as etapas do funil, a pessoa precisa saber em que área do sistema ela mora.
- O que se abre toda hora (conversas, funil, casos que esperam uma pessoa) divide o mesmo espaço com o que se mexe uma vez por mês.
- Vários nomes são jargão de quem programa: Webhooks, Roteadores, Skills, Credenciais, Provedores, API Tokens. O dono leigo não sabe o que são, e o técnico não encontra o termo que procura se o nome for trocado por completo.
- O menu tem um limite de tamanho (cabe em 900 px de altura, no máximo 15 itens). Toda tela nova disputa espaço e acaba escondida.
- O menu não tem uma identidade própria: a disposição e os nomes seguem a convenção comum de CRMs e não refletem o produto.

## Solution

Um menu novo, organizado pela frequência de uso, com três blocos que a pessoa entende pelo nome:

- **Todo dia:** o que se abre toda hora, numa "mesa de trabalho". Tem dois subtítulos: **Leads** (Conversas, Aguardando Humano, Alertas, Riscos de Perda, Compromissos) e **Gestão de Clientes CRM** (Funis, Contatos, Tarefas, Disparo em massa). Mostra os contadores de pendências e, para quem usa, as telas dos recursos opcionais (Propostas, Comandas, Chamadas).
- **Configurar:** o que se ajusta de vez em quando, em quatro áreas: **Vender**, **Agente**, **Conexões** e **Empresa**. Cada área abre numa **gaveta larga**, em duas colunas, com as telas agrupadas por tarefa e uma frase explicando cada uma.
- **Resultados:** números do negócio, trabalho da equipe e da IA, e o histórico para investigar quando algo dá errado.

No computador, uma **faixa azul-noite** fica à esquerda, com as entradas Todo dia, Vender, Agente, Conexões, Empresa e Resultados. Ao lado dela abre um painel que começa sempre em Todo dia, e pode ser recolhido. As áreas de Configurar e Resultados abrem a gaveta por cima da tela. As telas pessoais (Perfil, Segurança, Notificações) ficam no menu da conta, em "Você".

Os nomes ficam simples, e o **termo técnico aparece embaixo do nome**: "Avisar outros sistemas" com "webhooks" embaixo. A busca (Ctrl K) encontra a tela pelo nome novo, pelo nome antigo e pelo termo técnico.

No celular, uma barra de baixo leva a Conversas (com a fila), Todo dia, Configurar e Resultados. Cada uma abre uma folha com a lista.

Nada é retirado do produto: as 63 telas continuam existindo, com os mesmos endereços, e cada papel continua vendo exatamente o que vê hoje.

## User Stories

1. Como atendente, quero ver as minhas conversas, os casos que esperam uma pessoa, os alertas e os compromissos numa mesa fixa assim que abro o sistema, para começar o dia sem procurar.
2. Como atendente, quero um contador de conversas na fila no ícone de Todo dia, mesmo com o painel recolhido, para saber que alguém me espera sem abrir nada.
3. Como atendente, quero que "Aguardando Humano" mostre por padrão só os casos que esperam uma pessoa, para tratar primeiro o que está parado por minha causa.
4. Como atendente, quero poder ver também todos os casos (inclusive os já resolvidos) na mesma tela, para consultar o histórico de um atendimento da IA.
5. Como atendente, quero que o contador de "Aguardando Humano" some quando for zero, para o número significar sempre alguma coisa.
6. Como atendente, quero que as telas de configuração que não são minhas (agente, conexões, plano) não apareçam para mim, para o menu não me confundir.
7. Como gerente, quero encontrar as telas de montar o agente de IA numa área chamada Agente, para ajustá-lo sem saber em que "grupo do sistema" ele mora.
8. Como gerente, quero que as telas da área Agente estejam agrupadas por tarefa (montar, ensinar, conectar a IA), para achar rápido o que preciso.
9. Como gerente, quero ver o desempenho, o custo dos anúncios e o faturamento juntos em Resultados, para acompanhar o mês numa só entrada.
10. Como dono, quero ver a tela de Plano e cobrança, a marca e os dados da empresa na área Empresa, para configurar o negócio num único lugar.
11. Como dono leigo, quero que as telas tenham nomes que eu entendo ("Avisar outros sistemas", "Chave da IA", "Qual IA usar"), para saber o que cada uma faz sem pedir ajuda.
12. Como dono ou técnico que conhece o termo, quero ver o termo técnico embaixo do nome ("webhooks", "API key", "MCP"), para confirmar que é a tela que procuro.
13. Como pessoa que já usava o sistema antes, quero que a busca ache a tela pelo nome antigo ("Inbox", "Radar", "Casos", "Webhooks"), para não me perder na mudança.
14. Como qualquer pessoa, quero abrir a busca com Ctrl K e digitar "webhook" ou "chave" e chegar à tela certa, mesmo sem saber onde ela fica.
15. Como qualquer pessoa, quero passar o mouse sobre um item e ver a descrição e o termo técnico, para tirar dúvida sem entrar na tela.
16. Como dono, quero que uma área mostre a gaveta larga com a descrição de cada tela, para ler o que ela faz antes de abrir.
17. Como dono, quero fechar a gaveta com um "×", com a tecla Esc ou clicando fora, para voltar ao que eu estava fazendo.
18. Como atendente, quero que a gaveta feche sozinha depois que eu escolho uma tela, para não ficar cobrindo o meu trabalho.
19. Como atendente que usa a Inbox o dia todo, quero recolher o painel e ficar só com a faixa, para ganhar largura de tela.
20. Como atendente, quero que o sistema lembre se eu recolhi o painel, para não precisar recolher de novo a cada acesso.
21. Como dono, quero que o ícone de Conexões na faixa mostre um aviso quando um número do WhatsApp cair, para perceber sem abrir a tela.
22. Como atendente no celular, quero uma barra de baixo com Conversas, Todo dia, Configurar e Resultados, para navegar com o polegar.
23. Como atendente no celular, quero ver o contador da fila na aba Conversas, para saber se tem gente esperando.
24. Como gerente no celular, quero abrir a lista de Configurar numa folha agrupada por área, para achar uma tela de configuração sem rolar um menu enorme.
25. Como leitor (só consulta), quero um menu mais curto, com só o que o meu papel permite, para não ver telas que me levariam a "sem permissão".
26. Como dono de uma empresa que usa a interface simplificada, quero que o menu novo mostre só as telas que escolhi manter, para continuar com a interface enxuta.
27. Como dono, quero que as portas que não podem ser escondidas (Perfil, Segurança, Equipe, Dados da empresa) continuem acessíveis, para nunca me trancar para fora das configurações.
28. Como dono, quero ver Propostas, Comandas e Chamadas na mesa só se a minha empresa usa esses recursos, para o menu não mostrar o que eu não tenho.
29. Como dono de uma empresa que não usa propostas, quero que as telas de configuração de propostas não apareçam em Vender, para a área não ter itens mortos.
30. Como administrador de uma instalação, quero que os módulos opcionais desligados não apareçam no menu, na gaveta nem na busca, para ninguém abrir uma tela que não existe na instalação.
31. Como revendedor, quero que o destaque do menu use a cor da minha marca e o logo da minha empresa, para o sistema parecer meu.
32. Como pessoa que prefere o tema escuro, quero a faixa, o painel e a gaveta legíveis e bonitos no escuro, para trabalhar com conforto.
33. Como pessoa que usa leitor de tela, quero que a faixa, o painel e a gaveta tenham nomes e estados anunciados, e que a gaveta prenda o foco enquanto está aberta e o devolva ao fechar, para navegar sem o mouse.
34. Como pessoa que navega só pelo teclado, quero chegar a qualquer tela e fechar a gaveta com o teclado, para não depender do mouse.
35. Como pessoa sensível a movimento, quero que a gaveta apareça sem animação quando o meu sistema pede movimento reduzido, para não me incomodar.
36. Como pessoa com visão reduzida, quero que o estado "tela aberta" e os avisos usem palavra e forma, e não só cor, e que o texto tenha contraste suficiente.
37. Como dono, quero um menu da conta ("Você") com Perfil, Segurança e Notificações, para achar as telas pessoais sempre no mesmo lugar.
38. Como administrador, quero continuar vendo o aviso de versão e de atualização do sistema, para saber quando atualizar.
39. Como pessoa que usa o sistema em espanhol ou em inglês, quero todos os nomes, descrições e subtítulos novos traduzidos, para o menu não misturar idiomas.
40. Como pessoa que tinha uma tela salva nos favoritos, quero que os endereços das telas não mudem, para o link antigo continuar funcionando.
41. Como pessoa que abre a página de uma área do sistema pelo endereço antigo ("Ver tudo em IA", "Ver tudo em CRM"), quero que ela continue abrindo, para nenhum atalho antigo quebrar.
42. Como quem dá suporte, quero que uma tela nova entre no menu declarando onde mora em um único lugar, para o menu, a busca e as áreas nunca divergirem.
43. Como desenvolvedor, quero um teste que reprove uma tela que exista sem porta na navegação, para nenhuma tela ficar alcançável só digitando o endereço.
44. Como desenvolvedor, quero que o limite de tamanho do menu deixe de existir e seja trocado por uma garantia de que nenhum bloco some abaixo da dobra, para o menu poder crescer sem remendos.
45. Como mantenedor do produto, quero que as regras escritas sobre o menu (altura, 15 itens) sejam atualizadas junto com o código, para a documentação não mentir.

## Implementation Decisions

**Fonte única.** O catálogo de navegação continua sendo a única lista de destinos. O menu, a busca e as páginas de área são projeções dele. Telas novas passam a declarar, no catálogo: o bloco (Todo dia, Configurar ou Resultados), a área (nas de Configurar), o grupo por tarefa, o nome exibido, o termo técnico (opcional), o ícone, o papel mínimo, o módulo ou a capacidade opcional, o contador (se houver) e a ordem. O indicador "está no menu lateral" e o limite de 15 itens deixam de existir.

**Regras de visibilidade inalteradas.** Quem vê o quê continua sendo decidido pela mesma regra de hoje: papel, módulos e capacidades opcionais da instalação e da empresa, interface simplificada por empresa (inclusive a lista de telas escolhida), portas essenciais que nunca podem ser escondidas, administrador de plataforma. A mudança é só de apresentação, nunca de autorização. Grupo, área ou bloco sem telas visíveis desaparece.

**Estrutura do menu.**

- Todo dia: subtítulos Leads e Gestão de Clientes CRM; em seguida "Se a sua empresa usa" (Propostas, Comandas, Chamadas); em seguida os recursos opcionais. Distribuição das telas conforme as histórias 1 a 5 e a Solution.
- Configurar: áreas Vender, Agente, Conexões e Empresa, cada uma com seus grupos por tarefa. Cada tela de hoje cai em exatamente um grupo; o que não estiver mapeado cai num grupo "Outros", para nada desaparecer.
- Resultados: três grupos (Números do negócio, Equipe e IA, Quando algo dá errado).
- Menu da conta (Você): Perfil, Segurança, Notificações.

**Computador.** Faixa fixa à esquerda (largura de cerca de 80 px). O painel ao lado (cerca de 330 px) abre em Todo dia, mostra a mesa com contadores, e pode ser recolhido. Clicar numa área de Configurar ou em Resultados abre a gaveta (cerca de 700 px, em duas colunas) por cima do conteúdo, com fundo escurecido. A gaveta fecha com "×", Esc, clique fora ou ao escolher uma tela. A preferência de recolher o painel continua sendo guardada de forma que o servidor e o navegador desenhem o mesmo estado na primeira pintura (o sistema já teve um defeito por essa divergência).

**Celular.** Barra de baixo com Conversas (com o contador da fila), Todo dia, Configurar e Resultados. Todo dia e Resultados abrem uma folha com a lista; Configurar abre uma folha com as quatro áreas e seus grupos por tarefa. Busca e menu da conta ficam no topo.

**Contadores e avisos.** Só os contadores que já existem entram: fila de conversas (Conversas) e casos que esperam uma pessoa (Aguardando Humano). O ícone de Todo dia na faixa mostra só a fila de conversas. O indicador de saúde dos números do WhatsApp aparece também no ícone de Conexões na faixa. Contadores que apareceram nos protótipos para Alertas e Tarefas são ilustrativos e não fazem parte desta entrega.

**Nomes.**

- Telas: Inbox passa a Conversas; Radar passa a Riscos de Perda; Agenda passa a Compromissos; Casos passa a Aguardando Humano. Os nomes antigos viram sinônimos de busca.
- Jargão trocado por nome simples, com o termo técnico à vista: Webhooks passa a Avisar outros sistemas (webhooks); Roteadores passa a Quem atende cada conversa (roteadores); Skills passa a O que o agente sabe fazer (skills); Credenciais passa a Chave da IA (API key); Provedores passa a Qual IA usar (provedores); API Tokens passa a Chaves de acesso (API tokens); Ferramentas externas passa a Conectar outros sistemas (MCP); Execuções passa a Histórico do agente (logs); Auditoria passa a Quem mexeu em quê (audit log); Distribuição de atendimento passa a Revezamento da equipe (round-robin); Tags passa a Etiquetas (tags); Organização passa a Dados da empresa; Dados externos passa a Dados de outro sistema; a conta de anúncios (Meta Ads, em Configurações) passa a Conta de anúncios; Propostas (configuração) passa a Padrões de proposta. Conhecimento, Conversões, Linha telefônica, Segurança e Importações ganham termo técnico sem trocar o nome.
- A lista final de nomes, descrições e termos técnicos está no protótipo de referência. Todos passam pelo mecanismo de tradução e precisam existir em português, espanhol e inglês.
- A busca passa a considerar nome novo, nome antigo, termo técnico, descrição e sinônimos.

**Aguardando Humano.** A tela de casos passa a abrir filtrada nos casos que esperam uma pessoa, com uma forma clara de ver todos (inclusive os resolvidos). O contador e o endereço não mudam, e links para um caso específico continuam funcionando. A descrição da tela é ajustada para refletir isso. Antes de implementar, conferir se a tela já tem filtro ou abas, e aproveitar.

**Páginas de área existentes.** As páginas "Ver tudo em CRM / IA / Análise" e Configurações continuam existindo e abrindo pelo endereço, e continuam listadas na busca. Elas deixam de ser o caminho principal do menu, e os links "Ver tudo em…" saem do menu. Retirar essas páginas é decisão para depois.

**Marca própria.** A faixa usa tons neutros do tema e a cor de destaque da instalação ou da empresa (nunca violeta fixo no código). O símbolo ou logo mostrado na faixa vem da marca resolvida, como hoje. Valem os dois temas, claro e escuro, e a regra de que nenhum valor de marca fica fixo no código.

**Ícones.** Continua valendo um ícone próprio por destino. As entradas da faixa usam ícones distintos entre si.

**Acessibilidade e movimento.** Regiões de navegação com nome; tela atual marcada; a gaveta se comporta como diálogo (foco preso, Esc fecha, foco volta ao botão que a abriu); contraste mínimo de texto; estado nunca só por cor; alvos de toque de pelo menos 44 px no celular; sem animação com movimento reduzido.

**Idioma.** Todo texto novo passa pelo mecanismo de tradução, com espanhol e inglês cobertos, respeitando a verificação já existente.

**Sem mudança de dados.** Nenhuma tabela, migração, rota de API ou variável de ambiente nova. A entrega é de apresentação e de navegação, com a única exceção do filtro padrão da tela de casos.

**Rodapé e versão.** O aviso de versão e de atualização continua visível para quem administra, no rodapé do painel ou no menu da conta.

**Destino da mudança.** Núcleo: o menu é parte do produto básico, não de uma extensão. Ele deve funcionar com zero extensões e zero recursos opcionais ligados.

## Testing Decisions

**O que faz um bom teste aqui:** conferir o comportamento que a pessoa vê (quais telas aparecem para cada papel, em que ordem, em que bloco), e não detalhes de como o menu é montado por dentro.

**Dois pontos de teste:**

1. **A projeção do catálogo (o que cada pessoa vê).** Cobre: Dono, Gerente, Atendente e Leitor veem os blocos Todo dia, Configurar e Resultados com as telas certas; nenhuma das 63 telas some do conjunto; módulos e capacidades opcionais desligados escondem a tela; a interface simplificada por empresa e as portas essenciais continuam valendo; blocos e áreas vazios desaparecem; cada tela cai em exatamente um grupo; a busca acha por nome novo, nome antigo e termo técnico. Já existem testes de completude da navegação, do registro, da interface por empresa, dos ícones únicos, do agrupamento do menu e das páginas de área. Eles são atualizados ou substituídos, sem enfraquecer o que cobram hoje (em especial: toda tela tem porta).
2. **O teste na tela real (end to end).** Substitui a regra antiga de "o menu cabe em 900 px sem rolar". A garantia nova é: nenhum bloco ou área fica escondido abaixo da dobra no computador e no celular, a gaveta abre e fecha por todos os caminhos, os contadores aparecem e somem, e o menu muda conforme o papel. Existem hoje testes de navegação, de contadores e de "menu por empresa e a porta de volta"; eles servem de base.

**Verificação pela tela (obrigatória antes de dar por pronto):** num ambiente que imita a instalação nova numa VPS, provar pela tela como uma pessoa leiga usaria, no computador e no celular, nos temas claro e escuro, com pelo menos os papéis Dono, Atendente e Leitor, com os recursos opcionais desligados e ligados, e em português, espanhol e inglês. Anexar evidência visual ao pull request. Uma chamada de API não conta como prova.

**Garantias do projeto que devem continuar verdes:** a suíte unitária inteira (sem recortar pastas), os testes de end to end e de jornada que tocam o menu, a verificação de tradução, a cerca de marca (nenhum valor de marca fixo), checagem de tipos e lint. Como não há mudança de banco, os testes de banco não são necessários.

## Out of Scope

- **Fixar telas por pessoa.** Aparece nos protótipos, mas exige guardar uma escolha por usuário no banco. Será uma spec à parte.
- **Etiqueta do termo técnico no título de cada tela de destino.** Exige tocar cerca de 60 telas, títulos, testes e traduções. Fica para uma spec de continuação. Nesta entrega o termo técnico aparece no menu, na dica e na busca.
- **Novos contadores** (Alertas, Tarefas) e qualquer mudança nas regras de pendência.
- **Retirar as páginas de área** ("Ver tudo em…") ou mudar qualquer endereço de tela.
- **Mudar telas além do filtro padrão de Aguardando Humano**, nome e descrição.
- **Mudar papéis, permissões ou regras de visibilidade.**
- **O menu da área de administração da plataforma.**
- **Atualizar o manual do usuário em HTML e seus prints**, que mostram o menu antigo. Tarefa à parte.
- **Validar a lista de Todo dia e o nome "Leads" com operadores reais.** É pesquisa, não código.

## Further Notes

- **Referência visual:** protótipos clicáveis em `docs/design/menu-prototipos` (o escolhido é o 6, "Faixa + Mesa", com a gaveta de duas colunas). Eles precisam estar no repositório para quem implementar consultar; o índice lista os 63 destinos, os nomes e as pendências.
- **Hipóteses a validar depois do lançamento:** a lista de Todo dia (9 telas mais as opcionais) e o nome do subtítulo "Leads". Ambos são texto e lista no catálogo, baratos de mudar.
- **Contagem:** o catálogo real tem 63 destinos.
- **Regras escritas a atualizar junto:** a seção de menu do documento de design, a regra dos 900 px e dos 15 itens, e o item de "tela nova tem porta" da definição de pronto (a porta agora é declarada com bloco, área e grupo). Conferir se o arquivo portável de instruções (derivado) também precisa mudar.
- **Entrega para operadores de VPS:** como muda o que se vê no produto, a entrega traz o fragmento de versionamento e a nota pública de changelog, no formato que a doutrina de versionamento pede.
- **Lista "Living System":** cada tela segue com entrada, saída e porta; o menu é uma projeção do catálogo e não tem lista própria que possa divergir.

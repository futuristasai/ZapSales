# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Se você roda o ZapSales numa VPS, **leia a seção da versão para a qual está atualizando antes de atualizar**. Mudanças que exigem ação manual aparecem no topo da seção.

## [Não lançado]

## [1.5.3] — 2026-11-18

### Corrigido

- **Notas de versão na Administração com o título separado do texto** Na tela de atualização e no cartão Versão do Painel, o título de cada novidade aparecia
  grudado no começo do texto, sem pontuação ("…em aberto Atualizamos as bibliotecas…").
  Agora entra um ponto entre os dois, e isso vale também para as notas das versões
  anteriores.

## [1.5.2] — 2026-11-18

### Corrigido

- **Bibliotecas internas atualizadas, sem nenhuma vulnerabilidade conhecida em aberto** Atualizamos as bibliotecas que tinham avisos de segurança publicados: o `hono` e o
  `@hono/node-server` (usados pelo servidor MCP), o Sentry (registro de erros) e as
  ferramentas de verificação de código. A auditoria de dependências passou a não acusar
  nenhuma vulnerabilidade conhecida. Nada muda nas telas nem na forma de usar, e a
  atualização da instalação é a de sempre.

## [1.5.1] — 2026-11-18

### Corrigido

- **Next.js atualizado para a 16.4.6, com as correções de segurança da versão** O sistema passou a rodar sobre o Next.js 16.4.6 (antes, 16.4.3). A atualização traz
  as correções de segurança publicadas pelo Next.js para essa linha de versão. Nada
  muda nas telas nem na forma de usar, e a atualização da instalação é a de sempre.

## [1.5.0] — 2026-11-18

### Alterado

- **«O que o agente pode fazer» ficou organizado, e as ferramentas externas ganharam seção própria** No editor do agente, cada pacote de capacidades agora abre e mostra as capacidades
  dele separadas pelo tamanho do efeito (só consulta, altera dados, sem volta). Cada
  uma traz a explicação, um exemplo de conversa que mostra quando ela entra em ação, a
  parte do sistema em que mexe e quantas vezes foi usada nos últimos 30 dias. Uma busca
  acha qualquer capacidade pelo nome e substitui o antigo "modo avançado".

  Os avisos de "acima do recomendado" e de "capacidades parecidas" ficaram numa faixa
  só, junto da contagem, com um botão que abre direto a aba de uso. Essa aba passou a
  se chamar **Uso das capacidades**, para não ser confundida com a seção.

  As ferramentas externas saíram do meio das capacidades e viraram a parte
  **Ferramentas externas** do editor. Quando a empresa ainda não tem nenhuma, a seção
  explica para que servem e traz os botões "Cadastrar uma ferramenta externa" e
  "Conectar um servidor MCP", que abrem em outra aba para não perder o que estava
  sendo editado.

## [1.4.0] — 2026-11-18

### Alterado

- **O agente pode ligar mais de 27 capacidades, com aviso e sinais de escolha errada** Em **O que o agente pode fazer**, 27 capacidades deixou de ser um limite. Agora é o **recomendado**: acima disso a tela deixa ligar outro pacote inteiro (por exemplo, "Atender e responder" junto com "Vender e mover o funil") e mostra um aviso amarelo dizendo que a IA pode escolher a capacidade errada com mais frequência. O limite que o sistema recusa passou a ser **100**, e cabe o catálogo inteiro. Capacidade de risco crítico continua exigindo marcação uma a uma: o pacote nunca a liga por você.

  - **Capacidades parecidas:** quando duas capacidades de pacotes diferentes fazem quase a mesma coisa e estão ligadas juntas (por exemplo, "Marcar consulta" e "Agendar um retorno"), a tela avisa e diz o que observar.
  - **Sinais de escolha errada na aba Capacidades:** o painel passa a contar quando **alguém da equipe moveu o mesmo negócio até 24 horas depois da IA** (ao mover de etapa ou encerrar o negócio) e quando a **IA chamou a mesma capacidade de novo logo depois de ela falhar**. São indícios, não certeza, e servem para decidir o que desligar.

  **No servidor:** nada a fazer. A atualização normal aplica a mudança no banco.

### Corrigido

- **O editor do agente diz por que "Salvar rascunho" está apagado** No editor do agente, quando algum campo estava inválido, o botão "Salvar
  rascunho" ficava apagado sem explicação — mesmo com a barra dizendo
  "Alterações não salvas". O aviso existia só embaixo do campo, que podia estar
  várias partes abaixo de onde a pessoa estava mexendo. Agora a barra de salvar
  diz o que corrigir, nomeia a parte do formulário e traz um atalho "Ver onde corrigir".

## [1.3.2] — 2026-11-17

### Corrigido

- **O acervo volta a mostrar quais agentes consultam cada material** Na tela **O que o agente sabe** (IA › Conhecimento), o campo **Consultado por** de cada material dizia sempre "nenhum assistente ainda", mesmo quando um agente publicado lia aquele material. A tela perguntava pelos agentes de um jeito que o banco recusava em silêncio. Agora cada cartão mostra o nome dos agentes que consultam o material, e arquivar deixa de ser um tiro no escuro.

  Nada precisa ser feito no servidor.

## [1.3.1] — 2026-11-17

### Corrigido

- **A instalação mostra por que o login e os arquivos não subiram** Quando o login ou o armazenamento de arquivos não terminavam de preparar o banco,
  a instalação parava dizendo só para rodar `docker compose logs auth storage`, e o
  motivo ficava escondido na VPS. Agora, antes de parar, ela mostra na tela a
  situação dos dois serviços e as linhas do log que explicam a falha, com senhas e
  chaves mascaradas. No instalador guiado, essas linhas vão junto para a ficha da
  instalação, e o suporte enxerga a causa sem pedir acesso à máquina.

## [1.3.0] — 2026-11-16

### Adicionado

- **Administração da instalação — menu em grupos, em português e com ajuda em cada tela** A área **Administração da instalação** (o antigo "Admin Plataforma", em `/admin`) foi reorganizada para quem não é programador:

  - O menu agora tem **cinco grupos** — Visão geral, Empresas e pessoas, Acompanhar e proteger, Configurar a instalação e Integrações — e os nomes saíram do inglês: **Empresas** (era "Tenants"), **Registro de ações** ("Audit"), **Uso e custo**, **Usuários**, **Administradores da plataforma**, **Conversas de todas as empresas** ("Inbox") e **Quem pode criar conta** ("Cadastro").
  - Passando o mouse (ou o teclado) num item, aparece uma frase dizendo o que ele faz. Toda tela começa com o mesmo cabeçalho: o que ela faz e quando usar. No celular, essa ajuda fica visível no topo da tela.
  - Cada grupo tem um tom de cor próprio nos ícones, e nenhum ícone se repete. A faixa do topo diz: "Administração da instalação — o que você muda aqui vale para todas as empresas".
  - O **Painel** ganhou o quadro **"Sua instalação está pronta?"**, que mostra o que já está configurado e o que falta (e-mail, marca, quem pode criar conta, API Oficial da Meta, Google Agenda), dizendo o que é obrigatório e o que é opcional. Os cartões de números agora se clicam, levam à lista que contam e dizem em palavras o que o número quer dizer — o zero aparece como "tudo em dia".
  - **Módulos** saiu do menu: o botão **Instalar** do módulo Honorários agora fica no bloco Módulos de **Recursos opcionais**, com o aviso de que ele cria tabelas e vale para todas as empresas. O endereço antigo continua funcionando e leva direto para lá.

  Os endereços das telas não mudaram, e nada precisa ser feito no servidor.

- **Atualizar com um clique, com volta automática, e backup no Painel** O botão **Atualizar agora** voltou a funcionar, e agora mora na Administração da instalação: **Configurar a instalação › Atualização** (`/admin/atualizacao`). O endereço antigo, `/app/settings/atualizacao`, leva para lá.

  - **Um programa do servidor** (`zapsales-agente`) passa a conversar com a tela a cada minuto: conta a versão instalada, a última versão publicada, com as notas, e como está o backup. É ele quem atende o botão. O sistema nunca manda comando ao servidor: só avisa que alguém pediu.
  - **A atualização é protegida**: cópia do banco antes, instalação da última versão publicada (nunca o código em desenvolvimento, nunca uma versão mais antiga), conferência por 2 minutos e **volta sozinha** para a versão anterior se a nova não ficar de pé. A tela mostra o andamento, o desfecho em português e o **histórico** (quando, de qual para qual versão, quem pediu, resultado).
  - Uma atualização recusada antes de começar (por exemplo, a versão nova ainda não terminou de ser publicada) diz que **nada foi alterado**, e o botão volta.
  - Sem notícia do programa há mais de 5 minutos, a tela mostra **"O programa do servidor está desligado"** com o comando que o liga, e não cria pedido que ninguém vai atender.
  - O **Painel** ganhou os cartões **Versão** (instalada, disponível e o caminho para atualizar) e **Backup** (data da última cópia do banco, aviso quando passa de dois dias, e se a cópia fora do servidor, no R2, está configurada, com o comando `sudo kit/backup.sh configurar-r2` quando não está). Nenhuma senha nem chave aparece.

  **No servidor:** nada a editar à mão. O programa chega na próxima vez que o kit roda, ou seja, na próxima atualização pelo terminal (`curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sudo bash`). Depois dela, as atualizações seguintes podem ser feitas pelo botão.

- **Painel da administração — saúde da instalação e situação da licença** O **Painel** da Administração da instalação (`/admin/dashboard`) agora responde "está tudo bem?":

  - **Saúde da instalação**: o banco de dados, o WhatsApp (conexão por QR code), o Redis e a fila de tarefas em segundo plano aparecem em verde ou vermelho. Cada item vermelho diz, em uma frase, o que fazer — e, quando um comando resolve, mostra o comando pronto para copiar (por exemplo, `sudo docker compose up -d redis srh`). A checagem é a mesma do endereço `/api/v1/health`; o Painel nunca mostra endereço interno, senha nem chave. O botão **Conferir de novo** lê tudo outra vez.
  - A fila de tarefas só fica vermelha quando uma tarefa já devia ter rodado há mais de 10 minutos. Tarefa reagendada de propósito (como um atendimento esperando atendente) não conta.
  - **Licença**: um cartão mostra a situação da licença desta instalação (sem licença, temporária, permanente, vencida ou bloqueada), se ela está funcionando, quando foi ativada e a última conversa com o servidor de licenças, com as mesmas frases da tela de licença.

  Nada precisa ser feito no servidor.

### Corrigido

- **Administração da instalação — últimos termos técnicos trocados e conversas sem rolar a página** Na **Administração da instalação** (`/admin`), os últimos textos em inglês ou jargão viraram português claro:

  - **Administradores da plataforma**: as colunas "Scope" e "MFA" agora se chamam **Tipo de acesso** (Acesso completo ou Só leitura) e **Exige duas etapas**. O link "Ver runbook", que não levava a lugar nenhum, foi trocado por um que abre o manual na seção que explica como incluir ou tirar alguém.
  - **Uso e custo**: "Custo AI / dia (R$)" mostrava valores em dólar; agora é **Custo da IA por dia (US$)**, e as colunas são **Chamadas à IA** e **Custo da IA (US$)**.
  - **Registro de ações**: o detalhe de uma ação mostra **Dados registrados** (era "Metadata") e a situação da empresa em palavras (era "active").
  - Ficha da empresa: na aba Saúde, "Lag" virou **Tempo sem registro**; na aba Agente, o tipo aparece em palavras.
  - **Pedidos de LGPD**: escopo, origem e os códigos do contato e do cliente aparecem em português. Resolver um incidente fala em **registro de ações**, não mais em "audit log".
  - O CSV exportado em Uso e custo chama a coluna de custo de `custo_ia_dolares` (era `custo_reais`, mas o valor sempre foi em dólar).
  - **Conversas de todas as empresas** cabe na janela: com muitas conversas, a lista esticava a página e o aviso "Selecione uma conversa" sumia lá embaixo.

  O manual da área ganhou prints novos de todas as telas. Nada precisa ser feito no servidor.

## [1.2.1] — 2026-11-15

### Alterado

- **Editor do agente — o "Cérebro do agente" vem logo depois do nome, e cada parte tem título mais claro** No editor do agente de IA, a parte que diz **o que ele consulta antes de responder** virou o **Cérebro do agente** e subiu para logo depois de "Quem é este agente". Ela ganhou destaque próprio, mostra quantos materiais do acervo o agente lê, e traz sempre à vista os botões **Adicionar material** (que já abre a janela de cadastro do acervo) e **Abrir o acervo**. Os dois abrem em outra aba, para não perder o que ainda não foi salvo, e o material novo aparece na lista quando você volta.

  Cada material é agora uma linha inteira clicável, com o tipo (documento, perguntas e respostas, site…), a quantidade de trechos e um aviso quando ainda não foi preparado.

  As outras partes do editor ganharam título maior, faixa de título com ícone colorido e o mesmo ícone no índice lateral, para ficar claro qual parte você está editando.

## [1.2.0] — 2026-11-14

### Adicionado

- **Modelos mais novos da Anthropic no agente, e a lista passa a se atualizar sozinha** No agente, em **Inteligência e limites › Modelo**, o provedor **Anthropic (Claude)** passou a oferecer os modelos mais novos: **Claude Opus 5.5**, **Claude Sonnet 5.5**, **Claude Haiku 5.5** e **Claude Fable 5.2**, cada um com o preço oficial. Antes a lista parava no Opus 5 e no Sonnet 5, mesmo com a chave da Anthropic já configurada. Quem respondia pela lista era o próprio ZapSales, não a chave.

  - **A lista da Anthropic se atualiza sozinha.** A atualização diária do catálogo, que já trazia os modelos da OpenRouter, agora acrescenta também os modelos novos da Anthropic, com preço, no dia seguinte ao lançamento. Não é preciso esperar uma versão nova do ZapSales.
  - **Os modelos que vieram por versão continuam como estavam**, com a descrição em português. A atualização automática só acrescenta o que falta, e um modelo que sai da lista pública some do seletor sem apagar o histórico de gasto.
  - **O teto de orçamento conta os modelos novos desde o primeiro atendimento.** Modelo que ainda não está na tabela de preços do ZapSales passa a ser cobrado pelo preço do catálogo, arredondado para cima, em vez de rodar sem contar no teto.
  - **Corrigido:** o Claude Opus 4.7 aparecia por US$ 15/75 por milhão de tokens, três vezes o preço real (US$ 5/25).

  **O modelo padrão da Anthropic passa a ser o Claude Sonnet 5.5**, pelo mesmo preço do Sonnet 5. Ele vale para agente criado daqui em diante; os agentes que já existem seguem com o modelo escolhido.

## [1.1.0] — 2026-11-13

### Adicionado

- **O disparo em massa pode ser agendado para um dia e hora, pela tela** Uma campanha pronta ganhou o botão **Agendar**, ao lado de **Iniciar envio**. Você escolhe o dia e a hora, e a campanha começa sozinha quando a hora chega. Vale para número de QR code e para a API Oficial.

  - O horário escolhido vale no fuso do número, e a tela diz qual é e que horas são nele agora.
  - Se a hora marcada cai fora do horário de envio do número (por padrão, das 7h às 22h), a tela avisa antes de confirmar quando o primeiro envio vai sair de verdade.
  - A campanha agendada mostra para quando está marcada e ganha os botões **Mudar horário** e **Enviar agora**. Continua podendo ser pausada ou cancelada.
  - Em número de QR code, agendar pede o mesmo aceite do aviso de risco de banimento que iniciar já pedia.

  Antes, agendar só era possível por integração (API).

- **Limite de respostas automáticas por contato, e o gasto de áudio e imagem passa a aparecer em Uso de IA** **Limite por contato.** A IA passa a atender o mesmo contato até 50 vezes por hora e 150 vezes por dia. Ao passar disso, ela para de responder àquele contato, avisa o cliente de que uma pessoa vai continuar, passa a conversa para a fila de atendimento humano e abre um aviso na Central de avisos — um aviso por ocorrência, não um por mensagem. Isso protege o seu gasto de IA contra robôs e conversas em laço, em que um único número consome o que seria de todos os outros clientes.

  A conversa volta ao automático pelo botão "Devolver ao automático" no cabeçalho dela, e a contagem daquele contato recomeça. Os dois números são ajustados por quem administra a organização, em **Uso de IA › Limite de respostas automáticas por contato**; 0 desliga aquela janela. Uma conversa comum não chega perto do limite padrão.

  **Gasto de áudio e imagem.** A transcrição de áudios e a leitura de imagens enviadas pelos clientes agora entram na conta de Uso de IA e no limite mensal de gasto. Antes, essas chamadas eram pagas ao provedor mas não apareciam no total.

  **O que você pode notar depois de atualizar:** o gasto exibido em Uso de IA sobe, porque passa a refletir o que já era cobrado. Quem ligou "Parar a IA ao chegar no limite" pode atingir o limite mensal antes do que atingia. Quando o serviço de transcrição não informa a duração do áudio, a tela avisa que parte do gasto não entra na conta.

- **O quadro do funil ganhou o botão Trocar de funil** No quadro de um funil, ao lado do nome, há agora o botão **Trocar de funil**. Ele lista todos os funis da empresa, na mesma ordem da tela de Funis, com o que está aberto marcado. Escolher outro abre o quadro dele, sem voltar à lista.

  - O atalho **Quadro do funil** do menu continua abrindo o funil principal; o botão é o caminho para os demais.
  - A última linha, **Ver todos os funis**, leva à lista, onde se cria, renomeia e arquiva.
  - Os filtros da tela não acompanham a troca: cada funil tem as suas etapas e os seus responsáveis.
  - Funil arquivado não aparece na lista do botão.

- **Riscos de Perda — resgatar quem esfriou com um disparo em massa** A tela **Riscos de Perda** ganhou o botão **Resgatar com disparo em massa**, acima da lista. Ele leva as pessoas da situação escolhida (Todos, Crítico, Em risco ou Em voo) para uma campanha.

  - O botão **não envia nada**: guarda as pessoas numa lista salva, com a situação, o dia e a hora no nome, e abre a tela de nova campanha com elas já no público. Dali em diante é o disparo de sempre, pela API Oficial ou por QR code.
  - Em **Todos**, quem está em voo fica de fora, porque já tem retorno marcado; a janela diz quantos. Em **Em voo**, a janela avisa antes de seguir.
  - Todas as proteções do disparo continuam valendo: quem pediu para não receber, quem está sem telefone e quem já está em outra campanha não entram, e a tela de campanha diz quantos ficaram de fora e por quê.
  - O botão aparece para gerente e administrador, que são quem cria campanha.

  A tela de nova campanha passou a aceitar uma lista salva no endereço (`/app/campaigns/new?lista=<id>`): a lista entra no público sozinha, pelo mesmo caminho do botão **Usar esta lista**.

### Alterado

- **O manual do usuário foi revisado página por página para o menu novo** O manual que vem dentro do sistema (link **Manual** do menu) foi conferido tela por tela contra o produto atual: nomes novos do menu (Conversas, Riscos de Perda, Compromissos, Aguardando Humano), o caminho de cada tela, o onboarding de cinco passos, o disparo em massa com galeria de modelos e listas salvas, e a tela de **Licença**, que ganhou página própria. Os prints de Licença, Atualização, Etiquetas, Nova campanha e do painel do dono foram refeitos.

- **Regra anotada pelo agente de IA passa a precisar da aprovação de um gestor** Quando um agente de IA anota uma regra para a memória da organização — o que vale para todos os atendimentos —, ela agora nasce como **proposta**. A regra só passa a ser seguida depois que alguém com papel de gestor ou administrador a aprova em **Memória da IA**, no cartão novo "Propostas do agente". Enquanto ninguém decide, nenhum agente a segue, e um aviso fica aberto na Central de avisos.

  Antes, a anotação passava a valer na hora, para todos os clientes, sem ninguém ler. Como o agente pode anotar a pedido de quem está do outro lado da conversa, isso deixava um cliente ditar regra para o atendimento dos outros.

  **O que muda para você:** regras que já estavam ativas continuam ativas. As novas anotações do agente esperam a sua aprovação — se você contava com elas valendo na hora, passe a conferir o cartão de propostas. O que você mesmo escreve em Memória da IA continua valendo assim que salva.

  **Recomendamos atualizar.** Esta é uma correção de segurança.

- **Riscos de Perda — os contadores filtram a lista e cada linha diz para onde leva** A tela **Riscos de Perda** foi redesenhada.

  - Os contadores do alto viraram cartões clicáveis: **Todos**, **Crítico**, **Em risco** e **Em voo**. Clicar em um mostra só os negócios daquela situação. Antes eles pareciam filtro e não filtravam.
  - Cada linha mostra o **nome do cliente em destaque**, o título do negócio, há quanto tempo está parado (em dias, a partir de dois dias), o funil e a etapa, o dono e se há retorno agendado.
  - O clique deixou de variar: a linha e o botão **Abrir conversa** levam sempre à conversa com o cliente, e **Ver no funil** abre o cartão do negócio no funil. Quando o cliente ainda não tem conversa, a linha avisa e leva ao cartão no funil. Antes, a mesma lista abria ora a conversa, ora o funil, sem dizer qual.
  - Quando o cliente tem mais de uma conversa, abre a mais recente.
  - As listas **Sem próximo passo**, **Propostas vencidas** e **Propostas para revisar** saíram das caixas amarelas e ficaram na faixa **Também pedem atenção**. Cada item agora é clicável: abre a conversa, o cartão no funil ou a proposta.
  - **Mostrar mais** traz as próximas 50 linhas; antes a tela parava nas 50 primeiras.
  - A lista escolhida fica guardada no endereço: ao voltar de uma conversa, a tela continua no mesmo filtro.

  O texto “Sem próximo passo agendado” da linha passou a ser “Sem retorno agendado”, para não se confundir com a lista de demandas sem próximo passo.

- **O painel Todo dia ganhou atalho direto ao quadro do funil (kanban), Follow-ups e o Manual em destaque** O painel **Todo dia**, ao lado da faixa do menu, mudou em quatro pontos:

  - **Quadro do funil** (com a palavra *kanban* embaixo do nome) é o primeiro item de **Gestão de Clientes CRM** e abre direto o quadro do funil principal (o marcado como padrão; sem marca, o primeiro da lista). **Funis**, logo abaixo, continua sendo a lista, onde se abre outro funil e se cria, renomeia ou arquiva. Com um quadro aberto, o menu passa a mostrar **Quadro do funil** como a tela atual. Na busca (Ctrl K), a tela aparece também por *kanban* e *pipeline*.
  - **Follow-ups** entrou no grupo **Leads**, logo depois de **Riscos de Perda**. Aparece para Gerente ou acima, como antes. Ele saiu de **Agente › Montar o agente**.
  - **Comandas** e **Chamadas** saíram de Todo dia. Agora ficam em **Vender**, na faixa à esquerda: Comandas no grupo **O que você vende** e Chamadas em **Como a equipe vende**. As duas continuam abrindo pela busca (Ctrl K) e pela página de área do CRM.
  - O **Manual** saiu do rodapé do painel e virou um cartão em destaque no fim da lista, sob o título **Dúvidas? Consulte o manual**. Ele continua abrindo numa aba nova, e também está no menu **Você**.

  O grupo **Se a sua empresa usa** passa a ter só **Propostas**, e por isso só aparece na empresa que ligou esse recurso.

  Nenhum endereço mudou: links salvos e favoritos continuam funcionando, e quem vê cada tela é o mesmo de antes.

### Corrigido

- **Correção de segurança na forma como os anexos das conversas chegam ao navegador** Fotos, áudios, vídeos e PDFs recebidos continuam abrindo na conversa como antes. Qualquer outro tipo de arquivo — Word, Excel, compactados e tipos que o sistema não reconhece — agora é sempre **baixado**, em vez de o navegador tentar abri-lo numa aba. Vale para anexos de mensagens e de notas internas.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança nos avisos de mensagem editada e apagada do WhatsApp por QR code** Quando o WhatsApp avisa que uma mensagem foi editada ou apagada, o sistema passa a conferir se o aviso veio do mesmo número e do mesmo autor da mensagem antes de alterá-la. Mensagens editadas e apagadas continuam aparecendo na conversa como antes.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança nas permissões de contatos, mensagens e financeiro** As permissões por papel (somente leitura, atendente, gerente, admin) já valiam em todas as telas. Agora valem também no banco de dados, para contatos, mensagens e todo o financeiro — inclusive para apagar. Quem tem o papel "somente leitura" continua vendo tudo o que via e não consegue alterar nem apagar contatos, mensagens ou lançamentos por nenhum caminho.

  Desbloquear um contato que pediu para não receber mensagens continua sendo feito só pelo administrador, na tela do contato. Nada muda no dia a dia de atendentes, gerentes e administradores.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **A busca do menu acha a tela pelo nome antigo também em inglês e espanhol** Quem usa o sistema em inglês ou espanhol e digita na busca (Ctrl K) o nome que a tela tinha antes — por exemplo **Credentials**, **Runs** ou **Credenciales** — volta a encontrar a tela com o nome novo. Antes isso só funcionava em português.

  No catálogo de chinês, os nomes novos do menu deixaram de repetir a tradução do nome antigo, e os que faltavam foram traduzidos.

- **Correção de segurança na busca de anexos do WhatsApp por QR code** O sistema ficou mais rigoroso ao buscar um anexo recém-chegado no serviço do WhatsApp por QR code: o pedido só é feito ao endereço configurado da instalação e só alcança os arquivos do próprio número. Nada muda para quem atende — fotos, áudios, vídeos e documentos continuam abrindo como antes.

  **Recomendamos atualizar.** Esta é uma correção de segurança. Depois de atualizar, vale trocar a chave do serviço de WhatsApp da instalação; é uma precaução, e o sistema continua funcionando sem a troca.

- **Correção de segurança na fila de mensagens e na configuração do agente de IA** O roteiro do agente, as habilidades, a memória da organização, os ajustes anti-banimento de cada número, o registro de gasto de IA e a fila de mensagens agendadas passam a ser gravados só pelo servidor, depois de conferir o papel de quem pediu. Antes, as telas já exigiam o papel certo, mas o banco de dados aceitava a gravação de qualquer membro da organização.

  Nada muda no uso: quem configura o agente e os números continua fazendo isso pelas mesmas telas, e as leituras seguem iguais.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança: a configuração inicial da empresa é feita só por quem administra** O assistente de configuração inicial (nome da empresa, agente, funil, chave de IA) passa a aceitar só quem tem o papel de administrador. Para o administrador nada muda.

  Quem tem outro papel e entra numa empresa que ainda não terminou a configuração vê uma tela de espera — "Configuração em andamento" — em vez do assistente, e entra normalmente assim que o administrador concluir.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança na permissão para criar contatos** Criar contato já exigia o papel de atendente (ou acima) em todas as telas e importações. Agora o banco de dados exige o mesmo: quem tem o papel "somente leitura" não consegue criar contato por nenhum caminho. Com isso, criar, alterar e apagar contatos seguem a mesma regra na tela e no banco.

  Nada muda no dia a dia de atendentes, gerentes e administradores, nem nos contatos que chegam por formulário, WhatsApp ou integração.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança: mensagens, planilhas e páginas muito grandes não travam mais o sistema** Três pontos do sistema podiam ficar parados por muito tempo ao receber um conteúdo montado para dar trabalho: uma mensagem de WhatsApp com milhares de espaços, uma planilha XLSX malformada na importação de empresas, e uma página de site adicionada à base de conhecimento do agente. Enquanto isso acontecia, o sistema parava de responder para todos. Os três foram corrigidos.

  O que muda para quem usa: a importação por planilha XLSX passa a aceitar no máximo 200 colunas, e uma planilha que ocupe mais de 20 MB depois de aberta é recusada com aviso — divida o arquivo em partes. O reconhecimento de quem pede para não receber mais mensagens continua igual.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança na fila de exclusão de arquivos** A fila que apaga arquivos do armazenamento — usada quando um contato é anonimizado (LGPD) e na limpeza de mídia vencida — passou a ser gravada só pelo próprio servidor, que agora confere se cada arquivo pertence à empresa antes de apagá-lo. Nada muda nas telas: anonimizar um contato e a limpeza automática continuam funcionando como antes.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança (LGPD): formulário público não desfaz a recusa de um contato** Quando um contato já tinha recusado receber marketing, ou tinha pedido para não receber mais mensagens, um formulário público de captação preenchido com o telefone dele marcava o contato como "aceitou" de novo e liberava o atendimento pela IA. Um formulário público não prova quem o preencheu, então a recusa agora **permanece**. O lead continua entrando normalmente, e a equipe vê que a pessoa voltou a procurar a empresa.

  O que não muda: contato novo, e contato que nunca recusou, seguem sendo registrados com a resposta do formulário. Fontes de captação com assinatura configurada continuam podendo atualizar o consentimento. Toda mudança de consentimento feita por formulário passa a aparecer na auditoria.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança na aprovação de retomada de contato** Quando alguém aprova ou descarta a sugestão de retomar um negócio parado, a decisão e o agendamento da mensagem passam a ser gravados pelo servidor, depois de conferir que a pessoa enxerga aquele negócio. Antes, essas duas gravações eram feitas com a sessão de quem estava na tela. Nada muda no uso: aprovar continua agendando a mensagem, e descartar continua só registrando a decisão.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança na checagem de leads repetidos das fontes de captação** Quando uma integração ou um formulário envia um lead com um identificador próprio, o sistema usa esse identificador para não criar o mesmo lead duas vezes. Essa checagem passa a valer **por fonte de captação**: cada formulário e cada integração tem os seus próprios identificadores.

  Antes, a checagem era feita para a organização inteira. Quem preenchesse um formulário público usando o identificador que uma integração assinada ia enviar fazia o lead da integração ser tratado como repetido — e ele não era criado.

  Nada muda no uso: o reenvio do mesmo lead pela mesma fonte continua sem duplicar. Os leads que já existem são preservados; a atualização só passa a registrar, em cada um, de qual fonte ele veio.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Riscos de Perda — o nome do cliente não aparece duas vezes na mesma linha** Na tela **Riscos de Perda**, quando o título do negócio era igual ao nome do cliente (o caso do negócio criado a partir de uma conversa), a linha mostrava o nome duas vezes, um embaixo do outro. Agora o título só aparece quando diz algo além do nome.

  Cliente cujo nome é só o número do telefone passa a mostrar um ícone de pessoa no lugar de iniciais sem sentido ("+5").

- **Correção de segurança nas credenciais das conexões de WhatsApp** O código do endereço dos avisos do WhatsApp, o segredo que assina esses avisos e as credenciais da conexão oficial (Meta) deixaram de ser legíveis pela sessão dos usuários — inclusive a de quem administra. Essas informações passam a ser lidas só pelo servidor, nas rotas que precisam delas e depois de conferir o papel de quem pediu.

  Nada muda nas telas: Conexões, o inbox e os disparos continuam mostrando os números, o estado de cada um e a saúde da conexão como antes.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

- **Correção de segurança: os códigos antigos dos avisos do WhatsApp por QR code são trocados** Cada número de WhatsApp conectado por QR code tem um código interno que identifica os avisos dele. Esse código ficou legível por qualquer membro da organização até a versão anterior. Nesta atualização, os códigos que já existiam são trocados uma única vez, e os antigos deixam de valer.

  Nada muda no uso: os números continuam conectados e recebendo mensagens — o sistema recebe os avisos por um caminho interno que não depende desse código. Números da conexão oficial (Meta) não são alterados.

  **Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

## [1.0.1] — 2026-11-10

### Corrigido

- **A instalação não mostra mais um erro de "arquivo não encontrado" na tela** Quem instalava sem a implantação contínua via, no meio da instalação, a linha `.zapsales-revisao: No such file or directory`. Era só ruído (a instalação seguia certa), mas parecia falha logo na primeira impressão. A mensagem deixou de aparecer.

- **Depois de «Tentar renovar agora», a licença renovada vale na hora em todas as telas** Quem estava barrado pela licença clicava em **Tentar renovar agora**, via «Licença renovada.» e continuava barrado por até 30 segundos, com o título da tela ainda dizendo «Licença bloqueada». A renovação esquecia a decisão antiga só numa parte do sistema; as outras seguiam com a decisão velha até ela vencer sozinha. Agora a decisão é lembrada num lugar só, e a renovação vale para as telas e para a API no mesmo instante.

## [1.0.0] — 2026-11-10

### Adicionado

- **A primeira versão publicada do ZapSales.** Um CRM de WhatsApp com funil (Kanban), inbox, contatos, agentes de IA e campanhas em massa, que roda na sua própria VPS. Quem instala por número de versão (`1.0.0`) não depende mais de construir o programa na máquina: as imagens já vêm prontas, para Ubuntu 24.04 e 26.04, em processadores comuns (amd64) e ARM.
- **Instalação numa VPS com um comando, ou pela página do instalador.** HTTPS automático, guia de cada pergunta, convivência com outros sites na mesma máquina, backup diário, cópia semanal criptografada e ensaio de restauração. Rodar o mesmo comando de novo é a atualização: ela mantém segredos, administrador e dados.
- **Atendimento no WhatsApp pelos dois caminhos:** a API Oficial da Meta (recomendada para campanha) e o WAHA, por QR code (atendimento). Quem responde a uma campanha cai no funil e no agente, com o contexto do que foi enviado.
- **Agentes de IA** que atendem, qualificam e movem o funil junto com a equipe: criação passo a passo com sugestões por tipo de negócio, conhecimento próprio da empresa, modelos prontos por ramo, consulta a outros sistemas (estoque, planilha, ERP, Make, n8n) e **ações em outros sistemas sempre com a sua aprovação**.
- **Campanhas em massa pela API Oficial**, com modelos aprovados escolhidos numa galeria, público escolhido numa tabela de pessoas ou por planilha CSV, listas salvas, estimativa de custo antes do disparo, teto de gasto e acompanhamento ao vivo.
- **Follow-ups automáticos**, agenda, comandas, equipe com papéis, auditoria em linguagem de gente e **LGPD de fábrica** (exportação e anonimização).
- **Licença do produto dentro do sistema:** a instalação ativa a licença da compra (e termina mesmo sem ela), mostra a situação numa faixa e numa tela de Licença, e se renova sozinha.
- **Manual do usuário completo, aberto de dentro do sistema** pelo link «Manual» do menu: cada menu, tela e botão, com prints anotados e busca.
- **Menu novo, organizado pelo que a pessoa faz no dia:** uma faixa com o painel «Todo dia» no computador, uma barra de baixo no celular, nomes simples com o termo técnico à vista e busca que acha pelos dois. O primeiro acesso guia a configuração, com modelos prontos por ramo.

### Alterado

- **A trava de licença passa a valer nas instalações novas.** Se uma compra é reembolsada ou sofre chargeback, o servidor de licenças bloqueia a licença e a instalação **ativada** com ela deixa de operar. Os dados continuam preservados, e login, exportação dos próprios dados e a tela de Licença seguem liberados. Instalação que nunca foi ativada funciona como uso não comercial. Quem quiser que a trava só observe roda `sudo kit/licenca-modo.sh sombra`.
- **A licença do ZapSales é a PolyForm Noncommercial, com licença comercial para uso em empresa** (antes era MIT). Veja `LICENSING.md`.

[Não lançado]: https://github.com/futuristasai/ZapSales/compare/v1.5.3...HEAD
[1.5.3]: https://github.com/futuristasai/ZapSales/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/futuristasai/ZapSales/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/futuristasai/ZapSales/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/futuristasai/ZapSales/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/futuristasai/ZapSales/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/futuristasai/ZapSales/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/futuristasai/ZapSales/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/futuristasai/ZapSales/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/futuristasai/ZapSales/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/futuristasai/ZapSales/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/futuristasai/ZapSales/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/futuristasai/ZapSales/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/futuristasai/ZapSales/releases/tag/v1.0.0

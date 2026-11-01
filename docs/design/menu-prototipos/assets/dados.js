/* Dados dos protótipos: os 63 destinos REAIS de lib/navigation/catalogo.ts (nenhum inventado), reagrupados.
   Campos: id=rota real · antes=rótulo de hoje · rot=rótulo proposto · tec=termo técnico (ou null) · ic=ícone do produto
   bloco/tema=onde fica no menu novo · min=papel mínimo (igual ao catálogo) · opc=só aparece se a empresa usa o recurso
   g/sb=onde estava no menu de hoje (grupo e se estava no menu lateral). Contadores e saúde são dados de exemplo. */
(function () {
  const RANK = { viewer: 1, agent: 2, manager: 3, admin: 4 };
  const PAPEIS = [
    { id: "admin", nome: "Dono", pessoa: "Marina Alves", papel: "Dono · administra tudo" },
    { id: "manager", nome: "Gerente", pessoa: "Rafael Nunes", papel: "Gerente" },
    { id: "agent", nome: "Atendente", pessoa: "Camila Duarte", papel: "Atendente" },
    { id: "viewer", nome: "Leitor", pessoa: "Joana Prado", papel: "Só leitura" },
  ];

  const BLOCOS = [
    { id: "dia", rot: "Todo dia", ic: "House", frase: "O que se abre toda hora para atender, vender e acompanhar a IA." },
    { id: "montar", rot: "Configurar", ic: "Wrench", frase: "O que você ajusta de vez em quando: agente, vendas, conexões, empresa." },
    { id: "acompanhar", rot: "Resultados", ic: "ChartPieSlice", frase: "Os números, o trabalho da equipe e da IA, e o que investigar." },
  ];
  const TEMAS = [
    { id: "principal", bloco: "dia", rot: "Todo dia", ic: "House" },
    { id: "opcional", bloco: "dia", rot: "Se a sua empresa usa", ic: "Stack" },
    { id: "vender", bloco: "montar", rot: "Vender melhor", ic: "Storefront", frase: "Funil, produtos, propostas e o que a equipe usa para vender." },
    { id: "agente", bloco: "montar", rot: "Seu agente de IA", ic: "Robot", frase: "Configurar, ensinar e conectar o agente que atende por você." },
    { id: "conexoes", bloco: "montar", rot: "Números e conexões", ic: "Plugs", frase: "WhatsApp, anúncios e outros sistemas conversando com o seu." },
    { id: "empresa", bloco: "montar", rot: "Empresa e equipe", ic: "Buildings", frase: "Quem trabalha aqui, plano, marca e regras da empresa." },
    { id: "resultados", bloco: "acompanhar", rot: "Números do negócio", ic: "ChartBar", frase: "Quanto vendeu, quanto custou trazer cliente e quanto entrou." },
    { id: "trabalho", bloco: "acompanhar", rot: "Equipe e IA", ic: "UsersThree", frase: "O que a equipe e os agentes fizeram e como estão evoluindo." },
    { id: "problemas", bloco: "acompanhar", rot: "Quando algo dá errado", ic: "Warning", frase: "Histórico detalhado para descobrir o que aconteceu." },
    { id: "conta", bloco: "voce", rot: "Você", ic: "UserCircle" },
  ];

  const D = (id, antes, rot, tec, ic, tema, min, opc, desc, g, sb, extra) =>
    Object.assign({ id, href: "/app" + id, antes, rot, tec, ic, tema, min, opc: !!opc, desc, g, sb: !!sb }, extra || {});

  const DESTINOS = [
    // ── Todo dia ──
    D("/inbox", "Inbox", "Conversas", "inbox", "Inbox", "principal", "viewer", 0, "As conversas de WhatsApp, com você e a IA atendendo lado a lado.", "Atendimento", 1, { n: "fila" }),
    D("/radar", "Radar", "Riscos de Perda", null, "ClockCountdown", "principal", "viewer", 0, "Quem esfriou e ainda está aberto — o que corre risco de morrer sem resposta.", "Atendimento", 1),
    D("/kanban", "Funis", "Funis", null, "FunilEmEtapas", "principal", "viewer", 0, "Seus funis de venda — clique em um para abrir o quadro de clientes.", "CRM", 1),
    D("/ai/cases", "Casos", "Aguardando Humano", null, "ClipboardText", "principal", "agent", 0, "Os casos em que a IA pediu ajuda e esperam uma pessoa — e o histórico dos que ela conduziu até o fim.", "Agente de IA", 1, { n: "casos" }),
    D("/ai/inbox", "Alertas", "Alertas", null, "Flag", "principal", "viewer", 0, "O que a IA encontrou e precisa de uma decisão sua.", "Agente de IA", 0, { n: "alertas" }),
    D("/contacts", "Contatos", "Contatos", null, "Users", "principal", "viewer", 0, "As pessoas do outro lado da conversa e o histórico de cada uma.", "CRM", 1),
    D("/tasks", "Tarefas", "Tarefas", null, "ListChecks", "principal", "viewer", 0, "O que ficou combinado, com prazo — e o que já venceu sem ninguém fazer.", "CRM", 1, { n: "tarefas" }),
    D("/agenda", "Agenda", "Compromissos", null, "CalendarBlank", "principal", "viewer", 0, "O que está marcado, com quem, e quem atende — seu e da equipe.", "Atendimento", 1),
    D("/campaigns", "Disparo em massa", "Disparo em massa", null, "Megaphone", "principal", "manager", 0, "Mande uma mensagem para muita gente de uma vez — suba uma planilha CSV ou escolha contatos.", "CRM", 1),
    D("/proposals", "Propostas", "Propostas", null, "Signature", "opcional", "viewer", 1, "Rascunhe, revise e envie propostas comerciais — do orçamento ao aceite.", "CRM", 0),
    D("/comandas", "Comandas", "Comandas", null, "Receipt", "opcional", "viewer", 1, "O que foi feito, por quem, e quanto o cliente paga — o balcão do dia.", "CRM", 0),
    D("/calls", "Chamadas", "Chamadas", null, "Phone", "opcional", "manager", 1, "Histórico de ligações (voz por IA) com transcrição.", "CRM", 0),

    // ── Configurar › Vender melhor ──
    D("/settings/tenant/pipelines", "Etapas do funil", "Etapas do funil", null, "Funnel", "vender", "manager", 0, "As colunas de cada funil, o vocabulário do negócio e os motivos de perda.", "CRM", 0),
    D("/products", "Produtos", "Produtos", null, "Storefront", "vender", "viewer", 0, "O catálogo da loja, com o preço que o atendente de IA responde.", "CRM", 0),
    D("/templates", "Respostas rápidas", "Respostas rápidas", null, "Lightning", "vender", "viewer", 0, "Scripts salvos para responder mais rápido, seus ou da equipe.", "Atendimento", 1),
    D("/settings/tags", "Tags", "Etiquetas", "tags", "Tag", "vender", "manager", 0, "O vocabulário de etiquetas da empresa: renomear, juntar ou excluir.", "Configurações", 0),
    D("/settings/tenant/agenda", "Tipos de agendamento", "Tipos de agendamento", null, "CalendarCheck", "vender", "viewer", 0, "O que se pode marcar, quanto dura, onde acontece e quem atende.", "Configurações", 0),
    D("/prospecting", "Prospecção", "Prospecção", null, "Binoculars", "vender", "admin", 0, "Busque empresas e conduza abordagens graduais com IA.", "CRM", 0),
    D("/imports", "Importações", "Importações", "CSV / XLSX", "UploadSimple", "vender", "manager", 1, "Lotes de empresas, pessoas e telefones vindos de planilha.", "CRM", 0),
    D("/companies", "Empresas", "Empresas", "B2B", "Buildings", "vender", "viewer", 1, "Cadastro de empresas — razão social, CNPJ e decisores.", "CRM", 0),
    D("/people", "Pessoas", "Pessoas", "B2B", "UserList", "vender", "viewer", 1, "Decisores e contatos ligados a empresas, com vários telefones.", "CRM", 0),
    D("/settings/tenant/proposals", "Propostas", "Padrões de proposta", null, "Files", "vender", "manager", 1, "Validade padrão e condições das propostas comerciais.", "Configurações", 0),
    D("/settings/tenant/proposals/modelos", "Modelos de proposta", "Modelos de proposta", null, "FileText", "vender", "manager", 1, "Personalize os modelos da plataforma ou crie os da sua empresa.", "Configurações", 0),

    // ── Configurar › Seu agente de IA ──
    D("/ai/agents", "Agentes", "Agentes", null, "AgenteEmConversa", "agente", "manager", 0, "Quem atende por você: instruções, modelo, ferramentas e publicação.", "Agente de IA", 1),
    D("/ai/followups", "Follow-ups", "Follow-ups", null, "FlowArrow", "agente", "manager", 0, "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silêncio.", "Agente de IA", 1),
    D("/ai/atendimento", "Fluxos de atendimento", "Fluxos de atendimento", null, "TreeStructure", "agente", "manager", 1, "Perguntas que a IA conduz durante a conversa, com as respostas guardadas na ficha.", "Agente de IA", 0),
    D("/ai/routers", "Roteadores", "Quem atende cada conversa", "roteadores", "PassagemParaHumano", "agente", "manager", 0, "Qual agente pega qual conversa, e quando o humano assume.", "Agente de IA", 0),
    D("/ai/knowledge/sources", "Conhecimento", "Conhecimento", "RAG", "BookOpen", "agente", "manager", 0, "Os materiais que o agente consulta antes de responder sobre o seu negócio.", "Agente de IA", 0),
    D("/ai/memory", "Memória", "Memória", null, "Brain", "agente", "manager", 0, "O que o agente já aprendeu sobre a sua operação e reaproveita.", "Agente de IA", 0),
    D("/ai/skills", "Skills", "O que o agente sabe fazer", "skills", "MagicWand", "agente", "manager", 0, "As ações que o agente pode executar sozinho durante o atendimento.", "Agente de IA", 0),
    D("/ai/external-tools", "Ferramentas externas", "Conectar outros sistemas", "MCP", "Signpost", "agente", "manager", 0, "Consultas e ações em outro sistema (estoque, planilha, ERP) que o agente faz na conversa.", "Agente de IA", 0),
    D("/ai/credentials", "Credenciais", "Chave da IA", "API key", "Key", "agente", "manager", 0, "A chave do provedor de IA que os agentes usam para pensar.", "Agente de IA", 0),
    D("/ai/providers", "Provedores", "Qual IA usar", "provedores", "Plugs", "agente", "manager", 0, "Escolha qual inteligência atende cada parte do sistema.", "Agente de IA", 0),
    D("/ai/cases/avisos", "Aviso no WhatsApp", "Aviso no WhatsApp", null, "PaperPlaneTilt", "agente", "admin", 0, "Receber no WhatsApp quando o assistente abrir um caso.", "Agente de IA", 0),

    // ── Configurar › Números e conexões ──
    D("/connections", "Conexões", "Conexões", null, "PlugsConnected", "conexoes", "admin", 0, "Seus números de WhatsApp: por QR ou canal oficial da Meta, com saúde, reconexão e templates.", "Canais", 1, { saude: "alerta" }),
    D("/webhooks", "Webhooks", "Avisar outros sistemas", "webhooks", "WebhooksLogo", "conexoes", "manager", 0, "Avise outros sistemas quando algo acontecer aqui dentro.", "Canais", 1),
    D("/settings/api-tokens", "API Tokens", "Chaves de acesso", "API tokens", "Lock", "conexoes", "admin", 0, "Chaves para outro sistema conversar com o seu CRM.", "Configurações", 0),
    D("/settings/voip-trunk", "Linha telefônica (SIP)", "Linha telefônica", "SIP", "PhoneTransfer", "conexoes", "admin", 0, "Os dados da operadora de telefonia para a IA fazer e receber chamadas.", "Configurações", 0),
    D("/integracao-dados", "Dados externos", "Dados de outro sistema", "banco externo", "Database", "conexoes", "viewer", 1, "Conecte um banco de dados de outro sistema para o agente consultar em tempo real.", "Configurações", 0),
    D("/settings/meta-ads", "Meta Ads", "Conta de anúncios", "Meta Ads", "Target", "conexoes", "admin", 0, "Conectar a conta de anúncios para ler o desempenho das campanhas.", "Configurações", 0),
    D("/settings/conversoes", "Conversões", "Conversões", "CAPI", "TrendUp", "conexoes", "admin", 0, "Devolver ao anúncio as vendas que ele trouxe, e marcar a origem de quem chega pelo site.", "Configurações", 0),

    // ── Configurar › Empresa e equipe ──
    D("/team", "Equipe", "Equipe", null, "UsersThree", "empresa", "viewer", 0, "Quem trabalha aqui, com qual papel e quanta conversa cada um aguenta.", "Configurações", 0),
    D("/settings/atendimento", "Distribuição de atendimento", "Revezamento da equipe", "round-robin", "Shuffle", "empresa", "manager", 0, "Quem recebe cada cliente novo, e o que cada atendente enxerga.", "Configurações", 0),
    D("/settings/tenant/financeiro", "Financeiro", "Financeiro", null, "Wallet", "empresa", "viewer", 0, "Contas, formas de pagamento e como cada lançamento é classificado.", "Configurações", 0),
    D("/settings/tenant", "Organização", "Dados da empresa", "organização", "Briefcase", "empresa", "admin", 0, "Dados da empresa, retenção de dados e encarregado de LGPD.", "Configurações", 0),
    D("/settings/marca", "Marca", "Marca", null, "Palette", "empresa", "admin", 0, "O nome e a cor que sua empresa mostra dentro do sistema.", "Configurações", 0),
    D("/settings/billing", "Plano e cobrança", "Plano e cobrança", null, "CreditCard", "empresa", "admin", 0, "O plano contratado e as cobranças da sua empresa.", "Configurações", 0),
    D("/lgpd/requests", "LGPD", "LGPD", null, "ScalesSimple", "empresa", "admin", 0, "Pedidos de exportação e exclusão de dados feitos por clientes.", "Configurações", 0),
    D("/settings/recursos", "Recursos opcionais", "Recursos opcionais", null, "ToggleRight", "empresa", "manager", 0, "Tudo o que se liga e desliga, se está ligado e onde se ajusta.", "Configurações", 0),
    D("/extensions", "Extensões", "Extensões", null, "PuzzlePiece", "empresa", "viewer", 0, "Guias instalados para orientar o trabalho no CRM, com permissões e estado visíveis.", "Configurações", 0),

    // ── Resultados ──
    D("/metrics", "Desempenho", "Desempenho", null, "ChartBar", "resultados", "viewer", 0, "Funil e performance por atendente nos últimos 30 dias.", "Análise", 1),
    D("/ads/meta", "Meta Ads", "Meta Ads", null, "Target", "resultados", "manager", 0, "Quanto custou cada resultado das campanhas que trazem gente para cá.", "Análise", 1),
    D("/faturamento", "Faturamento", "Faturamento", null, "CurrencyCircleDollar", "resultados", "viewer", 0, "Quanto entrou, de que forma, e quanto cada pessoa tem a receber.", "Análise", 0),
    D("/honorarios", "Honorários", "Honorários", null, "HandCoins", "resultados", "viewer", 1, "O modelo de cobrança de cada caso e o calendário de parcelas.", "Análise", 0),
    D("/activities", "Atividades", "Atividades", null, "ClockCounterClockwise", "trabalho", "viewer", 0, "Relatório do que a equipe e os agentes fizeram no período: quanto, quem e de que tipo.", "Análise", 0),
    D("/ai/evolution", "Evolução da IA", "Evolução da IA", null, "ChartLineUp", "trabalho", "manager", 0, "Se o agente está melhorando, onde ele erra e o que falta ensinar.", "Análise", 0),
    D("/ai/proposals", "Sugestões da IA", "Sugestões da IA", null, "Lightbulb", "trabalho", "viewer", 0, "Melhorias que a IA sugere para si mesma, esperando sua decisão.", "Agente de IA", 0),
    D("/ai/usage", "Uso e orçamento", "Uso e orçamento", null, "Gauge", "trabalho", "manager", 0, "Quanto a IA consumiu e qual é o teto de gasto do mês.", "Agente de IA", 0),
    D("/ai/runs", "Execuções", "Histórico do agente", "logs", "Pulse", "problemas", "manager", 0, "O que a IA fez — e, quando falhou, o que aconteceu e o que fazer.", "Agente de IA", 0),
    D("/audit", "Auditoria", "Quem mexeu em quê", "audit log", "ListMagnifyingGlass", "problemas", "manager", 0, "Quem mudou o quê, e quando — o histórico que não se apaga.", "Análise", 0),

    // ── Você (menu da conta) ──
    D("/settings/profile", "Perfil", "Perfil", null, "UserCircle", "conta", "viewer", 0, "Seu nome, idioma, fuso horário e avatar.", "Configurações", 0),
    D("/settings/security", "Segurança", "Segurança", "MFA", "ShieldCheck", "conta", "viewer", 0, "Verificação em duas etapas, códigos de recuperação e sessões.", "Configurações", 0),
    D("/settings/notifications", "Notificações", "Notificações", null, "Bell", "conta", "viewer", 0, "Por onde e sobre o quê você quer ser avisado.", "Configurações", 0),
  ];
  DESTINOS.forEach((d) => { d.bloco = (TEMAS.find((t) => t.id === d.tema) || {}).bloco; });

  const HUB = { CRM: "Ver tudo em CRM", "Agente de IA": "Ver tudo em IA", "Análise": "Ver tudo em Análise", "Configurações": "Configurações", Atendimento: "", Canais: "" };
  DESTINOS.forEach((d) => { d.hoje = d.sb ? "Menu lateral › " + d.g : d.g + (HUB[d.g] ? " › " + HUB[d.g] : "") + " (fora do menu lateral)"; });

  const CONTADORES = { fila: 7, casos: 3, alertas: 2, tarefas: 4 };

  const CONVERSAS = [
    { n: "Camila Rocha", i: "CR", p: "Quero remarcar para quinta, pode ser às 15h?", h: "14:32", q: "ia", e: "Agendamento" },
    { n: "Marcos Tavares", i: "MT", p: "Qual o valor do pacote com 10 sessões?", h: "14:28", q: "fila", e: "Proposta" },
    { n: "Studio Aurora", i: "SA", p: "Recebemos o orçamento, vamos analisar.", h: "14:10", q: "humano", e: "Negociação" },
    { n: "Beatriz Lemos", i: "BL", p: "Obrigada! Vou fazer o pix agora.", h: "13:55", q: "ia", e: "Fechamento" },
    { n: "Diego Furtado", i: "DF", p: "Vocês atendem aos sábados?", h: "13:41", q: "fila", e: "Novo" },
    { n: "Larissa Prado", i: "LP", p: "Pode mandar o endereço de novo?", h: "13:20", q: "humano", e: "Qualificação" },
  ];
  const ETAPAS = ["Novo", "Qualificação", "Proposta", "Negociação", "Fechamento"];

  window.ZS_DADOS = { RANK, PAPEIS, BLOCOS, TEMAS, DESTINOS, CONTADORES, CONVERSAS, ETAPAS };
})();

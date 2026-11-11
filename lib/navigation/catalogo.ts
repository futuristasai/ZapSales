import type { Role } from "@/lib/auth/types";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";

/**
 * Registro de navegação — a ÚNICA lista de destinos do app do tenant.
 *
 * Antes disto, três listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de Configurações e `TABS` na área de IA. Sete telas
 * só eram alcançáveis por dentro da própria seção e uma não tinha link nenhum.
 *
 * O menu (faixa, painel, gaveta, barra de baixo), a busca ⌘K e as páginas de área
 * são PROJEÇÕES puras deste array — nenhum deles decide o que existe, só desenha o
 * que sai daqui. Tela nova aparece em todos sem editar arquivo nenhum, e
 * `tests/unit/navegacao-completude.test.ts` reprova o CI se uma rota nascer fora
 * daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md — "por qual porta se chega até mim?"
 */

/**
 * O MODELO DO MENU (issue #183) — por frequência de uso, não por área do sistema.
 *
 * Três blocos que a pessoa entende pelo nome: o que se abre TODO DIA, o que se
 * CONFIGURA de vez em quando (em quatro áreas) e os RESULTADOS. As telas pessoais
 * moram no menu da conta ("Você"). É o único modelo: o antigo (`group`, `section`,
 * `sidebar`, os grupos com "Ver tudo em…" e o limite de 15 itens) saiu na issue #192.
 *
 * A tela declara só o `grupo`; bloco e área SAEM da tabela de grupos abaixo. Assim
 * não existe uma tela com "bloco Resultados, área Vender" — a combinação inválida
 * não é representável, e o grupo é o único lugar onde a tela escolhe onde mora.
 */
export const MENU_BLOCOS = [
  { id: "todo-dia", label: "Todo dia" },
  { id: "configurar", label: "Configurar" },
  { id: "resultados", label: "Resultados" },
  { id: "conta", label: "Você" },
] as const;
export type BlocoDoMenu = (typeof MENU_BLOCOS)[number]["id"];

/** As áreas do bloco Configurar. */
export const MENU_AREAS = [
  { id: "vender", label: "Vender" },
  { id: "agente", label: "Agente" },
  { id: "conexoes", label: "Conexões" },
  { id: "empresa", label: "Empresa" },
] as const;
export type AreaDoMenu = (typeof MENU_AREAS)[number]["id"];

type GrupoDoMenuDeclarado = { id: string; label: string } & (
  | { bloco: Exclude<BlocoDoMenu, "configurar">; area?: never }
  | { bloco: "configurar"; area: AreaDoMenu }
);

/**
 * Os grupos por TAREFA, na ordem em que aparecem — dentro do bloco (ou da área).
 * Grupo sem tela visível não aparece; tela que não cabe em nenhum grupo não
 * compila (`PosicaoNoMenu.grupo`).
 */
export const MENU_GRUPOS = [
  // Todo dia: a mesa de trabalho.
  { id: "leads", bloco: "todo-dia", label: "Leads" },
  { id: "gestao-de-clientes", bloco: "todo-dia", label: "Gestão de Clientes CRM" },
  { id: "se-a-empresa-usa", bloco: "todo-dia", label: "Se a sua empresa usa" },
  // Configurar › Vender
  { id: "vender-funil", bloco: "configurar", area: "vender", label: "O seu funil" },
  { id: "vender-oferta", bloco: "configurar", area: "vender", label: "O que você vende" },
  { id: "vender-equipe", bloco: "configurar", area: "vender", label: "Como a equipe vende" },
  { id: "vender-cadastro", bloco: "configurar", area: "vender", label: "Cadastro de empresas" },
  // Configurar › Agente
  { id: "agente-montar", bloco: "configurar", area: "agente", label: "Montar o agente" },
  { id: "agente-ensinar", bloco: "configurar", area: "agente", label: "Ensinar o agente" },
  { id: "agente-conectar", bloco: "configurar", area: "agente", label: "Conectar a IA" },
  // Configurar › Conexões
  { id: "conexoes-whatsapp", bloco: "configurar", area: "conexoes", label: "WhatsApp e telefone" },
  { id: "conexoes-sistemas", bloco: "configurar", area: "conexoes", label: "Outros sistemas" },
  { id: "conexoes-anuncios", bloco: "configurar", area: "conexoes", label: "Anúncios" },
  // Configurar › Empresa
  { id: "empresa-equipe", bloco: "configurar", area: "empresa", label: "Equipe" },
  { id: "empresa-dados", bloco: "configurar", area: "empresa", label: "A empresa" },
  { id: "empresa-plano", bloco: "configurar", area: "empresa", label: "Plano e regras" },
  // Resultados
  { id: "resultados-negocio", bloco: "resultados", label: "Números do negócio" },
  { id: "resultados-equipe", bloco: "resultados", label: "Equipe e IA" },
  { id: "resultados-erro", bloco: "resultados", label: "Quando algo dá errado" },
  // Menu da conta
  { id: "conta-voce", bloco: "conta", label: "Você" },
] as const satisfies readonly GrupoDoMenuDeclarado[];
export type GrupoDoMenuId = (typeof MENU_GRUPOS)[number]["id"];

interface PaginaDeAreaDeclarada {
  href: string;
  label: string;
  description: string;
  icon: string;
  /** Os grupos por tarefa que a página lista, na ordem em que aparecem. */
  grupos: readonly GrupoDoMenuId[];
}

/** Onde a tela mora no menu novo. Obrigatória: tela sem posição não compila. */
export interface PosicaoNoMenu {
  grupo: GrupoDoMenuId;
  /**
   * O termo técnico, mostrado embaixo do nome ("webhooks", "API key") no menu, na
   * dica e nas páginas de área, e buscável no ⌘K. O NOME é o `label`: um só, igual no menu e na
   * busca (issue #187) — o nome de antes vira sinônimo de busca.
   */
  termo?: string;
  /** Posição dentro do grupo, a partir de 1. Única por grupo. */
  ordem: number;
}

export interface NavMetadata {
  href: string;
  label: string;
  /** Onde a tela mora no menu novo — ver `MENU_GRUPOS`. */
  menu: PosicaoNoMenu;
  /** Aparece na gaveta, nas páginas de área e é texto buscável no ⌘K. Nunca vazio. */
  description: string;
  /**
   * Outros nomes pelos quais quem procura chama esta tela, buscáveis no ⌘K mas
   * nunca mostrados. Existe porque o rótulo muda por decisão de produto e o
   * hábito não acompanha: "Campanhas" virou "Disparo em massa" e quem digitava
   * "campanha" deixou de achar a tela.
   *
   * O NOME ANTIGO entra escrito como era no menu ("Credenciais", não
   * "credenciais"): é a chave pela qual o dicionário guarda a tradução dele, e é
   * assim que quem usa em inglês acha a tela digitando "Credentials". A busca
   * ignora caixa e acento, então em português nada muda.
   */
  sinonimos?: readonly string[];
  icon: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  healthDot?: boolean;
  /**
   * Contador de pendências ao lado do rótulo. `casos`: casos em que a IA espera
   * uma pessoa (`awaiting_human`) — quem desenha é `ContadorDeCasos`. `fila`:
   * conversas que esperam uma pessoa (a aba Fila do Inbox) — `ContadorDaFila`.
   * Zero não desenha nada: número que nunca some ensina a ignorar o número.
   */
  contador?: "casos" | "fila";
  /**
   * A porta de um MÓDULO OPCIONAL da instalação (`lib/instalacao/modulos.ts`).
   * Com o módulo desligado ela some do menu, das páginas de área e do ⌘K — para todo papel.
   * É apresentação, como o resto deste arquivo: quem recusa é a tela e a rota.
   */
  modulo?: ModuloOpcional;
  /**
   * A porta de uma CAPACIDADE que a organização liga para si
   * (`lib/organizacao/capacidades.ts`). Desligada, some do menu, das páginas de área e do
   * ⌘K. Apresentação, como `modulo`: quem recusa é a tela e a rota.
   */
  capacidade?: CapacidadeDaOrganizacao;
}

/**
 * AS PÁGINAS DE ÁREA (issue #192): `/app/crm`, `/app/ai`, `/app/analise` e
 * `/app/settings`.
 *
 * Eram o "Ver tudo em…" do menu antigo. O menu novo não precisa delas para chegar
 * a nenhuma tela, mas o endereço é de quem o salvou nos favoritos — então elas
 * continuam abrindo, e a busca ⌘K as acha pelo nome. Cada uma é um INVENTÁRIO:
 * lista os grupos por tarefa do menu que declara aqui, e o que a pessoa vê dentro
 * deles é o que o menu já decide (papel, módulos, interface por empresa). Não há
 * segunda lista de telas: só a lista de grupos de cada página.
 *
 * Cada página lista, no MÍNIMO, o que o hub antigo dela listava — o piso está congelado em
 * `tests/unit/paginas-de-area.test.ts`. Como o corte é por grupo, algumas listam telas a mais.
 *
 * O texto (`label`, `description`) é o título e o subtítulo da própria página.
 * Retirar estas páginas é decisão para depois, e começa por apagar este array.
 */
export const PAGINAS_DE_AREA = [
  {
    href: "/app/crm",
    label: "Gestão de Clientes CRM",
    description: "Onde a venda acontece — e o que você define uma vez para ela funcionar.",
    icon: "AddressBook",
    // O que se abre todo dia no CRM e tudo o que se prepara em Vender.
    grupos: [
      "gestao-de-clientes",
      "se-a-empresa-usa",
      "vender-funil",
      "vender-oferta",
      "vender-equipe",
      "vender-cadastro",
    ],
  },
  {
    href: "/app/ai",
    label: "Agente de IA",
    description: "Tudo que define quem atende por você — e como acompanhar o que ele faz.",
    icon: "Sparkle",
    // Montar, ensinar e conectar a IA, e o acompanhamento que o hub antigo também listava: os casos
    // que esperam uma pessoa e os alertas (Leads) e o que a IA fez e gastou (Resultados).
    grupos: [
      "agente-montar",
      "agente-ensinar",
      "agente-conectar",
      "leads",
      "resultados-equipe",
      "resultados-erro",
    ],
  },
  {
    href: "/app/analise",
    label: "Análise",
    description: "Como o negócio foi no período — e o histórico para quando alguém perguntar por quê.",
    icon: "ChartPieSlice",
    grupos: ["resultados-negocio", "resultados-equipe", "resultados-erro"],
  },
  {
    href: "/app/settings",
    label: "Configurações",
    description: "Sua conta, os dados da empresa e quem tem acesso ao quê.",
    icon: "Gear",
    // A conta, a empresa e as conexões — e o que se prepara em Vender (agenda, propostas, etiquetas),
    // que o hub antigo de Configurações também listava.
    grupos: [
      "conta-voce",
      "empresa-equipe",
      "empresa-dados",
      "empresa-plano",
      "conexoes-whatsapp",
      "conexoes-sistemas",
      "conexoes-anuncios",
      "vender-funil",
      "vender-oferta",
      "vender-equipe",
    ],
  },
] as const satisfies readonly PaginaDeAreaDeclarada[];
export type PaginaDeAreaHref = (typeof PAGINAS_DE_AREA)[number]["href"];

/**
 * Como `minRole` foi escolhido — medido tela a tela, não estimado:
 *
 *   1. A página redireciona por papel?  → usa esse papel. Assim a navegação
 *      nunca mostra um link que morre em /403.
 *   2. Não redireciona, mas a navegação antiga já filtrava? → mantém o filtro
 *      antigo, para esta mudança reorganizar sem alterar quem vê o quê.
 *   3. Nenhum dos dois → viewer.
 *
 * `ROLE_RANK` só distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rápidas, `canCompare` em Desempenho) NÃO é porta
 * fechada e por isso não vira `minRole`.
 */
export const NAV_CATALOG = [
  {
    href: "/app/prospecting",
    label: "Prospecção",
    description: "Busque empresas e conduza abordagens graduais com IA.",
    icon: "Binoculars",
    menu: { grupo: "vender-funil", ordem: 3 },
    minRole: "admin",
  },
  // ---- Atendimento — onde o operador passa o dia ----
  {
    href: "/app/inbox",
    label: "Conversas",
    description: "As conversas de WhatsApp, com você e a IA atendendo lado a lado.",
    // O nome mudou de "Inbox" para "Conversas"; quem procura pelo antigo ainda acha.
    sinonimos: ["Inbox", "caixa de entrada"],
    icon: "Inbox",
    menu: { grupo: "leads", ordem: 1, termo: "inbox" },
    // Quantas conversas a IA passou para a equipe e esperam uma pessoa (aba Fila).
    contador: "fila",
  },
  {
    href: "/app/radar",
    label: "Riscos de Perda",
    // O nome mudou de "Radar" para "Riscos de Perda"; quem procura pelo antigo ainda acha.
    sinonimos: ["Radar", "risco", "esfriou"],
    description: "Quem esfriou e ainda está aberto — o que corre risco de morrer sem resposta.",
    icon: "ClockCountdown",
    menu: { grupo: "leads", ordem: 4 },
  },
  {
    // Entra em "atendimento", e não em "organizacao", porque a Agenda é onde o
    // dia acontece e não onde ele se configura: quem atende abre isto de manhã
    // junto com o Inbox. Os TIPOS de agendamento — que são configuração de
    // verdade — foram para Configurações, como este comentário previa: ver
    // `/app/settings/tenant/agenda` no grupo "organizacao".
    //
    // ⚠️ ESTA FRASE ESTAVA VENCIDA: dizia "a disponibilidade ainda não tem tela",
    // e tem — é a aba "Atendimento" de `/app/team`, com editor de fuso e janelas
    // (`app/app/team/_components/AttendantsClient.tsx`). Ela chegou a custar uma
    // investigação inteira: quem leu isto aqui concluiu que faltava construir a
    // tela, quando o que faltava era o CAMINHO até ela. O aviso da Agenda agora
    // aponta para `/app/team?aba=atendimento`.
    href: "/app/agenda",
    label: "Compromissos",
    // O nome mudou de "Agenda" para "Compromissos"; quem procura pelo antigo ainda acha.
    sinonimos: ["Agenda", "calendário", "agendamentos"],
    description: "O que está marcado, com quem, e quem atende — seu e da equipe.",
    icon: "CalendarBlank",
    menu: { grupo: "leads", ordem: 5 },
  },
  {
    // Renomeado de "Templates": estes são scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde é o termo técnico correto.
    href: "/app/templates",
    label: "Respostas rápidas",
    description: "Scripts salvos para responder mais rápido, seus ou da equipe.",
    icon: "Lightning",
    menu: { grupo: "vender-equipe", ordem: 1 },
  },

  // ---- CRM — o funil ----
  {
    // ⚠️ ERA "Kanban", e a URL continua sendo. O nome saiu da interface porque o
    // produto tinha CINCO vocabulários para a mesma coisa — "Kanban" no menu,
    // "Pipelines" no título desta tela, "Funis" no menu ao lado, "funil" em todo
    // o corpo dela e "quadro" no onboarding inteiro. Três deles no mesmo
    // viewport: o <h1> dizia "Pipelines", o estado vazio dizia "Sem pipelines
    // configurados" e o botão embaixo dizia "Criar meu primeiro funil".
    //
    // Ficou "Funis" porque é o que esta tela É: a lista dos funis, de onde se
    // abre o quadro de cada um. "Pipeline" é palavra de quem construiu o
    // sistema; "funil de vendas" é palavra de quem vende.
    href: "/app/kanban",
    label: "Funis",
    description: "Seus funis de venda — clique em um para abrir o quadro de clientes.",
    icon: "FunilEmEtapas",
    menu: { grupo: "gestao-de-clientes", ordem: 1 },
  },
  {
    // A campanha vive no CRM e não em Conexões: quem a usa está pensando em
    // QUEM vai falar, não no número que fala. O ritmo (que é de Conexões) ela
    // herda, e só sabe deixar mais devagar.
    //
    // ─── O NOME É "Disparo em massa", e o endereço continua /app/campaigns ───
    // O dono do produto pediu o nome explícito: "Campanhas" não diz, a quem abre
    // o menu pela primeira vez, que é aqui que se manda mensagem para uma lista
    // (inclusive uma planilha CSV). A URL não muda — link salvo e histórico
    // seguem valendo.
    //
    // `minRole: "manager"`: a API da campanha exige manager, e mostrar a quem toma 403 seria uma porta
    // que não abre.
    href: "/app/campaigns",
    label: "Disparo em massa",
    description:
      "Mande uma mensagem para muita gente de uma vez — suba uma planilha CSV ou escolha contatos que já estão aqui.",
    sinonimos: ["campanha", "Campanhas", "envio em massa", "broadcast"],
    icon: "Megaphone",
    menu: { grupo: "gestao-de-clientes", ordem: 4 },
    minRole: "manager",
  },
  {
    href: "/app/contacts",
    label: "Contatos",
    description: "As pessoas do outro lado da conversa e seu histórico.",
    icon: "Users",
    menu: { grupo: "gestao-de-clientes", ordem: 2 },
  },
  {
    href: "/app/companies",
    label: "Empresas",
    description: "Cadastro B2B — razão social, CNPJ e decisores.",
    icon: "Buildings",
    menu: { grupo: "vender-cadastro", ordem: 2, termo: "B2B" },
    minRole: "viewer",
    // Módulo opcional da instalação, desligado por padrão (doc 68, #1621).
    modulo: "crm_b2b",
  },
  {
    href: "/app/people",
    label: "Pessoas",
    description: "Decisores e contatos ligados a empresas, com vários telefones.",
    icon: "UserList",
    menu: { grupo: "vender-cadastro", ordem: 3, termo: "B2B" },
    minRole: "viewer",
    // Módulo opcional da instalação, desligado por padrão (doc 68, #1621).
    modulo: "crm_b2b",
  },
  {
    // Extraída do PR #418 (@clinicacentrodosorrisosc-code). É tela de USO DIÁRIO — quem atende
    // abre para ver o que vence hoje, do mesmo jeito que abre as Conversas. Sem `minRole`: `viewer` VÊ
    // o que o time combinou (é informação de operação), e a criação é cobrada pela rota, com
    // `requireRole("agent")`.
    href: "/app/tasks",
    label: "Tarefas",
    description: "O que ficou combinado, com prazo — e o que já venceu sem ninguém fazer.",
    icon: "ListChecks",
    menu: { grupo: "gestao-de-clientes", ordem: 3 },
  },
  {
    // Módulo VoIP (migration 0347). No grupo do CRM pelo mesmo critério de
    // Tarefas: quem atende confere ligações perdidas e transcrições no dia a
    // dia, não como revisão deliberada.
    href: "/app/calls",
    label: "Chamadas",
    description: "Histórico de ligações (voz por IA) com transcrição.",
    icon: "Phone",
    menu: { grupo: "se-a-empresa-usa", ordem: 3 },
    minRole: "manager",
  },
  {
    // ⚠️ Esta tela nasceu porque a FERRAMENTA já existia sem ela. O agente de IA
    // vinha com "procurar produto na loja" ligada por padrão, lendo uma tabela
    // que ninguém nunca preencheu — e o efeito não era silêncio: era o agente
    // respondendo "não tenho nada com esse nome" para uma loja de estoque cheio.
    //
    // Fica no grupo do CRM, e não em Configurações, porque o catálogo é insumo
    // de VENDA: ele existe para o agente responder preço na conversa.
    href: "/app/products",
    label: "Produtos",
    description: "O catálogo da loja, com o preço que o atendente de IA responde.",
    icon: "Storefront",
    menu: { grupo: "vender-oferta", ordem: 1 },
  },
  {
    href: "/app/imports",
    label: "Importações",
    description: "Lotes CSV/XLSX de empresas, pessoas e telefones.",
    icon: "UploadSimple",
    menu: { grupo: "vender-cadastro", ordem: 1, termo: "CSV / XLSX" },
    minRole: "manager",
    // Módulo opcional da instalação, desligado por padrão (doc 68, #1621).
    modulo: "crm_b2b",
  },
  {
    href: "/app/proposals",
    label: "Propostas",
    description: "Rascunhe, revise e envie propostas comerciais — do orçamento ao aceite.",
    icon: "Signature",
    menu: { grupo: "se-a-empresa-usa", ordem: 1 },
    capacidade: "propostas",
  },
  {
    // A promessa que o comentário da Agenda fazia desde que ela nasceu. Aqui se
    // decide O QUE se pode marcar, quanto dura e quem atende — e é isto que a
    // tela de marcar e o agente de IA oferecem ao cliente.
    //
    // Nasceu porque a `calendar_event_types` tinha dez categorias no CHECK,
    // duração, buffers e antecedência mínima, e NÃO havia como criar ou editar
    // um tipo por lugar nenhum: a organização recebia três semeados e ficava com
    // eles para sempre.
    href: "/app/settings/tenant/agenda",
    label: "Tipos de agendamento",
    description: "O que se pode marcar, quanto dura, onde acontece e quem atende.",
    icon: "CalendarCheck",
    menu: { grupo: "vender-funil", ordem: 2 },
  },
  {
    href: "/app/settings/tenant/proposals",
    label: "Padrões de proposta",
    sinonimos: ["Propostas"],
    description: "Configure a validade padrão e condições para propostas comerciais.",
    icon: "Files",
    menu: { grupo: "vender-oferta", ordem: 2 },
    minRole: "manager",
    // Doc 79: é aqui que a EMPRESA liga — então a porta depende só da chave da
    // INSTALAÇÃO (a capacidade da empresa ainda está desligada quando se chega).
    modulo: "propostas",
  },
  {
    href: "/app/settings/tenant/proposals/modelos",
    label: "Modelos de proposta",
    description: "Personalize os modelos da plataforma ou crie os da sua empresa, inclusive a partir de uma proposta que você já usa.",
    icon: "FileText",
    menu: { grupo: "vender-oferta", ordem: 3 },
    minRole: "manager",
    capacidade: "propostas",
  },
  {
    // O BALCÃO. Fica em CRM, e não em Configurações, porque é uso diário de quem
    // está com a cliente na frente — a tela irmã, em Configurações › Financeiro,
    // é onde o negócio se descreve uma vez.
    //
    // `viewer` porque conferir o que foi lançado no dia não é privilégio de
    // quem lança; o que a RLS impede é ele escrever.
    href: "/app/comandas",
    label: "Comandas",
    description: "O que foi feito, por quem, e quanto o cliente paga.",
    icon: "Receipt",
    menu: { grupo: "se-a-empresa-usa", ordem: 2 },
    minRole: "viewer",
  },
  {
    // O catálogo financeiro: contas, formas de pagamento e plano de contas.
    //
    // Fica em "Sua empresa" pelo mesmo motivo dos tipos de agendamento — é onde
    // o negócio se DESCREVE, não onde o dia acontece. E vem ANTES de qualquer
    // tela de venda porque a forma de pagamento é quem decide em que conta a
    // entrada cai quando uma comanda é fechada: sem esta camada, a comanda não
    // tem onde depositar.
    href: "/app/settings/tenant/financeiro",
    label: "Financeiro",
    description: "Contas, formas de pagamento e como cada lançamento é classificado.",
    icon: "Wallet",
    menu: { grupo: "empresa-dados", ordem: 3 },
    // Leitura para a organização, escrita para manager+ (é a RLS que decide).
    // `viewer` aqui e não `manager`: quem só olha precisa conferir para onde o
    // dinheiro vai, e esconder a tela não esconde o dado — só torna a
    // conferência impossível.
    minRole: "viewer",
  },
  {
    // Estava enterrado em Configurações e ninguém sabia que existia — o achado
    // que originou esta reorganização. A URL não muda; só o lugar na navegação.
    //
    // ⚠️ ERA "Funis", nome que ele DISPUTAVA com o destino acima: os dois
    // listavam as mesmas linhas de `crm_pipelines`, lado a lado no mesmo grupo,
    // com nomes que não diziam qual servia para quê. A diferença real é o VERBO,
    // e é ela que o nome carrega agora: lá se ABRE o funil, aqui se CONFIGURA o
    // que ele significa.
    href: "/app/settings/tenant/pipelines",
    label: "Etapas do funil",
    description: "As colunas de cada funil, o vocabulário do negócio e os motivos de perda.",
    icon: "Funnel",
    menu: { grupo: "vender-funil", ordem: 1 },
    minRole: "manager",
  },

  // ---- Agente de IA — montar, ensinar, acompanhar ----
  {
    href: "/app/ai/agents",
    label: "Agentes",
    description: "Quem atende por você: instruções, modelo, ferramentas e publicação.",
    icon: "AgenteEmConversa",
    menu: { grupo: "agente-montar", ordem: 1 },
    minRole: "manager",
  },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silêncio.",
    icon: "FlowArrow",
    menu: { grupo: "agente-montar", ordem: 2 },
    minRole: "manager",
  },
  {
    // Os roteiros de atendimento (#1130): perguntas que a IA conduz
    // durante a conversa. MÓDULO OPCIONAL da instalação, desligado por padrão
    // (doc 64): a porta só existe onde quem administra o servidor o ligou.
    href: "/app/ai/atendimento",
    label: "Fluxos de atendimento",
    description: "Perguntas que a IA conduz durante a conversa, com as respostas guardadas na ficha do cliente.",
    icon: "TreeStructure",
    menu: { grupo: "agente-montar", ordem: 3 },
    minRole: "manager",
    modulo: "fluxos_atendimento",
  },
  {
    href: "/app/ai/routers",
    label: "Quem atende cada conversa",
    sinonimos: ["Roteadores"],
    description: "Qual agente pega qual conversa, e quando o humano assume.",
    icon: "PassagemParaHumano",
    menu: { grupo: "agente-montar", ordem: 4, termo: "roteadores" },
    minRole: "manager",
  },
  {
    href: "/app/ai/credentials",
    label: "Chave da IA",
    sinonimos: ["Credenciais"],
    description: "A chave do provedor de IA que os agentes usam para pensar.",
    icon: "Key",
    menu: { grupo: "agente-conectar", ordem: 2, termo: "API key" },
    minRole: "manager",
  },
  {
    // O sistema chama modelo em 23 lugares e, até esta tela, a escolha vivia
    // espalhada por três pilhas de código e sete variáveis de ambiente — não
    // havia onde responder "quem usa IA aqui, e com qual chave?".
    href: "/app/ai/providers",
    label: "Qual IA usar",
    sinonimos: ["Provedores"],
    // O "Jev" vem cedo: o ⌘K mostra só o começo da descrição, e a versão
    // longa cortava antes do nome — quem procurava "jev" achava, mas não via por quê.
    description: "Ligue o Jev para decisões rápidas e escolha qual inteligência atende cada parte do sistema.",
    icon: "Plugs",
    menu: { grupo: "agente-conectar", ordem: 3, termo: "provedores" },
    minRole: "manager",
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Conhecimento",
    description: "Os materiais que o agente consulta antes de responder sobre o seu negócio.",
    icon: "BookOpen",
    menu: { grupo: "agente-ensinar", ordem: 1, termo: "RAG" },
    minRole: "manager",
  },
  {
    href: "/app/ai/external-tools",
    label: "Conectar outros sistemas",
    description: "Consultas e ações em outro sistema (estoque, planilha, ERP) que o agente faz durante a conversa; as que alteram algo esperam a sua aprovação.",
    sinonimos: ["webhook", "integração", "make", "n8n", "erp", "consulta externa", "mcp", "servidor mcp", "Ferramentas externas"],
    icon: "Signpost",
    menu: { grupo: "agente-conectar", ordem: 1, termo: "MCP" },
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "Memória",
    description: "O que o agente já aprendeu sobre a sua operação e reaproveita.",
    icon: "Brain",
    menu: { grupo: "agente-ensinar", ordem: 2 },
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "O que o agente sabe fazer",
    sinonimos: ["Skills"],
    description: "As ações que o agente pode executar sozinho durante o atendimento.",
    icon: "MagicWand",
    menu: { grupo: "agente-ensinar", ordem: 3, termo: "skills" },
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Aguardando Humano",
    description:
      "Os casos em que a IA pediu ajuda e esperam uma pessoa — e o histórico dos que ela conduziu até o fim.",
    // O nome mudou de "Casos" para "Aguardando Humano"; quem procura pelo antigo ainda acha.
    sinonimos: ["Casos", "caso", "esperando uma pessoa"],
    icon: "ClipboardText",
    menu: { grupo: "leads", ordem: 2 },
    minRole: "agent",
    // Uso diário: a IA abre caso quando precisa de uma pessoa e segue atendendo enquanto espera.
    contador: "casos",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertas",
    description: "O que a IA encontrou e precisa de uma decisão sua.",
    icon: "Flag",
    menu: { grupo: "leads", ordem: 3 },
  },
  {
    // "Aviso no WhatsApp", NUNCA "Avisos": a vizinha de cima chama-se "Alertas"
    // e É a central de avisos — todo o vocabulário interno dela é "aviso"
    // (POLITICAS_DE_AVISO, REFERENCIAS_DE_AVISO). Duas entradas com a mesma
    // palavra, na mesma seção, é a tela ficando ilegível para quem não
    // programa. O rótulo nomeia o CANAL e o destinatário.
    href: "/app/ai/cases/avisos",
    label: "Aviso no WhatsApp",
    description: "Receber no WhatsApp quando o assistente abrir um caso.",
    icon: "PaperPlaneTilt",
    menu: { grupo: "agente-conectar", ordem: 4 },
    // `admin` porque escolhe um número conectado e manda dado de cliente para um
    // celular — o mesmo gate da rota e da RLS de `config_aviso_de_caso`.
    minRole: "admin",
  },
  {
    // Órfã: nenhum lugar do app linkava para cá. O flywheel gerava propostas de
    // melhoria do agente e a fila só era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Sugestões da IA",
    description: "Melhorias que a IA sugere para si mesma, esperando sua decisão.",
    icon: "Lightbulb",
    menu: { grupo: "resultados-equipe", ordem: 3 },
  },
  {
    // A tela de Uso responde "quanto gastei". Esta responde a pergunta que não
    // tinha lugar nenhum: "o agente parou de responder, o que aconteceu?".
    // Antes da migration 0128 ela seria impossível de construir com honestidade
    // — llm_calls só registrava sucesso.
    href: "/app/ai/runs",
    label: "Histórico do agente",
    sinonimos: ["Execuções"],
    description: "O que a IA fez — e, quando falhou, o que aconteceu e o que fazer.",
    icon: "Pulse",
    menu: { grupo: "resultados-erro", ordem: 1, termo: "logs" },
    minRole: "manager",
  },
  {
    href: "/app/ai/usage",
    label: "Uso e orçamento",
    description: "Quanto a IA consumiu e qual é o teto de gasto do mês.",
    icon: "Gauge",
    menu: { grupo: "resultados-equipe", ordem: 4 },
    minRole: "manager",
  },

  // ---- Canais — por onde as mensagens entram e saem ----
  {
    href: "/app/connections",
    label: "Conexões",
    // Cobre os DOIS caminhos desde o PR #105: número por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descrição cita "oficial"
    // e "Meta" de propósito — é por esses nomes que se procura no ⌘K, e a busca
    // varre a descrição além do rótulo.
    description:
      "Seus números de WhatsApp: por QR ou canal oficial da Meta, com saúde, reconexão e templates.",
    icon: "PlugsConnected",
    menu: { grupo: "conexoes-whatsapp", ordem: 1 },
    minRole: "admin",
    healthDot: true,
  },
  {
    href: "/app/webhooks",
    label: "Avisar outros sistemas",
    sinonimos: ["Webhooks"],
    description: "Avise outros sistemas quando algo acontecer aqui dentro.",
    icon: "WebhooksLogo",
    menu: { grupo: "conexoes-sistemas", ordem: 1, termo: "webhooks" },
    minRole: "manager",
  },

  // ---- Análise — olhar o sistema funcionando ----
  {
    // A terceira ponta do módulo financeiro: Configurações › Financeiro descreve
    // para onde o dinheiro vai, CRM › Comandas é onde o dia acontece, e aqui se
    // responde a pergunta do fim do mês.
    href: "/app/faturamento",
    label: "Faturamento",
    description: "Quanto entrou, de que forma, e quanto cada pessoa tem a receber.",
    icon: "CurrencyCircleDollar",
    menu: { grupo: "resultados-negocio", ordem: 3 },
    minRole: "viewer",
  },
  {
    // Módulo opcional (ADR-0002), fonte `modulos_instalados` — a porta só existe
    // depois que o administrador da instalação instala `honorarios` em
    // `/admin/modulos`. Mesmo mecanismo genérico de `banco_externo` acima, só
    // que a fonte é a TABELA, não a flag de `platform_config`; `deModuloDesligado`
    // e este filtro não sabem a diferença, e não precisam saber.
    href: "/app/honorarios",
    label: "Honorários",
    description: "O modelo de cobrança de cada caso e o calendário de parcelas.",
    icon: "HandCoins",
    menu: { grupo: "resultados-negocio", ordem: 4 },
    minRole: "viewer",
    modulo: "honorarios",
  },
  {
    href: "/app/metrics",
    label: "Desempenho",
    description: "Funil e performance por atendente nos últimos 30 dias.",
    icon: "ChartBar",
    menu: { grupo: "resultados-negocio", ordem: 1 },
  },
  {
    // Logo abaixo de Desempenho porque responde a metade da MESMA pergunta: lá
    // está o que aconteceu depois que a pessoa chegou; aqui, quanto custou
    // trazê-la. Ler as duas juntas é o que fecha a conta do custo por cliente.
    href: "/app/ads/meta",
    label: "Meta Ads",
    description: "Quanto custou cada resultado das campanhas que trazem gente para cá.",
    icon: "Target",
    menu: { grupo: "resultados-negocio", ordem: 2 },
    // `manager`, e não o `viewer` de Desempenho: aqui não há recorte por
    // pessoa — orçamento e criativo são da empresa inteira. Mesmo grau dos
    // outros dois vizinhos do grupo.
    minRole: "manager",
  },
  {
    // Irmã de "Desempenho", não a mesma coisa: lá é DESFECHO (funil agora,
    // ganho/perdido por atendente); aqui é o TRABALHO que aconteceu no
    // período, com quem fez cada coisa. Um mês inteiro atendido pela IA e um
    // mês inteiro atendido pela equipe têm o mesmo desfecho e histórias
    // opostas — só esta tela distingue as duas.
    href: "/app/activities",
    label: "Atividades",
    description:
      "Relatório do que a equipe e os agentes fizeram no período: quanto, quem e de que tipo.",
    icon: "ClockCounterClockwise",
    menu: { grupo: "resultados-equipe", ordem: 1 },
  },
  {
    // Observabilidade, não configuração: por isso não fica junto dos agentes.
    href: "/app/ai/evolution",
    label: "Evolução da IA",
    description: "Se o agente está melhorando, onde ele erra e o que falta ensinar.",
    icon: "ChartLineUp",
    menu: { grupo: "resultados-equipe", ordem: 2 },
    minRole: "manager",
  },
  {
    href: "/app/audit",
    label: "Quem mexeu em quê",
    sinonimos: ["Auditoria"],
    description: "Quem mudou o quê, e quando — o histórico que não se apaga.",
    icon: "ListMagnifyingGlass",
    menu: { grupo: "resultados-erro", ordem: 2, termo: "audit log" },
    minRole: "manager",
  },

  // ---- Organização — conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Perfil",
    description: "Seu nome, idioma, fuso horário e avatar.",
    icon: "UserCircle",
    menu: { grupo: "conta-voce", ordem: 1 },
  },
  {
    href: "/app/settings/security",
    label: "Segurança",
    description: "Verificação em duas etapas, códigos de recuperação e sessões.",
    icon: "ShieldCheck",
    menu: { grupo: "conta-voce", ordem: 2, termo: "MFA" },
  },
  {
    href: "/app/settings/notifications",
    label: "Notificações",
    description: "Por onde e sobre o quê você quer ser avisado.",
    icon: "Bell",
    menu: { grupo: "conta-voce", ordem: 3 },
  },
  {
    href: "/app/team",
    label: "Equipe",
    description: "Quem trabalha aqui, com qual papel e quanta conversa cada um aguenta.",
    icon: "UsersThree",
    menu: { grupo: "empresa-equipe", ordem: 1 },
  },
  {
    // A porta que faltava (issue #144): rodízio de atendimento e restrição de
    // visibilidade existiam inteiros no backend e não tinham NENHUMA tela — só
    // dava para ligar com UPDATE à mão no banco.
    href: "/app/settings/atendimento",
    label: "Revezamento da equipe",
    sinonimos: ["Distribuição de atendimento"],
    description: "Quem recebe cada cliente novo, e o que cada atendente enxerga.",
    icon: "Shuffle",
    menu: { grupo: "empresa-equipe", ordem: 2, termo: "round-robin" },
    minRole: "manager",
  },
  {
    // A porta que faltava para o vocabulário de etiquetas (issue #852). Até
    // aqui a etiqueta só ENTRAva no vocabulário — cada agente escrevia a que
    // quisesse em `add_tag` — e não havia por onde corrigir, juntar as duas
    // grafias que a operação criou, nem tirar a que ninguém mais usa. O
    // vocabulário dava para LER (`/api/v1/conversation-tags`) e não para
    // AJUSTAR, então a única saída era digitar errado para sempre.
    //
    // `manager` e não `admin`, pelo mesmo critério da vizinha acima: quem
    // escreve a etiqueta é quem monta a regra do agente, e a tela existe para
    // quem monta a regra. Nada aqui apaga conversa ou muda dinheiro — o
    // alcance da operação é ao lado do de "Revezamento da equipe".
    href: "/app/settings/tags",
    label: "Etiquetas",
    sinonimos: ["Tags"],
    description:
      "O vocabulário de etiquetas da empresa: onde cada uma é usada e como renomear, juntar ou excluir.",
    icon: "Tag",
    menu: { grupo: "vender-equipe", ordem: 2, termo: "tags" },
    minRole: "manager",
  },
  {
    // A área única dos recursos opcionais (pedido do mantenedor, doc 73/80):
    // tudo o que a empresa pode ligar, com o estado e o caminho até a tela onde
    // se liga. Só leitura — quem liga continua sendo a tela do assunto.
    href: "/app/settings/recursos",
    label: "Recursos opcionais",
    description: "Tudo o que se liga e desliga, se está ligado e onde se ajusta.",
    icon: "ToggleRight",
    menu: { grupo: "empresa-plano", ordem: 3 },
    // `manager`: o gerente decide metade das chaves da lista. Atendente e
    // leitor não ajustam nenhuma, e a tela redireciona os dois para /403.
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "Dados da empresa",
    sinonimos: ["Organização"],
    description: "Dados da empresa, retenção de dados e encarregado de LGPD.",
    icon: "Briefcase",
    menu: { grupo: "empresa-dados", ordem: 1, termo: "organização" },
    minRole: "admin",
  },
  {
    // Mora em Organização e não em Canais de propósito: o que se configura aqui
    // é a CONTA DE ANÚNCIOS da empresa — dinheiro e identidade comercial, ao lado
    // de billing e API tokens. Canais é por onde se FALA com o cliente, e os dois
    // eixos são independentes (dá para receber lead de anúncio num número servido
    // por qualquer transporte). Ver `lib/plataformas-de-anuncio/types.ts`.
    href: "/app/settings/conversoes",
    label: "Conversões",
    description:
      "Devolver ao anúncio as vendas que ele trouxe, e marcar a origem de quem chega pelo site.",
    icon: "TrendUp",
    menu: { grupo: "conexoes-anuncios", ordem: 2, termo: "CAPI" },
    // `admin` pelo mesmo critério das vizinhas: o token grava na conta de
    // anúncios da empresa, e quem o troca decide para onde vai o dinheiro de
    // mídia. Um `manager` ficaria acima de billing na mesma prancheta.
    minRole: "admin",
  },
  {
    // Vizinha de Conversões, e SEPARADA dela de propósito. As duas conectam "a
    // Meta" e a tentação de fundi-las é real — mas são credenciais de escopos
    // diferentes, em tabelas diferentes (0214), com consequências opostas
    // quando vencem: o token de leitura vencido deixa uma tela vazia, o de
    // conversões vencido faz a empresa parar de reportar vendas sem sintoma.
    // Uma tela só, com dois campos de token parecidos, é como se cola o token
    // errado no campo errado e se perde uma semana achando que quebrou.
    href: "/app/settings/meta-ads",
    label: "Conta de anúncios",
    sinonimos: ["Meta Ads"],
    description: "Conectar a conta de anúncios para ler o desempenho das campanhas.",
    // Ícone próprio: com o nome novo ("Conta de anúncios") a tela deixou de ser a "mesma
    // coisa" do Meta Ads de Análise, e a regra é um ícone por destino.
    icon: "IdentificationCard",
    menu: { grupo: "conexoes-anuncios", ordem: 1, termo: "Meta Ads" },
    // `admin` pelo mesmo critério da vizinha, mesmo o token sendo só de
    // leitura: ele expõe orçamento e performance da conta inteira, e quem
    // apenas LÊ a tela (`manager`) não precisa poder trocar a credencial.
    minRole: "admin",
  },
  {
    href: "/app/settings/marca",
    label: "Marca",
    description: "O nome e a cor que sua empresa mostra dentro do sistema.",
    icon: "Palette",
    menu: { grupo: "empresa-dados", ordem: 2 },
    // `admin` pelo mesmo motivo da linha de cima: o que se edita ali é
    // identidade da empresa, e dá-lo a `manager` o colocaria abaixo de billing e
    // de API tokens na mesma prancheta.
    minRole: "admin",
  },
  {
    href: "/app/settings/billing",
    label: "Plano e cobrança",
    description: "O plano contratado e as cobranças da sua empresa.",
    icon: "CreditCard",
    menu: { grupo: "empresa-plano", ordem: 1 },
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    description: "Pedidos de exportação e exclusão de dados feitos por clientes.",
    icon: "ScalesSimple",
    menu: { grupo: "empresa-plano", ordem: 2 },
    minRole: "admin",
  },
  {
    href: "/app/settings/api-tokens",
    label: "Chaves de acesso",
    sinonimos: ["API Tokens"],
    description: "Chaves para outro sistema conversar com o seu CRM.",
    icon: "Lock",
    menu: { grupo: "conexoes-sistemas", ordem: 2, termo: "API tokens" },
    minRole: "admin",
  },
  {
    href: "/app/settings/voip-trunk",
    label: "Linha telefônica",
    sinonimos: ["Linha telefônica (SIP)"],
    description: "Os dados da operadora de telefonia para a IA fazer e receber chamadas.",
    icon: "PhoneTransfer",
    menu: { grupo: "conexoes-whatsapp", ordem: 2, termo: "SIP" },
    minRole: "admin",
  },
  {
    href: "/app/extensions",
    label: "Extensões",
    description:
      "Guias instalados para orientar o trabalho no CRM, com permissões e estado visíveis.",
    icon: "PuzzlePiece",
    menu: { grupo: "empresa-plano", ordem: 4 },
  },
  {
    // A situação da licença desta instalação e o "tentar renovar agora" (#222, ADR-0005). É a única tela de
    // `/app` que uma instalação barrada continua alcançando (`caminhoLiberadoDaLicenca`). A porta aqui é para
    // quem quer SABER em que pé está a licença sem esperar a faixa aparecer — o permanente, por exemplo,
    // nunca mostra faixa.
    href: "/app/licenca",
    label: "Licença",
    description: "Se a licença está em dia, quando vence e como renovar.",
    icon: "Certificate",
    menu: { grupo: "empresa-plano", ordem: 5 },
    minRole: "admin",
  },
  {
    // A porta da fonte de dados externa (migration 0372). Fica em "Dados e
    // acesso" porque é o MESMO eixo de "Chaves de acesso": por onde dado entra e sai do
    // CRM. NÃO é `admin` como as vizinhas de propósito — a decisão do dono (D2)
    // é que QUALQUER autenticado vê a lista e consulta os dados; só CRIAR e
    // editar conexão é `admin`. Gatear a leitura em `manager` esconderia do
    // atendente exatamente a fonte que responde o que o cliente pergunta.
    href: "/app/integracao-dados",
    label: "Dados de outro sistema",
    sinonimos: ["Dados externos"],
    description:
      "Conecte um banco de dados de outro sistema para o agente consultar em tempo real.",
    icon: "Database",
    menu: { grupo: "conexoes-sistemas", ordem: 3, termo: "banco externo" },
    // Módulo opcional da instalação, desligado por padrão (doc 37): a porta só
    // existe onde quem administra o servidor o ligou, em `/admin/sistema`.
    modulo: "banco_externo",
  },
] as const satisfies readonly NavMetadata[];

export type NavDestinationId = (typeof NAV_CATALOG)[number]["href"];

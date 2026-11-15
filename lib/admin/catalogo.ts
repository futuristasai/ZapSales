/**
 * O CATÁLOGO DA ÁREA DE ADMINISTRAÇÃO DA INSTALAÇÃO (`/admin/**`) — issue #308.
 *
 * Uma lista de dados, e ninguém mais escreve item de menu: a barra lateral, a gaveta
 * do celular, o cabeçalho de cada tela (`CabecalhoDaPlataforma`) e o título da aba
 * (`metadadosDaTelaDoAdmin`) leem daqui. Antes o menu era uma lista dentro do
 * componente da barra lateral, com 21 itens soltos, metade em inglês, e cada tela
 * escrevia o próprio subtítulo de um jeito.
 *
 * ── Por que SEPARADO de `lib/navigation/catalogo.ts` ───────────────────────────
 *
 * Aquele catálogo descreve a navegação da EMPRESA (`app/app/**`), e as cercas que o
 * vigiam (porta no menu, idiomas, nomes) varrem só aquela raiz. Misturar as duas
 * confundiria as cercas: uma tela da instalação "sem porta" no menu da empresa é o
 * certo, não um defeito. O padrão é o mesmo — dados puros, ícone por NOME (string),
 * sem React aqui — para este arquivo ser lido por teste e por servidor sem puxar a
 * biblioteca de ícones.
 *
 * ── As chaves de tradução são o texto em português ─────────────────────────────
 *
 * Como em todo o produto (`lib/i18n/dicionario.ts`). Trocar uma frase aqui troca a
 * chave: espanhol no dicionário, inglês e chinês nos JSON de `lib/i18n/traducoes/`.
 * Quem cobra é `tests/unit/i18n-catalogo-do-admin.test.ts`.
 *
 * ── As rotas não mudam ─────────────────────────────────────────────────────────
 *
 * `/admin/tenants`, `/admin/audit` etc. continuam iguais: só o TEXTO muda. Mudar a
 * URL quebraria favoritos, specs e links em mensagens de erro sem ganho para ninguém.
 */

export type GrupoDoAdmin = "visao" | "pessoas" | "protecao" | "instalacao" | "integracoes";

/**
 * Os ícones que a área usa, por nome do Phosphor. União fechada de propósito: o
 * componente que desenha (`components/admin/icones-do-admin.tsx`) tem um `Record`
 * exaustivo, então nome novo sem desenho não compila.
 */
export type IconeDoAdmin =
  | "Gauge"
  | "Buildings"
  | "Users"
  | "ShieldCheck"
  | "ChatsCircle"
  | "ClipboardText"
  | "Scales"
  | "Warning"
  | "ChartBar"
  | "Palette"
  | "UserPlus"
  | "EnvelopeSimple"
  | "Lock"
  | "ToggleRight"
  | "PuzzlePiece"
  | "WhatsappLogo"
  | "Receipt"
  | "CalendarBlank"
  | "TreeStructure"
  | "HardDrives";

export interface GrupoDoAdminDef {
  id: GrupoDoAdmin;
  label: string;
  /**
   * O utilitário de cor do tom (token `--color-grupo-*` de `app/globals.css`). O tom
   * aparece no ÍCONE, nunca no texto, e nunca no item ativo — ali manda a cor de
   * destaque da marca, para o revendedor continuar vendo a dele.
   */
  tom: string;
}

export const GRUPOS_DO_ADMIN: readonly GrupoDoAdminDef[] = [
  { id: "visao", label: "Visão geral", tom: "text-grupo-visao" },
  { id: "pessoas", label: "Empresas e pessoas", tom: "text-grupo-pessoas" },
  { id: "protecao", label: "Acompanhar e proteger", tom: "text-grupo-protecao" },
  { id: "instalacao", label: "Configurar a instalação", tom: "text-grupo-instalacao" },
  { id: "integracoes", label: "Integrações", tom: "text-grupo-integracoes" },
];

export interface ItemDoAdmin {
  href: string;
  grupo: GrupoDoAdmin;
  /** O nome no menu, no título da tela e na aba do navegador. */
  label: string;
  /** Uma frase: aparece ao passar o mouse ou focar o item no menu. */
  dica: string;
  /** O que a tela faz — primeira linha do cabeçalho. */
  paraQueServe: string;
  /** Em que situação abrir — segunda linha do cabeçalho. */
  quandoUsar: string;
  icone: IconeDoAdmin;
}

export const CATALOGO_DO_ADMIN: readonly ItemDoAdmin[] = [
  // ── Visão geral ─────────────────────────────────────────────────────────────
  {
    href: "/admin/dashboard",
    grupo: "visao",
    label: "Painel",
    dica: "Se está tudo bem agora e o que falta configurar.",
    paraQueServe:
      "Mostra, num lugar só, o que pede atenção em todas as empresas desta instalação e o que ainda falta configurar.",
    quandoUsar: "Ao entrar, para saber se está tudo em ordem e por onde começar.",
    icone: "Gauge",
  },
  // ── Empresas e pessoas ──────────────────────────────────────────────────────
  {
    href: "/admin/tenants",
    grupo: "pessoas",
    label: "Empresas",
    dica: "As empresas que usam esta instalação: criar, suspender e reativar.",
    paraQueServe: "Lista todas as empresas hospedadas neste servidor, com a situação de cada uma.",
    quandoUsar:
      "Para cadastrar uma empresa nova, ver como uma delas está ou suspender o acesso dela.",
    icone: "Buildings",
  },
  {
    href: "/admin/users",
    grupo: "pessoas",
    label: "Usuários",
    dica: "Todas as pessoas com acesso, em qualquer empresa.",
    paraQueServe: "Lista quem entra no sistema, em qual empresa e com qual papel.",
    quandoUsar:
      "Para achar uma pessoa, conferir o papel dela ou ver quando entrou pela última vez.",
    icone: "Users",
  },
  {
    href: "/admin/platform-admins",
    grupo: "pessoas",
    label: "Administradores da plataforma",
    dica: "Quem pode abrir esta área de administração.",
    paraQueServe: "Mostra quem administra a instalação inteira, acima de todas as empresas.",
    quandoUsar:
      "Para conferir quem tem esse poder e se essas pessoas usam a verificação em duas etapas.",
    icone: "ShieldCheck",
  },
  {
    href: "/admin/inbox",
    grupo: "pessoas",
    label: "Conversas de todas as empresas",
    dica: "Leia as conversas de qualquer empresa, para dar suporte.",
    paraQueServe:
      "Junta as conversas de todas as empresas numa lista só, com o nome da empresa em cada uma.",
    quandoUsar:
      "Para investigar um problema que uma empresa relatou. Não é a sua caixa de entrada.",
    icone: "ChatsCircle",
  },
  // ── Acompanhar e proteger ───────────────────────────────────────────────────
  {
    href: "/admin/audit",
    grupo: "protecao",
    label: "Registro de ações",
    dica: "Quem fez o quê, quando e em qual empresa.",
    paraQueServe: "Guarda cada alteração feita no sistema, com a pessoa, a data e o que mudou.",
    quandoUsar: "Para descobrir quem mudou alguma coisa ou provar o que aconteceu.",
    icone: "ClipboardText",
  },
  {
    href: "/admin/lgpd",
    grupo: "protecao",
    label: "Pedidos de LGPD",
    dica: "Pedidos de cópia e de apagamento de dados pessoais, com prazo.",
    paraQueServe:
      "Acompanha os pedidos dos donos dos dados (cópia, correção, anonimização) em todas as empresas, e o prazo legal de cada um.",
    quandoUsar: "Toda semana, para nenhum pedido passar do prazo que a lei dá.",
    icone: "Scales",
  },
  {
    href: "/admin/incidents",
    grupo: "protecao",
    label: "Incidentes",
    dica: "Problemas que o sistema registrou sozinho, até alguém resolver.",
    paraQueServe:
      "Lista as falhas que o sistema detectou, com a gravidade e o andamento de cada uma.",
    quandoUsar: "Quando algo parou de funcionar, ou para fechar um problema que já foi resolvido.",
    icone: "Warning",
  },
  {
    href: "/admin/usage",
    grupo: "protecao",
    label: "Uso e custo",
    dica: "Quanto cada empresa usa de mensagens, conversas e IA.",
    paraQueServe: "Mostra o consumo de cada empresa e quanto a inteligência artificial custou.",
    quandoUsar:
      "Para cobrar o uso, achar uma empresa que gasta fora do normal ou planejar o servidor.",
    icone: "ChartBar",
  },
  // ── Configurar a instalação ─────────────────────────────────────────────────
  {
    href: "/admin/marca",
    grupo: "instalacao",
    label: "Marca",
    dica: "O nome, a cor e o logo que todo mundo vê nesta instalação.",
    paraQueServe: "Define o nome, a cor de destaque, o logo e o ícone da aba que o sistema mostra.",
    quandoUsar: "Ao instalar, ou quando você revende o sistema com a sua própria marca.",
    icone: "Palette",
  },
  {
    href: "/admin/cadastro",
    grupo: "instalacao",
    label: "Quem pode criar conta",
    dica: "Cadastro aberto, só por convite ou com a sua aprovação.",
    paraQueServe:
      "Decide se qualquer pessoa pode criar uma conta, só quem foi convidado ou quem você aprovar.",
    quandoUsar: "Ao abrir a instalação para clientes novos, ou para fechá-la de novo.",
    icone: "UserPlus",
  },
  {
    href: "/admin/email",
    grupo: "instalacao",
    label: "E-mail",
    dica: "Por onde saem os convites, a troca de senha e os avisos.",
    paraQueServe:
      "Configura o servidor de e-mail próprio ou o serviço externo que manda os e-mails de todas as empresas.",
    quandoUsar:
      "Logo depois de instalar: sem e-mail não sai convite de equipe nem recuperação de senha.",
    icone: "EnvelopeSimple",
  },
  {
    href: "/admin/configuracao",
    grupo: "instalacao",
    label: "Credenciais",
    dica: "Chaves e contatos que o servidor guarda, sem precisar de terminal.",
    paraQueServe:
      "Guarda as chaves e os dados de contato da instalação, o que antes só se trocava pelo terminal.",
    quandoUsar: "Quando uma chave vence, muda de dono ou precisa ser trocada por segurança.",
    icone: "Lock",
  },
  {
    href: "/admin/sistema",
    grupo: "instalacao",
    label: "Recursos opcionais",
    dica: "Liga e desliga módulos e comportamentos da instalação inteira.",
    paraQueServe:
      "Junta tudo o que se liga e desliga nesta instalação: os módulos, o comportamento e o que depende do servidor.",
    quandoUsar: "Para instalar um módulo, ou quando um recurso não aparece para as empresas.",
    icone: "ToggleRight",
  },
  {
    href: "/admin/extensoes",
    grupo: "instalacao",
    label: "Extensões",
    dica: "De onde vêm as extensões e quais empresas as usam.",
    paraQueServe:
      "Mostra as extensões que este servidor conhece, de onde vieram e quem está usando.",
    quandoUsar:
      "Para saber o que está instalado. Ativar e configurar continua dentro de cada empresa.",
    icone: "PuzzlePiece",
  },
  // ── Integrações ─────────────────────────────────────────────────────────────
  {
    href: "/admin/meta",
    grupo: "integracoes",
    label: "API Oficial (Meta)",
    dica: "O app da Meta que permite conectar números oficiais do WhatsApp.",
    paraQueServe:
      "Guarda a chave secreta e o código de conferência do app da Meta, que valem para todas as empresas.",
    quandoUsar:
      "Antes de alguma empresa conectar um número pela API oficial ou fazer disparo em massa.",
    icone: "WhatsappLogo",
  },
  {
    href: "/admin/precos-da-meta",
    grupo: "integracoes",
    label: "Preços da Meta",
    dica: "Quanto a Meta cobra por mensagem, e a cotação do dólar.",
    paraQueServe:
      "Mantém a tabela de preço por país e categoria de mensagem, base da estimativa e do teto de gasto das campanhas.",
    quandoUsar: "Quando a Meta muda os preços ou o dólar varia muito.",
    icone: "Receipt",
  },
  {
    href: "/admin/google",
    grupo: "integracoes",
    label: "Google Agenda",
    dica: "O app do Google que deixa cada pessoa conectar a própria agenda.",
    paraQueServe:
      "Guarda os dados do app do Google que liga a agenda de cada atendente aos compromissos do sistema.",
    quandoUsar: "Quando as empresas quiserem ver os compromissos do sistema na agenda do Google.",
    icone: "CalendarBlank",
  },
  {
    href: "/admin/destinos-internos",
    grupo: "integracoes",
    label: "Destinos internos",
    dica: "Endereços da rede deste servidor que o sistema pode alcançar.",
    paraQueServe:
      "Libera endereços da rede interna, como um modelo de IA rodando na própria máquina, que o sistema bloqueia por segurança.",
    quandoUsar:
      "Só se você roda outro serviço na mesma máquina ou na mesma rede e quer que o sistema o use.",
    icone: "TreeStructure",
  },
];

/** O ícone da tarja do topo: o servidor, e não o prédio que agora é "Empresas". */
export const ICONE_DA_TARJA: IconeDoAdmin = "HardDrives";

/**
 * O nome de cada SUBPÁGINA no título da aba ("Detalhe do incidente · Incidentes ·
 * Administração"). Dado, e não parâmetro livre: a cerca de idioma só traduz texto que
 * mora num catálogo, e é aqui que `tests/unit/i18n-catalogo-do-admin.test.ts` o lê.
 */
export const SUBPAGINAS_DO_ADMIN = {
  acao: "Detalhe da ação",
  pedidoLgpd: "Detalhe do pedido",
  incidente: "Detalhe do incidente",
  usuario: "Detalhe do usuário",
  empresa: "Detalhe da empresa",
  novaEmpresa: "Nova empresa",
  acessoNegado: "Acesso negado",
} as const;

export type SubpaginaDoAdmin = keyof typeof SUBPAGINAS_DO_ADMIN;

/**
 * Telas de primeiro nível que só REDIRECIONAM e por isso não têm porta no menu. A
 * cerca de completude (`tests/unit/admin-navegacao-completude.test.ts`) aceita só o
 * que estiver aqui, com o motivo escrito, e confere que a página não desenha nada.
 */
export const REDIRECIONAMENTOS_DO_ADMIN: readonly { de: string; para: string; motivo: string }[] = [
  {
    de: "/admin/modulos",
    para: "/admin/sistema#modulos",
    motivo:
      "Ocupava um item inteiro do menu para um botão só. Instalar módulo passou a morar no bloco Módulos de Recursos opcionais (issue #308); o endereço antigo continua valendo para favoritos e mensagens antigas.",
  },
];

export function itemDoAdmin(href: string): ItemDoAdmin | undefined {
  return CATALOGO_DO_ADMIN.find((i) => i.href === href);
}

/**
 * O item que "manda" num caminho: o próprio, ou a tela-mãe numa subpágina
 * (`/admin/tenants/<id>/health` → Empresas). É o que o menu marca como atual.
 */
export function itemAtualDoAdmin(pathname: string): ItemDoAdmin | undefined {
  return CATALOGO_DO_ADMIN.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export function grupoDoAdmin(id: GrupoDoAdmin): GrupoDoAdminDef {
  // O tipo garante que o grupo existe; o primeiro é só a rede de execução.
  return GRUPOS_DO_ADMIN.find((g) => g.id === id) ?? GRUPOS_DO_ADMIN[0]!;
}

/**
 * AS OPÇÕES DE SEGURANÇA DAS APIs, EXPLICADAS (issue #372) — o catálogo que a tela mostra.
 *
 * Quem configura isto não é programador. Por decisão do dono do produto, toda opção traz, NA
 * PRÓPRIA TELA: o nome sem jargão, uma frase do que ela faz, um exemplo do dia a dia, a posição
 * recomendada e a frase do risco de sair dela. Este arquivo é a fonte única desses textos — a
 * tela só os desenha —, e `tests/unit/api-generica-opcoes-explicadas.test.ts` reprova opção nova
 * que entre sem os cinco, ou sem tradução em espanhol e em inglês.
 *
 * As chaves são o texto em português (a regra de `lib/i18n/dicionario.ts`): quem lê este arquivo
 * lê o que a tela diz.
 *
 * Client-safe: só texto.
 */

export interface OpcaoExplicada {
  /** Identificador estável: a tela e o teste o usam; não aparece para a pessoa. */
  id: string;
  /** Onde a opção mora: na organização inteira ou em cada API cadastrada. */
  escopo: "organizacao" | "ferramenta";
  nome: string;
  /** Uma frase, sem termo técnico, do que a opção faz. */
  oQueFaz: string;
  /** Um exemplo concreto do dia a dia. */
  exemplo: string;
  /** A posição recomendada, dita como recomendação. */
  recomendacao: string;
  /** O que pode dar errado ao sair da posição recomendada. */
  risco: string;
  /**
   * `true` = sair do recomendado pede confirmação antes de salvar e deixa o selo «Fora do
   * recomendado». `false` = a opção é uma escolha de uso (não há posição «insegura»), e o risco
   * aparece como dica ao lado.
   */
  comAlerta: boolean;
}

export const OPCOES_EXPLICADAS: readonly OpcaoExplicada[] = [
  // ─── Da organização ────────────────────────────────────────────────────────
  {
    id: "ligar",
    escopo: "organizacao",
    nome: "Ligar as APIs",
    oQueFaz: "Permite que o agente consulte ou acione outros sistemas (loja, ERP, CRM) durante a conversa, pelas APIs que você cadastrar.",
    exemplo: "Com as APIs ligadas, o agente consegue ver na sua loja virtual onde está o pedido do cliente.",
    recomendacao: "Deixe desligado enquanto você não tiver uma API para conectar.",
    risco: "Com as APIs ligadas, o agente passa a poder enviar dados da conversa aos sistemas que você cadastrar. Ligue só quando souber quais sistemas são.",
    comAlerta: false,
  },
  {
    id: "quem_cadastra",
    escopo: "organizacao",
    nome: "Quem pode cadastrar APIs",
    oQueFaz: "Define quem da equipe pode cadastrar, editar e apagar APIs.",
    exemplo: "Em «só administrador», um gerente vê as APIs, mas não consegue cadastrar uma nova nem trocar a chave.",
    recomendacao: "Recomendamos deixar só para administrador.",
    risco: "Quem cadastra uma API escolhe para qual sistema os dados dos seus clientes são enviados. Liberar para gerentes aumenta o número de pessoas que podem fazer isso.",
    comAlerta: true,
  },
  {
    id: "dominios_permitidos",
    escopo: "organizacao",
    nome: "Endereços permitidos",
    oQueFaz: "Limita os sites que as APIs podem chamar. Com a lista vazia, vale qualquer endereço público da internet.",
    exemplo: "Com «api.loja.example.com» na lista, ninguém consegue cadastrar uma API que mande dados para outro site.",
    recomendacao: "Recomendamos listar os sites dos sistemas que você usa.",
    risco: "Com a lista vazia, uma API pode ser cadastrada para qualquer site da internet — inclusive por engano ou por alguém que entrou na conta de outra pessoa.",
    comAlerta: false,
  },
  {
    id: "somente_consulta",
    escopo: "organizacao",
    nome: "Somente consulta",
    oQueFaz: "Impede o agente de alterar qualquer coisa em outro sistema. Ele só consegue consultar.",
    exemplo: "Com isto ligado, o agente vê se o produto tem em estoque, mas não consegue criar nem cancelar um pedido.",
    recomendacao: "Recomendamos manter ligado enquanto você não precisar que o agente altere dados em outro sistema.",
    risco: "Com isto desligado, o agente pode criar, mudar ou apagar informações em outro sistema. Um engano dele vira um pedido errado, um cadastro duplicado ou um cancelamento indevido.",
    comAlerta: true,
  },
  {
    id: "aprovacao_obrigatoria",
    escopo: "organizacao",
    nome: "Aprovação sempre obrigatória",
    oQueFaz: "Faz toda ação que altera dados esperar uma pessoa aprovar na Central de avisos, e impede que alguém desligue essa aprovação numa API.",
    exemplo: "Com isto ligado, o agente só cria o pedido depois que você clicar em «Aprovar» na Central de avisos.",
    recomendacao: "Recomendamos manter ligado.",
    risco: "Com isto desligado, uma API pode ser configurada para o agente alterar dados sozinho, sem ninguém conferir. Se ele entender errado o que o cliente pediu, a ação já foi feita.",
    comAlerta: true,
  },
  {
    id: "dados_do_contato",
    escopo: "organizacao",
    nome: "Dados do contato que podem sair",
    oQueFaz: "Escolhe quais dados do cliente (telefone, nome, e-mail) as APIs podem enviar a outro sistema. O sistema preenche com os dados de quem está na conversa; o agente não escolhe.",
    exemplo: "Liberando o telefone, a API busca os pedidos de quem está conversando — e não os de outra pessoa que o cliente citar.",
    recomendacao: "Libere só o que alguma API realmente precisa. Nenhum dado sai por padrão.",
    risco: "Cada dado liberado passa a ser enviado ao sistema que você conectou. Pela LGPD, o envio de dados pessoais a terceiros precisa estar previsto na sua política de privacidade.",
    comAlerta: false,
  },
  {
    id: "quem_aprova",
    escopo: "organizacao",
    nome: "Quem pode aprovar",
    oQueFaz: "Define quem pode aprovar ou recusar, na Central de avisos, o que o agente quer fazer por uma API.",
    exemplo: "Em «só administrador», o gerente vê o pedido do agente na Central, mas os botões de aprovar e recusar são só do administrador.",
    recomendacao: "Recomendamos deixar só para administrador.",
    risco: "Aprovar faz a ação acontecer de verdade no outro sistema. Liberar para gerentes aumenta o número de pessoas que podem autorizar uma alteração.",
    comAlerta: true,
  },
  {
    id: "avisar_administrador",
    escopo: "organizacao",
    nome: "Aviso ao administrador",
    oQueFaz: "Abre um aviso na Central sempre que uma API é cadastrada, alterada ou apagada, quando a segurança muda e quando o agente altera dados sem aprovação.",
    exemplo: "Se alguém trocar a chave de uma API às 3 da manhã, você encontra o aviso na Central quando abrir o sistema.",
    recomendacao: "Recomendamos manter ligado.",
    risco: "Com isto desligado, uma mudança nas APIs ou na segurança pode passar sem que você saiba. Ela continua no registro de auditoria, mas ninguém é avisado.",
    comAlerta: true,
  },

  // ─── De cada API ───────────────────────────────────────────────────────────
  {
    id: "efeito_e_aprovacao",
    escopo: "ferramenta",
    nome: "O que a API faz e se pede aprovação",
    oQueFaz: "Diz se a API só consulta ou se altera dados no outro sistema, e se o agente precisa esperar uma pessoa aprovar antes de usá-la.",
    exemplo: "«Consultar pedido» só consulta e roda direto. «Cancelar pedido» altera dados e espera você aprovar.",
    recomendacao: "Recomendamos marcar como «altera dados» tudo o que cria, muda ou apaga, e manter a aprovação ligada nesses casos.",
    risco: "Marcar como «só consulta» uma API que altera dados faz o agente usá-la sem aprovação e repeti-la quando falha — a ação pode ser feita duas vezes.",
    comAlerta: true,
  },
  {
    id: "validade_do_pedido",
    escopo: "ferramenta",
    nome: "Prazo da aprovação",
    oQueFaz: "Define por quantas horas o pedido do agente espera uma decisão antes de ser cancelado sozinho.",
    exemplo: "Com 24 horas, um pedido que ninguém aprovou até o dia seguinte expira, e o agente avisa o cliente que a ação não foi feita.",
    recomendacao: "Recomendamos 24 horas.",
    risco: "Um prazo longo demais pode fazer uma ação ser aprovada dias depois, quando o cliente já não a quer mais.",
    comAlerta: false,
  },
  {
    id: "dados_do_contato_da_ferramenta",
    escopo: "ferramenta",
    nome: "Dados do contato que esta API recebe",
    oQueFaz: "Escolhe quais dados de quem está na conversa esta API envia, dentro do que a organização liberou.",
    exemplo: "Marcando o telefone, a API recebe o número de quem está conversando, sem o agente poder trocá-lo por outro.",
    recomendacao: "Marque só o que esta API precisa para funcionar.",
    risco: "O dado marcado é enviado ao outro sistema em toda chamada desta API.",
    comAlerta: false,
  },
  {
    id: "campos_da_resposta",
    escopo: "ferramenta",
    nome: "O que o agente lê da resposta",
    oQueFaz: "Escolhe quais informações da resposta do outro sistema chegam ao agente. O resto é descartado.",
    exemplo: "Escolhendo «status» e «previsao_de_entrega», o agente não recebe o endereço nem o CPF que a loja também devolve.",
    recomendacao: "Recomendamos escolher só as informações que o agente precisa para responder.",
    risco: "Sem escolher, o agente lê a resposta inteira: a conversa fica mais cara e ele pode receber dados que não precisava ver.",
    comAlerta: false,
  },
  {
    id: "limite_de_uso",
    escopo: "ferramenta",
    nome: "Limite de uso",
    oQueFaz: "Limita quantas vezes o agente pode usar esta API na mesma conversa e no total, a cada 24 horas.",
    exemplo: "Com 5 por conversa, se o agente entrar em repetição ele para na quinta chamada e você é avisado.",
    recomendacao: "Recomendamos manter os dois limites.",
    risco: "Sem limite, um defeito ou um cliente insistente pode fazer centenas de chamadas: o outro sistema pode bloquear a sua chave ou cobrar pelo excesso.",
    comAlerta: true,
  },
  {
    id: "agentes_e_pausa",
    escopo: "ferramenta",
    nome: "Quais agentes usam e pausar",
    oQueFaz: "A API só é usada pelos agentes em que você a marcar, na tela do agente. E o interruptor da lista pausa a API para todos de uma vez.",
    exemplo: "Se o outro sistema sair do ar, desligue o interruptor: nenhum agente tenta usar a API até você ligar de novo.",
    recomendacao: "Marque a API só nos agentes que precisam dela.",
    risco: "Uma API marcada em um agente que não precisa dela pode ser usada numa conversa em que não faz sentido.",
    comAlerta: false,
  },
  {
    id: "valores_permitidos",
    escopo: "ferramenta",
    nome: "Valores permitidos por campo",
    oQueFaz: "Limita o que o agente pode preencher em cada campo: uma lista de opções para texto, ou um mínimo e um máximo para número.",
    exemplo: "Com quantidade de 1 a 10, o agente não consegue pedir 1.000 unidades por engano.",
    recomendacao: "Recomendamos limitar todo campo que tem poucos valores válidos.",
    risco: "Sem limite, o agente pode enviar um valor absurdo que o outro sistema aceite.",
    comAlerta: false,
  },
  {
    id: "pausa_automatica",
    escopo: "ferramenta",
    nome: "Pausa automática após falhas",
    oQueFaz: "Pausa a API sozinha quando ela falha várias vezes seguidas, e avisa você na Central.",
    exemplo: "Se a chave vencer e a API falhar 5 vezes seguidas, ela é pausada e você recebe o aviso para trocar a chave.",
    recomendacao: "Recomendamos manter ligada.",
    risco: "Sem a pausa, o agente continua tentando uma API que não funciona, e cada cliente que depende dela fica sem resposta.",
    comAlerta: true,
  },
];

/**
 * Quantas opções o produto promete (issue #372). O teste cobra o número: opção não some em silêncio.
 * Eram 17; a «verificação em duas etapas para mexer nas APIs» saiu por decisão do dono (20/11/2026).
 */
export const TOTAL_DE_OPCOES = 16;

export function opcaoExplicada(id: string): OpcaoExplicada {
  const opcao = OPCOES_EXPLICADAS.find((o) => o.id === id);
  if (!opcao) throw new Error(`opção de segurança desconhecida: ${id}`);
  return opcao;
}

// ─── Nível de segurança ──────────────────────────────────────────────────────

export interface NivelExplicado {
  id: "mais_seguro" | "equilibrado" | "personalizado";
  nome: string;
  oQueFaz: string;
  exemplo: string;
}

export const NIVEIS_EXPLICADOS: readonly NivelExplicado[] = [
  {
    id: "mais_seguro",
    nome: "Mais seguro",
    oQueFaz: "O agente só consulta, e só administrador cadastra e aprova.",
    exemplo: "Bom para começar: o agente vê o estoque e o andamento do pedido, e nada é alterado em outro sistema.",
  },
  {
    id: "equilibrado",
    nome: "Equilibrado",
    oQueFaz: "O agente também pode alterar dados, mas toda alteração espera uma pessoa aprovar. Gerentes podem aprovar.",
    exemplo: "Bom quando o agente precisa criar um pedido ou agendar algo no outro sistema, com você conferindo antes.",
  },
  {
    id: "personalizado",
    nome: "Personalizado",
    oQueFaz: "Você ajusta opção por opção. A tela avisa o risco de cada mudança e marca o que ficar fora do recomendado.",
    exemplo: "Para quem já conhece as opções e quer uma combinação diferente das duas acima.",
  },
];

/** A frase do risco de escolher o nível «Equilibrado» de uma vez. */
export const RISCO_DO_NIVEL_EQUILIBRADO =
  "No nível «Equilibrado» o agente passa a poder alterar dados em outro sistema (sempre com aprovação), e gerentes passam a poder aprovar.";

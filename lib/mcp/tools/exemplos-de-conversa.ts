/**
 * Um exemplo de conversa para cada capacidade do catálogo: o que o cliente diz (ou o que
 * acontece) e o que o agente faz com isso.
 *
 * Existe porque a explicação diz O QUE a capacidade faz, e quem configura um agente (dono
 * de clínica, de loja) decide melhor vendo QUANDO ela entra numa conversa de verdade. A
 * tela de «O que o agente pode fazer» mostra o exemplo embaixo da explicação.
 *
 * Mora fora de `catalogo/` de propósito: é texto de tela, não contrato da capacidade, e
 * a rota `/api/v1/mcp/tools` junta os dois em `catalogo-servido.ts`. Toda capacidade do
 * catálogo precisa de um exemplo, com tradução em espanhol e inglês — quem cobra é
 * `tests/unit/exemplos-de-conversa.test.ts`.
 *
 * Este módulo é CLIENT-SAFE: só texto.
 */
export const EXEMPLOS_DE_CONVERSA: Readonly<Record<string, string>> = {
  crm_list_event_types:
    "Cliente: «quanto tempo dura a avaliação?» → o agente vê que a avaliação dura 40 minutos e é presencial.",
  crm_find_free_slots:
    "Cliente: «tem horário na quinta à tarde?» → o agente vê que a Dra. Paula está livre às 14h e às 16h.",
  crm_list_appointments:
    "Cliente: «qual era mesmo o meu horário?» → o agente encontra a consulta de sexta, às 10h, ainda marcada.",
  crm_find_and_book_appointment:
    "Cliente: «pode ser quinta às 15h?» → o agente confere que está livre e já reserva, na mesma resposta.",
  crm_book_appointment:
    "Cliente escolhe «quinta às 15h» → o agente reserva o horário com a Dra. Paula e a agenda dela passa a mostrar a consulta.",
  crm_reschedule_appointment:
    "Cliente: «não vou conseguir quinta, pode ser sexta?» → o agente passa a consulta para sexta, no mesmo horário.",
  crm_confirm_appointment:
    "Cliente responde «confirmado, estarei lá» → o agente marca a consulta como confirmada para a recepção ver.",
  crm_set_appointment_outcome:
    "Cliente: «desculpa, ontem não consegui ir» → o agente registra que ele faltou à consulta de ontem.",
  crm_cancel_appointment:
    "Cliente: «pode cancelar a consulta de sexta» → o agente desmarca e o horário volta a ficar livre para outra pessoa.",
  crm_search_contacts:
    "Mensagem chega de um número novo dizendo «sou a Ana Souza» → o agente procura e encontra o cadastro antigo dela.",
  crm_get_contact:
    "Antes de responder, o agente abre a ficha e vê que a cliente chegou pelo anúncio do Instagram e já comprou duas vezes.",
  crm_propose_contact_field:
    "Cliente: «meu e-mail é ana@email.com» → o e-mail fica esperando alguém da equipe conferir antes de ir para a ficha.",
  crm_list_conversations:
    "O agente vê que já há uma conversa aberta com este cliente, atendida pelo Carlos, e não abre outra.",
  crm_get_conversation:
    "O agente vê que a conversa está com o marcador «reclamação» e que a cliente espera há 20 minutos.",
  crm_get_conversation_history:
    "Cliente volta dois dias depois: «e aquele orçamento?» → o agente sabe de qual orçamento ele está falando.",
  crm_send_whatsapp_message:
    "O sistema já envia sozinho a resposta do agente no fim de cada turno; esta capacidade não precisa ser ligada.",
  crm_start_conversation_and_send:
    "Alguém pede «avise a Joana que o pedido chegou» → o agente cadastra a Joana, abre a conversa e manda a mensagem para ela.",
  crm_create_conversation_draft:
    "O sistema da loja manda «pedido 4521 saiu para entrega» → o texto fica no campo de resposta para a atendente revisar e enviar.",
  crm_list_available_attendants:
    "Cliente pede para falar com alguém → o agente vê que a Bia está livre e o Carlos já tem cinco conversas.",
  crm_list_human_cases:
    "Cliente pergunta do reembolso de novo → o agente vê que já existe um chamado aberto para isso e não abre outro.",
  crm_get_human_case:
    "O agente lê que o gerente aprovou o desconto de 10% e responde ao cliente com essa decisão.",
  crm_add_case_note:
    "Cliente manda a foto do produto quebrado → o agente anota no chamado que a foto chegou e quando.",
  crm_close_human_case:
    "A troca foi feita e o cliente agradeceu → o agente fecha o chamado com o desfecho «troca concluída».",
  crm_resume_ai_attendance:
    "A atendente terminou de negociar o prazo → ela devolve a conversa ao agente, que segue a partir do que ficou combinado.",
  crm_list_leads:
    "O agente vê que esta cliente já tem uma oportunidade em «Proposta enviada», sob responsabilidade do Carlos.",
  crm_get_lead:
    "O agente abre a oportunidade e vê o valor de R$ 3.200 e o marcador «plano anual».",
  crm_list_pipelines:
    "O agente vê que a empresa tem os funis «Vendas» e «Pós-venda» e escolhe o certo para o pedido.",
  crm_get_pipeline_forecast:
    "Gestor pergunta «quanto deve entrar este mês?» → o agente soma os negócios abertos com a chance de cada etapa.",
  crm_create_lead:
    "Cliente pergunta o preço do plano anual → nasce uma oportunidade em «Interessado», com o valor do plano.",
  crm_update_lead:
    "Cliente diz que são três pessoas, não uma → o agente atualiza o valor do negócio para três matrículas.",
  crm_move_lead_stage:
    "Cliente manda o comprovante → o negócio vai de «Proposta enviada» para «Pago».",
  crm_retomar_lead:
    "Quem desistiu em março volta perguntando de novo → o agente abre uma nova tentativa, sem mexer no negócio perdido.",
  crm_get_queue_status:
    "O agente vê que há oito pessoas esperando e avisa o cliente que a espera é de cerca de 15 minutos.",
  crm_assign_conversation:
    "Cliente pede o financeiro → o agente passa a conversa para a Marta, que cuida das cobranças.",
  crm_manage_tags:
    "Cliente diz que é revendedor → o agente aplica o marcador «revenda» na conversa.",
  crm_request_human_handoff:
    "Cliente: «quero falar com alguém» → a Bia recebe a conversa com o resumo do que já foi dito.",
  crm_search_knowledge:
    "Cliente: «vocês parcelam?» → o agente encontra a política de pagamento no material que você cadastrou.",
  crm_list_knowledge_sources:
    "O agente não acha o horário de funcionamento → vê que o PDF com essa informação ainda está sendo processado.",
  crm_list_improvement_proposals:
    "O agente vê que já existe a sugestão «responder sobre frete grátis» esperando aprovação e não repete o pedido.",
  crm_get_org_memory:
    "Cliente pede desconto → o agente lê a regra da casa «desconto só no Pix, até 5%» e segue ela.",
  crm_save_org_memory:
    "Três clientes perguntaram do estacionamento → o agente propõe a regra «há estacionamento conveniado na rua de trás» para um gestor aprovar.",
  crm_list_contact_orders:
    "Cliente: «meu pedido já saiu?» → o agente vê que o pedido de terça foi enviado ontem.",
  crm_search_products:
    "Cliente: «tem a camiseta azul no M?» → o agente encontra o produto, o preço cadastrado e o estoque.",
  crm_draft_proposal:
    "Cliente fecha «plano anual para três pessoas» → o agente deixa a proposta rascunhada para a equipe revisar e enviar.",
  crm_preparar_proposta:
    "Antes de rascunhar, o agente vê que o modelo pede CNPJ e endereço e pergunta isso ao cliente.",
  crm_list_privacy_requests:
    "O agente vê que este cliente pediu para apagar os dados e não oferece mais promoções a ele.",
  crm_describe_external_data:
    "Antes de buscar um pedido, o agente vê que o banco conectado tem a tabela «pedidos» com o campo «status».",
  crm_query_external_data:
    "Cliente: «e o pedido 4521?» → o agente lê no banco conectado que o status é «em separação».",
  crm_get_honorarios_contrato:
    "Cliente: «quanto vocês ficam se ganharmos?» → o agente vê no contrato que o êxito é de 20%.",
  crm_list_honorarios_parcelas:
    "Cliente: «a parcela de maio já foi paga?» → o agente confirma que sim, paga no dia 10.",
  crm_list_stages:
    "O agente vê que, depois de «Visita marcada», a próxima etapa do funil é «Proposta».",
  crm_create_stage:
    "A equipe passou a fazer vistoria antes da proposta → o agente cria a etapa «Vistoria» no fim do funil.",
  crm_update_stage:
    "Gestor pede para chamar «Negociação» de «Em conversa» → o agente renomeia a etapa.",
  crm_archive_stage:
    "Gestor pede para tirar a etapa «Aguardando boleto» → o agente arquiva a coluna e leva os negócios dela para «Proposta».",
  crm_list_tags:
    "Antes de marcar, o agente vê que a empresa já usa «revenda» e não cria um «revendedor» repetido.",
  crm_list_message_templates:
    "Cliente pergunta do horário → o agente acha a resposta pronta «/horario» que a equipe já usa.",
  crm_render_message_template:
    "O agente pega a resposta pronta «Olá, [nome]» e preenche com «Olá, Ana», sem enviar nada.",
  crm_list_webhook_sources:
    "Gestor pergunta por que os contatos do site sumiram → o agente vê que a entrada do formulário está desligada.",
  crm_list_webhook_source_events:
    "O agente vê que o último contato do site chegou sem telefone e explica por que ele não caiu no funil.",
  crm_create_webhook_source:
    "Gestor pede uma entrada para o formulário novo do site → o agente cria o endereço que manda os contatos para «Vendas».",
  crm_set_webhook_source_active:
    "Gestor pede para pausar os contatos da campanha que acabou → o agente desliga aquela entrada.",
  crm_list_automation_rules:
    "Gestor pergunta «o que acontece quando alguém paga?» → o agente mostra a regra que move o negócio e avisa o financeiro.",
  crm_list_automation_runs:
    "O agente vê que a regra de boas-vindas falhou nas últimas três vezes e conta isso ao gestor.",
  crm_set_automation_rule_active:
    "Gestor pede para parar a mensagem automática de aniversário → o agente desliga essa regra.",
  crm_list_team_members:
    "Cliente pede o responsável pelas obras → o agente vê que é o Rafael e passa o atendimento para ele.",
  crm_schedule_followup:
    "Cliente: «me chama mês que vem» → o agente marca para voltar a escrever no dia 18.",
  crm_enroll_followup_flow:
    "Cliente pediu orçamento e sumiu → o agente coloca ele no acompanhamento «Orçamento sem resposta».",
  crm_cancel_followup:
    "Cliente respondeu antes da data combinada → o agente cancela o retorno que ainda estava marcado.",
  crm_list_followups:
    "O agente vê que já há um retorno marcado para sexta e não marca outro em cima.",
  crm_list_at_risk_leads:
    "Gestor pergunta «quem está esfriando?» → o agente lista os cinco negócios parados há mais de uma semana.",
  crm_close_demand:
    "Cliente diz «fechei com outra empresa» → o agente encerra o negócio como perdido, com esse motivo.",
  crm_propose_reactivation:
    "Uma cliente parou de responder há 20 dias → o agente sugere retomar o contato, e uma pessoa aprova antes de qualquer envio.",
};

/** O exemplo da capacidade, ou `null` quando ela ainda não tem um. */
export function exemploDeConversa(nome: string): string | null {
  return Object.hasOwn(EXEMPLOS_DE_CONVERSA, nome) ? (EXEMPLOS_DE_CONVERSA[nome] ?? null) : null;
}

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, contador e frase aqui são os que a tela mostra em cada idioma (`Assumir` / `Asumir` /
 * `Take over`; `Abrir conversa` / `Abrir conversación` / `Open conversation`; `Ver no funil` /
 * `Ver en el embudo` / `View in pipeline`; `Resgatar com disparo em massa` / `Recuperar con envío masivo` /
 * `Win back with a bulk send`; cartões `Crítico`, `Em risco`, `Em voo` / `Crítico`,
 * `En riesgo`, `En curso` / `Critical`, `At risk`, `In flight`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os negócios e as demandas que esfriaram e precisam de você. Se já existe um retorno agendado, o negócio aparece como em voo; sem retorno, é risco de perder o cliente.",
    passos: [
      "No alto, quatro cartões mostram quantos negócios parados há em cada situação: Todos, Crítico, Em risco e Em voo. Clique em um cartão para ver só os daquela situação; a lista vem com os mais graves primeiro.",
      "Logo abaixo, em Também pedem atenção, aparecem (quando existem) as demandas abertas sem próximo passo, as propostas vencidas e as propostas para revisar. Clique em cada uma para abrir a lista dela.",
      "Em cada linha você vê o nome do cliente em destaque, o título do negócio, há quanto tempo está parado, o funil e a etapa, quem cuida dele e o retorno: Assistente retorna em um prazo, ou Sem retorno agendado.",
      "Clique na linha ou em Abrir conversa para falar com o cliente em Conversas. Ver no funil abre o cartão do negócio no funil. Quando o cliente ainda não tem conversa, a linha avisa e leva ao cartão no funil.",
      "Use Assumir quando o negócio ainda não tem atendente. O botão só aparece se há conversa e nenhuma pessoa cuida dela.",
      "Mostrar mais traz as próximas linhas da mesma lista.",
      "Gerente e administrador veem Resgatar com disparo em massa acima da lista: o botão guarda as pessoas da situação escolhida numa lista salva e abre uma nova campanha com elas já no público. Nada é enviado nesse clique.",
    ],
    termos: [
      { termo: "Crítico / Em risco / Em voo", significa: "Crítico: parado há muito tempo e sem retorno combinado. Em risco: esfriou e está sem retorno. Em voo: esfriou, mas já existe um retorno agendado." },
      { termo: "Demanda", significa: "Um atendimento ou negócio aberto de um cliente que ainda não foi concluído." },
      { termo: "Sem dono", significa: "Nenhuma pessoa nem agente de IA é responsável pela demanda." },
      { termo: "Assumir", significa: "Tira a demanda da IA e traz para você, para que você mesmo continue a conversa." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los negocios y los casos que se enfriaron y te necesitan. Si ya hay un seguimiento programado, el negocio aparece como en curso; sin seguimiento, hay riesgo de perder al cliente.",
    passos: [
      "Arriba, cuatro tarjetas muestran cuántos negocios detenidos hay en cada situación: Todos, Crítico, En riesgo y En curso. Haz clic en una tarjeta para ver solo los de esa situación; la lista viene con los más graves primero.",
      "Justo debajo, en También piden atención, aparecen (cuando existen) los casos abiertos sin siguiente paso, las propuestas vencidas y las propuestas para revisar. Haz clic en cada una para abrir su lista.",
      "En cada fila ves el nombre del cliente destacado, el título del negocio, hace cuánto está detenido, el embudo y la etapa, quién se ocupa de él y el seguimiento: El asistente dará seguimiento en un plazo, o Sin seguimiento programado.",
      "Haz clic en la fila o en Abrir conversación para hablar con el cliente en Conversaciones. Ver en el embudo abre la tarjeta del negocio en el embudo. Cuando el cliente aún no tiene conversación, la fila lo avisa y lleva a la tarjeta en el embudo.",
      "Usa Asumir cuando el negocio aún no tiene asesor. El botón solo aparece si hay conversación y ninguna persona se ocupa de ella.",
      "Mostrar más trae las siguientes filas de la misma lista.",
      "Gerente y administrador ven Recuperar con envío masivo arriba de la lista: el botón guarda a las personas de la situación elegida en una lista guardada y abre una nueva campaña con ellas ya en la audiencia. No se envía nada con ese clic.",
    ],
    termos: [
      { termo: "Crítico / En riesgo / En curso", significa: "Crítico: detenido hace mucho tiempo y sin seguimiento acordado. En riesgo: se enfrió y no tiene seguimiento. En curso: se enfrió, pero ya hay un seguimiento programado." },
      { termo: "Caso", significa: "Una atención o negocio abierto de un cliente que todavía no se concluyó." },
      { termo: "Sin responsable", significa: "Ninguna persona ni agente de IA es responsable del caso." },
      { termo: "Asumir", significa: "Saca el caso de la IA y lo trae a ti, para que continúes tú mismo la conversación." },
    ],
  },
  en: {
    oQueMostra:
      "This is where deals and cases that went cold and need you live. If a follow-up is already scheduled, the deal shows as in flight; with no follow-up, there is a risk of losing the customer.",
    passos: [
      "At the top, four cards show how many stalled deals are in each situation: All, Critical, At risk and In flight. Click a card to see only the deals in that situation; the list comes with the most severe first.",
      "Right below, under Also need attention, you see (when they exist) open cases with no next step, expired proposals and proposals to review. Click each one to open its list.",
      "On each row you see the customer's name highlighted, the deal title, how long it has been stalled, the pipeline and stage, who is handling it and the follow-up: Assistant follows up in a given time, or No follow-up scheduled.",
      "Click the row or Open conversation to talk to the customer in Conversations. View in pipeline opens the deal's card in the pipeline. When the customer has no conversation yet, the row says so and takes you to the card in the pipeline.",
      "Use Take over when the deal has no agent yet. The button only appears if there is a conversation and no person is handling it.",
      "Show more brings the next rows of the same list.",
      "Managers and admins see Win back with a bulk send above the list: the button saves the people in the chosen situation to a saved list and opens a new campaign with them already in the audience. Nothing is sent by that click.",
    ],
    termos: [
      { termo: "Critical / At risk / In flight", significa: "Critical: stalled for a long time with no follow-up arranged. At risk: went cold with no follow-up. In flight: went cold, but a follow-up is already scheduled." },
      { termo: "Case", significa: "An open conversation or deal of a customer that has not been concluded yet." },
      { termo: "No owner", significa: "No person or AI agent is responsible for the case." },
      { termo: "Take over", significa: "Takes the case away from the AI and brings it to you, so you continue the conversation yourself." },
    ],
  },
};

export default ajuda;

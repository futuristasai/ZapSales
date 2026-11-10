/**
 * A AJUDA DE CADA PASSO DO ASSISTENTE DE INSTALAÇÃO.
 *
 * Mora aqui, e não no dicionário de `t()`, pelo mesmo motivo de `lib/ajuda/tipos.ts`: é texto LONGO
 * (parágrafos e perguntas com resposta), e traduzir parágrafo por chave-em-português dá chave de
 * 300 caracteres. Os três idiomas moram lado a lado, na mesma entrada — quem revisa lê os três juntos.
 *
 * Idioma sem entrada cai em inglês e depois em português: nunca em erro, nunca em chave crua.
 *
 * ⚠️ Nada aqui afirma o que o código não faz. Cada frase de "como preencher" descreve um campo que
 * existe na tela daquele passo, e cada "se deixar para depois" descreve um botão que existe nela.
 * Se um passo mudar, a ajuda dele muda junto — é o texto que o dono lê quando está em dúvida.
 *
 * A ORDEM dos passos, os rótulos e o que conta como "feito" continuam em `passos.ts`: este arquivo
 * só acrescenta o que a PESSOA precisa para decidir (quanto tempo leva, para que serve, o que
 * escrever). `tests/unit/onboarding-ajuda-cobre-os-passos.test.ts` cobra que nenhum passo fique sem.
 */
import type { Idioma } from "@/lib/i18n/idiomas";

export interface DuvidaDoPasso {
  readonly pergunta: string;
  readonly resposta: string;
}

export interface TextoDoPasso {
  /** Uma linha para a trilha lateral: o que se faz neste passo. */
  readonly resumo: string;
  /** Para que serve o passo — a razão de a pergunta existir. */
  readonly paraQueServe: string;
  /** O que escrever ou escolher, na ordem em que a tela pede. */
  readonly comoPreencher: readonly string[];
  /** As dúvidas que quem instala realmente tem. */
  readonly duvidas: readonly DuvidaDoPasso[];
  /** O que acontece se a pessoa pular. Só existe em passo que pode ser pulado. */
  readonly seDeixarParaDepois?: string;
}

export interface PassoComAjuda {
  /** Estimativa honesta, em minutos, para quem tem o que precisa em mãos. */
  readonly minutos: number;
  /** Tem botão de pular na tela? Alimenta o selo "Pode ficar para depois". */
  readonly podePular: boolean;
  readonly texto: { readonly "pt-BR": TextoDoPasso } & Partial<Record<Idioma, TextoDoPasso>>;
}

export const AJUDA_DOS_PASSOS: Readonly<Record<string, PassoComAjuda>> = {
  welcome: {
    minutos: 1,
    podePular: false,
    texto: {
      "pt-BR": {
        resumo: "Nome do negócio, o que vocês fazem e onde atendem.",
        paraQueServe:
          "O sistema usa estas três respostas para falar do jeito certo com o seu cliente: o nome aparece para o seu time e nos relatórios, o ramo ensina o seu funcionário com quem ele está falando, e o lugar define o horário em que ele pode escrever.",
        comoPreencher: [
          "Nome do negócio: como os seus clientes conhecem a empresa. Pode ser clínica, loja, escritório — o que for seu.",
          "O que vocês fazem: uma linha basta. Por exemplo, «clínica odontológica» ou «venda de roupa fitness pelo WhatsApp».",
          "Onde você atende: escolha a cidade que tem o mesmo horário que o seu atendimento.",
          "Marque o aceite dos termos para liberar o botão Continuar. Os dois documentos abrem em outra aba, sem perder o que você escreveu.",
        ],
        duvidas: [
          {
            pergunta: "Preciso saber de tecnologia para continuar?",
            resposta:
              "Não. Os próximos passos têm sempre uma opção sugerida, e cada tela explica a escolha com palavras do dia a dia.",
          },
          {
            pergunta: "Dá para mudar essas respostas depois?",
            resposta:
              "Dá. Nome, ramo e horário podem ser ajustados a qualquer momento nas configurações da empresa.",
          },
          {
            pergunta: "Por que perguntam o que a empresa faz?",
            resposta:
              "Sem isso o seu funcionário se apresentaria como atendente de uma loja online, e o quadro de clientes nasceria com colunas de e-commerce. Com uma linha sua, os dois já nascem do seu ramo.",
          },
        ],
      },
      es: {
        resumo: "Nombre del negocio, a qué se dedican y dónde atienden.",
        paraQueServe:
          "El sistema usa estas tres respuestas para hablar bien con tu cliente: el nombre aparece para tu equipo y en los informes, el rubro le enseña a tu empleado con quién está hablando, y el lugar define el horario en que puede escribir.",
        comoPreencher: [
          "Nombre del negocio: como tus clientes conocen la empresa. Puede ser clínica, tienda, oficina — lo que sea tuyo.",
          "A qué se dedican: una línea basta. Por ejemplo, «clínica odontológica» o «venta de ropa fitness por WhatsApp».",
          "Dónde atiendes: elige la ciudad con el mismo horario que tu atención.",
          "Marca la aceptación de los términos para habilitar el botón Continuar. Los dos documentos se abren en otra pestaña, sin perder lo que escribiste.",
        ],
        duvidas: [
          {
            pergunta: "¿Necesito saber de tecnología para continuar?",
            resposta:
              "No. Los próximos pasos siempre traen una opción sugerida, y cada pantalla explica la elección con palabras de todos los días.",
          },
          {
            pergunta: "¿Puedo cambiar estas respuestas después?",
            resposta:
              "Sí. El nombre, el rubro y el horario se pueden ajustar en cualquier momento en la configuración de la empresa.",
          },
          {
            pergunta: "¿Por qué preguntan a qué se dedica la empresa?",
            resposta:
              "Sin eso tu empleado se presentaría como asistente de una tienda en línea, y el tablero de clientes nacería con columnas de comercio electrónico. Con una línea tuya, los dos nacen de tu rubro.",
          },
        ],
      },
      en: {
        resumo: "Business name, what you do and where you serve.",
        paraQueServe:
          "The system uses these three answers to talk to your customers the right way: the name shows up for your team and in reports, the line of business teaches your employee who they are talking to, and the location sets the hours when they may write.",
        comoPreencher: [
          "Business name: how your customers know the company. A clinic, a shop, an office — whatever is yours.",
          "What you do: one line is enough. For example, “dental clinic” or “selling fitness clothing over WhatsApp”.",
          "Where you serve: pick the city that shares your service hours.",
          "Tick the terms to enable the Continue button. Both documents open in another tab, so you keep what you typed.",
        ],
        duvidas: [
          {
            pergunta: "Do I need to know technology to continue?",
            resposta:
              "No. The next steps always suggest an option, and every screen explains the choice in everyday words.",
          },
          {
            pergunta: "Can I change these answers later?",
            resposta:
              "Yes. The name, line of business and hours can be adjusted at any time in the company settings.",
          },
          {
            pergunta: "Why do you ask what the company does?",
            resposta:
              "Without it your employee would introduce themselves as an online-shop assistant, and the customer board would start with e-commerce columns. With one line from you, both start from your line of business.",
          },
        ],
      },
    },
  },

  "connect-whatsapp": {
    minutos: 3,
    podePular: true,
    texto: {
      "pt-BR": {
        resumo: "Ligue o número de WhatsApp pelo qual ele atende.",
        paraQueServe:
          "O seu funcionário precisa de um número de WhatsApp para receber e responder os clientes. Aqui você liga esse número ao sistema, de um dos dois jeitos que existem.",
        comoPreencher: [
          "Escolha como você usa o número hoje: pelo aplicativo no celular, ou como conta oficial cadastrada na Meta.",
          "Pelo celular: no WhatsApp, abra Aparelhos conectados e leia o QR Code da tela — ou digite o código de pareamento.",
          "Conta oficial: tenha em mãos as credenciais do número, as mesmas que a Meta mostra no cadastro.",
          "Errou a escolha? Há sempre o link «Escolher outra forma» no alto do quadro.",
        ],
        duvidas: [
          {
            pergunta: "Qual das duas eu escolho?",
            resposta:
              "Para começar hoje e atender conversas, o celular é o caminho mais curto. A conta oficial da Meta é a indicada para campanhas em massa. As duas podem conviver depois, em Conexões.",
          },
          {
            pergunta: "O QR Code expirou. E agora?",
            resposta:
              "É normal: ele vale poucos minutos. Deixe o WhatsApp já aberto em Aparelhos conectados e use «Gerar novo QR Code».",
          },
          {
            pergunta: "O número deixa de funcionar no meu celular?",
            resposta:
              "Não. Conectar é como abrir o WhatsApp em outro aparelho: o seu celular continua com o número.",
          },
        ],
        seDeixarParaDepois:
          "Sem número ele não tem por onde atender, mas dá para treinar e ensaiar mesmo assim. Conecte quando puder, em Conexões.",
      },
      es: {
        resumo: "Conecta el número de WhatsApp con el que atiende.",
        paraQueServe:
          "Tu empleado necesita un número de WhatsApp para recibir y responder a los clientes. Aquí conectas ese número al sistema, de una de las dos formas que existen.",
        comoPreencher: [
          "Elige cómo usas el número hoy: con la aplicación en el celular, o como cuenta oficial registrada en Meta.",
          "Por el celular: en WhatsApp, abre Dispositivos vinculados y lee el código QR de la pantalla — o escribe el código de emparejamiento.",
          "Cuenta oficial: ten a mano las credenciales del número, las mismas que Meta muestra en el registro.",
          "¿Elegiste mal? Siempre está el enlace «Elegir otra forma» en la parte de arriba del cuadro.",
        ],
        duvidas: [
          {
            pergunta: "¿Cuál de las dos elijo?",
            resposta:
              "Para empezar hoy y atender conversaciones, el celular es el camino más corto. La cuenta oficial de Meta es la indicada para campañas masivas. Las dos pueden convivir después, en Conexiones.",
          },
          {
            pergunta: "El código QR expiró. ¿Y ahora?",
            resposta:
              "Es normal: dura pocos minutos. Deja WhatsApp ya abierto en Dispositivos vinculados y usa «Generar nuevo código QR».",
          },
          {
            pergunta: "¿El número deja de funcionar en mi celular?",
            resposta:
              "No. Conectar es como abrir WhatsApp en otro dispositivo: tu celular sigue con el número.",
          },
        ],
        seDeixarParaDepois:
          "Sin número no tiene por dónde atender, pero igual puedes entrenarlo y hacer pruebas. Conéctalo cuando puedas, en Conexiones.",
      },
      en: {
        resumo: "Connect the WhatsApp number they answer from.",
        paraQueServe:
          "Your employee needs a WhatsApp number to receive and answer customers. Here you connect that number to the system, in one of the two ways available.",
        comoPreencher: [
          "Choose how you use the number today: through the app on your phone, or as an official account registered with Meta.",
          "From your phone: in WhatsApp open Linked devices and scan the QR code on screen — or type the pairing code.",
          "Official account: have the number's credentials at hand, the same ones Meta shows in the registration.",
          "Picked the wrong one? The “Choose another way” link is always at the top of the box.",
        ],
        duvidas: [
          {
            pergunta: "Which of the two should I choose?",
            resposta:
              "To start today and handle conversations, the phone is the shortest path. The official Meta account is the one for mass campaigns. Both can live side by side later, in Connections.",
          },
          {
            pergunta: "The QR code expired. Now what?",
            resposta:
              "That's normal: it lasts only a few minutes. Keep WhatsApp already open on Linked devices and use “Generate new QR code”.",
          },
          {
            pergunta: "Does the number stop working on my phone?",
            resposta:
              "No. Connecting is like opening WhatsApp on another device: your phone keeps the number.",
          },
        ],
        seDeixarParaDepois:
          "Without a number they have nowhere to answer from, but you can still train and rehearse. Connect whenever you can, in Connections.",
      },
    },
  },

  "setup-ai": {
    minutos: 3,
    podePular: true,
    texto: {
      "pt-BR": {
        resumo: "Dê nome, jeito de falar e regras a ele.",
        paraQueServe:
          "É aqui que nasce o seu funcionário de IA: quem ele é, como fala e o que a casa exige dele. Nada fica escrito em pedra — tudo pode ser mudado depois.",
        comoPreencher: [
          "O cérebro dele: a chave da empresa de IA que ele usa para pensar. Se a instalação já trouxe uma, ela aparece como pronta.",
          "Como ele vai se chamar: é o nome que o seu time vê. O cliente vê só a conversa.",
          "O ramo: escolher Vendas, Suporte ou Agendamento já traz o perfil e as instruções escritos. Sem ramo, você escolhe só o jeito de falar.",
          "As regras da casa: uma regra por linha, curtas e diretas. Por exemplo, «Nunca prometa desconto sem confirmar com uma pessoa».",
        ],
        duvidas: [
          {
            pergunta: "Preciso entender de inteligência artificial?",
            resposta:
              "Não. Escolha o ramo que mais se parece com o seu e siga: o sistema escreve as instruções por você.",
          },
          {
            pergunta: "O que é essa chave?",
            resposta:
              "É uma senha que liga o sistema à empresa de IA que dá o cérebro ao funcionário. Ela fica guardada com segurança, e a tela só mostra o final dela.",
          },
          {
            pergunta: "Existe algo que ele não pode fazer?",
            resposta:
              "As conferências que rodam antes de cada mensagem sair estão listadas no fim desta tela. Elas valem sempre e não têm interruptor.",
          },
        ],
        seDeixarParaDepois:
          "Ele fica como rascunho e não responde ninguém até você treiná-lo em IA › Agentes. O resto do assistente segue normalmente.",
      },
      es: {
        resumo: "Dale nombre, forma de hablar y reglas.",
        paraQueServe:
          "Aquí nace tu empleado de IA: quién es, cómo habla y qué le exige la casa. Nada queda escrito en piedra — todo se puede cambiar después.",
        comoPreencher: [
          "Su cerebro: la clave de la empresa de IA que usa para pensar. Si la instalación ya trajo una, aparece como lista.",
          "Cómo se va a llamar: es el nombre que ve tu equipo. El cliente ve solo la conversación.",
          "El rubro: elegir Ventas, Soporte o Agendamiento ya trae el perfil y las instrucciones escritos. Sin rubro, eliges solo la forma de hablar.",
          "Las reglas de la casa: una regla por línea, cortas y directas. Por ejemplo, «Nunca prometas descuento sin confirmar con una persona».",
        ],
        duvidas: [
          {
            pergunta: "¿Necesito entender de inteligencia artificial?",
            resposta:
              "No. Elige el rubro que más se parezca al tuyo y sigue: el sistema escribe las instrucciones por ti.",
          },
          {
            pergunta: "¿Qué es esa clave?",
            resposta:
              "Es una contraseña que conecta el sistema con la empresa de IA que le da el cerebro al empleado. Queda guardada con seguridad, y la pantalla solo muestra el final.",
          },
          {
            pergunta: "¿Qué nunca va a hacer?",
            resposta:
              "Las verificaciones que se ejecutan antes de cada mensaje están listadas al final de esta pantalla. Valen siempre y no tienen interruptor.",
          },
        ],
        seDeixarParaDepois:
          "Queda como borrador y no responde a nadie hasta que lo entrenes en IA › Agentes. El resto del asistente sigue con normalidad.",
      },
      en: {
        resumo: "Give them a name, a way of speaking and rules.",
        paraQueServe:
          "This is where your AI employee is born: who they are, how they speak and what the house expects of them. Nothing is set in stone — everything can be changed later.",
        comoPreencher: [
          "Their brain: the key of the AI company they use to think. If the installation already brought one, it shows as ready.",
          "What they will be called: the name your team sees. Customers only see the conversation.",
          "The line of business: picking Sales, Support or Scheduling brings the profile and instructions already written. With none, you only choose the way of speaking.",
          "House rules: one rule per line, short and direct. For example, “Never promise a discount without checking with a person”.",
        ],
        duvidas: [
          {
            pergunta: "Do I need to understand artificial intelligence?",
            resposta:
              "No. Pick the line of business closest to yours and go on: the system writes the instructions for you.",
          },
          {
            pergunta: "What is that key?",
            resposta:
              "It is a password that connects the system to the AI company that gives the employee a brain. It is stored securely, and the screen only shows its last characters.",
          },
          {
            pergunta: "What will they never do?",
            resposta:
              "The checks that run before every message goes out are listed at the bottom of this screen. They always apply and have no off switch.",
          },
        ],
        seDeixarParaDepois:
          "They stay as a draft and answer nobody until you train them in AI › Agents. The rest of the assistant carries on normally.",
      },
    },
  },

  funil: {
    minutos: 2,
    podePular: true,
    texto: {
      "pt-BR": {
        resumo: "Veja as colunas por onde cada cliente anda.",
        paraQueServe:
          "O quadro mostra em que ponto da conversa cada cliente está, de «chegou agora» até «fechou». Cada cliente vira um cartão, e o seu funcionário move o cartão sozinho conforme a conversa avança.",
        comoPreencher: [
          "Leia as colunas sugeridas. Embaixo de cada uma está quando o funcionário a usa.",
          "Troque o nome de qualquer coluna escrevendo por cima, ou tire as que não fazem sentido para você.",
          "Para uma etapa que só a sua equipe controla, use Adicionar coluna. Ela entra antes das colunas de desfecho.",
          "Prefere partir de outro desenho? Use «Prefiro começar de um modelo pronto».",
        ],
        duvidas: [
          {
            pergunta: "Por que algumas colunas não podem ser removidas?",
            resposta:
              "As de «fechou» e «não fechou» são o desfecho de toda venda. Sem elas o sistema não saberia contar o que deu certo.",
          },
          {
            pergunta: "Isso apaga o quadro que já existia?",
            resposta:
              "Ao continuar, o quadro padrão da instalação (feito para loja online) é substituído por este. Se você já tinha clientes nele, deixe como está e use «Pular por enquanto».",
          },
          {
            pergunta: "De onde vem a sugestão?",
            resposta:
              "Do que você contou sobre o negócio, pensada pelo próprio funcionário. Se ele não conseguiu agora, a tela avisa e parte de um modelo pronto.",
          },
        ],
        seDeixarParaDepois:
          "Fica o quadro padrão da instalação, feito para loja online. Dá para trocá-lo depois, nas etapas do funil.",
      },
      es: {
        resumo: "Mira las columnas por las que avanza cada cliente.",
        paraQueServe:
          "El tablero muestra en qué punto de la conversación está cada cliente, desde «acaba de llegar» hasta «cerró». Cada cliente es una tarjeta, y tu empleado la mueve solo a medida que avanza la conversación.",
        comoPreencher: [
          "Lee las columnas sugeridas. Debajo de cada una está cuándo la usa el empleado.",
          "Cambia el nombre de cualquier columna escribiendo encima, o quita las que no tengan sentido para ti.",
          "Para una etapa que solo controla tu equipo, usa Agregar columna. Entra antes de las columnas de resultado.",
          "¿Prefieres partir de otro diseño? Usa «Prefiero empezar de un modelo listo».",
        ],
        duvidas: [
          {
            pergunta: "¿Por qué algunas columnas no se pueden quitar?",
            resposta:
              "Las de «cerró» y «no cerró» son el resultado de toda venta. Sin ellas el sistema no sabría contar lo que salió bien.",
          },
          {
            pergunta: "¿Esto borra el tablero que ya existía?",
            resposta:
              "Al continuar, el tablero estándar de la instalación (hecho para tienda en línea) se reemplaza por este. Si ya tenías clientes en él, déjalo como está y usa «Omitir por ahora».",
          },
          {
            pergunta: "¿De dónde viene la sugerencia?",
            resposta:
              "De lo que contaste sobre el negocio, pensada por el propio empleado. Si no pudo ahora, la pantalla avisa y parte de un modelo listo.",
          },
        ],
        seDeixarParaDepois:
          "Queda el tablero estándar de la instalación, hecho para tienda en línea. Se puede cambiar después, en las etapas del embudo.",
      },
      en: {
        resumo: "See the columns each customer moves through.",
        paraQueServe:
          "The board shows where each customer is in the conversation, from “just arrived” to “closed”. Every customer becomes a card, and your employee moves the card on its own as the conversation advances.",
        comoPreencher: [
          "Read the suggested columns. Under each one is when the employee uses it.",
          "Rename any column by typing over it, or remove the ones that make no sense for you.",
          "For a stage only your team controls, use Add column. It goes in before the outcome columns.",
          "Prefer another layout? Use “I'd rather start from a ready-made template”.",
        ],
        duvidas: [
          {
            pergunta: "Why can't some columns be removed?",
            resposta:
              "“Closed” and “not closed” are the outcome of every sale. Without them the system couldn't count what went well.",
          },
          {
            pergunta: "Does this erase the board that already existed?",
            resposta:
              "On continuing, the installation's default board (made for online shops) is replaced by this one. If you already had customers on it, leave it as is and use “Skip for now”.",
          },
          {
            pergunta: "Where does the suggestion come from?",
            resposta:
              "From what you told us about the business, drafted by the employee. If they couldn't right now, the screen says so and starts from a ready-made template.",
          },
        ],
        seDeixarParaDepois:
          "The installation's default board stays, made for online shops. You can swap it later, in the pipeline stages.",
      },
    },
  },

  testar: {
    minutos: 2,
    podePular: true,
    texto: {
      "pt-BR": {
        resumo: "Escreva como cliente e veja a resposta dele.",
        paraQueServe:
          "É um ensaio: você faz o papel do cliente e vê o seu funcionário responder. Se algo estiver errado, como uma chave sem saldo, é melhor descobrir agora do que com um cliente de verdade.",
        comoPreencher: [
          "Escreva uma mensagem como o seu cliente escreveria. A frase de exemplo já serve.",
          "Use Mandar mensagem e espere a resposta. Pode levar alguns segundos.",
          "Se a resposta não for o que você queria, siga em frente: o jeito de falar dele se ajusta depois, em IA › Agentes.",
        ],
        duvidas: [
          {
            pergunta: "Isso envia algo para alguém no WhatsApp?",
            resposta:
              "Não. É só uma conversa entre você e ele: nada sai pelo WhatsApp e nada aparece na sua caixa de conversas.",
          },
          {
            pergunta: "Deu erro. O que fazer?",
            resposta:
              "A tela mostra o motivo. As causas mais comuns são a chave de IA sem saldo ou o modelo indisponível, e se resolvem em IA › Credenciais. O que você montou continua salvo.",
          },
        ],
        seDeixarParaDepois:
          "Nada deixa de funcionar. Você só não vê o funcionário responder antes do primeiro cliente de verdade.",
      },
      es: {
        resumo: "Escribe como cliente y mira su respuesta.",
        paraQueServe:
          "Es un ensayo: haces el papel de cliente y ves a tu empleado responder. Si algo está mal, como una clave sin saldo, es mejor descubrirlo ahora que con un cliente de verdad.",
        comoPreencher: [
          "Escribe un mensaje como lo escribiría tu cliente. La frase de ejemplo ya sirve.",
          "Usa Enviar mensaje y espera la respuesta. Puede tardar unos segundos.",
          "Si la respuesta no es la que querías, sigue adelante: su forma de hablar se ajusta después, en IA › Agentes.",
        ],
        duvidas: [
          {
            pergunta: "¿Esto envía algo a alguien por WhatsApp?",
            resposta:
              "No. Es solo una conversación entre tú y él: nada sale por WhatsApp y nada aparece en tu bandeja de conversaciones.",
          },
          {
            pergunta: "Dio error. ¿Qué hago?",
            resposta:
              "La pantalla muestra el motivo. Las causas más comunes son la clave de IA sin saldo o el modelo no disponible, y se resuelven en IA › Credenciales. Lo que armaste sigue guardado.",
          },
        ],
        seDeixarParaDepois:
          "Nada deja de funcionar. Solo no ves a tu empleado responder antes del primer cliente de verdad.",
      },
      en: {
        resumo: "Write as a customer and see their reply.",
        paraQueServe:
          "It is a rehearsal: you play the customer and watch your employee answer. If something is wrong, like a key with no balance, it is better to find out now than with a real customer.",
        comoPreencher: [
          "Write a message the way your customer would. The example sentence already works.",
          "Use Send message and wait for the reply. It can take a few seconds.",
          "If the reply isn't what you wanted, move on: their way of speaking can be adjusted later, in AI › Agents.",
        ],
        duvidas: [
          {
            pergunta: "Does this send anything to anyone on WhatsApp?",
            resposta:
              "No. It is only a conversation between you and them: nothing goes out over WhatsApp and nothing shows in your inbox.",
          },
          {
            pergunta: "It failed. What now?",
            resposta:
              "The screen shows the reason. The usual causes are an AI key with no balance or an unavailable model, and both are fixed in AI › Credentials. What you built is still saved.",
          },
        ],
        seDeixarParaDepois:
          "Nothing stops working. You just don't see your employee answer before the first real customer.",
      },
    },
  },

};

/** Escolhe o texto do idioma de quem olha, com a queda en → pt-BR. */
export function textoDoPasso(segmento: string, idioma: Idioma): TextoDoPasso | null {
  const passo = AJUDA_DOS_PASSOS[segmento];
  if (!passo) return null;
  return passo.texto[idioma] ?? passo.texto.en ?? passo.texto["pt-BR"];
}

/* ─── O texto da casca (trilha, selos, painel de ajuda) ─────────────────────────────────────────── */

export interface TextosDaCasca {
  trilha: string;
  /** Modelos com `{n}`, `{total}` e `{m}`: texto puro, para atravessar a fronteira servidor → cliente. */
  passoDe: string;
  faltam: string;
  faltamUm: string;
  tudoMontado: string;
  progressoSalvo: string;
  navegacao: string;
  /** O crachá no alto da trilha: o funcionário sendo montado. */
  funcionario: string;
  emTreinamento: string;
  prontoParaAtender: string;
  feito: string;
  pulado: string;
  atual: string;
  chipMinutos: string;
  chipPulavel: string;
  chipObrigatorio: string;
  ajudaDoPasso: string;
  irParaAjuda: string;
  paraQueServe: string;
  comoPreencher: string;
  duvidas: string;
  seDeixarParaDepois: string;
}

export const TEXTOS_DA_CASCA: { readonly "pt-BR": TextosDaCasca } & Partial<
  Record<Idioma, TextosDaCasca>
> = {
  "pt-BR": {
    trilha: "Montando o seu funcionário",
    passoDe: "Passo {n} de {total}",
    faltam: "faltam cerca de {m} minutos",
    faltamUm: "falta cerca de 1 minuto",
    tudoMontado: "Tudo montado",
    progressoSalvo: "O que você faz fica salvo. Pode fechar e voltar de onde parou.",
    navegacao: "Passos da configuração",
    funcionario: "Seu funcionário",
    emTreinamento: "Em treinamento",
    prontoParaAtender: "Pronto para atender",
    feito: "feito",
    pulado: "pulado",
    atual: "passo atual",
    chipMinutos: "cerca de {n} min",
    chipPulavel: "Pode ficar para depois",
    chipObrigatorio: "Obrigatório",
    ajudaDoPasso: "Ajuda deste passo",
    irParaAjuda: "Ver a ajuda deste passo",
    paraQueServe: "Para que serve",
    comoPreencher: "Como preencher",
    duvidas: "Dúvidas comuns",
    seDeixarParaDepois: "Se deixar para depois",
  },
  es: {
    trilha: "Armando a tu empleado",
    passoDe: "Paso {n} de {total}",
    faltam: "faltan cerca de {m} minutos",
    faltamUm: "falta cerca de 1 minuto",
    tudoMontado: "Todo armado",
    progressoSalvo: "Lo que haces queda guardado. Puedes cerrar y volver desde donde quedaste.",
    navegacao: "Pasos de la configuración",
    funcionario: "Tu empleado",
    emTreinamento: "En entrenamiento",
    prontoParaAtender: "Listo para atender",
    feito: "hecho",
    pulado: "omitido",
    atual: "paso actual",
    chipMinutos: "unos {n} min",
    chipPulavel: "Puede quedar para después",
    chipObrigatorio: "Obligatorio",
    ajudaDoPasso: "Ayuda de este paso",
    irParaAjuda: "Ver la ayuda de este paso",
    paraQueServe: "Para qué sirve",
    comoPreencher: "Cómo completarlo",
    duvidas: "Dudas comunes",
    seDeixarParaDepois: "Si lo dejas para después",
  },
  en: {
    trilha: "Building your employee",
    passoDe: "Step {n} of {total}",
    faltam: "about {m} minutes left",
    faltamUm: "about 1 minute left",
    tudoMontado: "All set up",
    progressoSalvo: "What you do is saved. You can close this and come back where you left off.",
    navegacao: "Setup steps",
    funcionario: "Your employee",
    emTreinamento: "In training",
    prontoParaAtender: "Ready to serve",
    feito: "done",
    pulado: "skipped",
    atual: "current step",
    chipMinutos: "about {n} min",
    chipPulavel: "Can wait until later",
    chipObrigatorio: "Required",
    ajudaDoPasso: "Help for this step",
    irParaAjuda: "See help for this step",
    paraQueServe: "What it is for",
    comoPreencher: "How to fill it in",
    duvidas: "Common questions",
    seDeixarParaDepois: "If you leave it for later",
  },
};

export function textosDaCasca(idioma: Idioma): TextosDaCasca {
  return TEXTOS_DA_CASCA[idioma] ?? TEXTOS_DA_CASCA.en ?? TEXTOS_DA_CASCA["pt-BR"];
}

/** Preenche `{n}`, `{total}` e `{m}` de um modelo de texto. */
export function preencher(modelo: string, valores: Record<string, number | string>): string {
  return modelo.replace(/\{(\w+)\}/g, (_, chave: string) => String(valores[chave] ?? ""));
}

/** Minutos que faltam: a soma do que ainda não foi cumprido. */
export function minutosRestantes(segmentosPendentes: readonly string[]): number {
  return segmentosPendentes.reduce((soma, s) => soma + (AJUDA_DOS_PASSOS[s]?.minutos ?? 0), 0);
}

/* ─── Ajuda dentro das escolhas (exemplos, jeitos de falar, detalhes do ramo) ───────────────────── */

type Trilingue<T> = { readonly "pt-BR": T } & Partial<Record<Idioma, T>>;

function noIdioma<T>(texto: Trilingue<T>, idioma: Idioma): T {
  return texto[idioma] ?? texto.en ?? texto["pt-BR"];
}

/** Atalhos para «O que vocês fazem?»: um clique escreve o ramo, e a pessoa ainda pode editar. */
export const EXEMPLOS_DO_RAMO: Trilingue<{ rotulo: string; itens: readonly string[] }> = {
  "pt-BR": {
    rotulo: "Ou comece por um exemplo:",
    itens: [
      "Clínica odontológica",
      "Loja de roupas",
      "Imobiliária",
      "Curso online",
      "Agência de marketing",
      "Salão de beleza",
    ],
  },
  es: {
    rotulo: "O empieza por un ejemplo:",
    itens: [
      "Clínica odontológica",
      "Tienda de ropa",
      "Inmobiliaria",
      "Curso en línea",
      "Agencia de marketing",
      "Salón de belleza",
    ],
  },
  en: {
    rotulo: "Or start from an example:",
    itens: [
      "Dental clinic",
      "Clothing shop",
      "Real estate agency",
      "Online course",
      "Marketing agency",
      "Beauty salon",
    ],
  },
};

export function exemplosDoRamo(idioma: Idioma): { rotulo: string; itens: readonly string[] } {
  return noIdioma(EXEMPLOS_DO_RAMO, idioma);
}

/** Como cada «jeito de falar» soa numa resposta de verdade — a diferença só se entende ouvindo. */
export const EXEMPLO_DO_JEITO: Record<
  "ecommerce_friendly" | "ecommerce_professional" | "support_minimal",
  Trilingue<string>
> = {
  ecommerce_friendly: {
    "pt-BR":
      "Oi, Ana! Que bom falar com você. Me conta, o que você está procurando? Eu te ajudo a escolher.",
    es: "¡Hola, Ana! Qué bueno hablar contigo. Cuéntame, ¿qué estás buscando? Te ayudo a elegir.",
    en: "Hi Ana! So nice to talk to you. Tell me, what are you looking for? I'll help you choose.",
  },
  ecommerce_professional: {
    "pt-BR":
      "Olá, Ana. Para te atender melhor: qual produto você procura? Em seguida passo valores e prazo.",
    es: "Hola, Ana. Para atenderte mejor: ¿qué producto buscas? Enseguida te paso precios y plazo.",
    en: "Hello Ana. To help you better: which product are you looking for? Next I'll share prices and delivery time.",
  },
  support_minimal: {
    "pt-BR": "Oi! Qual é a sua dúvida?",
    es: "¡Hola! ¿Cuál es tu duda?",
    en: "Hi! What's your question?",
  },
};

export function exemploDoJeito(id: keyof typeof EXEMPLO_DO_JEITO, idioma: Idioma): string {
  return noIdioma(EXEMPLO_DO_JEITO[id], idioma);
}

/** Rótulos do detalhe que aparece quando um ramo (ou jeito) é marcado. */
export const ROTULOS_DA_ESCOLHA: Trilingue<{
  exemploDeResposta: string;
  objetivo: string;
  cumprimento: string;
  editavel: string;
}> = {
  "pt-BR": {
    exemploDeResposta: "Assim ele responde:",
    objetivo: "O que ele busca:",
    cumprimento: "Como ele cumprimenta:",
    editavel: "Vem pronto, mas você edita tudo depois.",
  },
  es: {
    exemploDeResposta: "Así responde:",
    objetivo: "Qué busca:",
    cumprimento: "Cómo saluda:",
    editavel: "Viene listo, pero lo editas todo después.",
  },
  en: {
    exemploDeResposta: "This is how they reply:",
    objetivo: "What they aim for:",
    cumprimento: "How they greet:",
    editavel: "It comes ready, but you can edit everything later.",
  },
};

export function rotulosDaEscolha(idioma: Idioma) {
  return noIdioma(ROTULOS_DA_ESCOLHA, idioma);
}

/** As duas formas de conectar o número, com o que separa uma da outra. */
export const FORMAS_DE_CONECTAR: Trilingue<{
  qr: { bom: readonly string[]; atencao: readonly string[] };
  oficial: { bom: readonly string[]; atencao: readonly string[] };
}> = {
  "pt-BR": {
    qr: {
      bom: ["Mais rápido para começar: leva poucos minutos", "Boa para atender conversas todo dia"],
      atencao: ["Não é a indicada para campanhas em massa"],
    },
    oficial: {
      bom: ["Indicada para campanhas em massa", "Não depende do celular para ficar conectada"],
      atencao: ["Pede o cadastro do número na Meta e as credenciais em mãos"],
    },
  },
  es: {
    qr: {
      bom: [
        "Más rápido para empezar: toma pocos minutos",
        "Buena para atender conversaciones todos los días",
      ],
      atencao: ["No es la indicada para campañas masivas"],
    },
    oficial: {
      bom: ["Indicada para campañas masivas", "No depende del celular para seguir conectada"],
      atencao: ["Pide el registro del número en Meta y las credenciales a mano"],
    },
  },
  en: {
    qr: {
      bom: [
        "Fastest way to start: takes a few minutes",
        "Good for handling conversations every day",
      ],
      atencao: ["Not the one for mass campaigns"],
    },
    oficial: {
      bom: ["The one for mass campaigns", "Doesn't depend on your phone to stay connected"],
      atencao: ["Needs the number registered with Meta and the credentials at hand"],
    },
  },
};

export function formasDeConectar(idioma: Idioma) {
  return noIdioma(FORMAS_DE_CONECTAR, idioma);
}

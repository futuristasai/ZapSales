/**
 * O AGENDAMENTO DA CAMPANHA, visto pela tela — puro, com o relógio injetado.
 *
 * ═══ Por que existe ═══
 *
 * O servidor sempre soube agendar (`agendarAcao`, a promoção das agendadas na
 * rodada). A tela não oferecia a ação (issue #292). Ao oferecer, duas perguntas
 * aparecem, e as duas são fáceis de responder errado em silêncio:
 *
 *  1. **"9h" de quem?** O campo de data e hora do navegador devolve um relógio
 *     de parede, sem fuso. A janela de envio é avaliada no fuso do NÚMERO
 *     (`channel_knobs.timezone`, senão o da organização). Se a tela lesse o
 *     campo no fuso do navegador, quem agenda de Lisboa para um número de São
 *     Paulo marcaria "9h" e o envio sairia às 6h de lá — antes de a janela
 *     abrir. Por isso o campo é lido no fuso do número, e a tela diz qual é.
 *
 *  2. **"Agendar para as 23h" começa às 23h?** Não: chegar a hora só passa a
 *     campanha para "em andamento"; quem decide cada envio é o ritmo, e fora do
 *     horário de envio nada sai. Sem aviso, o operador veria a campanha
 *     "em andamento" parada a noite inteira. `inicioDoEnvio` diz, na hora da
 *     escolha, quando o primeiro envio pode sair de verdade.
 *
 * ═══ Por que as duas rodadas têm janelas diferentes ═══
 *
 * `janelaDeEnvioDaCampanha` espelha o que cada rodada faz, e elas não fazem o
 * mesmo:
 *
 *  - número por QR code (`rodada.ts`): a janela da campanha é um veto A MAIS,
 *    por cima do motor de ritmo do número — vale a interseção das duas, e o
 *    domingo segue o que o número permite;
 *  - API Oficial (`rodada-oficial.ts`): a janela da campanha SUBSTITUI a do
 *    número quando está preenchida, e não há regra de domingo.
 *
 * Arquivo sem import de servidor de propósito: a tela o usa direto.
 */

/** A janela de envio em vigor para a campanha — vai no JSON da API, por isso snake_case. */
export interface JanelaDeEnvio {
  /** Fuso IANA em que as horas abaixo valem (o do número principal). */
  fuso: string;
  /** Hora local em que o envio abre (0–23). */
  inicio_hora: number;
  /** Hora local em que o envio fecha (1–24), exclusiva. */
  fim_hora: number;
  permite_domingo: boolean;
}

/** Por quanto tempo à frente uma campanha pode ser agendada. */
export const AGENDA_MAXIMA_DIAS = 365;

export function janelaDeEnvioDaCampanha(
  campanha: {
    meta_template_id: string | null;
    janela_inicio_hora: number | null;
    janela_fim_hora: number | null;
  },
  numero: { fuso: string; inicioHora: number; fimHora: number; permiteDomingo: boolean },
): JanelaDeEnvio {
  const temJanela = campanha.janela_inicio_hora !== null && campanha.janela_fim_hora !== null;
  if (campanha.meta_template_id) {
    return {
      fuso: numero.fuso,
      inicio_hora: temJanela ? campanha.janela_inicio_hora! : numero.inicioHora,
      fim_hora: temJanela ? campanha.janela_fim_hora! : numero.fimHora,
      permite_domingo: true,
    };
  }
  return {
    fuso: numero.fuso,
    inicio_hora: temJanela ? Math.max(campanha.janela_inicio_hora!, numero.inicioHora) : numero.inicioHora,
    fim_hora: temJanela ? Math.min(campanha.janela_fim_hora!, numero.fimHora) : numero.fimHora,
    permite_domingo: numero.permiteDomingo,
  };
}

interface Relogio {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** "Sun", "Mon"… — em inglês fixo: é aritmética, ninguém lê. */
  diaDaSemana: string;
}

/**
 * O relógio de parede do instante, no fuso. `en-US` e `h23` fixos pelo mesmo
 * motivo de `relogio.ts`: isto decide, não aparece na tela, e `hour12: false`
 * devolve "24" à meia-noite em várias versões do ICU.
 */
function relogioNoFuso(instante: Date, fuso: string): Relogio {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    ano: Number(parte("year")),
    mes: Number(parte("month")),
    dia: Number(parte("day")),
    hora: Number(parte("hour")) % 24,
    minuto: Number(parte("minute")),
    diaDaSemana: parte("weekday"),
  };
}

/**
 * O instante em que o relógio do fuso marca o que foi pedido. Duas voltas de
 * ajuste, como `instantFromWall` do motor de ritmo: a primeira acerta o
 * deslocamento, a segunda corrige quando o chute caiu do outro lado de uma
 * virada de horário de verão. `Date.UTC` normaliza dia 32 e hora 24.
 */
function instanteDe(ano: number, mes: number, dia: number, hora: number, minuto: number, fuso: string): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let chute = alvo;
  for (let i = 0; i < 2; i += 1) {
    const r = relogioNoFuso(new Date(chute), fuso);
    chute += alvo - Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto);
  }
  return new Date(chute);
}

const FORMA_DO_CAMPO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/**
 * O valor de um `<input type="datetime-local">` ("2026-11-13T09:30"), lido como
 * relógio de parede NO FUSO dado. `null` quando o texto não tem essa forma —
 * campo vazio ou pela metade não é erro, é "ainda não escolheu".
 */
export function instanteDoCampo(texto: string, fuso: string): Date | null {
  const m = FORMA_DO_CAMPO.exec(texto.trim());
  if (!m) return null;
  const [ano, mes, dia, hora, minuto] = m.slice(1, 6).map(Number) as [number, number, number, number, number];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const instante = instanteDe(ano, mes, dia, hora, minuto, fuso);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/** O caminho de volta: o instante como valor do campo, no fuso dado. */
export function campoDoInstante(instante: Date, fuso: string): string {
  const r = relogioNoFuso(instante, fuso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${String(r.ano).padStart(4, "0")}-${dois(r.mes)}-${dois(r.dia)}T${dois(r.hora)}:${dois(r.minuto)}`;
}

export type InicioDoEnvio =
  /** O horário escolhido está dentro do horário de envio: o primeiro envio pode sair nele. */
  | { dentro: true }
  /**
   * Está fora. `abre` é quando o horário de envio abre de novo; `null` quando
   * ele não abre nunca (a janela da campanha e a do número não se cruzam).
   */
  | { dentro: false; motivo: "horario" | "domingo"; abre: Date | null };

/**
 * A campanha agendada para `quando` começa a enviar em `quando`?
 *
 * Mesmo critério das rodadas: a hora local cheia, `[inicio, fim)`, e o domingo
 * quando o número não o permite. Não considera teto diário, aquecimento nem
 * intervalo — esses atrasam o SEGUNDO envio em diante, não dizem quando a
 * campanha começa.
 */
export function inicioDoEnvio(quando: Date, janela: JanelaDeEnvio): InicioDoEnvio {
  if (janela.inicio_hora >= janela.fim_hora) return { dentro: false, motivo: "horario", abre: null };

  const r = relogioNoFuso(quando, janela.fuso);
  const domingoVetado = !janela.permite_domingo && r.diaDaSemana === "Sun";
  const naHora = r.hora >= janela.inicio_hora && r.hora < janela.fim_hora;
  if (naHora && !domingoVetado) return { dentro: true };

  // Hoje, amanhã… até achar a abertura. Oito dias cobrem a semana inteira com
  // folga; domingo vetado é o único dia que se pula.
  for (let dias = 0; dias <= 8; dias += 1) {
    const abertura = instanteDe(r.ano, r.mes, r.dia + dias, janela.inicio_hora, 0, janela.fuso);
    if (abertura.getTime() <= quando.getTime()) continue;
    if (!janela.permite_domingo && relogioNoFuso(abertura, janela.fuso).diaDaSemana === "Sun") continue;
    return { dentro: false, motivo: domingoVetado ? "domingo" : "horario", abre: abertura };
  }
  return { dentro: false, motivo: domingoVetado ? "domingo" : "horario", abre: null };
}

export type RecusaDaAgenda = "passado" | "longe_demais";

/** O horário escolhido serve para agendar? `null` = serve. A mesma régua do servidor. */
export function recusaDaAgenda(quando: Date, agora: Date): RecusaDaAgenda | null {
  if (quando.getTime() <= agora.getTime()) return "passado";
  if (quando.getTime() - agora.getTime() > AGENDA_MAXIMA_DIAS * 24 * 60 * 60_000) return "longe_demais";
  return null;
}

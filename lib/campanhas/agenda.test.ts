import { describe, expect, it } from "vitest";

import {
  AGENDA_MAXIMA_DIAS,
  campoDoInstante,
  inicioDoEnvio,
  instanteDoCampo,
  janelaDeEnvioDaCampanha,
  recusaDaAgenda,
  type JanelaDeEnvio,
} from "./agenda";

const SP = "America/Sao_Paulo";
const LISBOA = "Europe/Lisbon";

const janela = (extra: Partial<JanelaDeEnvio> = {}): JanelaDeEnvio => ({
  fuso: SP,
  inicio_hora: 7,
  fim_hora: 22,
  permite_domingo: true,
  ...extra,
});

describe("o campo de data e hora é lido no fuso do número", () => {
  it("9h30 em São Paulo é 12h30 UTC, qualquer que seja o fuso de quem digita", () => {
    expect(instanteDoCampo("2026-11-13T09:30", SP)?.toISOString()).toBe("2026-11-13T12:30:00.000Z");
  });

  it("o mesmo texto em outro fuso é outro instante", () => {
    expect(instanteDoCampo("2026-11-13T09:30", LISBOA)?.toISOString()).toBe("2026-11-13T09:30:00.000Z");
  });

  it("vale no horário de verão do fuso (Lisboa em julho está em UTC+1)", () => {
    expect(instanteDoCampo("2026-07-10T09:30", LISBOA)?.toISOString()).toBe("2026-07-10T08:30:00.000Z");
  });

  it("aceita o valor com segundos, que alguns navegadores devolvem", () => {
    expect(instanteDoCampo("2026-11-13T09:30:00", SP)?.toISOString()).toBe("2026-11-13T12:30:00.000Z");
  });

  it("campo vazio, pela metade ou impossível não é um instante", () => {
    expect(instanteDoCampo("", SP)).toBeNull();
    expect(instanteDoCampo("2026-11-13", SP)).toBeNull();
    expect(instanteDoCampo("2026-13-01T09:30", SP)).toBeNull();
    expect(instanteDoCampo("2026-11-13T24:00", SP)).toBeNull();
  });

  it("ida e volta devolvem o mesmo texto", () => {
    for (const texto of ["2026-11-13T09:30", "2026-01-01T00:00", "2026-12-31T23:59"]) {
      for (const fuso of [SP, LISBOA, "Asia/Tokyo", "America/Manaus"]) {
        expect(campoDoInstante(instanteDoCampo(texto, fuso)!, fuso)).toBe(texto);
      }
    }
  });

  it("meia-noite sai como 00:00, nunca 24:00", () => {
    expect(campoDoInstante(new Date("2026-11-13T03:00:00.000Z"), SP)).toBe("2026-11-13T00:00");
  });
});

describe("quando o primeiro envio pode sair", () => {
  // 13/11/2026 é sexta-feira; 15/11/2026 é domingo.
  const em = (texto: string, fuso = SP) => instanteDoCampo(texto, fuso)!;

  it("dentro do horário de envio, começa na hora marcada", () => {
    expect(inicioDoEnvio(em("2026-11-13T09:30"), janela())).toEqual({ dentro: true });
    expect(inicioDoEnvio(em("2026-11-13T07:00"), janela())).toEqual({ dentro: true });
    expect(inicioDoEnvio(em("2026-11-13T21:59"), janela())).toEqual({ dentro: true });
  });

  it("depois que o horário fecha, espera a abertura do dia seguinte", () => {
    const r = inicioDoEnvio(em("2026-11-13T22:00"), janela());
    expect(r).toEqual({ dentro: false, motivo: "horario", abre: em("2026-11-14T07:00") });
  });

  it("de madrugada, espera a abertura do mesmo dia", () => {
    const r = inicioDoEnvio(em("2026-11-13T03:15"), janela());
    expect(r).toEqual({ dentro: false, motivo: "horario", abre: em("2026-11-13T07:00") });
  });

  it("a hora é a do fuso do número, não a UTC", () => {
    // 23h UTC de sexta são 20h em São Paulo: dentro.
    expect(inicioDoEnvio(new Date("2026-11-13T23:00:00.000Z"), janela())).toEqual({ dentro: true });
    // 02h UTC de sábado são 23h de sexta em São Paulo: fora.
    expect(inicioDoEnvio(new Date("2026-11-14T02:00:00.000Z"), janela())).toMatchObject({ dentro: false });
  });

  it("domingo liberado é um dia como os outros", () => {
    expect(inicioDoEnvio(em("2026-11-15T10:00"), janela({ permite_domingo: true }))).toEqual({ dentro: true });
  });

  it("número que não envia aos domingos: espera a segunda-feira", () => {
    const r = inicioDoEnvio(em("2026-11-15T10:00"), janela({ permite_domingo: false }));
    expect(r).toEqual({ dentro: false, motivo: "domingo", abre: em("2026-11-16T07:00") });
  });

  it("sábado à noite sem domingo: pula o domingo inteiro", () => {
    const r = inicioDoEnvio(em("2026-11-14T23:00"), janela({ permite_domingo: false }));
    expect(r).toEqual({ dentro: false, motivo: "horario", abre: em("2026-11-16T07:00") });
  });

  it("janela que termina à meia-noite (24) vale até 23h59", () => {
    expect(inicioDoEnvio(em("2026-11-13T23:59"), janela({ inicio_hora: 0, fim_hora: 24 }))).toEqual({ dentro: true });
  });

  it("janela que não abre nunca não inventa data", () => {
    const r = inicioDoEnvio(em("2026-11-13T09:30"), janela({ inicio_hora: 20, fim_hora: 20 }));
    expect(r).toEqual({ dentro: false, motivo: "horario", abre: null });
  });
});

describe("a janela em vigor espelha a rodada de cada tipo de número", () => {
  const numero = { fuso: SP, inicioHora: 7, fimHora: 22, permiteDomingo: false };
  const semJanela = { janela_inicio_hora: null, janela_fim_hora: null };

  it("QR code sem janela própria herda a do número, domingo inclusive", () => {
    expect(janelaDeEnvioDaCampanha({ meta_template_id: null, ...semJanela }, numero)).toEqual(
      janela({ permite_domingo: false }),
    );
  });

  it("QR code com janela própria: vale a interseção com a do número", () => {
    expect(
      janelaDeEnvioDaCampanha({ meta_template_id: null, janela_inicio_hora: 5, janela_fim_hora: 18 }, numero),
    ).toEqual(janela({ inicio_hora: 7, fim_hora: 18, permite_domingo: false }));
  });

  it("API Oficial sem janela própria herda as horas do número, sem regra de domingo", () => {
    expect(janelaDeEnvioDaCampanha({ meta_template_id: "m1", ...semJanela }, numero)).toEqual(janela());
  });

  it("API Oficial com janela própria: a da campanha substitui a do número", () => {
    expect(
      janelaDeEnvioDaCampanha({ meta_template_id: "m1", janela_inicio_hora: 0, janela_fim_hora: 24 }, numero),
    ).toEqual(janela({ inicio_hora: 0, fim_hora: 24 }));
  });

  it("janela pela metade conta como em branco", () => {
    expect(
      janelaDeEnvioDaCampanha({ meta_template_id: null, janela_inicio_hora: 9, janela_fim_hora: null }, numero),
    ).toEqual(janela({ permite_domingo: false }));
  });
});

describe("o horário serve para agendar?", () => {
  const agora = new Date("2026-11-12T15:00:00.000Z");

  it("no futuro, serve", () => {
    expect(recusaDaAgenda(new Date("2026-11-12T15:01:00.000Z"), agora)).toBeNull();
  });

  it("agora ou antes, não", () => {
    expect(recusaDaAgenda(agora, agora)).toBe("passado");
    expect(recusaDaAgenda(new Date("2026-11-12T14:59:00.000Z"), agora)).toBe("passado");
  });

  it("mais de um ano à frente é erro de digitação, não agenda", () => {
    const limite = new Date(agora.getTime() + AGENDA_MAXIMA_DIAS * 24 * 60 * 60_000);
    expect(recusaDaAgenda(limite, agora)).toBeNull();
    expect(recusaDaAgenda(new Date(limite.getTime() + 60_000), agora)).toBe("longe_demais");
  });
});

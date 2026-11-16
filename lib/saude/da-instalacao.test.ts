import { describe, expect, it } from "vitest";

import { saudeDaInstalacao, type SondasDaInstalacao } from "./da-instalacao";

const OK = { status: "ok", latency_ms: 12 } as const;

function sondas(parcial: Partial<SondasDaInstalacao> = {}): SondasDaInstalacao {
  return { banco: OK, redis: OK, transporteQr: OK, fila: { atrasoSegundos: null }, ...parcial };
}

const porId = (s: SondasDaInstalacao) =>
  Object.fromEntries(saudeDaInstalacao(s).itens.map((i) => [i.id, i]));

describe("saúde da instalação — o que o Painel mostra", () => {
  it("com tudo respondendo, os quatro itens ficam verdes e o resumo diz que está tudo bem", () => {
    const saude = saudeDaInstalacao(sondas());
    expect(saude.itens.map((i) => i.id)).toEqual(["banco", "whatsapp", "redis", "fila"]);
    expect(saude.itens.every((i) => i.estado === "ok")).toBe(true);
    expect(saude.itens.every((i) => i.comando === null)).toBe(true);
    expect(saude.tudoBem).toBe(true);
    expect(saude.fora).toBe(0);
  });

  it("Redis fora do ar fica vermelho e diz o comando para subir o serviço", () => {
    const fora = sondas({ redis: { status: "down", latency_ms: 3, reason: "conexao_recusada" } });
    const saude = saudeDaInstalacao(fora);
    const redis = porId(fora).redis!;
    expect(redis.estado).toBe("fora");
    expect(redis.frase).toMatch(/não respondeu/);
    expect(redis.comando).toBe("sudo docker compose up -d redis srh");
    expect(saude.tudoBem).toBe(false);
    expect(saude.fora).toBe(1);
  });

  it("Redis com endereço escrito errado manda ao arquivo de configuração, não a reiniciar", () => {
    const redis = porId(
      sondas({ redis: { status: "down", latency_ms: 0, reason: "configuracao_invalida" } }),
    ).redis!;
    expect(redis.estado).toBe("fora");
    expect(redis.frase).toContain(".env");
    expect(redis.comando).toBeNull();
  });

  it("credencial recusada pelo transporte por QR code diz que a chave não confere", () => {
    const qr = porId(
      sondas({ transporteQr: { status: "down", latency_ms: 5, reason: "credencial_recusada" } }),
    ).whatsapp!;
    expect(qr.estado).toBe("fora");
    expect(qr.frase).toMatch(/chave/i);
  });

  it("transporte por QR code fora do ar diz o comando de subir o serviço dele", () => {
    const qr = porId(
      sondas({ transporteQr: { status: "down", latency_ms: 3000, reason: "tempo_esgotado" } }),
    ).whatsapp!;
    expect(qr.estado).toBe("fora");
    expect(qr.comando).toMatch(/^sudo docker compose up -d \S+$/);
  });

  it("serviço não configurado não é vermelho: é neutro e não conta como fora", () => {
    const saude = saudeDaInstalacao(
      sondas({ transporteQr: { status: "degraded", latency_ms: 0, reason: "nao_configurado" } }),
    );
    const qr = saude.itens.find((i) => i.id === "whatsapp")!;
    expect(qr.estado).toBe("nao_configurado");
    expect(saude.fora).toBe(0);
  });

  it("fila com evento atrasado há mais de 10 minutos fica vermelha", () => {
    const fila = porId(sondas({ fila: { atrasoSegundos: 11 * 60 } })).fila!;
    expect(fila.estado).toBe("fora");
    expect(fila.comando).toBe("sudo docker compose up -d scheduler worker");
  });

  it("fila com atraso de poucos minutos ainda é normal (o processador roda a cada minuto)", () => {
    expect(porId(sondas({ fila: { atrasoSegundos: 4 * 60 } })).fila!.estado).toBe("ok");
  });

  it("fila que não pôde ser lida não chuta: fica 'não consegui ler', nunca verde nem vermelha", () => {
    const saude = saudeDaInstalacao(sondas({ fila: null }));
    expect(saude.itens.find((i) => i.id === "fila")!.estado).toBe("nao_lido");
    expect(saude.fora).toBe(0);
    expect(saude.tudoBem).toBe(false);
  });

  it("nenhuma frase leva endereço, erro cru nem alvo da sonda", () => {
    const vazamento = {
      status: "down",
      latency_ms: 1,
      reason: "endereco_nao_resolve",
      error: "Failed to parse URL from redis-interno.minha-vps.com",
      target: "https://redis-interno.minha-vps.com:443",
    } as const;
    const texto = JSON.stringify(
      saudeDaInstalacao(sondas({ banco: vazamento, redis: vazamento, transporteQr: vazamento })),
    );
    expect(texto).not.toContain("redis-interno");
    expect(texto).not.toContain("Failed to parse");
  });
});

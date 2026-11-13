import { describe, expect, it } from "vitest";

import {
  contagemDaVisao,
  destinosDaLinha,
  lerVisao,
  nomeDaListaDeResgate,
  pessoasParaResgatar,
  situacaoDaVisao,
  temIniciais,
  tempoDecorrido,
  tituloQueAcrescenta,
  visaoEmVigor,
} from "./visao-do-radar";

const t = (texto: string) => texto;

const VAZIO = {
  counts: { critico: 0, em_risco: 0, em_voo: 0 },
  total: 0,
  total_sem_proximo_passo: 0,
  propostas_vencidas_sem_retomada: [],
  propostas_esperando_revisao: [],
};

describe("destinosDaLinha — uma regra só para onde o clique vai", () => {
  it("com conversa: o destino principal é a conversa, e o funil abre o CARTÃO do negócio", () => {
    expect(destinosDaLinha({ conversation_id: "c1", pipeline_id: "p1", lead_id: "l1" })).toEqual({
      conversa: "/app/inbox?id=c1",
      funil: "/app/pipelines/p1?lead=l1",
      principal: "/app/inbox?id=c1",
    });
  });

  it("sem conversa: o principal passa a ser o cartão no funil", () => {
    const d = destinosDaLinha({ conversation_id: null, pipeline_id: "p1", lead_id: "l1" });
    expect(d.conversa).toBeNull();
    expect(d.principal).toBe("/app/pipelines/p1?lead=l1");
  });

  it("sem conversa e sem negócio: não inventa destino", () => {
    expect(destinosDaLinha({ conversation_id: null, pipeline_id: null, lead_id: null })).toEqual({
      conversa: null,
      funil: null,
      principal: null,
    });
  });

  it("negócio sem funil conhecido não vira link quebrado", () => {
    expect(
      destinosDaLinha({ conversation_id: null, pipeline_id: null, lead_id: "l1" }).funil,
    ).toBeNull();
  });
});

describe("visão do radar", () => {
  it("lê só valores conhecidos do endereço", () => {
    expect(lerVisao("em_voo")).toBe("em_voo");
    expect(lerVisao("sem_proximo_passo")).toBe("sem_proximo_passo");
    expect(lerVisao("qualquer-coisa")).toBeNull();
    expect(lerVisao(null)).toBeNull();
  });

  it("só as três situações viram filtro no servidor", () => {
    expect(situacaoDaVisao("critico")).toBe("critico");
    expect(situacaoDaVisao("todos")).toBeUndefined();
    expect(situacaoDaVisao("sem_proximo_passo")).toBeUndefined();
    expect(situacaoDaVisao(null)).toBeUndefined();
  });

  it("conta cada visão pelo total do servidor, não pelas linhas que vieram", () => {
    const dados = {
      ...VAZIO,
      counts: { critico: 160, em_risco: 107, em_voo: 80 },
      total: 347,
      total_sem_proximo_passo: 19,
    };
    expect(contagemDaVisao(dados, "todos")).toBe(347);
    expect(contagemDaVisao(dados, "em_voo")).toBe(80);
    expect(contagemDaVisao(dados, "sem_proximo_passo")).toBe(19);
    expect(contagemDaVisao(dados, "propostas_vencidas")).toBe(0);
  });

  it("a escolha de quem usa vence, mesmo que a lista esteja vazia", () => {
    expect(visaoEmVigor({ ...VAZIO, total_sem_proximo_passo: 3 }, "em_voo")).toBe("em_voo");
  });

  it("sem escolha, abre na primeira lista que tem algo — nunca numa vazia ao lado de um contador cheio", () => {
    expect(
      visaoEmVigor({ ...VAZIO, total: 5, counts: { critico: 5, em_risco: 0, em_voo: 0 } }, null),
    ).toBe("todos");
    expect(visaoEmVigor({ ...VAZIO, total_sem_proximo_passo: 3 }, null)).toBe("sem_proximo_passo");
    expect(visaoEmVigor(VAZIO, null)).toBe("todos");
  });
});

describe("tituloQueAcrescenta — o título só aparece quando diz algo além do nome", () => {
  it("título igual ao nome some, sem ligar para maiúsculas nem espaços nas pontas", () => {
    expect(tituloQueAcrescenta("Luh Dumont", "Luh Dumont")).toBeNull();
    expect(tituloQueAcrescenta("Luh Dumont", "  luh dumont ")).toBeNull();
  });

  it("título diferente fica", () => {
    expect(tituloQueAcrescenta("Larissa Rodrigues", "Matrícula — Curso de ASB")).toBe(
      "Matrícula — Curso de ASB",
    );
  });

  it("sem nome, o título é tudo o que há; título vazio não vira linha em branco", () => {
    expect(tituloQueAcrescenta(null, "Negócio sem contato")).toBe("Negócio sem contato");
    expect(tituloQueAcrescenta("Luh Dumont", "   ")).toBeNull();
    expect(tituloQueAcrescenta("Luh Dumont", null)).toBeNull();
  });
});

describe("temIniciais", () => {
  it("nome com letra tem iniciais; nome que é só telefone não", () => {
    expect(temIniciais("João Francisco")).toBe(true);
    expect(temIniciais("+552120181242")).toBe(false);
  });
});

describe("pessoasParaResgatar — quem entra no disparo de resgate", () => {
  const ITENS = [
    { contact_id: "c1", risk: "critico" },
    { contact_id: "c1", risk: "em_risco" },
    { contact_id: "c2", risk: "em_risco" },
    { contact_id: null, risk: "critico" },
    { contact_id: "c3", risk: "em_voo" },
  ];

  it("numa situação: só os dela, cada pessoa uma vez, e conta os negócios sem contato", () => {
    expect(pessoasParaResgatar(ITENS, "critico")).toEqual({
      ids: ["c1"],
      semContato: 1,
      emVooDeFora: 0,
    });
    expect(pessoasParaResgatar(ITENS, "em_risco")).toEqual({
      ids: ["c1", "c2"],
      semContato: 0,
      emVooDeFora: 0,
    });
  });

  it("em Todos, quem está em voo fica de fora — e a contagem diz quantos", () => {
    expect(pessoasParaResgatar(ITENS, "todos")).toEqual({
      ids: ["c1", "c2"],
      semContato: 1,
      emVooDeFora: 1,
    });
  });

  it("o retorno marcado é da PESSOA: com um negócio em voo e outro crítico, ela não entra em Todos", () => {
    const r = pessoasParaResgatar(
      [
        { contact_id: "c9", risk: "critico" },
        { contact_id: "c9", risk: "em_voo" },
      ],
      "todos",
    );
    expect(r.ids).toEqual([]);
    expect(r.emVooDeFora).toBe(1);
  });

  it("Em voo escolhido de propósito leva os em voo", () => {
    expect(pessoasParaResgatar(ITENS, "em_voo").ids).toEqual(["c3"]);
  });
});

describe("nomeDaListaDeResgate", () => {
  it("diz de onde veio, qual situação e quando — a lista é uma foto com data", () => {
    expect(nomeDaListaDeResgate("Riscos de Perda", "Crítico", new Date(2026, 10, 13, 9, 5))).toBe(
      "Riscos de Perda · Crítico · 13/11 09h05",
    );
  });
});

describe("tempoDecorrido", () => {
  it("fica em horas até dois dias e passa a dias depois", () => {
    expect(tempoDecorrido(0, t)).toBe("menos de 1 hora");
    expect(tempoDecorrido(1, t)).toBe("1 hora");
    expect(tempoDecorrido(30, t)).toBe("30 horas");
    expect(tempoDecorrido(48, t)).toBe("2 dias");
    expect(tempoDecorrido(484, t)).toBe("20 dias");
  });
});

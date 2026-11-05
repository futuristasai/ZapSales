/**
 * Um `platform_licenca` EM MEMÓRIA, só para testar a lógica de `lib/licenca/armazem.ts` sem banco.
 *
 * Imita o PostgREST no que o armazém usa (`select/eq/maybeSingle`, `upsert ignoreDuplicates`,
 * `update/eq/select`) e o gatilho `fn_licenca_guarda_invariantes` da migration 0556 (horário só
 * avança, `ativada_em` e `instalacao_id` não mudam). O gatilho REAL é provado contra o Postgres em
 * `tests/invariants/licenca-estado-local.test.ts`; esta cópia existe para que o teste unitário
 * exercite o armazém sob as mesmas regras, e não se prova nada sobre o banco com ela.
 */

export type LinhaFalsa = Record<string, unknown> & { instalacao_id: string };

export interface BancoFalso {
  /** O cliente que `createAdminClient()` devolve. */
  cliente: unknown;
  /** A linha atual (ou `null`), para as asserções olharem o que ficou GRAVADO. */
  linha: () => LinhaFalsa | null;
  /** Quantas vezes cada operação rodou. */
  chamadas: { ler: number; criar: number; atualizar: number };
}

export interface OpcoesDoBancoFalso {
  /** Linha que já existe. */
  inicial?: LinhaFalsa | null;
  /** Faz TODA operação devolver este erro do PostgREST (ex.: `{ code: "PGRST205" }`). */
  erro?: { code: string; message?: string };
  /** Faz toda operação LANÇAR (rede caída). */
  lanca?: boolean;
}

const COLUNAS_DE_TEXTO_DE_INSTANTE = ["maior_horario_visto", "ativada_em"] as const;

const LINHA_NOVA = {
  selo_atual: null,
  maior_horario_visto: null,
  ativada_em: null,
  bloqueio_codigo: null,
  bloqueio_em: null,
  ultima_consulta_ok_em: null,
  janela_termina_em: null,
  credencial_ciphertext: null,
  modo: "sombra",
};

function maior(a: unknown, b: unknown): unknown {
  if (a == null) return b;
  if (b == null) return a;
  return Date.parse(String(a)) >= Date.parse(String(b)) ? a : b;
}

export function bancoFalso(opcoes: OpcoesDoBancoFalso = {}): BancoFalso {
  let linha: LinhaFalsa | null = opcoes.inicial ?? null;
  const chamadas = { ler: 0, criar: 0, atualizar: 0 };

  const falha = () => {
    if (opcoes.lanca) throw new Error("rede caída");
    return opcoes.erro ? { data: null, error: opcoes.erro } : null;
  };

  const tabela = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          chamadas.ler += 1;
          const f = falha();
          if (f) return f;
          return { data: linha ? { ...linha } : null, error: null };
        },
      }),
    }),
    upsert: async (novo: LinhaFalsa) => {
      chamadas.criar += 1;
      const f = falha();
      if (f) return { error: f.error };
      // Os defaults da tabela: tudo NULL, menos `modo`.
      if (!linha) linha = { ...LINHA_NOVA, ...novo };
      return { error: null };
    },
    update: (campos: Record<string, unknown>) => ({
      eq: () => ({
        select: async () => {
          chamadas.atualizar += 1;
          const f = falha();
          if (f) return f;
          if (!linha) return { data: [], error: null };
          const antiga = linha;
          const nova: LinhaFalsa = { ...antiga, ...campos };
          // O gatilho da 0556.
          nova.instalacao_id = antiga.instalacao_id;
          nova.maior_horario_visto = maior(antiga.maior_horario_visto, nova.maior_horario_visto);
          nova.ativada_em = antiga.ativada_em ?? nova.ativada_em;
          for (const c of COLUNAS_DE_TEXTO_DE_INSTANTE) nova[c] = nova[c] ?? null;
          linha = nova;
          return { data: [{ id: 1 }], error: null };
        },
      }),
    }),
  };

  return {
    cliente: { from: () => tabela },
    linha: () => (linha ? { ...linha } : null),
    chamadas,
  };
}

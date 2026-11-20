/**
 * O PORTÃO das rotas da API genérica (issue #372). Server-side only.
 *
 * Toda rota que cadastra, edita, apaga ou testa uma ferramenta de API passa por aqui, e as quatro
 * perguntas são feitas sempre na mesma ordem — a rota não reimplementa nenhuma:
 *
 *  1. PAPEL — gerente para cima chega; se a organização diz «só administrador cadastra», só ele.
 *  2. RECURSO LIGADO — desligado (o padrão), nada se cadastra nem se testa.
 *  3. DUAS ETAPAS — com a exigência ligada (o padrão), a sessão precisa ter provado a segunda
 *     etapa. Quem TEM fator e está em `aal1` já é barrado por `requireRole`; o que este portão
 *     acrescenta é barrar quem não tem fator nenhum.
 *
 * A organização vem da sessão, nunca do corpo.
 */
import type { NextResponse } from "next/server";

import { fail, type ApiError } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { sessionAal } from "@/lib/auth/server";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

import type { SegurancaDasApis } from "./seguranca";
import { lerSegurancaDaOrganizacao } from "./seguranca-servidor";

export const RECURSO_DAS_APIS = "ai_api_tools";

export const FRASE_DAS_DUAS_ETAPAS =
  "Para mexer nas APIs, esta organização exige a verificação em duas etapas. Ative-a em Configurações › Segurança e entre de novo com o código — ou desligue a exigência em Ferramentas externas › APIs › Segurança.";

export type PortaoDasApis =
  | {
      ok: true;
      user: AuthUser;
      org: ActiveOrg;
      seguranca: SegurancaDasApis;
      admin: ReturnType<typeof createAdminClient>;
      t: (texto: string) => string;
    }
  | { ok: false; response: NextResponse<ApiError> };

/** Como o aviso ao administrador nomeia quem fez a mudança: o nome, e só na falta dele o e-mail. */
export function quemFez(user: Pick<AuthUser, "id" | "email" | "full_name">): string {
  return user.full_name?.trim() || user.email || user.id;
}

/**
 * A hora que entra no TÍTULO de um aviso ao administrador, até o segundo.
 *
 * A Central guarda um aviso aberto por título. Com a hora só até o minuto, duas mudanças seguidas
 * tinham o mesmo título e a segunda era engolida — e a segunda é justamente a que importa quando
 * alguém liga o recurso e, no mesmo minuto, tira uma proteção (achado do e2e da #372).
 */
export function horaDoAviso(agora: Date = new Date()): string {
  return `${agora.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** A sessão provou a segunda etapa? */
export async function sessaoComDuasEtapas(): Promise<boolean> {
  return (await sessionAal()) === "aal2";
}

/**
 * O portão de quem vai CADASTRAR, EDITAR, APAGAR ou TESTAR uma ferramenta de API.
 * `exigirLigado: false` só para a remoção e para desativar: tirar uma API do ar tem de ser
 * possível com o recurso desligado. `exigirDuasEtapas: false` só para PAUSAR: parar uma API é o
 * freio de emergência, e quem tem o papel não pode ficar sem ele por ter entrado só com a senha.
 */
export async function portaoDeCadastro(
  requestId: string,
  opcoes: { exigirLigado?: boolean; exigirDuasEtapas?: boolean } = {},
): Promise<PortaoDasApis> {
  const authz = await requireRole("manager", { requestId, resource: RECURSO_DAS_APIS });
  if (!authz.ok) return authz;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const admin = createAdminClient();

  const seguranca = await lerSegurancaDaOrganizacao(admin, authz.org.orgId);
  if (!seguranca) {
    return { ok: false, response: fail("internal_error", t("Não consegui ler a segurança das APIs."), 500, { requestId }) };
  }
  if (seguranca.quem_cadastra === "admin") {
    const adm = await requireRole("admin", { requestId, resource: RECURSO_DAS_APIS });
    if (!adm.ok) return adm;
  }
  if (opcoes.exigirLigado !== false && !seguranca.ligado) {
    return {
      ok: false,
      response: fail("api_disabled", t("As APIs estão desligadas nesta organização. Ligue o recurso em Ferramentas externas › APIs."), 409, {
        requestId,
      }),
    };
  }
  if (opcoes.exigirDuasEtapas !== false && seguranca.exigir_duas_etapas && !(await sessaoComDuasEtapas())) {
    return { ok: false, response: fail("api_two_step_required", t(FRASE_DAS_DUAS_ETAPAS), 403, { requestId }) };
  }
  return { ok: true, user: authz.user, org: authz.org, seguranca, admin, t };
}

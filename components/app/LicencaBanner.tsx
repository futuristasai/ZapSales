/**
 * A FAIXA DA LICENÇA — a situação da licença, na tela em que a pessoa já está.
 *
 * Contrato: `docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2 (a tabela de estados e as mensagens).
 * A frase de cada estado mora em `lib/licenca/textos.ts`, para a faixa e a página `/licenca` nunca discordarem.
 *
 * ─── Quem vê o quê, e por quê ───────────────────────────────────────────────
 *
 *  - **Estados em que a instalação opera** (uso não comercial, ativação pendente, temporária): só quem
 *    administra. É o aviso de quem precisa agir; a equipe que atende o dia inteiro não tem o que fazer com ele, e
 *    uma faixa que ninguém pode atender vira papel de parede.
 *  - **Estados em que a instalação NÃO opera** (autorização vencida, bloqueada): todos. Quando o produto passa a
 *    recusar trabalho, ninguém pode ficar sem saber por quê — é a diferença entre "o sistema parou" e "a licença
 *    venceu". Enquanto o modo for só observação, a faixa diz que o sistema segue funcionando.
 *  - **Permanente**: nenhuma faixa. O que está certo não se anuncia.
 *
 * ─── Por que não derruba a primeira tela ────────────────────────────────────
 *
 * Os estados informativos são uma linha e `role="status"` — não `alert`: não interrompem leitor de tela nem
 * disputam a atenção com o aviso de conexão caída. Só o estado de erro é `alert`, porque ali o produto está (ou
 * ficará) parado.
 *
 * E a faixa mora NO TOPO DA COLUNA DE CONTEÚDO (`AppShell`, prop `faixas`), em fluxo normal, e não acima da
 * casca: acima dela empurrava a página para baixo e a barra lateral (`sticky h-screen`) passava da borda da
 * janela — "Buscar" e o menu da conta ficavam cortados até rolar. Medido na vitrine antes de mover.
 *
 * Client de propósito, pela mesma razão de `ConexaoCaidaBanner`: o layout é servidor, mas a faixa fica DENTRO do
 * `IdiomaProvider` e do `AuthProvider`, e lê o idioma e o papel de lá.
 */
"use client";
import Link from "next/link";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { ROLE_RANK } from "@/lib/auth/types";
import type { SituacaoDaLicenca } from "@/lib/licenca/situacao";
import { seguePorEnquanto, textoDaLicenca } from "@/lib/licenca/textos";

export function LicencaBanner({ situacao }: { situacao: SituacaoDaLicenca | null }) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  if (!situacao || situacao.estado === "permanente_valido") return null;

  const administra =
    (user.is_platform_admin && !user.support) ||
    (activeOrg !== null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);
  const parada = !situacao.opera;
  if (!parada && !administra) return null;

  const texto = textoDaLicenca(situacao.estado, situacao.diasRestantes, t);
  const ainda = parada && situacao.modo === "sombra" ? ` ${seguePorEnquanto(t)}` : "";

  return (
    <div
      role={parada ? "alert" : "status"}
      data-licenca-estado={situacao.estado}
      className={
        parada
          ? "flex flex-wrap items-center justify-between gap-3 border-b border-error/40 bg-error-bg px-4 py-2 text-sm text-error-fg"
          : "flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-elevated px-4 py-1.5 text-sm text-text-muted"
      }
    >
      <span>
        {texto.curta}
        {ainda}
      </span>
      <Link
        href="/app/licenca"
        className={
          parada
            ? "rounded-md border border-error/40 bg-white/70 px-3 py-1 font-medium text-error-fg hover:bg-white"
            : "font-medium underline underline-offset-2 hover:text-foreground"
        }
      >
        {t("Ver licença")}
      </Link>
    </div>
  );
}

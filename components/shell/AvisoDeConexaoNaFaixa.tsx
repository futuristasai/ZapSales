"use client";
import { useChannelSessions, deriveOverallHealth } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { Warning } from "@/lib/ui/icons";

/**
 * O aviso sobre o ícone de Conexões na faixa: um número do WhatsApp caiu (issue #188).
 *
 * É a mesma leitura da bolinha ao lado da tela «Conexões» (`ConnectionHealthDot`,
 * 30 s) — só que a bolinha mora dentro do painel, e com o painel recolhido ou em
 * outra área ninguém a veria. Aparece SÓ quando uma conexão caiu: "nenhuma
 * conexão" e "não foi possível verificar" são estados de tela, não de alarme, e um
 * aviso que acende o tempo todo ensina a ser ignorado.
 *
 * Forma e palavra, não só cor: um triângulo de alerta e o texto «Uma conexão
 * caiu» para o leitor de tela.
 */
export function AvisoDeConexaoNaFaixa() {
  const t = useT();
  const { data, isError } = useChannelSessions({ refetchInterval: 30_000 });
  if (isError || deriveOverallHealth(data) !== "down") return null;
  const rotulo = t("Uma conexão caiu");
  return (
    <span
      data-testid="aviso-de-conexao-na-faixa"
      role="img"
      aria-label={rotulo}
      title={rotulo}
      className="absolute top-1 right-2 flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full bg-error text-white dark:text-neutral-900"
    >
      <Warning size={12} weight="fill" aria-hidden />
    </span>
  );
}

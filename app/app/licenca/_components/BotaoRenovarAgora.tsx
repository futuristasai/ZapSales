"use client";
// Client de propósito: o botão faz um POST e atualiza a página com o que voltou. O texto do resultado é
// montado aqui (`textoDoResultadoDaRenovacao`), no idioma de quem apertou.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { textoDoResultadoDaRenovacao, type TomDaLicenca } from "@/lib/licenca/textos";

interface Resposta {
  data?: { resultado: string; motivo?: string };
  error?: { code: string };
}

const CLASSE_DO_TOM: Record<TomDaLicenca, string> = {
  informacao: "border-border bg-surface-elevated",
  aviso: "border-warning/60 bg-warning-bg",
  erro: "border-error/40 bg-error-bg text-error-fg",
};

/** "Tentar renovar agora": pede ao servidor de licenças um selo novo sem esperar a próxima consulta. */
export function BotaoRenovarAgora() {
  const t = useT();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [, comecar] = useTransition();
  const [resultado, setResultado] = useState<{ texto: string; tom: TomDaLicenca } | null>(null);

  async function renovar() {
    setOcupado(true);
    setResultado(null);
    try {
      const resposta = await fetch("/api/v1/licenca/renovar", { method: "POST" });
      const corpo = (await resposta.json().catch(() => ({}))) as Resposta;
      if (corpo.data) {
        setResultado(
          textoDoResultadoDaRenovacao(corpo.data.resultado, corpo.data.motivo ?? null, t),
        );
      } else {
        setResultado({
          texto:
            resposta.status === 403
              ? t("Só o administrador da empresa pode renovar a licença.")
              : t(
                  "Não foi possível renovar agora. Nada foi alterado: confira a internet desta VPS e tente de novo daqui a pouco.",
                ),
          tom: "aviso",
        });
      }
      // O estado pode ter mudado (selo novo, bloqueio): a página relê.
      comecar(() => router.refresh());
    } catch {
      setResultado({
        texto: t(
          "Não foi possível renovar agora. Nada foi alterado: confira a internet desta VPS e tente de novo daqui a pouco.",
        ),
        tom: "aviso",
      });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={() => void renovar()} disabled={ocupado}>
        {ocupado ? t("Renovando…") : t("Tentar renovar agora")}
      </Button>
      {resultado ? (
        <p
          role="status"
          data-testid="licenca-resultado"
          className={`rounded-md border px-3 py-2 text-sm ${CLASSE_DO_TOM[resultado.tom]}`}
        >
          {resultado.texto}
        </p>
      ) : null}
    </div>
  );
}

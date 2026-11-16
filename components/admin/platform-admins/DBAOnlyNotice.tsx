"use client";
import { ENDERECO_DO_MANUAL } from "@/lib/navigation/manual";
import { Info } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

export function DBAOnlyNotice() {
  const t = useT();
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-info/40 bg-info-bg p-4 text-info-fg"
    >
      <Info size={20} className="mt-0.5 shrink-0 text-info-fg" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {t("Quem administra a plataforma só se muda direto no banco de dados")}
        </p>
        <p className="text-sm leading-relaxed text-info-fg">
          {t("Incluir, tirar ou mudar alguém em")}{" "}
          <code className="rounded-md bg-info-bg px-1 font-mono text-xs">platform_admins</code>{" "}
          {t("é feito só por comando direto no banco de dados, com uma nota no registro de ações (")}
          <code className="rounded-md bg-info-bg px-1 font-mono text-xs">api_audit_log</code>
          {t("). Esta página só mostra quem é: de propósito, ela não tem botão de mudança.")}
        </p>
        <p className="pt-1">
          {/* O manual é servido por uma rota própria (`app/manual/[[...arquivo]]`) como HTML
              inteiro, não uma tela do app: `<a>` com recarga, não `<Link>`. */}
          <a
            href={`${ENDERECO_DO_MANUAL}#admin-visao--conceder`}
            target="_blank"
            rel="noopener"
            className="text-xs font-medium text-info-fg underline underline-offset-2 hover:text-info-fg"
          >
            {t("Ver no manual como incluir ou tirar alguém →")}
          </a>
        </p>
      </div>
    </div>
  );
}

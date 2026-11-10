"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FUSO_PADRAO, FUSOS_DO_ONBOARDING } from "@/lib/tempo/fusos";
import { ArrowRight } from "@/lib/ui/icons";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { exemplosDoRamo } from "@/lib/onboarding/ajuda";


export function WelcomeForm({
  defaultOrgName,
  orgId,
}: {
  defaultOrgName: string;
  orgId: string;
}) {
  const t = useT();
  const exemplos = exemplosDoRamo(useIdioma());
  const [displayName, setDisplayName] = useState(defaultOrgName);
  const [oQueFaz, setOQueFaz] = useState("");
  const [timezone, setTimezone] = useState(FUSO_PADRAO);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-7 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6"
      action={(formData) => {
        if (!accepted) {
          toast.error(t("Aceite os termos para continuar."));
          return;
        }
        startTransition(async () => {
          const res = await acceptWelcome(formData);
          if (res && !res.ok) {
            toast.error(`Falha: ${res.error}`);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="display_name" className="text-base font-semibold">{t("Como se chama o seu negócio?")}</Label>
        <Input
          id="display_name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={120}
          required
          className="h-12 text-base"
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("É o nome que aparece para o seu time e nos relatórios. Pode ser clínica, loja, escritório — o que for seu.")}
        </p>
      </div>

      {/*
        A pergunta que faltava no produto inteiro. Sem ela, o funcionário nasce
        se apresentando como atendente de uma "loja online" — era o que os três
        modelos de prompt diziam — e o quadro de clientes nasce com as colunas
        de e-commerce que o gatilho semeia. Os dois defeitos têm a mesma origem:
        uma instalação que nunca pergunta em que ramo entrou.
      */}
      <div className="space-y-2">
        <Label htmlFor="o_que_faz" className="text-base font-semibold">{t("O que vocês fazem?")}</Label>
        <Input
          id="o_que_faz"
          name="o_que_faz"
          value={oQueFaz}
          onChange={(e) => setOQueFaz(e.target.value)}
          maxLength={280}
          className="h-12 text-base"
          placeholder={t("Ex.: clínica odontológica, ou venda de roupa fitness pelo WhatsApp")}
        />
        {/* Atalhos, não obrigação: um clique escreve o ramo e a pessoa ainda edita. Quem
            não sabe como descrever o negócio em uma linha ganha um ponto de partida. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="mr-0.5 text-xs text-muted-foreground">{exemplos.rotulo}</span>
          {exemplos.itens.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setOQueFaz(ex)}
              className="rounded-full border border-primary/30 bg-primary/[0.06] px-3.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(
            "Uma linha basta. É com isso que seu funcionário aprende com quem ele está falando — e que a gente monta o quadro de clientes do seu jeito.",
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone" className="text-base font-semibold">{t("Onde você atende")}</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone" className="h-12 text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FUSOS_DO_ONBOARDING.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {t(f.cidade)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="timezone" value={timezone} />
        {/* A org para a qual ESTA aba foi aberta. No submit, o server action
            resolve por ela (validada como membership), não pela org ativa do
            momento — que outra aba pode ter trocado. */}
        <input type="hidden" name="organization_id" value={orgId} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("Decide o horário em que seu funcionário pode falar com clientes.")}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-elevated/50 p-3.5 text-sm leading-relaxed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
          required
        />
        <span>
          {t("Li e aceito os")}{" "}
          <a className="underline" href="/legal/terms" target="_blank" rel="noreferrer">
            {t("Termos de Uso")}
          </a>{" "}
          {t("e a")}{" "}
          <a className="underline" href="/legal/privacy" target="_blank" rel="noreferrer">
            {t("Política de Privacidade")}
          </a>
          .
        </span>
      </label>

      <div className="flex sm:justify-end">
        <Button type="submit" disabled={pending || !accepted} className="w-full sm:w-auto h-12 gap-2 px-7 text-base">
          {pending ? t("Salvando...") : t("Continuar")}
          {pending ? null : <ArrowRight aria-hidden size={18} weight="bold" />}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCases, type CaseListItem } from "@/hooks/ai/useCases";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  casosEsperandoUmaPessoa,
  tipoDeCasoLabel,
} from "@/lib/ai/case-copy";
import { Robot } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { CaseDetail } from "./CaseDetail";

type Aba = "esperando" | "todos";

export function CaseList() {
  const t = useT();
  // A tela abre nos casos que esperam uma PESSOA — o que está parado por causa
  // de quem atende. "Todos" é o histórico (inclusive os resolvidos), a um clique.
  const [aba, setAba] = useState<Aba>("esperando");
  // Deep link: o aviso "um atendimento espera decisão" na Central manda para cá
  // com o id do caso. Sem isto ele abriria a LISTA, e quem clicou teria que
  // caçar de qual caso o aviso falava — um aviso que não leva ao seu assunto é
  // meio aviso. Só o valor INICIAL: clicar na lista continua mandando, e a URL
  // não vira estado a sincronizar. O detalhe busca o caso pelo id, então um
  // caso resolvido abre mesmo fora da aba padrão.
  // `?.` porque o hook devolve null fora de um contexto de navegação (o que
  // acontece em teste e em render estático). Sem a guarda, a tela inteira
  // quebra com "Cannot read properties of null".
  const idDaUrl = useSearchParams()?.get("caso") ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(idDaUrl);
  // A MESMA consulta (e a mesma chave) do contador do menu: abrir a tela e
  // olhar o menu não dobram a leitura, e os dois números saem da mesma lista.
  const abertos = useCases("open");
  const resolvidos = useCases("resolved", { enabled: aba === "todos" });

  const esperando = casosEsperandoUmaPessoa(abertos.data?.cases ?? []);
  const todos = [...(abertos.data?.cases ?? []), ...(resolvidos.data?.cases ?? [])].sort(
    (x, y) => Date.parse(y.opened_at) - Date.parse(x.opened_at),
  );

  const isLoading = aba === "esperando" ? abertos.isLoading : abertos.isLoading || resolvidos.isLoading;
  const casos = aba === "esperando" ? esperando : todos;
  const temDados = aba === "esperando" ? !!abertos.data : !!abertos.data && !!resolvidos.data;

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="flex w-full max-w-xs shrink-0 flex-col gap-4">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="esperando">
              {t("Aguardando você")}
              {abertos.data ? ` (${esperando.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="todos">{t("Todos")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !temDados || casos.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <Robot size={28} className="text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {aba === "esperando" ? t("Nenhum caso esperando você") : t("Nenhum caso ainda")}
            </p>
            <p className="text-xs text-muted-foreground">
              {aba === "esperando"
                ? t("Quando a IA precisar de você, aparece aqui.")
                : t("Os casos que a IA abrir, esperando alguém ou já concluídos, ficam aqui.")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {casos.map((c) => (
              <CaseRow
                key={c.id}
                item={c}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <CaseDetail caseId={selectedId} />
      </div>
    </div>
  );
}

function CaseRow({
  item,
  selected,
  onSelect,
}: {
  item: CaseListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const when = formatDistanceToNowStrict(new Date(item.opened_at), { addSuffix: true, locale: localeDaData });
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        data-testid="case-item"
        className={cn(
          "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-accent-soft",
          selected && "bg-accent-soft",
        )}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <Badge variant={STATUS_BADGE_VARIANT[item.status]} className="shrink-0">
            {t(STATUS_LABEL[item.status])}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {/* O assunto vem ANTES do nome: quem tria a fila decide por ele, e o
              nome só importa depois de escolher o caso. */}
          {t(tipoDeCasoLabel(item.kind))} · {item.contact_name ?? t("Contato sem nome")} · {when}
        </p>
      </button>
    </li>
  );
}

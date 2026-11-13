"use client";
/**
 * Listas salvas de pessoas — dentro do cartão "Escolher pessoas do CRM".
 *
 * Salvar guarda as pessoas que estão MARCADAS agora, com um nome; usar traz as pessoas de volta
 * para o público (somando às que já estão lá). A lista é fixa: o que se vê ao salvar é o que volta.
 * Quem não pode mais receber (pediu para sair, anonimizado, sem telefone, já em outra campanha)
 * não entra ao usar a lista, e a tela diz quantas ficaram de fora e por quê — a lista nunca é um
 * caminho para furar um veto.
 */
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useApagarListaDePessoas,
  useListasDePessoas,
  useSalvarListaDePessoas,
  useUsarListaDePessoas,
  type ListaSalva,
} from "@/hooks/campanhas/useListasDePessoas";
import { useT } from "@/hooks/i18n/useT";
import { idsDoPublico, marcarTodos } from "@/lib/campanhas/escolha-de-contatos";

interface Props {
  /** As pessoas marcadas na tabela (ids). */
  marcados: string[];
  onMarcados: (ids: string[]) => void;
  /** As pessoas da planilha CSV — dividem o mesmo teto do público. */
  daPlanilha: string[];
  /** Na edição: os destinatários desta campanha não contam como "já em campanha". */
  campanhaId?: string;
  /**
   * Lista que entra no público sozinha, uma vez, quando a tela abre — o id veio
   * no endereço (`?lista=`), posto por outra tela que acabou de criar a lista.
   */
  listaInicial?: string;
}

export function ListasSalvas({
  marcados,
  onMarcados,
  daPlanilha,
  campanhaId,
  listaInicial,
}: Props) {
  const t = useT();
  const listas = useListasDePessoas();
  const salvar = useSalvarListaDePessoas();
  const usar = useUsarListaDePessoas();
  const apagar = useApagarListaDePessoas();

  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [paraApagar, setParaApagar] = useState<ListaSalva | null>(null);

  const nomeValido = nome.trim().length >= 2;
  // Salva o público inteiro como a tela o mostra: as marcadas na tabela e as da planilha, sem repetir.
  const publico = idsDoPublico(marcados, daPlanilha);

  function guardar() {
    if (!nomeValido || publico.length === 0) return;
    salvar.mutate(
      { name: nome.trim(), contact_ids: publico },
      {
        onSuccess: (lista) => {
          setAviso(`${t("Lista salva:")} ${lista.name} (${lista.total} ${t("pessoa(s)")}).`);
          setNome("");
          setSalvando(false);
        },
      },
    );
  }

  function usarLista(lista: ListaSalva) {
    usar.mutate(
      { id: lista.id, campanhaId },
      {
        onSuccess: (pessoas) => {
          const r = marcarTodos(marcados, pessoas.contatos, daPlanilha);
          onMarcados(r.marcados);

          const novas = r.marcados.length - marcados.length;
          const vetadas = pessoas.contatos.filter((c) => c.motivo !== null);
          const porMotivo = new Map<string, number>();
          for (const v of vetadas) {
            porMotivo.set(v.motivo ?? "", (porMotivo.get(v.motivo ?? "") ?? 0) + 1);
          }
          const sumidas = pessoas.guardadas - pessoas.total;
          const partes = [`${novas} ${t("pessoa(s) da lista entraram no público")}`];
          if (vetadas.length > 0) {
            const motivos = [...porMotivo.entries()]
              .map(([m, n]) => `${n} · ${t(pessoas.legenda[m] ?? m)}`)
              .join("; ");
            partes.push(`${vetadas.length} ${t("ficaram de fora")} (${motivos})`);
          }
          if (sumidas > 0) {
            partes.push(`${sumidas} ${t("não estão mais no CRM")}`);
          }
          if (r.ficaramDeFora > 0) {
            partes.push(
              `${r.ficaramDeFora} ${t("passariam do máximo de 5.000 pessoas num público")}`,
            );
          }
          setAviso(`${lista.name}: ${partes.join(" · ")}.`);
        },
      },
    );
  }

  function confirmarExclusao() {
    const lista = paraApagar;
    if (!lista) return;
    apagar.mutate(lista.id, {
      onSuccess: () => {
        setAviso(`${t("Lista apagada:")} ${lista.name}.`);
        setParaApagar(null);
      },
    });
  }

  const todas = listas.data ?? [];

  // A LISTA DO ENDEREÇO entra pelo MESMO caminho do botão "Usar esta lista":
  // os mesmos vetos, o mesmo aviso de quem ficou de fora. Uma vez só — o `ref`
  // segura a repetição quando as listas recarregam — e só depois que as listas
  // chegaram, porque o aviso leva o nome dela. Id que não é de nenhuma lista
  // desta organização (apagada, ou de outra empresa) vira aviso, não erro.
  const jaUsouAInicial = useRef(false);
  const listasCarregadas = listas.data;
  useEffect(() => {
    if (!listaInicial || jaUsouAInicial.current || !listasCarregadas) return;
    jaUsouAInicial.current = true;
    const lista = listasCarregadas.find((l) => l.id === listaInicial);
    if (lista) usarLista(lista);
    // `usarLista` muda de identidade a cada render; o `ref` é quem garante "uma vez".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaInicial, listasCarregadas]);
  // A lista do endereço que não existe é um FATO das listas carregadas, não um
  // acontecimento: calculado a cada render, sem estado. Some assim que a tela
  // tiver outra coisa a dizer (um aviso de salvar, usar ou excluir).
  const listaDoEnderecoSumiu =
    Boolean(listaInicial) &&
    listasCarregadas !== undefined &&
    !listasCarregadas.some((l) => l.id === listaInicial);
  const avisoNaTela =
    aviso ??
    (listaDoEnderecoSumiu
      ? t("A lista indicada não existe mais. Escolha as pessoas abaixo.")
      : null);

  return (
    <div className="space-y-3 rounded-md border border-border p-3" data-testid="listas-salvas">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">{t("Listas salvas")}</h4>
        <p className="text-sm text-muted-foreground">
          {t(
            "Guarde as pessoas marcadas com um nome para usar em outra campanha. A lista é fixa: quem entrou nela fica, e quem não puder mais receber é deixado de fora na hora de usar.",
          )}
        </p>
      </div>

      {listas.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando as listas…")}</p>
      ) : listas.isError ? (
        <p role="alert" className="text-sm text-error-fg">
          {t("Não foi possível carregar as listas salvas.")}
        </p>
      ) : todas.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="listas-vazio">
          {t("Você ainda não salvou nenhuma lista.")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {todas.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              data-testid="lista-salva"
            >
              <span>
                <strong>{l.name}</strong>{" "}
                <span className="text-muted-foreground">
                  · {l.total} {t("pessoa(s)")}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={usar.isPending}
                  onClick={() => usarLista(l)}
                  aria-label={`${t("Usar a lista")} ${l.name}`}
                >
                  {t("Usar esta lista")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setParaApagar(l)}
                  aria-label={`${t("Excluir a lista")} ${l.name}`}
                >
                  {t("Excluir")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {avisoNaTela && (
        <p role="status" className="text-sm" data-testid="aviso-de-lista">
          {avisoNaTela}
        </p>
      )}

      {salvando ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="nome-da-lista">{t("Nome da lista")}</Label>
            <Input
              id="nome-da-lista"
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Ex.: Clientes VIP de novembro")}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!nomeValido || salvar.isPending}
            onClick={guardar}
          >
            {t("Salvar lista")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSalvando(false)}>
            {t("Cancelar")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={publico.length === 0}
          onClick={() => {
            setAviso(null);
            setSalvando(true);
          }}
        >
          {publico.length === 0
            ? t("Marque pessoas para salvar uma lista")
            : `${t("Salvar as")} ${publico.length} ${t("pessoas deste público como lista")}`}
        </Button>
      )}

      <AlertDialog
        open={paraApagar !== null}
        onOpenChange={(aberto) => !aberto && setParaApagar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Excluir a lista")} {paraApagar?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Só a lista some. As pessoas continuam no CRM e as campanhas que já usaram a lista não mudam.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>{t("Excluir")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

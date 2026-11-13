"use client";
/**
 * Escolher pessoas do CRM para esta campanha.
 *
 * ═══ Como se lê ═══
 *
 * Os filtros e a busca só ENCONTRAM gente — etiquetas, funis, etapas, tempo sem falar, e uma busca
 * por nome, telefone ou etiqueta. Quem vira público é quem o operador MARCA na tabela (ou quem a
 * planilha CSV trouxe): a tabela é onde se confere "quem vai receber" antes de salvar.
 *
 * Quem não pode receber aparece, mas esmaecida e sem caixa para marcar, com o motivo: pediu para
 * não receber, sem telefone, já em outra campanha. Esconder a linha faria o operador achar que a
 * pessoa sumiu do CRM. Os vetos são os mesmos da prévia — a tabela só os mostra mais cedo.
 *
 * Controlado: quem guarda as pessoas marcadas é a tela da campanha (nova ou edição), que as soma
 * às da planilha e manda tudo como `audience_filter.incluir_contatos`.
 */
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListasSalvas } from "@/components/campanhas/ListasSalvas";
import {
  useEtiquetasDoCrm,
  usePessoasEncontradas,
  type FiltrosDaTabela,
} from "@/hooks/campanhas/useEscolhaDePessoas";
import { consultaDeEtapas, useEtapas, useFunis } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";
import {
  desmarcarTodos,
  marcarTodos,
  podeMarcar,
  somaDoPublico,
} from "@/lib/campanhas/escolha-de-contatos";

const POR_PAGINA = 25;
/** Quanto a digitação espera antes de ir ao servidor. */
const ESPERA_DA_BUSCA_MS = 400;

interface Props {
  /** As pessoas marcadas na tabela (ids). */
  marcados: string[];
  onMarcados: (ids: string[]) => void;
  /** As pessoas que vieram da planilha CSV — só para a soma e para o teto. */
  daPlanilha: string[];
  /** Na edição: os destinatários desta campanha não contam como "já em campanha". */
  campanhaId?: string;
  /** Lista salva que entra no público sozinha ao abrir (veio no endereço da tela). */
  listaInicial?: string;
}

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

export function SeletorDePessoas({
  marcados,
  onMarcados,
  daPlanilha,
  campanhaId,
  listaInicial,
}: Props) {
  const t = useT();
  const etiquetas = useEtiquetasDoCrm();
  const funis = useFunis();

  const [comTags, setComTags] = useState<string[]>([]);
  const [semTags, setSemTags] = useState<string[]>([]);
  const [funisEscolhidos, setFunisEscolhidos] = useState<string[]>([]);
  // As etapas marcadas, por funil. Funil sem etapa marcada vale por inteiro.
  const [etapasPorFunil, setEtapasPorFunil] = useState<Record<string, string[]>>({});
  const [semInteracao, setSemInteracao] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaEsperada, setBuscaEsperada] = useState("");
  // A página vale para UMA busca: mudou o filtro ou o texto, volta ao começo sem precisar de efeito.
  const [paginaGuardada, setPaginaGuardada] = useState({ chave: "", pagina: 0 });
  const [avisoDoTeto, setAvisoDoTeto] = useState(0);

  useEffect(() => {
    const espera = setTimeout(() => setBuscaEsperada(busca.trim()), ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(espera);
  }, [busca]);

  // O servidor combina funil e etapa com "E", e o que se quer aqui é "OU entre os funis": por isso
  // a tela manda só ETAPAS — as marcadas de cada funil, ou todas as dele quando nenhuma foi
  // marcada. Uma etapa já implica o funil dela.
  const etapasDosFunis = useQueries({
    queries: funisEscolhidos.map((id) => consultaDeEtapas(id)),
  });
  const etapasProntas = etapasDosFunis.every((q) => q.isSuccess);
  const etapasEfetivas = useMemo(
    () =>
      funisEscolhidos.flatMap((id, i) => {
        const marcadas = etapasPorFunil[id] ?? [];
        return marcadas.length > 0 ? marcadas : (etapasDosFunis[i]?.data ?? []).map((e) => e.id);
      }),
    // `etapasDosFunis` muda de identidade a cada render; o que importa é o que ele carregou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funisEscolhidos, etapasPorFunil, etapasProntas],
  );

  const filtros: FiltrosDaTabela = useMemo(
    () => ({
      com_alguma_tag: comTags,
      sem_tags: semTags,
      funis: [],
      etapas: etapasEfetivas.slice(0, 50),
      sem_interacao_ha_dias: semInteracao ? Number(semInteracao) : null,
    }),
    [comTags, semTags, etapasEfetivas, semInteracao],
  );

  const temFiltro =
    comTags.length > 0 ||
    semTags.length > 0 ||
    funisEscolhidos.length > 0 ||
    filtros.sem_interacao_ha_dias !== null;
  // Com funil escolhido e as etapas ainda chegando, esperar: mandar agora seria buscar sem o funil.
  const podeProcurar = (temFiltro || buscaEsperada.length >= 2) && etapasProntas;

  const achadas = usePessoasEncontradas(
    podeProcurar ? { filtros, busca: buscaEsperada, campanhaId } : null,
  );
  const encontrados = useMemo(
    () => (podeProcurar ? (achadas.data?.contatos ?? []) : []),
    [podeProcurar, achadas.data],
  );
  const legenda = achadas.data?.legenda ?? {};

  const chaveDaBusca = JSON.stringify([filtros, buscaEsperada]);
  const pagina = paginaGuardada.chave === chaveDaBusca ? paginaGuardada.pagina : 0;
  const irParaPagina = (n: number) => setPaginaGuardada({ chave: chaveDaBusca, pagina: n });

  const soma = somaDoPublico(marcados, daPlanilha);
  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);
  const quePodem = encontrados.filter(podeMarcar);
  const ultimaPagina = Math.max(0, Math.ceil(encontrados.length / POR_PAGINA) - 1);
  const naUltimaPagina = pagina >= ultimaPagina;
  const linhasDaPagina = encontrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const todosMarcados = quePodem.length > 0 && quePodem.every((l) => marcadosSet.has(l.id));

  function marcarOsEncontrados() {
    const r = marcarTodos(marcados, encontrados, daPlanilha);
    onMarcados(r.marcados);
    setAvisoDoTeto(r.ficaramDeFora);
  }

  function limparFiltros() {
    setComTags([]);
    setSemTags([]);
    setFunisEscolhidos([]);
    setEtapasPorFunil({});
    setSemInteracao("");
    setBusca("");
    setBuscaEsperada("");
  }

  function alternarFunil(id: string) {
    setFunisEscolhidos((atual) => alternar(atual, id));
    // As etapas de um funil que saiu da lista saem junto: mantê-las seria um filtro invisível.
    setEtapasPorFunil(({ [id]: _tiradas, ...resto }) => resto);
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-3" data-testid="seletor-de-pessoas">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("Escolher pessoas do CRM")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "Use os filtros ou a busca para encontrar pessoas e marque quem vai receber. Quem pediu para não receber, não tem telefone ou já está em outra campanha aparece esmaecido.",
          )}
        </p>
      </div>

      <ListasSalvas
        marcados={marcados}
        onMarcados={onMarcados}
        daPlanilha={daPlanilha}
        campanhaId={campanhaId}
        listaInicial={listaInicial}
      />

      <div className="space-y-2">
        <Label htmlFor="busca-de-pessoas">{t("Buscar por nome, telefone ou etiqueta")}</Label>
        <Input
          id="busca-de-pessoas"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Digite pelo menos 2 letras")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <EscolherEtiquetas
          rotulo={t("Com alguma destas etiquetas")}
          opcoes={etiquetas.data ?? []}
          escolhidas={comTags}
          onAlternar={(tag) => setComTags((atual) => alternar(atual, tag))}
          carregando={etiquetas.isLoading}
          testId="filtro-com-etiquetas"
        />
        <EscolherEtiquetas
          rotulo={t("Sem nenhuma destas etiquetas")}
          opcoes={etiquetas.data ?? []}
          escolhidas={semTags}
          onAlternar={(tag) => setSemTags((atual) => alternar(atual, tag))}
          carregando={etiquetas.isLoading}
          testId="filtro-sem-etiquetas"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2" data-testid="filtro-de-funis">
          <legend className="text-sm font-medium">{t("Com negócio nos funis")}</legend>
          {(funis.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum funil criado ainda.")}</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {(funis.data ?? []).map((f) => (
                <div key={f.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={funisEscolhidos.includes(f.id)}
                      onChange={() => alternarFunil(f.id)}
                    />
                    {f.name}
                  </label>
                  {funisEscolhidos.includes(f.id) && (
                    <EtapasDoFunil
                      funilId={f.id}
                      escolhidas={etapasPorFunil[f.id] ?? []}
                      onAlternar={(etapa) =>
                        setEtapasPorFunil((atual) => ({
                          ...atual,
                          [f.id]: alternar(atual[f.id] ?? [], etapa),
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="pessoas-silencio">{t("Sem falar com a gente há (dias)")}</Label>
          <Input
            id="pessoas-silencio"
            type="number"
            min={1}
            value={semInteracao}
            onChange={(e) => setSemInteracao(e.target.value)}
          />
        </div>
      </div>

      {temFiltro && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={limparFiltros}>
            {t("Limpar filtros")}
          </Button>
        </div>
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-elevated px-3 py-2 text-sm"
        data-testid="soma-do-publico"
      >
        <span>
          <strong>{soma.total}</strong> {t("pessoa(s) neste público")}
          {daPlanilha.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {soma.doCrm} {t("do CRM")} + {soma.daPlanilha} {t("da planilha")}
            </span>
          )}
        </span>
        {marcados.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onMarcados([])}>
            {t("Desmarcar todas as escolhidas")}
          </Button>
        )}
      </div>

      {!podeProcurar ? (
        <p className="text-sm text-muted-foreground" data-testid="tabela-sem-busca">
          {t("Escolha um filtro ou busque por nome, telefone ou etiqueta para ver as pessoas.")}
        </p>
      ) : achadas.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Procurando pessoas…")}</p>
      ) : achadas.isError ? (
        <p role="alert" className="text-sm text-error-fg">
          {t("Não foi possível procurar as pessoas agora.")}
        </p>
      ) : encontrados.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="tabela-vazia">
          {t("Ninguém encontrado com esses filtros.")}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span data-testid="total-encontrado">
              <strong>{encontrados.length}</strong> {t("encontrada(s)")} · {quePodem.length}{" "}
              {t("podem receber")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={quePodem.length === 0}
              onClick={() =>
                todosMarcados
                  ? onMarcados(desmarcarTodos(marcados, encontrados))
                  : marcarOsEncontrados()
              }
            >
              {todosMarcados
                ? t("Desmarcar as encontradas")
                : `${t("Marcar todas as")} ${quePodem.length} ${t("que podem receber")}`}
            </Button>
          </div>
          {achadas.data?.cortado && (
            <p className="text-sm text-warning-fg" role="note">
              {t(
                "A busca achou mais gente do que a tabela mostra. Afine os filtros para ver o resto.",
              )}
            </p>
          )}
          {avisoDoTeto > 0 && (
            <p className="text-sm text-warning-fg" role="note" data-testid="aviso-do-teto">
              {avisoDoTeto}{" "}
              {t("pessoa(s) ficaram de fora: um público tem no máximo 5.000 pessoas.")}
            </p>
          )}

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid="tabela-de-pessoas">
              <thead className="bg-surface-elevated text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <span className="sr-only">{t("Escolher")}</span>
                  </th>
                  <th className="px-3 py-2">{t("Nome")}</th>
                  <th className="px-3 py-2">{t("Telefone")}</th>
                  <th className="px-3 py-2">{t("Etiquetas")}</th>
                  <th className="px-3 py-2">{t("Situação")}</th>
                </tr>
              </thead>
              <tbody>
                {linhasDaPagina.map((l) => {
                  const livre = podeMarcar(l);
                  return (
                    <tr
                      key={l.id}
                      data-testid="linha-de-pessoa"
                      data-vetada={livre ? undefined : "true"}
                      className={`border-t border-border ${livre ? "" : "text-muted-foreground opacity-60"}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${t("Escolher")} ${l.nome ?? l.telefone ?? ""}`}
                          checked={marcadosSet.has(l.id)}
                          disabled={!livre}
                          onChange={() => onMarcados(alternar(marcados, l.id))}
                        />
                      </td>
                      <td className="px-3 py-2">{l.nome ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.telefone ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {l.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {livre ? t("Pode receber") : t(legenda[l.motivo ?? ""] ?? l.motivo ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ultimaPagina > 0 && (
            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => irParaPagina(pagina - 1)}
              >
                {t("Anterior")}
              </Button>
              <span className="text-muted-foreground">
                {t("Página")} {pagina + 1} / {ultimaPagina + 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={naUltimaPagina}
                onClick={() => irParaPagina(pagina + 1)}
              >
                {t("Próxima")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EscolherEtiquetas({
  rotulo,
  opcoes,
  escolhidas,
  onAlternar,
  carregando,
  testId,
}: {
  rotulo: string;
  opcoes: string[];
  escolhidas: string[];
  onAlternar: (tag: string) => void;
  carregando: boolean;
  testId: string;
}) {
  const t = useT();
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="text-sm font-medium">{rotulo}</legend>
      {carregando ? (
        <p className="text-sm text-muted-foreground">{t("Carregando etiquetas…")}</p>
      ) : opcoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma etiqueta nos contatos ainda.")}</p>
      ) : (
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {opcoes.map((tag) => {
            const ligada = escolhidas.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={ligada}
                onClick={() => onAlternar(tag)}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  ligada
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:bg-surface-elevated"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function EtapasDoFunil({
  funilId,
  escolhidas,
  onAlternar,
}: {
  funilId: string;
  escolhidas: string[];
  onAlternar: (id: string) => void;
}) {
  const etapas = useEtapas(funilId);
  return (
    <div className="ml-6 space-y-1" data-testid="etapas-do-funil">
      {(etapas.data ?? []).map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={escolhidas.includes(e.id)}
            onChange={() => onAlternar(e.id)}
          />
          {e.name}
        </label>
      ))}
    </div>
  );
}

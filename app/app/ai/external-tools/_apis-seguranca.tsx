"use client";
/**
 * O painel «Segurança das APIs» (issue #372): as opções da ORGANIZAÇÃO.
 *
 * Três camadas, para ninguém precisar ler tudo de uma vez:
 *   1. o RESUMO — «todas as opções estão na posição recomendada», ou quantas estão fora e quais;
 *   2. o NÍVEL — uma escolha só (Mais seguro, Equilibrado, Personalizado) para quem não quer
 *      ajustar item por item;
 *   3. as OPÇÕES, uma a uma, cada qual com o que faz, exemplo, recomendação e risco.
 *
 * Sair da posição recomendada NUNCA é um clique só: a tela mostra o risco e a recomendação antes
 * de salvar («Manter como está» é o botão em destaque), e a opção fica com o selo «Fora do
 * recomendado» enquanto durar. Voltar à posição recomendada é direto.
 *
 * Só administrador muda. Gerente vê o resumo, para saber em que pé a conta está.
 */
import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { NIVEIS_EXPLICADOS, RISCO_DO_NIVEL_EQUILIBRADO, opcaoExplicada } from "@/lib/ai/ferramentas-externas/api/opcoes";
import {
  RECOMENDADO,
  dominioValido,
  normalizarDominio,
  type MudancaDeSeguranca,
  type OpcaoComRecomendacao,
} from "@/lib/ai/ferramentas-externas/api/seguranca";
import { DADOS_DO_CONTATO, ROTULO_DO_DADO_DO_CONTATO, type DadoDoContato } from "@/lib/ai/ferramentas-externas/api/tipos";

import type { EstadoDasApis } from "./_apis";
import { OpcaoDeSeguranca } from "./_apis-opcao";

/** Mesmo visual do `Input`, para o `<select>` nativo (o repo usa o nativo onde a lista é curta). */
const CLASSE_DO_SELECT =
  "h-11 w-full max-w-xs rounded-md border border-border bg-transparent px-3 text-sm lg:h-9 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent";

/** O que espera a confirmação de risco antes de ser enviado. Os textos já vêm no idioma da pessoa. */
interface Pendente {
  titulo: string;
  risco: string;
  recomendacao: string;
  mudanca: MudancaDeSeguranca;
}

export function PainelDeSeguranca({
  estado,
  souAdmin,
  onMudou,
}: {
  estado: EstadoDasApis;
  souAdmin: boolean;
  onMudou: () => Promise<void>;
}) {
  const t = useT();
  const { opcoes } = estado;
  const [aberto, setAberto] = useState(estado.nivel === "personalizado");
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [desligando, setDesligando] = useState(false);
  const [dominios, setDominios] = useState(opcoes.dominios_permitidos.join("\n"));
  const [erroDosDominios, setErroDosDominios] = useState<string | null>(null);

  const fora = new Set(estado.fora_do_recomendado);

  async function enviar(mudanca: MudancaDeSeguranca, sucesso: string) {
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/ai/api-security", mudanca);
      toast.success(sucesso);
      setPendente(null);
      setDesligando(false);
      await onMudou();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Muda uma opção que tem posição recomendada. Sair dela abre a confirmação de risco; voltar a
   * ela é direto.
   */
  function mudar<C extends OpcaoComRecomendacao>(chave: C, valor: (typeof RECOMENDADO)[C]) {
    const mudanca = { [chave]: valor } as MudancaDeSeguranca;
    if (valor === RECOMENDADO[chave]) {
      void enviar(mudanca, t("Opção salva."));
      return;
    }
    const opcao = opcaoExplicada(chave);
    setPendente({ titulo: t(opcao.nome), risco: t(opcao.risco), recomendacao: t(opcao.recomendacao), mudanca });
  }

  function mudarDadoDoContato(dado: DadoDoContato, liberar: boolean) {
    const proximos = liberar ? [...opcoes.dados_do_contato, dado] : opcoes.dados_do_contato.filter((d) => d !== dado);
    const mudanca: MudancaDeSeguranca = { dados_do_contato: proximos };
    if (!liberar) {
      void enviar(mudanca, t("Opção salva."));
      return;
    }
    const opcao = opcaoExplicada("dados_do_contato");
    setPendente({
      titulo: `${t(opcao.nome)}: ${t(ROTULO_DO_DADO_DO_CONTATO[dado])}`,
      risco: t(opcao.risco),
      recomendacao: t(opcao.recomendacao),
      mudanca,
    });
  }

  function salvarDominios() {
    const linhas = dominios
      .split(/[\n,]/)
      .map(normalizarDominio)
      .filter((d) => d !== "");
    const invalido = linhas.find((d) => !dominioValido(d));
    if (invalido) {
      setErroDosDominios(`${t("Este endereço não é válido:")} ${invalido}. ${t("Escreva só o nome do site, como api.loja.example.com.")}`);
      return;
    }
    setErroDosDominios(null);
    void enviar({ dominios_permitidos: linhas }, t("Endereços permitidos salvos."));
  }

  function escolherNivel(nivel: "mais_seguro" | "equilibrado" | "personalizado") {
    if (nivel === "personalizado") {
      setAberto(true);
      return;
    }
    if (nivel === estado.nivel) return;
    if (nivel === "mais_seguro") {
      void enviar({ nivel }, t("Nível de segurança alterado."));
      return;
    }
    setPendente({
      titulo: t("Nível de segurança: Equilibrado"),
      risco: t(RISCO_DO_NIVEL_EQUILIBRADO),
      recomendacao: t("Recomendamos o nível «Mais seguro» enquanto o agente só precisar consultar."),
      mudanca: { nivel },
    });
  }

  return (
    <Card className="space-y-4 p-4" data-testid="seguranca-das-apis">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">{t("Segurança das APIs")}</h2>
            <Badge variant="outline" className="text-[11px]" data-testid="apis-estado">
              {t("Ligado")}
            </Badge>
          </div>
          {fora.size === 0 ? (
            <p className="text-sm text-success-fg" data-testid="resumo-da-seguranca" data-fora="0">
              {t("Todas as opções estão na posição recomendada.")}
            </p>
          ) : (
            <p role="status" className="max-w-[68ch] text-sm text-warning-fg" data-testid="resumo-da-seguranca" data-fora={fora.size}>
              {fora.size === 1 ? t("1 opção está fora do recomendado:") : `${fora.size} ${t("opções estão fora do recomendado:")}`}{" "}
              {[...fora].map((id) => t(opcaoExplicada(id).nome)).join(", ")}.
            </p>
          )}
        </div>
        {souAdmin ? (
          <Button variant="outline" size="sm" data-testid="apis-desligar" onClick={() => setDesligando(true)}>
            {t("Desligar as APIs")}
          </Button>
        ) : null}
      </div>

      {!souAdmin ? (
        <p className="text-sm text-muted-foreground" data-testid="seguranca-so-admin">
          {t("Só um administrador da organização muda as opções de segurança das APIs.")}
        </p>
      ) : (
        <>
          <fieldset className="space-y-2" data-testid="nivel-de-seguranca" data-nivel={estado.nivel}>
            <legend className="text-sm font-medium">{t("Nível de segurança")}</legend>
            <p className="max-w-[68ch] text-xs text-muted-foreground">
              {t("Uma escolha só, para você não precisar ajustar item por item. Cada nível muda várias opções de uma vez.")}
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {NIVEIS_EXPLICADOS.map((nivel) => {
                const marcado = estado.nivel === nivel.id;
                return (
                  <label
                    key={nivel.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${marcado ? "border-accent" : "border-border/60"}`}
                    data-testid={`nivel-${nivel.id}`}
                  >
                    <input
                      type="radio"
                      name="nivel-de-seguranca"
                      value={nivel.id}
                      checked={marcado}
                      disabled={salvando}
                      onChange={() => escolherNivel(nivel.id)}
                      className="mt-1 accent-primary"
                    />
                    <span className="space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong>{t(nivel.nome)}</strong>
                        {nivel.id === "mais_seguro" ? (
                          <Badge variant="outline" className="border-success/40 text-[11px] text-success-fg">
                            {t("Recomendado")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t(nivel.oQueFaz)}</span>
                      <span className="block text-xs text-muted-foreground">{t(nivel.exemplo)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Button variant="ghost" size="sm" data-testid="ver-opcoes-de-seguranca" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            {aberto ? t("Esconder as opções") : t("Ver e ajustar as opções uma a uma")}
          </Button>

          {aberto ? (
            <div className="grid gap-3 lg:grid-cols-2" data-testid="opcoes-de-seguranca">
              <OpcaoDeSeguranca id="somente_consulta" fora={fora.has("somente_consulta")}>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={opcoes.somente_consulta}
                    disabled={salvando}
                    onCheckedChange={(v) => mudar("somente_consulta", v)}
                    aria-label={t("Somente consulta")}
                    data-testid="controle-somente_consulta"
                  />
                  {opcoes.somente_consulta ? t("Ligado") : t("Desligado")}
                </label>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="aprovacao_obrigatoria" fora={fora.has("aprovacao_obrigatoria")}>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={opcoes.aprovacao_obrigatoria}
                    disabled={salvando}
                    onCheckedChange={(v) => mudar("aprovacao_obrigatoria", v)}
                    aria-label={t("Aprovação sempre obrigatória")}
                    data-testid="controle-aprovacao_obrigatoria"
                  />
                  {opcoes.aprovacao_obrigatoria ? t("Ligado") : t("Desligado")}
                </label>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="quem_cadastra" fora={fora.has("quem_cadastra")}>
                <select
                  className={CLASSE_DO_SELECT}
                  value={opcoes.quem_cadastra}
                  disabled={salvando}
                  onChange={(e) => mudar("quem_cadastra", e.target.value as "admin" | "manager")}
                  aria-label={t("Quem pode cadastrar APIs")}
                  data-testid="controle-quem_cadastra"
                >
                  <option value="admin">{t("Só administrador")}</option>
                  <option value="manager">{t("Administrador e gerente")}</option>
                </select>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="quem_aprova" fora={fora.has("quem_aprova")}>
                <select
                  className={CLASSE_DO_SELECT}
                  value={opcoes.quem_aprova}
                  disabled={salvando}
                  onChange={(e) => mudar("quem_aprova", e.target.value as "admin" | "manager")}
                  aria-label={t("Quem pode aprovar")}
                  data-testid="controle-quem_aprova"
                >
                  <option value="admin">{t("Só administrador")}</option>
                  <option value="manager">{t("Administrador e gerente")}</option>
                </select>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="avisar_administrador" fora={fora.has("avisar_administrador")}>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={opcoes.avisar_administrador}
                    disabled={salvando}
                    onCheckedChange={(v) => mudar("avisar_administrador", v)}
                    aria-label={t("Aviso ao administrador")}
                    data-testid="controle-avisar_administrador"
                  />
                  {opcoes.avisar_administrador ? t("Ligado") : t("Desligado")}
                </label>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="dados_do_contato" fora={false}>
                <div className="flex flex-wrap gap-4">
                  {DADOS_DO_CONTATO.map((dado) => (
                    <label key={dado} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-md border-border accent-primary"
                        checked={opcoes.dados_do_contato.includes(dado)}
                        disabled={salvando}
                        onChange={(e) => mudarDadoDoContato(dado, e.target.checked)}
                        data-testid={`controle-dado-${dado}`}
                      />
                      {t(ROTULO_DO_DADO_DO_CONTATO[dado])}
                    </label>
                  ))}
                </div>
              </OpcaoDeSeguranca>

              <OpcaoDeSeguranca id="dominios_permitidos" fora={false}>
                <div className="space-y-2">
                  <Textarea
                    value={dominios}
                    onChange={(e) => setDominios(e.target.value)}
                    rows={3}
                    placeholder={t("api.loja.example.com\n*.erp.example.com")}
                    aria-label={t("Endereços permitidos, um por linha")}
                    className="font-mono text-xs"
                    data-testid="controle-dominios_permitidos"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Um site por linha, sem https:// e sem caminho. Use *. na frente para liberar todos os endereços de um site.")}
                  </p>
                  {erroDosDominios ? (
                    <p role="alert" className="text-xs text-destructive" data-testid="erro-dos-dominios">
                      {erroDosDominios}
                    </p>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={salvando} onClick={salvarDominios} data-testid="salvar-dominios">
                    {t("Salvar endereços")}
                  </Button>
                </div>
              </OpcaoDeSeguranca>
            </div>
          ) : null}
        </>
      )}

      {/* Sair da posição recomendada: o risco e a recomendação ANTES de salvar. */}
      <AlertDialog open={pendente !== null} onOpenChange={(abrir) => (abrir ? null : setPendente(null))}>
        <AlertDialogContent data-testid="confirmar-risco">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendente?.titulo ?? ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p data-testid="risco-da-mudanca">
                  <strong>{t("Risco:")}</strong> {pendente?.risco ?? ""}
                </p>
                <p>
                  <strong>{t("Recomendação:")}</strong> {pendente?.recomendacao ?? ""}
                </p>
                <p className="text-muted-foreground">
                  {t("Se você mudar, a opção fica marcada como «Fora do recomendado» e a mudança fica registrada com o seu nome.")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* O destaque é de quem MANTÉM: o caminho fácil de clicar é o seguro. */}
            <AlertDialogCancel data-testid="manter-recomendado" className={buttonVariants({ variant: "primary" })}>
              {t("Manter como está (recomendado)")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="mudar-mesmo-assim"
              className={buttonVariants({ variant: "outline" })}
              disabled={salvando}
              onClick={(e) => {
                e.preventDefault();
                if (pendente) void enviar(pendente.mudanca, t("Opção salva."));
              }}
            >
              {salvando ? t("Salvando…") : t("Mudar mesmo assim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={desligando} onOpenChange={(abrir) => (abrir ? null : setDesligando(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Desligar as APIs?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Nenhum agente usa mais nenhuma API, e pedidos que esperam aprovação não são executados. Nada é apagado: as APIs, as chaves e as opções de segurança ficam guardadas, e ligar de novo devolve tudo.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirmar-desligar-apis"
              disabled={salvando}
              onClick={(e) => {
                e.preventDefault();
                void enviar({ ligado: false }, t("APIs desligadas."));
              }}
            >
              {t("Desligar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

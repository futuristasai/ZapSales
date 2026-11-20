"use client";
/**
 * A aba «APIs» de Ferramentas externas (issue #372).
 *
 * A API pronta de outro sistema (loja, ERP, CRM) que o agente chama direto durante a conversa,
 * com os dados que a própria pessoa cadastra. O caminho, em ordem:
 *   1. ligar o recurso para a organização (desligado por padrão, com o aceite);
 *   2. conferir a segurança — nasce no nível «Mais seguro», e cada opção diz o que faz, dá um
 *      exemplo, a recomendação e o risco de sair dela;
 *   3. cadastrar a API e testar de verdade;
 *   4. marcar, na tela do agente, quais agentes podem usá-la (grupo «Ferramentas externas»).
 *
 * Com o recurso desligado a aba explica o que é e como ligar; a instalação segue útil sem ele.
 */
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { foraDoRecomendadoNaFerramenta } from "@/lib/ai/ferramentas-externas/api/recomendado";
import type { NivelDeSeguranca, OpcoesDeSeguranca } from "@/lib/ai/ferramentas-externas/api/seguranca";
import { FRASE_DA_TRAVA, type TravaDaApi } from "@/lib/ai/ferramentas-externas/api/travas";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { ROTULO_DO_EFEITO } from "@/lib/ai/ferramentas-externas/tipos";

import { FormularioDaApiDialog, TesteDaApiDialog } from "./_apis-dialogs";
import { PainelDeSeguranca } from "./_apis-seguranca";

export interface EstadoDasApis {
  ligado: boolean;
  aceite: { em: string; por: string } | null;
  opcoes: OpcoesDeSeguranca;
  nivel: NivelDeSeguranca;
  fora_do_recomendado: string[];
  sessao_com_duas_etapas: boolean;
  apis: number;
  apis_ativas: number;
}

export const CHAVE_DO_ESTADO_DAS_APIS = ["ai", "api-security"] as const;
/** Filha da chave do seletor do agente: invalidar a PAI atualiza a lista de lá também. */
const CHAVE_DAS_APIS = ["ai", "external-tools", "api"] as const;
const CHAVE_PAI_DAS_FERRAMENTAS = ["ai", "external-tools"] as const;

const ONDE_ATIVAR_AS_DUAS_ETAPAS = "/app/settings/security";

function host(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** A API pede aprovação DE VERDADE? (a chave dela, com a trava da organização já aplicada) */
export function apiPedeAprovacao(f: FerramentaExterna): boolean {
  return decidirSePedeAprovacao({
    effect: f.effect,
    requireApproval: f.api ? f.api.approval_in_effect : f.require_approval,
    modo: "ao_vivo",
  }).pede;
}

export function ApisClient({ souAdmin }: { souAdmin: boolean }) {
  const t = useT();
  const qc = useQueryClient();

  const estado = useQuery({
    queryKey: CHAVE_DO_ESTADO_DAS_APIS,
    queryFn: async () => (await apiClient.get<{ data: EstadoDasApis }>("/api/v1/ai/api-security")).data,
  });
  const ligado = estado.data?.ligado === true;

  const apis = useQuery({
    queryKey: CHAVE_DAS_APIS,
    queryFn: async () => (await apiClient.get<{ data: FerramentaExterna[] }>("/api/v1/ai/api-tools")).data,
    enabled: ligado,
  });

  const [aceitou, setAceitou] = useState(false);
  const [alterando, setAlterando] = useState(false);
  const [formulario, setFormulario] = useState<{ aberto: boolean; editando: FerramentaExterna | null }>({
    aberto: false,
    editando: null,
  });
  const [testando, setTestando] = useState<FerramentaExterna | null>(null);
  const [apagando, setApagando] = useState<FerramentaExterna | null>(null);

  const recarregar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CHAVE_DO_ESTADO_DAS_APIS }),
      qc.invalidateQueries({ queryKey: CHAVE_PAI_DAS_FERRAMENTAS }),
    ]);
  };

  async function ligar() {
    setAlterando(true);
    try {
      await apiClient.put("/api/v1/ai/api-security", {
        ligado: true,
        ...(estado.data?.aceite === null ? { aceitar: true as const } : {}),
      });
      toast.success(t("APIs ligadas."));
      await recarregar();
    } catch (err) {
      showApiError(err);
    } finally {
      setAlterando(false);
    }
  }

  async function alternarAtiva(f: FerramentaExterna, ativa: boolean) {
    try {
      await apiClient.patch(`/api/v1/ai/api-tools/${f.id}`, { ativa });
      toast.success(ativa ? t("API ativada.") : t("API pausada."));
      await recarregar();
    } catch (err) {
      showApiError(err);
    }
  }

  async function apagar(f: FerramentaExterna) {
    try {
      await apiClient.delete(`/api/v1/ai/api-tools/${f.id}`);
      toast.success(t("API apagada."));
      setApagando(null);
      await recarregar();
    } catch (err) {
      setApagando(null);
      showApiError(err);
    }
  }

  if (estado.isLoading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="apis-carregando">
        {t("Carregando…")}
      </p>
    );
  }
  if (estado.isError || !estado.data) {
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="apis-erro">
        {t("Não foi possível carregar as APIs. Recarregue a página.")}
      </p>
    );
  }
  const dados = estado.data;

  // ── Desligado (o estado de toda instalação nova) ────────────────────────────
  if (!ligado) {
    return (
      <Card className="space-y-4 p-6" data-testid="apis-desligado">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">{t("APIs de outros sistemas")}</h2>
            <Badge variant="outline" className="text-[11px]" data-testid="apis-estado">
              {t("Desligado")}
            </Badge>
          </div>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Uma API é a porta que um sistema abre para outros sistemas — a sua loja virtual, o seu ERP, o seu CRM. Com ela o agente consulta ou faz algo lá durante a conversa: vê onde está um pedido, confere o estoque, registra um atendimento.",
            )}
          </p>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Você informa o endereço e a chave de acesso que o outro sistema fornece. A chave é guardada cifrada e nunca é mostrada de novo.",
            )}
          </p>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Ao ligar, a segurança nasce no nível mais seguro: o agente só consulta, só administrador cadastra e nada é alterado em outro sistema. Cada opção explica o que faz e avisa o risco antes de você mudar.",
            )}
          </p>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t("O sistema funciona normalmente sem isto. Enquanto estiver desligado, nenhuma API é cadastrada nem chamada.")}
          </p>
        </div>

        {souAdmin ? (
          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(e) => setAceitou(e.target.checked)}
                className="mt-1 h-4 w-4 rounded-md border-border accent-primary"
                data-testid="apis-aceite"
              />
              <span>
                {t(
                  "Entendo que, ao ligar, o agente pode enviar aos sistemas que eu cadastrar os dados que ele preencher ao usar uma API, e que o que eles responderem é tratado como informação, nunca como ordem.",
                )}
              </span>
            </label>
            <Button data-testid="apis-ligar" disabled={alterando || (!aceitou && dados.aceite === null)} onClick={() => void ligar()}>
              {alterando ? t("Ligando…") : t("Ligar as APIs")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="apis-so-admin">
            {t("Só um administrador da organização pode ligar este recurso.")}
          </p>
        )}
      </Card>
    );
  }

  // ── Ligado ──────────────────────────────────────────────────────────────────
  const podeCadastrar = souAdmin || dados.opcoes.quem_cadastra === "manager";
  const faltaASegundaEtapa = dados.opcoes.exigir_duas_etapas && !dados.sessao_com_duas_etapas;
  const lista = apis.data ?? [];

  return (
    <div className="space-y-5" data-testid="apis-ligado">
      <PainelDeSeguranca estado={dados} souAdmin={souAdmin} onMudou={recarregar} />

      {faltaASegundaEtapa && podeCadastrar ? (
        <Card className="space-y-2 border-warning/40 p-4" role="status" data-testid="apis-falta-duas-etapas">
          <h3 className="text-sm font-medium">{t("Falta a verificação em duas etapas para cadastrar APIs")}</h3>
          <p className="max-w-[68ch] text-sm text-muted-foreground">
            {t(
              "Esta organização só deixa cadastrar, editar e testar APIs quem entrou com a senha e com o código do aplicativo no celular. Ative a verificação na sua conta e entre de novo.",
            )}{" "}
            {souAdmin
              ? t("Se preferir não usar a verificação, desligue a opção «Verificação em duas etapas para mexer nas APIs» acima — a tela explica o risco.")
              : t("Se a equipe preferir não usar a verificação, um administrador pode desligar essa exigência.")}
          </p>
          <Link href={ONDE_ATIVAR_AS_DUAS_ETAPAS} className="text-sm font-medium text-accent underline" data-testid="apis-ativar-duas-etapas">
            {t("Ativar a verificação em duas etapas")}
          </Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {lista.length === 0 ? t("Nenhuma API cadastrada ainda.") : `${lista.length} ${lista.length === 1 ? t("API") : t("APIs")}`}
        </p>
        {podeCadastrar ? (
          <Button
            data-testid="nova-api"
            disabled={faltaASegundaEtapa}
            onClick={() => setFormulario({ aberto: true, editando: null })}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {t("Nova API")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="apis-so-admin-cadastra">
            {t("Só um administrador pode cadastrar APIs nesta organização.")}
          </p>
        )}
      </div>

      {apis.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : apis.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Não foi possível carregar as APIs. Recarregue a página.")}
        </p>
      ) : lista.length === 0 ? (
        <Card className="space-y-2 p-6" data-testid="apis-vazio">
          <h2 className="text-base font-medium">{t("O agente ainda não usa nenhuma API")}</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Para cadastrar, tenha em mãos a documentação da API do outro sistema: ela diz o endereço, a chave de acesso e quais dados enviar. Depois de cadastrar, use «Testar de verdade» para ver o que o outro sistema responde antes de ligar a API em um agente.",
            )}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lista.map((f) => {
            const pede = apiPedeAprovacao(f);
            const fora = f.api
              ? foraDoRecomendadoNaFerramenta({ metodo: f.api.config.metodo, efeito: f.effect, pedeAprovacao: pede, config: f.api.config })
              : [];
            const trava =
              f.unavailable_reason && f.unavailable_reason !== "mcp_desligado" && f.unavailable_reason !== "servidor_desativado"
                ? f.unavailable_reason
                : null;
            return (
              <li key={f.id}>
                <Card className="space-y-3 p-4" data-testid={`api-${f.id}`} data-ativa={f.active ? "sim" : "nao"}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-medium">{f.name}</h2>
                        {f.api ? (
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {f.api.config.metodo}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-[11px]">
                          {t(ROTULO_DO_EFEITO[f.effect])}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]" data-testid={`api-aprovacao-${f.id}`} data-pede={pede ? "sim" : "nao"}>
                          {pede ? t("Pede aprovação") : t("Executa direto")}
                        </Badge>
                        {fora.length > 0 ? (
                          <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg" data-testid={`api-fora-${f.id}`}>
                            {t("Fora do recomendado")}
                          </Badge>
                        ) : null}
                        {f.api?.auto_paused_at ? (
                          <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg" data-testid={`api-pausada-${f.id}`}>
                            {t("Pausada após falhas")}
                          </Badge>
                        ) : !f.active ? (
                          <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                            {t("Pausada")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="max-w-[65ch] text-sm text-muted-foreground">{f.when_to_use}</p>
                      <p className="text-xs text-muted-foreground">
                        {host(f.url)} · {f.parameters.length} {f.parameters.length === 1 ? t("campo") : t("campos")} ·{" "}
                        {f.api?.has_credential ? `${t("chave")} …${f.secret_last4}` : t("sem chave de acesso")}
                      </p>
                      {trava ? (
                        <p role="status" className="max-w-[65ch] text-xs text-warning-fg" data-testid={`api-trava-${f.id}`}>
                          {trava === "config_ilegivel"
                            ? t("O cadastro desta API está ilegível: o agente não a usa. Abra «Editar» e salve de novo.")
                            : `${t("O agente não usa esta API agora.")} ${t(FRASE_DA_TRAVA[trava as TravaDaApi])}`}
                        </p>
                      ) : f.api?.auto_paused_at ? (
                        <p role="status" className="max-w-[65ch] text-xs text-warning-fg">
                          {t("Esta API falhou várias vezes seguidas e foi pausada sozinha. Teste de verdade e ative de novo quando estiver funcionando.")}
                        </p>
                      ) : null}
                    </div>
                    {podeCadastrar ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={f.active}
                          // Pausar é sempre possível; ativar de novo passa pelo portão inteiro.
                          disabled={faltaASegundaEtapa && !f.active}
                          onCheckedChange={(v) => void alternarAtiva(f, v)}
                          aria-label={f.active ? t("Pausar") : t("Ativar")}
                          data-testid={`api-ativar-${f.id}`}
                        />
                        {f.active ? t("Ativa") : t("Pausada")}
                      </label>
                    ) : null}
                  </div>
                  {podeCadastrar ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={faltaASegundaEtapa} data-testid={`api-testar-${f.id}`} onClick={() => setTestando(f)}>
                        {t("Testar de verdade")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={faltaASegundaEtapa}
                        data-testid={`api-editar-${f.id}`}
                        onClick={() => setFormulario({ aberto: true, editando: f })}
                      >
                        {t("Editar")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={faltaASegundaEtapa} data-testid={`api-apagar-${f.id}`} onClick={() => setApagando(f)}>
                        {t("Apagar")}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <FormularioDaApiDialog
        aberto={formulario.aberto}
        editando={formulario.editando}
        opcoes={dados.opcoes}
        onFechar={() => setFormulario({ aberto: false, editando: null })}
        onSalvo={async () => {
          setFormulario({ aberto: false, editando: null });
          await recarregar();
        }}
      />

      <TesteDaApiDialog ferramenta={testando} onFechar={() => setTestando(null)} />

      <AlertDialog open={apagando !== null} onOpenChange={(aberto) => (aberto ? null : setApagando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Apagar esta API?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Ela deixa de existir, com a chave de acesso guardada. Se algum agente já a usou numa versão publicada, o sistema não deixa apagar — nesse caso, pause.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction data-testid="api-confirmar-apagar" onClick={() => apagando && void apagar(apagando)}>
              {t("Apagar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

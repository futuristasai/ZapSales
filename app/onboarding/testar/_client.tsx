"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { ArrowRight, PaperPlaneTilt, Robot } from "@/lib/ui/icons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { marcarTesteFeito, pularTeste } from "@/app/actions/onboarding/marcarTeste";

interface Props {
  nome: string | null;
  agenteId: string | null;
  versaoId: string | null;
}

/** O que o ensaio devolveu — ou por que ele não aconteceu. */
type Desfecho =
  | { tipo: "resposta"; texto: string }
  | { tipo: "erro"; mensagem: string };

const EXEMPLO = "Oi! Vocês atendem hoje? Queria saber o preço.";

export function TestarClient({ nome, agenteId, versaoId }: Props) {
  const t = useT();
  const [mensagem, setMensagem] = useState(EXEMPLO);
  // O que foi de fato enviado: a caixa de texto pode ser editada depois da resposta,
  // e a conversa na tela tem de continuar mostrando a pergunta que gerou a resposta.
  const [enviada, setEnviada] = useState("");
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pending, startTransition] = useTransition();

  const funcionario = nome ?? t("seu funcionário");

  // Três estados possíveis, e nenhum deles pode virar uma tela vazia: sem
  // agente (a pessoa pulou o treinamento), agente em rascunho (não tem versão
  // publicada, então não há o que executar), e o caso normal.
  const semAgente = !agenteId;
  const rascunho = Boolean(agenteId) && !versaoId;

  async function ensaiar() {
    if (!agenteId || !versaoId) return;
    setCarregando(true);
    setDesfecho(null);
    setEnviada(mensagem.trim());
    try {
      const res = await fetch(`/api/v1/ai/agents/${agenteId}/versions/${versaoId}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sample_message: mensagem }),
      });
      const json = (await res.json()) as {
        data?: { final_text?: string; status?: string; error_code?: string; error_message?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        // A causa crua importa: quem instalou numa VPS é quem vai consertar, e
        // "não foi possível testar" não diz se falta chave, saldo ou modelo.
        setDesfecho({
          tipo: "erro",
          mensagem: json.error?.message ?? `${t("O ensaio falhou")} (HTTP ${res.status}).`,
        });
        return;
      }
      // O ensaio responde 200 mesmo quando o turno FALHA — o resultado traz o
      // status. Ler só o texto e concluir "executou e não devolveu nada" foi o
      // que a tela fez no primeiro percurso real, enquanto a causa verdadeira
      // era outra: a versão não tinha credencial. Mentir sobre a causa manda a
      // pessoa procurar no lugar errado.
      const d = json.data;
      // O sucesso desta rota é `"ok"` (há resposta candidata) e a ausência dela é
      // `"blocked"` — `"completed"` é o vocabulário de `ai_agent_runs`, outra
      // tabela. Exigir `"completed"` aqui fazia toda resposta boa virar erro.
      if (d?.status && d.status !== "ok") {
        setDesfecho({
          tipo: "erro",
          mensagem: d.error_message ?? d.error_code ?? `${t("o ensaio terminou como")} "${d.status}"`,
        });
        return;
      }
      const texto = d?.final_text?.trim();
      setDesfecho(
        texto
          ? { tipo: "resposta", texto }
          : { tipo: "erro", mensagem: t("Ele executou, mas não devolveu texto nenhum.") },
      );
    } catch (err) {
      setDesfecho({ tipo: "erro", mensagem: err instanceof Error ? err.message : String(err) });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-4">
      {semAgente && (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6" role="status">
          <p className="text-sm font-medium">{t("Você ainda não montou seu funcionário.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Sem ninguém treinado, não há o que testar. Dá para voltar ao passo anterior agora ou fazer isso depois, em IA › Agentes.",
            )}
          </p>
        </div>
      )}

      {rascunho && (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6" role="status">
          <p className="text-sm font-medium">
            {funcionario} {t("está como")} <strong>{t("rascunho")}</strong> — {t("ainda não foi para o ar.")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Rascunho não responde mensagem, então não há o que ensaiar. O passo anterior explicou o que falta; você pode resolver depois em IA › Agentes.",
            )}
          </p>
        </div>
      )}

      {!semAgente && !rascunho && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="mensagem" className="text-base font-semibold">{t("Escreva como se fosse um cliente")}</Label>
            <Textarea
              id="mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={3}
              maxLength={4000}
              className="text-base"
            />
          </div>
          <div className="flex sm:justify-end">
            <Button
              type="button"
              onClick={ensaiar}
              disabled={carregando || mensagem.trim() === ""}
              className="w-full gap-2 sm:w-auto"
            >
              {carregando ? t("Ele está pensando...") : t("Mandar mensagem")}
              {carregando ? null : <PaperPlaneTilt aria-hidden size={16} weight="bold" />}
            </Button>
          </div>

          {desfecho?.tipo === "resposta" && (
            // A conversa como o cliente a veria: a pergunta à direita, a resposta à esquerda.
            // O violeta é o da IA (DESIGN.md): quem fala pelo funcionário é o automático.
            <div className="space-y-3 rounded-xl bg-surface-elevated/60 p-4" aria-live="polite">
              {enviada ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-border bg-surface px-3.5 py-2 text-sm">
                    {enviada}
                  </p>
                </div>
              ) : null}
              <div className="flex justify-start">
                <div className="flex max-w-[90%] items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ia text-white"
                  >
                    <Robot size={18} weight="fill" />
                  </span>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {funcionario} {t("respondeu")}
                    </p>
                    <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-ia-fundo px-4 py-2.5 text-[0.9375rem] leading-relaxed">
                      {desfecho.texto}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Esta conversa não foi enviada a ninguém e não aparece no seu inbox.")}
              </p>
            </div>
          )}

          {desfecho?.tipo === "erro" && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-warning/60 bg-warning-bg p-4"
            >
              <p className="text-sm font-medium">
                {t(
                  "Ele não conseguiu responder — e é melhor descobrir isso agora do que com um cliente de verdade.",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Motivo:")} <code className="break-all">{desfecho.mensagem}</code>
              </p>
              <p className="text-sm">
                {t(
                  "As causas mais comuns são a chave da empresa de IA sem saldo ou o modelo indisponível. Dá para conferir em",
                )}{" "}
                <strong>{t("IA › Credenciais")}</strong>{" "}
                {t("e seguir daqui mesmo — o que você montou está salvo.")}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => void pularTeste())}
        >
          {t("Pular")}
        </Button>
        <Button
          type="button"
          disabled={pending}
          className="h-12 gap-2 px-7 text-base"
          onClick={() =>
            startTransition(async () => {
              // `respondeu` guarda a diferença entre "vi funcionando" e "passei
              // por aqui" — é o que o resumo final usa para não dizer que está
              // tudo certo quando ninguém viu nada.
              //
              // A action redireciona no servidor (o `redirect` do Next lança),
              // então só chega aqui quem falhou antes disso.
              try {
                await marcarTesteFeito(desfecho?.tipo === "resposta");
              } catch (err) {
                if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
                toast.error(t("Não consegui salvar este passo."));
              }
            })
          }
        >
          {t("Continuar")}
          <ArrowRight aria-hidden size={18} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

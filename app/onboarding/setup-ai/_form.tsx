"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultAgent, skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import type { PromptTemplate } from "@/lib/schemas/onboarding";
import { PROVEDOR_POR_ID } from "@/lib/ai/pontos/provedores";
import {
  IDS_DE_MODELO_DO_ONBOARDING,
  MODELOS_DE_AGENTE,
  type IdDoModelo,
} from "@/lib/ai/agents/modelos";
import { IDIOMAS_DO_AGENTE, type IdiomaDoAgente } from "@/lib/ai/agents/perfil";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Check,
  Handshake,
  Headset,
  Lightning,
  Smiley,
  Sparkle,
  X,
} from "@/lib/ui/icons";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { exemploDoJeito, rotulosDaEscolha } from "@/lib/onboarding/ajuda";
import { Opcao } from "../_components/Opcao";

/**
 * O jeito de falar, não o "estilo de prompt".
 *
 * Os rótulos anteriores eram "Amigável (e-commerce)", "Profissional" e "Suporte
 * minimalista" — dois deles amarrados a loja virtual, num produto cuja maioria
 * de adopters roda em clínica, imobiliária e infoproduto. Os identificadores
 * continuam os mesmos porque já existem gravados; só a fala mudou.
 */
/** "openrouter" no meio de uma frase é identificador vazando para a tela. */
function provedorLegivel(id: string | null, t: (texto: string) => string): string {
  if (!id) return t("da inteligência escolhida na instalação");
  return `${t("da")} ${PROVEDOR_POR_ID.get(id)?.rotulo ?? id}`;
}

const ICONE_DO_RAMO: Record<string, typeof Sparkle> = {
  vendas: Handshake,
  suporte: Headset,
  agendamento: CalendarCheck,
};

const ICONE_DO_JEITO: Record<PromptTemplate, typeof Sparkle> = {
  ecommerce_friendly: Smiley,
  ecommerce_professional: Briefcase,
  support_minimal: Lightning,
};

const JEITOS: { id: PromptTemplate; titulo: string; desc: string }[] = [
  {
    id: "ecommerce_friendly",
    titulo: "Próximo e caloroso",
    desc: "Conversa como gente, puxa assunto, tranquiliza. Bom para quem vende no dia a dia.",
  },
  {
    id: "ecommerce_professional",
    titulo: "Objetivo e cordial",
    desc: "Vai direto ao ponto sem ser seco, e sempre indica o próximo passo.",
  },
  {
    id: "support_minimal",
    titulo: "Curto e prático",
    desc: "Frases curtas, pergunta só o essencial e chama uma pessoa cedo.",
  },
];

interface Props {
  /** O que ele já sabe fazer, em linguagem de dono de negócio. */
  capacidades: string[];
  /** O que ele nunca faz — as conferências antes de cada mensagem sair. */
  conferencias: string[];
}

export function SetupAiForm({ capacidades, conferencias }: Props) {
  const t = useT();
  const [name, setName] = useState("Atendente IA");
  const [jeito, setJeito] = useState<PromptTemplate>("ecommerce_friendly");
  // O ramo (#92) é OPCIONAL e nasce vazio: sem escolher, o passo é o de sempre.
  const [ramo, setRamo] = useState<IdDoModelo | "">("");
  // O modelo vem no idioma da tela de quem instala; idioma sem modelo cai em português.
  const idiomaDaTela = useIdioma();
  const escolha = rotulosDaEscolha(idiomaDaTela);
  const idiomaDoModelo: IdiomaDoAgente = (IDIOMAS_DO_AGENTE as readonly string[]).includes(
    idiomaDaTela,
  )
    ? (idiomaDaTela as IdiomaDoAgente)
    : "pt-BR";
  const [regras, setRegras] = useState("");
  const [naoPublicado, setNaoPublicado] = useState<string | null>(null);
  const [causa, setCausa] = useState<"canal" | "modelo" | "chave" | null>(null);
  const [provedor, setProvedor] = useState<string | null>(null);
  // Provedor cuja chave a pessoa JÁ colou e que o provedor ainda não confirmou.
  const [chaveEmVerificacao, setChaveEmVerificacao] = useState<string | null>(null);
  const [motivoDoModelo, setMotivoDoModelo] = useState<
    "catalogo_vazio" | "nenhum_com_ferramentas" | null
  >(null);
  const [regrasNaoSalvas, setRegrasNaoSalvas] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-6"
      action={(formData) => {
        startTransition(async () => {
          setNaoPublicado(null);
          setCausa(null);
          setProvedor(null);
          setChaveEmVerificacao(null);
          setMotivoDoModelo(null);
          setRegrasNaoSalvas(null);
          const res = await createDefaultAgent(formData);
          if (res && !res.ok) {
            toast.error(`${t("Falha ao criar agente:")} ${res.error}`);
            return;
          }
          if (res?.regras_nao_salvas) setRegrasNaoSalvas(res.regras_nao_salvas);
          // Sem chave utilizável não há o que publicar — e o conselho é outro:
          // não é esperar o catálogo nem trocar de provedor, é cadastrar a chave.
          if (res?.publish_blocked_by === "chave") {
            setCausa("chave");
            setProvedor(res.provider ?? null);
            // A chave colada (e ainda não confirmada) tem provedor PRÓPRIO: sem
            // isto a tela pediria de novo uma chave que a pessoa já colou.
            setChaveEmVerificacao(res.chave_em_verificacao ?? null);
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_blocked_by === "modelo") {
            setCausa("modelo");
            setProvedor(res.provider ?? null);
            setMotivoDoModelo(res.motivo_do_modelo ?? null);
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_error) {
            setNaoPublicado(res.publish_error);
            setCausa("canal");
            toast.warning(t("Agente criado, mas ainda não publicado."));
          }
        });
      }}
    >
      <div className="space-y-6 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-base font-semibold">
            {t("Como ele vai se chamar")}
          </Label>
          <Input
            className="h-12 text-base"
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("É o nome que aparece para o seu time. O cliente vê só a conversa.")}
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <fieldset className="space-y-3 border-0 p-0" data-testid="onboarding-ramo">
            <legend className="mb-3 block w-full p-0 font-[family-name:var(--font-titulo)] text-xl font-bold tracking-[-0.02em]">
              {t("O ramo do atendimento (opcional)")}
            </legend>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                "Escolha o ramo e o perfil e as instruções já vêm prontos — dá para editar tudo depois. Ou pule e escolha só o jeito de falar.",
              )}
            </p>
            <input type="hidden" name="idioma" value={idiomaDoModelo} />
            <div className="grid gap-2.5">
              {MODELOS_DE_AGENTE.filter((m) =>
                (IDS_DE_MODELO_DO_ONBOARDING as readonly string[]).includes(m.id),
              ).map((m) => {
                const c = m.conteudo[idiomaDoModelo];
                return (
                  <Opcao
                    key={m.id}
                    nome="ramo"
                    valor={m.id}
                    marcada={ramo === m.id}
                    onEscolher={() => setRamo(m.id)}
                    idDoRadio={`onboarding-ramo-${m.id}`}
                    icone={ICONE_DO_RAMO[m.id] ?? Sparkle}
                    titulo={c.titulo}
                    descricao={c.descricao}
                    detalhe={
                      <>
                        <span className="block">
                          <strong className="font-medium text-foreground">
                            {escolha.objetivo}
                          </strong>{" "}
                          {c.objetivo}
                        </span>
                        <span className="block">
                          <strong className="font-medium text-foreground">
                            {escolha.cumprimento}
                          </strong>{" "}
                          «{c.boasVindas}»
                        </span>
                        <span className="block text-text-subtle">{escolha.editavel}</span>
                      </>
                    }
                  />
                );
              })}
              <Opcao
                nome="ramo"
                valor=""
                marcada={ramo === ""}
                onEscolher={() => setRamo("")}
                idDoRadio="onboarding-ramo-nenhum"
                icone={Sparkle}
                titulo={t("Nenhum — só o jeito de falar")}
                descricao={t("Escolha abaixo como ele conversa.")}
              />
            </div>
          </fieldset>
        </div>

        {/* Com um ramo, o modelo já define o tom; o jeito de falar só vale sem ele. O
            campo segue no formulário (oculto) para o envio ser sempre o mesmo. */}
        <input type="hidden" name="prompt_template" value={jeito} />
        <div className="border-t border-border pt-6" hidden={ramo !== ""}>
          <fieldset className="space-y-3 border-0 p-0">
            <legend className="mb-3 block w-full p-0 font-[family-name:var(--font-titulo)] text-xl font-bold tracking-[-0.02em]">
              {t("O jeito dele falar")}
            </legend>
            <div className="grid gap-2.5">
              {JEITOS.map((j) => (
                <Opcao
                  key={j.id}
                  nome="jeito_de_falar"
                  valor={j.id}
                  marcada={jeito === j.id}
                  onEscolher={() => setJeito(j.id)}
                  icone={ICONE_DO_JEITO[j.id]}
                  titulo={t(j.titulo)}
                  descricao={t(j.desc)}
                  detalhe={
                    <span className="block">
                      <strong className="font-medium text-foreground">
                        {escolha.exemploDeResposta}
                      </strong>{" "}
                      «
                      {exemploDoJeito(
                        j.id as "ecommerce_friendly" | "ecommerce_professional" | "support_minimal",
                        idiomaDaTela,
                      )}
                      »
                    </span>
                  }
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-2 border-t border-border pt-6">
          <Label
            htmlFor="regras_da_casa"
            className="font-[family-name:var(--font-titulo)] text-xl font-bold tracking-[-0.02em]"
          >
            {t("As regras da casa (opcional)")}
          </Label>
          <Textarea
            id="regras_da_casa"
            name="regras_da_casa"
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            rows={5}
            maxLength={20000}
            placeholder={
              `${t("Nunca prometa desconto sem confirmar com uma pessoa.")}\n` +
              `${t("Horário de atendimento: 9h às 18h, de segunda a sexta.")}\n` +
              t("Sempre chame o cliente pelo primeiro nome.")
            }
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "O que vale para qualquer atendimento aqui. Pode deixar em branco agora e escrever depois — ele aprende com você ao longo do tempo.",
            )}
          </p>
        </div>
      </div>

      {/*
        Nada aqui pede configuração: é o que ele JÁ vem sabendo. O passo
        anterior entregava um funcionário sem dizer uma linha sobre o que ele
        é capaz de fazer — e a primeira pergunta de quem contrata alguém é
        exatamente essa.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <h3 className="text-sm font-semibold">{t("Ele já vem sabendo")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {capacidades.map((c) => (
              <li key={c} className="flex items-start gap-2 leading-snug">
                <Check
                  aria-hidden
                  size={16}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-success"
                />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <h3 className="text-sm font-semibold">{t("E nunca vai fazer")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {conferencias.map((c) => (
              <li key={c} className="flex items-start gap-2 leading-snug">
                <X aria-hidden size={16} weight="bold" className="mt-0.5 shrink-0 text-error" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {t("Essas conferências acontecem antes de cada mensagem sair, e não têm interruptor.")}
          </p>
        </section>
      </div>

      {regrasNaoSalvas && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-warning/60 bg-warning-bg p-4"
        >
          <p className="text-sm font-medium">
            {t("O atendente foi criado, mas as")} <strong>{t("regras da casa")}</strong>{" "}
            {t("não foram gravadas. Copie o que você escreveu antes de sair — e salve de novo em")}{" "}
            <strong>{t("IA › Memória")}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{regrasNaoSalvas}</code>
          </p>
        </div>
      )}

      {causa === "chave" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-warning/60 bg-warning-bg p-4"
        >
          <p className="text-sm font-medium">
            {t("Seu atendente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>{" "}
            {t("— ele ainda não tem com o que pensar.")}
          </p>
          {chaveEmVerificacao ? (
            // A chave EXISTE, está gravada, e o que falta é o provedor confirmar.
            // Dizer "não achei chave" aqui é falso — e manda a pessoa colar de
            // novo o que ela acabou de colar (#1007).
            <p className="text-sm">
              {t("A chave que você colou ainda não foi confirmada pelo provedor.")}{" "}
              {t("Assim que ela for confirmada, publique de novo — não precisa colar outra.")}
            </p>
          ) : (
            <p className="text-sm">
              {t("Não achei chave")} {provedorLegivel(provedor, t)}{" "}
              {t(
                "nem cadastrada aqui, nem vinda da instalação. Cole a chave no campo acima («o cérebro dele») e crie o atendente de novo — ou cadastre em",
              )}{" "}
              <strong>{t("IA › Credenciais")}</strong>.
            </p>
          )}
          {/*
            ⚠️ SEM ESTA SAÍDA O PASSO É UM BECO. O aviso irmão (o de modelo) já
            oferecia seguir, e este nasceu sem — quem instala sem chave nenhuma
            (o caminho que o CI exercita) ficava preso na tela de treinar, com um
            diagnóstico correto e nenhum botão. O atendente EXISTE como rascunho;
            o que falta é o cérebro, e isso se resolve depois sem travar o resto
            do wizard.
          */}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {causa === "modelo" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-warning/60 bg-warning-bg p-4"
        >
          <p className="text-sm font-medium">
            {t("Seu atendente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>{" "}
            {t("— e rascunho não responde mensagem.")}
          </p>
          {/*
            As duas causas pedem conselhos OPOSTOS, e dar o errado custa caro:
            mandar esperar a sincronização diária quem já tem o catálogo
            completo é mandar esperar para sempre. Foi o que a tela fazia, e só
            apareceu percorrendo o wizard num ambiente com 400 modelos baixados.
          */}
          {motivoDoModelo === "nenhum_com_ferramentas" ? (
            <p className="text-sm">
              {t("Os modelos")} {provedorLegivel(provedor, t)}{" "}
              {t(
                "que esta instalação conhece não sabem usar ferramentas — sem isso ele conversaria bem e nunca criaria um cliente nem moveria um negócio no funil. Escolha outra empresa de IA em",
              )}{" "}
              <strong>{t("IA › Provedores")}</strong>.
            </p>
          ) : (
            <p className="text-sm">
              {t("Esta instalação ainda não tem a lista de modelos")} {provedorLegivel(provedor, t)}
              . {t("Ela é baixada automaticamente uma vez por dia; depois disso, publique em")}{" "}
              <strong>{t("IA › Agentes")}</strong>.
            </p>
          )}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {naoPublicado && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-warning/60 bg-warning-bg p-4"
        >
          <p className="text-sm font-medium">
            {t("Seu agente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>:{" "}
            {t(
              "não consegui ler os números de WhatsApp desta instalação, então não dá pra dizer em qual número ele atenderia — e rascunho não responde mensagem.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{naoPublicado}</code>
          </p>
          <p className="text-sm">
            {t(
              "Tente de novo no botão abaixo (clicar de novo não cria um segundo agente) ou siga agora e publique depois em",
            )}{" "}
            <strong>{t("IA › Agentes")}</strong>.
          </p>
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => void skipAi())}
        >
          {t("Pular")}
        </Button>
        <Button type="submit" disabled={pending} className="h-12 gap-2 px-7 text-base">
          {pending ? t("Criando...") : t("Criar e continuar")}
          {pending ? null : <ArrowRight aria-hidden size={18} weight="bold" />}
        </Button>
      </div>
    </form>
  );
}

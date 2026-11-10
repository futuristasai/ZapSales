import type { RetratoDaInstalacao } from "@/lib/instalacao/retrato";
import type { Idioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";
import { Check, Warning } from "@/lib/ui/icons";

import { TITULO } from "./fonte";

/**
 * A primeira coisa que a pessoa lê no wizard: o que ela JÁ tem.
 *
 * Quem chega aqui acabou de instalar o sistema num servidor — escolheu a
 * inteligência artificial, colou a chave, subiu o WhatsApp — e era recebido por
 * um formulário em branco, como se tivesse acabado de chegar. Começar pelo que
 * já está pronto muda a pergunta de "quanto trabalho me espera?" para "o que
 * falta?".
 *
 * Cada linha é MEDIDA, nunca presumida. É o oposto do aviso que o painel de
 * provedores dá hoje ("tudo usa a chave que veio na instalação"), disparado sem
 * verificar se existe chave — a frase que tranquiliza enquanto o funcionário
 * está mudo.
 */
export function JaEstaPronto({
  retrato,
  idioma,
}: {
  retrato: RetratoDaInstalacao;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const itens: { pronto: boolean; texto: string }[] = [
    {
      pronto: true,
      texto: t("Servidor no ar e banco de dados instalado"),
    },
    {
      // Três estados, não dois: cadastrada-e-confirmada, cadastrada-e-sendo-
      // conferida, e nenhuma. A do meio existe porque a validação roda em
      // segundo plano — e dizer "falta a chave" a quem acabou de colá-la é a
      // frase que manda a pessoa cadastrar de novo o que já está lá.
      pronto: retrato.inteligencia.origemDaChave !== "nenhuma",
      texto:
        retrato.inteligencia.origemDaChave !== "nenhuma"
          ? `${t("Inteligência contratada:")} ${retrato.inteligencia.rotulo}`
          : retrato.inteligencia.chaveEmVerificacao
            ? t("Chave cadastrada — conferindo com a empresa de IA")
            : t("Falta a chave da inteligência artificial"),
    },
    {
      pronto: retrato.whatsapp.transporteApontado,
      texto: retrato.whatsapp.transporteApontado
        ? t("WhatsApp pronto para conectar seu número")
        : t("O WhatsApp desta instalação ainda não subiu"),
    },
    {
      pronto: Boolean(retrato.funil),
      texto: retrato.funil
        ? `${t("Funil de vendas criado:")} ${retrato.funil.nome}`
        : t("Nenhum funil de vendas ainda"),
    },
  ];

  const faltando = itens.filter((i) => !i.pronto).length;

  return (
    <section
      aria-labelledby="ja-pronto"
      className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7"
    >
      <h3 id="ja-pronto" className={`${TITULO} text-2xl leading-snug`}>
        {t("Você já instalou o sistema. Isto aqui já está de pé:")}
      </h3>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {itens.map((it) => (
          <li
            key={it.texto}
            className={
              "flex items-start gap-3 rounded-2xl p-3.5 " +
              (it.pronto ? "bg-success-bg" : "bg-warning-bg")
            }
          >
            <span
              aria-hidden
              className={
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white " +
                (it.pronto ? "bg-success" : "bg-warning")
              }
            >
              {it.pronto ? <Check size={18} weight="bold" /> : <Warning size={18} weight="bold" />}
            </span>
            <span className="pt-1 text-[0.9375rem] leading-snug font-medium">{it.texto}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-base text-muted-foreground">
        {faltando === 0
          ? t("Agora é montar quem vai atender por você.")
          : t("O que falta a gente resolve nos próximos passos.")}
      </p>
    </section>
  );
}

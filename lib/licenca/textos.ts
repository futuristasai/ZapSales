/**
 * O QUE A TELA DIZ sobre a licença — num lugar só, para a faixa e a página nunca discordarem.
 *
 * A decisão (`decidir.ts`) devolve um CÓDIGO de mensagem, não uma frase; a frase é de quem desenha. Aqui moram
 * as duas frases de cada estado: a CURTA (a faixa, uma linha) e a LONGA (a página, que explica o que significa
 * e o que fazer). Tudo passa por `t`, e `t` é quem traduz: este módulo não lê idioma, não lê banco e não renderiza
 * nada, então roda no servidor e no navegador.
 *
 * Os textos seguem o contrato (`docs/specs/licenca-contrato-entre-as-pontas-v1.md`, seção 2): "Uso não
 * comercial", "Ativação pendente", "Licença temporária, faltam N dias", "Autorização vencida por falta de
 * contato" e "Licença bloqueada". Nenhum nomeia o produto (marca própria): quem lê é o cliente de um revendedor.
 */
import type { EstadoDaLicenca } from "./decidir";
import type { ModoDaLicenca } from "./estado";

type Traduz = (texto: string) => string;

/** O "tom" da faixa e da página. Quem desenha escolhe a cor; aqui só se diz o que cada estado pede. */
export type TomDaLicenca = "informacao" | "aviso" | "erro";

export interface TextoDaLicenca {
  /** A frase da faixa — uma linha. */
  readonly curta: string;
  /** O título da página. */
  readonly titulo: string;
  /** O parágrafo da página: o que significa e o que fazer. */
  readonly explicacao: string;
  readonly tom: TomDaLicenca;
}

function diasRestantes(dias: number | null, t: Traduz): string {
  if (dias === null) return t("Licença temporária.");
  if (dias === 0) return t("Licença temporária, termina hoje.");
  if (dias === 1) return t("Licença temporária, falta 1 dia.");
  return `${t("Licença temporária, faltam")} ${dias} ${t("dias.")}`;
}

export function textoDaLicenca(
  estado: EstadoDaLicenca,
  dias: number | null,
  t: Traduz,
): TextoDaLicenca {
  switch (estado) {
    case "sem_selo":
      return {
        curta: t("Uso não comercial: uso em empresa exige licença."),
        titulo: t("Uso não comercial"),
        explicacao: t(
          "Esta instalação ainda não tem licença. Ela funciona por inteiro, mas usá-la dentro de uma empresa exige a licença comercial. A licença é ativada com o e-mail e o código da compra, na instalação.",
        ),
        tom: "informacao",
      };
    case "ativacao_pendente":
      return {
        curta: t("Ativação da licença pendente."),
        titulo: t("Ativação pendente"),
        explicacao: t(
          "A instalação terminou, mas a licença ainda não foi ativada. Ela funciona normalmente enquanto isso. Ative com o e-mail e o código da compra.",
        ),
        tom: "informacao",
      };
    case "temporario_valido":
      return {
        curta: diasRestantes(dias, t),
        titulo: t("Licença temporária"),
        explicacao: t(
          "A licença está no período de validação. Ela se renova sozinha enquanto esta instalação conseguir falar com o servidor de licenças. Ao fim do período, uma licença elegível recebe a autorização permanente automaticamente.",
        ),
        tom: "informacao",
      };
    case "permanente_valido":
      return {
        curta: t("Licença permanente."),
        titulo: t("Licença permanente"),
        explicacao: t(
          "Esta instalação tem autorização permanente. Ela funciona sem consultar o servidor de licenças.",
        ),
        tom: "informacao",
      };
    case "temporario_vencido":
      return {
        curta: t("Autorização vencida por falta de contato com o servidor de licenças."),
        titulo: t("Autorização vencida"),
        explicacao: t(
          "Esta instalação ficou tempo demais sem falar com o servidor de licenças, e a autorização temporária venceu. Isto não é um bloqueio: ela volta a funcionar assim que conseguir renovar. Confira se esta VPS está com a internet em ordem e tente renovar agora.",
        ),
        tom: "erro",
      };
    case "bloqueada":
      return {
        curta: t("Licença bloqueada."),
        titulo: t("Licença bloqueada"),
        explicacao: t(
          "O servidor de licenças registrou um bloqueio para esta instalação. Os seus dados estão preservados e a exportação continua disponível. Fale com quem forneceu este sistema para regularizar a licença.",
        ),
        tom: "erro",
      };
  }
}

/** O que o modo significa, em linguagem de quem não é técnico. */
export function textoDoModo(modo: ModoDaLicenca, t: Traduz): string {
  return modo === "valendo"
    ? t("Em vigor: uma instalação sem licença válida deixa de funcionar.")
    : t("Em observação: a licença é calculada e mostrada, mas nada é restringido.");
}

/** O complemento da faixa de erro quando o modo ainda é só observação. */
export function seguePorEnquanto(t: Traduz): string {
  return t("O sistema segue funcionando por enquanto.");
}

/** A explicação do resultado do botão "tentar renovar agora". */
export function textoDoResultadoDaRenovacao(
  resultado: string,
  motivo: string | null,
  t: Traduz,
): { texto: string; tom: TomDaLicenca } {
  switch (resultado) {
    case "renovada":
      return { texto: t("Licença renovada."), tom: "informacao" };
    case "bloqueada":
      return {
        texto: t("O servidor de licenças respondeu que esta licença está bloqueada."),
        tom: "erro",
      };
    case "nada_a_fazer":
      return motivo === "permanente"
        ? { texto: t("Esta licença é permanente: não precisa de renovação."), tom: "informacao" }
        : {
            texto: t(
              "Esta instalação ainda não foi ativada, então não há o que renovar. A ativação é feita na instalação, com o e-mail e o código da compra.",
            ),
            tom: "aviso",
          };
    case "adiada":
      return {
        texto: t("Você acabou de tentar. Espere alguns segundos e tente de novo."),
        tom: "aviso",
      };
    default:
      return {
        texto: t(
          "Não foi possível renovar agora. Nada foi alterado: confira a internet desta VPS e tente de novo daqui a pouco.",
        ),
        tom: "aviso",
      };
  }
}

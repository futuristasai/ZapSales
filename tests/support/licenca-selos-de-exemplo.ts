/**
 * Os SELOS DE EXEMPLO: o conjunto que o aplicativo e o servidor de licenças consomem para provar
 * que falam o mesmo formato (contrato, seção 6). É gerado aqui e gravado em
 * `tests/fixtures/licenca/selos-de-exemplo.json` por `tests/support/gerar-selos-de-exemplo.ts`; um teste
 * reprova se o arquivo versionado divergir do que este gerador produz.
 *
 * Cada selo vem com o veredito esperado, para o outro lado não precisar adivinhar. Todos valem
 * para a instalação `INSTALACAO_DE_EXEMPLO` e para o instante `AGORA_DE_REFERENCIA`.
 */
import { assinarParaTeste, CABECALHO_PADRAO, chavePublicaDeTeste } from "./licenca-chave-de-teste";

/** 2027-01-15T08:00:00Z, em segundos Unix. É o "agora" contra o qual cada veredito vale. */
export const AGORA_DE_REFERENCIA = 1_800_000_000;

export const INSTALACAO_DE_EXEMPLO = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const OUTRA_INSTALACAO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const LICENCA = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

const HORA = 3600;
const DIA = 86_400;
const VALIDADE_DO_TEMPORARIO = 48 * HORA;

export type Esperado =
  { ok: true; tipo: "temporario" | "permanente" } | { ok: false; motivo: string };

/**
 * Vai na MESMA linha de cada selo no arquivo gravado. O detector de segredos reconhece um JWT
 * ali; estes são exemplos públicos, assinados com a chave de teste, e o marcador `gitleaks:allow`
 * é a forma que o repositório usa para declarar o falso positivo na própria linha.
 */
export const AVISO_DO_SELO_DE_EXEMPLO =
  "gitleaks:allow - selo de EXEMPLO assinado com a chave de TESTE publica; nao e segredo";

export interface SeloDeExemplo {
  nome: string;
  descricao: string;
  selo: string;
  esperado: Esperado;
  aviso: string;
}

function jti(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function base64url(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

type Carga = Record<string, unknown>;

function temporario(n: number, mudancas: Carga = {}): Carga {
  const iat = AGORA_DE_REFERENCIA - HORA;
  return {
    v: 1,
    iss: "zapsales-licencas",
    sub: INSTALACAO_DE_EXEMPLO,
    lic: LICENCA,
    tipo: "temporario",
    iat,
    exp: iat + VALIDADE_DO_TEMPORARIO,
    jti: jti(n),
    ...mudancas,
  };
}

function permanente(n: number, mudancas: Carga = {}): Carga {
  return {
    v: 1,
    iss: "zapsales-licencas",
    sub: INSTALACAO_DE_EXEMPLO,
    lic: LICENCA,
    tipo: "permanente",
    iat: AGORA_DE_REFERENCIA - 11 * DIA,
    jti: jti(n),
    ...mudancas,
  };
}

export async function montarConjuntoDeExemplo() {
  const valido = temporario(1);
  const permanenteValido = permanente(2);

  const seloValido = await assinarParaTeste(valido);
  const seloPermanente = await assinarParaTeste(permanenteValido);

  // Assinatura adulterada: o conteúdo do permanente com a assinatura do temporário.
  const [cabecalhoValido, , assinaturaValida] = seloValido.split(".");
  const adulterado = `${cabecalhoValido}.${seloPermanente.split(".")[1]}.${assinaturaValida}`;

  // `alg: none`: sem assinatura nenhuma, como no ataque clássico.
  const semAlgoritmo = `${base64url(
    JSON.stringify({ alg: "none", typ: "zapsales-selo", kid: CABECALHO_PADRAO.kid }),
  )}.${base64url(JSON.stringify(valido))}.`;

  const iatFuturo = AGORA_DE_REFERENCIA + HORA;

  const casos: Omit<SeloDeExemplo, "aviso">[] = [
    {
      nome: "temporario_valido",
      descricao: "Emitido há 1 hora, vale 48 horas.",
      selo: seloValido,
      esperado: { ok: true, tipo: "temporario" },
    },
    {
      nome: "permanente_valido",
      descricao: "Emitido há 11 dias, sem vencimento.",
      selo: seloPermanente,
      esperado: { ok: true, tipo: "permanente" },
    },
    {
      nome: "temporario_vencido",
      descricao: "Emitido há mais de 3 dias: o vencimento já passou.",
      selo: await assinarParaTeste(
        temporario(3, {
          iat: AGORA_DE_REFERENCIA - 300_000,
          exp: AGORA_DE_REFERENCIA - 300_000 + VALIDADE_DO_TEMPORARIO,
        }),
      ),
      esperado: { ok: false, motivo: "expirado" },
    },
    {
      nome: "emitido_no_futuro",
      descricao: "`iat` 1 hora adiante do agora (a tolerância é de 5 minutos).",
      selo: await assinarParaTeste(
        temporario(4, { iat: iatFuturo, exp: iatFuturo + VALIDADE_DO_TEMPORARIO }),
      ),
      esperado: { ok: false, motivo: "emitido_no_futuro" },
    },
    {
      nome: "assinatura_adulterada",
      descricao: "Conteúdo trocado depois de assinado.",
      selo: adulterado,
      esperado: { ok: false, motivo: "assinatura_invalida" },
    },
    {
      nome: "alg_none",
      descricao: "Cabeçalho com `alg: none` e assinatura vazia.",
      selo: semAlgoritmo,
      esperado: { ok: false, motivo: "cabecalho_invalido" },
    },
    {
      nome: "kid_desconhecido",
      descricao: "Assinado por uma chave cujo `kid` o aplicativo não conhece.",
      selo: await assinarParaTeste(temporario(7), { ...CABECALHO_PADRAO, kid: "desconhecida-1" }),
      esperado: { ok: false, motivo: "chave_desconhecida" },
    },
    {
      nome: "instalacao_de_outra",
      descricao: "Selo legítimo de OUTRA instalação.",
      selo: await assinarParaTeste(temporario(8, { sub: OUTRA_INSTALACAO })),
      esperado: { ok: false, motivo: "instalacao_diferente" },
    },
    {
      nome: "campo_extra",
      descricao: "Payload com um campo que o formato v1 não tem (leitura estrita).",
      selo: await assinarParaTeste(temporario(9, { modalidade: "revenda" })),
      esperado: { ok: false, motivo: "payload_invalido" },
    },
    {
      nome: "versao_diferente",
      descricao: "`v` igual a 2: um app v1 não aceita em silêncio um formato futuro.",
      selo: await assinarParaTeste(temporario(10, { v: 2 })),
      esperado: { ok: false, motivo: "versao_nao_suportada" },
    },
    {
      nome: "permanente_com_exp",
      descricao: "Permanente que traz `exp`.",
      selo: await assinarParaTeste(permanente(11, { exp: AGORA_DE_REFERENCIA + 10 * DIA })),
      esperado: { ok: false, motivo: "tipo_incoerente" },
    },
    {
      nome: "temporario_sem_exp",
      descricao: "Temporário que não traz `exp`.",
      selo: await assinarParaTeste(temporario(12, { exp: undefined })),
      esperado: { ok: false, motivo: "tipo_incoerente" },
    },
  ];

  const selos: SeloDeExemplo[] = casos.map((caso) => ({
    ...caso,
    aviso: AVISO_DO_SELO_DE_EXEMPLO,
  }));

  return {
    _leia_me:
      "Selos de exemplo do licenciamento do ZapSales, gerados com a chave de TESTE (jamais usada em producao). " +
      "Cada selo vale para `instalacao_id` e para o instante `agora_de_referencia` (segundos Unix UTC). " +
      "Gerado por tests/support/gerar-selos-de-exemplo.ts; nao edite a mao. Contrato: docs/specs/licenca-contrato-entre-as-pontas-v1.md.",
    algoritmo: "EdDSA",
    typ: "zapsales-selo",
    chave_publica: chavePublicaDeTeste,
    agora_de_referencia: AGORA_DE_REFERENCIA,
    instalacao_id: INSTALACAO_DE_EXEMPLO,
    selos,
  };
}

"use client";
/**
 * O cadastro e o teste de UMA API (issue #372).
 *
 * O formulário tem quatro partes, na ordem em que a pessoa pensa: o que a API faz para o agente,
 * como chamá-la (os dados que a documentação do outro sistema fornece), o que o agente preenche
 * e a segurança desta API. A última parte usa o mesmo desenho do painel da organização: cada
 * opção diz o que faz, dá um exemplo, a recomendação e o risco.
 *
 * Salvar com uma opção FORA do recomendado não é um clique só: a tela lista os riscos e o botão
 * em destaque é «Voltar e ajustar». O servidor revalida tudo, e as travas da organização valem
 * lá de novo — a tela só evita que a pessoa descubra a recusa depois de preencher.
 */
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  conferirEnderecoModelo,
  conferirModeloDoCorpo,
  dadoDoMarcador,
  hostDoModelo,
  marcadoresDe,
} from "@/lib/ai/ferramentas-externas/api/montagem";
import { opcaoExplicada } from "@/lib/ai/ferramentas-externas/api/opcoes";
import { foraDoRecomendadoNaFerramenta } from "@/lib/ai/ferramentas-externas/api/recomendado";
import { CAMINHO_DA_RESPOSTA } from "@/lib/ai/ferramentas-externas/api/resposta";
import { hostPermitido, type OpcoesDeSeguranca } from "@/lib/ai/ferramentas-externas/api/seguranca";
import {
  CABECALHOS_RESERVADOS,
  DADOS_DO_CONTATO,
  LIMITES_DA_API,
  MARCADOR_DO_CONTATO,
  METODOS_COM_CORPO,
  METODOS_DA_API,
  ROTULO_DO_DADO_DO_CONTATO,
  type CabecalhoFixo,
  type DadoDoContato,
  type MetodoDaApi,
  type ModoDoCorpo,
  type TipoDeCredencial,
} from "@/lib/ai/ferramentas-externas/api/tipos";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import {
  LIMITES_DA_FERRAMENTA,
  ROTULO_DO_TIPO,
  TIPOS_DE_PARAMETRO,
  VALIDADE_DO_PEDIDO_HORAS,
  type EfeitoDaFerramenta,
  type ParametroDaFerramenta,
  type TipoDeParametro,
} from "@/lib/ai/ferramentas-externas/tipos";
import { randomId } from "@/lib/random-id";

import { OpcaoDeSeguranca } from "./_apis-opcao";

/** Mesmo visual do `Input`, para o `<select>` nativo (o repo usa o nativo onde a lista é curta). */
const CLASSE_DO_SELECT =
  "h-11 w-full rounded-md border border-border bg-transparent px-3 text-sm lg:h-9 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent";

// ─── Cadastro e edição ───────────────────────────────────────────────────────

interface FormularioProps {
  aberto: boolean;
  editando: FerramentaExterna | null;
  /** As opções de segurança da organização: o formulário já mostra o que elas proíbem. */
  opcoes: OpcoesDeSeguranca;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}

export function FormularioDaApiDialog(props: FormularioProps) {
  const t = useT();
  return (
    <Dialog open={props.aberto} onOpenChange={(aberto) => (aberto ? null : props.onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{props.editando ? t("Editar API") : t("Nova API")}</DialogTitle>
          <DialogDescription>
            {t("O agente chama esta API durante a conversa e usa a resposta como informação. Tenha em mãos a documentação da API do outro sistema.")}
          </DialogDescription>
        </DialogHeader>
        {/* Monta SÓ aberto: o estado do formulário nasce limpo a cada abertura. */}
        {props.aberto ? <Formulario {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface CampoDoFormulario {
  nome: string;
  tipo: TipoDeParametro;
  descricao: string;
  obrigatorio: boolean;
  /** Texto: as opções permitidas, separadas por vírgula. */
  opcoes: string;
  /** Número: a faixa permitida. Vazio = sem limite. */
  minimo: string;
  maximo: string;
}

function campoDoCadastro(p: ParametroDaFerramenta): CampoDoFormulario {
  return {
    nome: p.nome,
    tipo: p.tipo,
    descricao: p.descricao,
    obrigatorio: p.obrigatorio,
    opcoes: (p.opcoes ?? []).join(", "),
    minimo: p.minimo !== undefined ? String(p.minimo) : "",
    maximo: p.maximo !== undefined ? String(p.maximo) : "",
  };
}

/** O número de um campo de limite, ou `null` quando a pessoa escolheu «sem limite». */
function numeroOuNulo(semLimite: boolean, texto: string): number | null {
  return semLimite ? null : Number(texto);
}

function Formulario({ editando, opcoes, onFechar, onSalvo }: FormularioProps) {
  const t = useT();
  const config = editando?.api?.config;

  const [nome, setNome] = useState(editando?.name ?? "");
  const [quandoUsar, setQuandoUsar] = useState(editando?.when_to_use ?? "");
  const [metodo, setMetodo] = useState<MetodoDaApi>(config?.metodo ?? "GET");
  const [url, setUrl] = useState(editando?.url ?? "");
  const [tipoDeCredencial, setTipoDeCredencial] = useState<TipoDeCredencial>(config?.credencial.tipo ?? "bearer");
  const [cabecalhoDaCredencial, setCabecalhoDaCredencial] = useState(config?.credencial.cabecalho ?? "X-API-Key");
  const [usuario, setUsuario] = useState(config?.credencial.usuario ?? "");
  const [credencial, setCredencial] = useState("");
  const [cabecalhos, setCabecalhos] = useState<CabecalhoFixo[]>(config?.cabecalhos.map((c) => ({ ...c })) ?? []);
  const [modoDoCorpo, setModoDoCorpo] = useState<ModoDoCorpo>(config?.corpo.modo ?? "campos");
  const [modeloDoCorpo, setModeloDoCorpo] = useState(config?.corpo.modelo ?? "");
  const [campos, setCampos] = useState<CampoDoFormulario[]>(editando?.parameters.map(campoDoCadastro) ?? []);

  const [efeito, setEfeito] = useState<EfeitoDaFerramenta>(editando?.effect ?? "consulta");
  /** A pessoa escolheu o efeito à mão? Enquanto não, ele acompanha o método. */
  const [efeitoEscolhido, setEfeitoEscolhido] = useState(editando !== null);
  // `null` = a pessoa nunca mexeu na chave: vale o padrão do efeito (altera pede aprovação).
  const [pedirAprovacao, setPedirAprovacao] = useState<boolean | null>(editando?.require_approval ?? null);
  const [validade, setValidade] = useState(String(editando?.approval_ttl_hours ?? VALIDADE_DO_PEDIDO_HORAS.padrao));
  const [dadosDoContato, setDadosDoContato] = useState<DadoDoContato[]>(config?.dados_contato ?? []);
  const [camposDaResposta, setCamposDaResposta] = useState((config?.campos_resposta ?? []).join("\n"));
  const [semLimitePorConversa, setSemLimitePorConversa] = useState(config ? config.limite_por_conversa === null : false);
  const [limitePorConversa, setLimitePorConversa] = useState(
    String(config?.limite_por_conversa ?? LIMITES_DA_API.limitePorConversa.padrao),
  );
  const [semLimitePorDia, setSemLimitePorDia] = useState(config ? config.limite_por_dia === null : false);
  const [limitePorDia, setLimitePorDia] = useState(String(config?.limite_por_dia ?? LIMITES_DA_API.limitePorDia.padrao));
  const [semPausa, setSemPausa] = useState(config ? config.pausa_apos_falhas === null : false);
  const [pausaAposFalhas, setPausaAposFalhas] = useState(String(config?.pausa_apos_falhas ?? LIMITES_DA_API.pausaAposFalhas.padrao));

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState<string[] | null>(null);
  // Um clique duplo no «Salvar» reenvia a MESMA chave: o servidor cria uma API só.
  const chaveDeIdempotencia = useRef(randomId());

  const temCorpo = METODOS_COM_CORPO.has(metodo);
  // A trava da organização: com «aprovação sempre obrigatória», a ação que altera sempre pede.
  const aprovacaoTravada = opcoes.aprovacao_obrigatoria && efeito === "altera";
  const pede = aprovacaoTravada || decidirSePedeAprovacao({ effect: efeito, requireApproval: pedirAprovacao, modo: "ao_vivo" }).pede;
  const jaTemCredencial = editando?.api?.has_credential === true;

  const fora = foraDoRecomendadoNaFerramenta({
    metodo,
    efeito,
    pedeAprovacao: pede,
    config: {
      limite_por_conversa: numeroOuNulo(semLimitePorConversa, limitePorConversa),
      limite_por_dia: numeroOuNulo(semLimitePorDia, limitePorDia),
      pausa_apos_falhas: numeroOuNulo(semPausa, pausaAposFalhas),
    },
  });

  /** Os marcadores que a pessoa pode escrever no endereço e no corpo. */
  const marcadores = [
    ...campos.map((c) => c.nome).filter((n) => n !== ""),
    ...dadosDoContato.map((d) => MARCADOR_DO_CONTATO[d]),
  ];

  function mudarMetodo(novo: MetodoDaApi) {
    setMetodo(novo);
    if (!efeitoEscolhido) setEfeito(novo === "GET" ? "consulta" : "altera");
  }

  function atualizarCampo(indice: number, mudanca: Partial<CampoDoFormulario>) {
    setCampos((atuais) => atuais.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));
  }

  function parametros(): ParametroDaFerramenta[] {
    return campos.map((c) => {
      const base: ParametroDaFerramenta = { nome: c.nome, tipo: c.tipo, descricao: c.descricao.trim(), obrigatorio: c.obrigatorio };
      if (c.tipo === "texto") {
        const lista = c.opcoes
          .split(",")
          .map((o) => o.trim())
          .filter((o) => o !== "");
        if (lista.length > 0) base.opcoes = lista;
      }
      if (c.tipo === "numero" || c.tipo === "inteiro") {
        if (c.minimo.trim() !== "") base.minimo = Number(c.minimo);
        if (c.maximo.trim() !== "") base.maximo = Number(c.maximo);
      }
      return base;
    });
  }

  function caminhosDaResposta(): string[] {
    return camposDaResposta
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter((c) => c !== "");
  }

  /** A primeira coisa errada, no idioma da pessoa. O servidor revalida tudo. */
  function conferir(): string | null {
    if (nome.trim().length < LIMITES_DA_FERRAMENTA.nome.min) return t("Dê um nome à API (ao menos 3 letras).");
    if (quandoUsar.trim().length < LIMITES_DA_FERRAMENTA.quandoUsar.min)
      return t("Explique em uma frase quando o agente deve usar esta API (ao menos 10 letras).");

    const problema = conferirEnderecoModelo(url.trim(), process.env.NODE_ENV !== "production");
    if (problema === "marcador_no_host")
      return t("O endereço só pode ter campos depois do nome do site: o agente preenche o número do pedido, nunca para onde a chamada vai.");
    if (problema !== null) return t("Informe um endereço completo que comece com https:// e sem usuário e senha.");
    const site = hostDoModelo(url.trim());
    if (site && !hostPermitido(site, opcoes.dominios_permitidos))
      return `${t("Este site não está na lista de endereços permitidos da organização:")} ${site}.`;

    const usados = new Set<string>();
    for (const c of campos) {
      if (!/^[a-z][a-z0-9_]*$/.test(c.nome))
        return t("O nome de cada campo usa só letras minúsculas sem acento, números e _ (ex.: codigo_produto).");
      if (dadoDoMarcador(c.nome) !== null) return t("Este nome de campo é reservado para um dado do contato. Escolha outro.");
      if (usados.has(c.nome)) return t("Dois campos têm o mesmo nome.");
      usados.add(c.nome);
      if (c.descricao.trim().length < LIMITES_DA_FERRAMENTA.descricaoDoParametro.min)
        return t("Descreva cada campo para o agente saber o que preencher.");
      if (c.tipo === "numero" || c.tipo === "inteiro") {
        const min = c.minimo.trim() === "" ? null : Number(c.minimo);
        const max = c.maximo.trim() === "" ? null : Number(c.maximo);
        if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && min > max))
          return t("Confira o mínimo e o máximo dos campos numéricos: o mínimo não pode passar do máximo.");
      }
    }

    const conhecidos = new Set(marcadores);
    const citados = [...marcadoresDe(url), ...(temCorpo && modoDoCorpo === "modelo" ? marcadoresDe(modeloDoCorpo) : [])];
    const desconhecido = citados.find((m) => !conhecidos.has(m));
    if (desconhecido)
      return `${t("O endereço ou o corpo cita um campo que não existe:")} {{${desconhecido}}}. ${t("Crie o campo abaixo ou marque o dado do contato.")}`;

    if (temCorpo && modoDoCorpo === "modelo" && conferirModeloDoCorpo(modeloDoCorpo) !== null)
      return t("O modelo do corpo precisa ser um JSON válido, com os campos entre aspas — por exemplo: {\"produto\": \"{{produto}}\"}.");

    for (const c of cabecalhos) {
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(c.nome.trim()) || CABECALHOS_RESERVADOS.has(c.nome.trim().toLowerCase()))
        return `${t("Este cabeçalho não pode ser usado:")} ${c.nome || "—"}.`;
      if (c.valor.trim() === "") return t("Preencha o valor de cada cabeçalho, ou remova o que estiver vazio.");
    }

    if (tipoDeCredencial !== "nenhuma" && credencial === "" && !jaTemCredencial) return t("Informe a chave de acesso da API.");
    if (tipoDeCredencial === "cabecalho" && !/^[A-Za-z][A-Za-z0-9-]*$/.test(cabecalhoDaCredencial.trim()))
      return t("Informe o nome do cabeçalho que leva a chave (ex.: X-API-Key).");
    if (tipoDeCredencial === "basic" && usuario.trim() === "") return t("Informe o usuário.");

    if (caminhosDaResposta().some((c) => !CAMINHO_DA_RESPOSTA.test(c)))
      return t("Cada informação da resposta usa só letras, números e ponto — por exemplo: status ou cliente.nome.");

    const horas = Number(validade);
    if (pede && (!Number.isInteger(horas) || horas < VALIDADE_DO_PEDIDO_HORAS.min || horas > VALIDADE_DO_PEDIDO_HORAS.max))
      return t("A validade do pedido é de 1 a 168 horas.");

    const faixas: Array<[boolean, string, { min: number; max: number }]> = [
      [semLimitePorConversa, limitePorConversa, LIMITES_DA_API.limitePorConversa],
      [semLimitePorDia, limitePorDia, LIMITES_DA_API.limitePorDia],
      [semPausa, pausaAposFalhas, LIMITES_DA_API.pausaAposFalhas],
    ];
    for (const [sem, texto, faixa] of faixas) {
      const n = Number(texto);
      if (!sem && (!Number.isInteger(n) || n < faixa.min || n > faixa.max))
        return `${t("Confira os limites: cada número precisa estar dentro da faixa indicada ao lado do campo.")} (${faixa.min}–${faixa.max})`;
    }
    return null;
  }

  function corpoDoPedido() {
    return {
      nome: nome.trim(),
      quando_usar: quandoUsar.trim(),
      url: url.trim(),
      parametros: parametros(),
      efeito,
      // Só vai a escolha EXPLÍCITA; sem ela o servidor guarda «padrão do efeito».
      ...(pedirAprovacao !== null && !aprovacaoTravada ? { pedir_aprovacao: pedirAprovacao } : {}),
      ...(pede ? { validade_horas: Number(validade) } : {}),
      config: {
        metodo,
        cabecalhos: cabecalhos.map((c) => ({ nome: c.nome.trim(), valor: c.valor.trim() })),
        corpo: temCorpo && modoDoCorpo === "modelo" ? { modo: "modelo" as const, modelo: modeloDoCorpo } : { modo: "campos" as const, modelo: null },
        credencial: {
          tipo: tipoDeCredencial,
          cabecalho: tipoDeCredencial === "cabecalho" ? cabecalhoDaCredencial.trim() : null,
          usuario: tipoDeCredencial === "basic" ? usuario.trim() : null,
        },
        campos_resposta: caminhosDaResposta(),
        dados_contato: dadosDoContato,
        limite_por_conversa: numeroOuNulo(semLimitePorConversa, limitePorConversa),
        limite_por_dia: numeroOuNulo(semLimitePorDia, limitePorDia),
        pausa_apos_falhas: numeroOuNulo(semPausa, pausaAposFalhas),
      },
      ...(tipoDeCredencial !== "nenhuma" && credencial !== "" ? { credencial } : {}),
    };
  }

  async function enviar() {
    setSalvando(true);
    try {
      const corpo = corpoDoPedido();
      if (editando) {
        await apiClient.patch(`/api/v1/ai/api-tools/${editando.id}`, corpo);
        toast.success(t("API salva."));
      } else {
        await apiClient.post("/api/v1/ai/api-tools", corpo, { idempotencyKey: chaveDeIdempotencia.current });
        toast.success(t("API cadastrada."));
      }
      setConfirmando(null);
      await onSalvo();
    } catch (err) {
      setConfirmando(null);
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    const problema = conferir();
    setErro(problema);
    if (problema) return;
    // Sair do recomendado não é um clique só: os riscos aparecem antes de salvar.
    if (fora.length > 0) {
      setConfirmando(fora);
      return;
    }
    void enviar();
  }

  return (
    <form
      className="space-y-6"
      // As mensagens são nossas, no idioma da pessoa e com o motivo: a validação nativa do navegador
      // (que fala no idioma dele e só aponta o campo) barraria o envio antes delas.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
      data-testid="formulario-da-api"
    >
      {/* ── 1. O que ela faz para o agente ─────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t("1. O que esta API faz para o agente")}</legend>
        <div className="space-y-1.5">
          <Label htmlFor="api-nome">{t("Nome")}</Label>
          <Input
            id="api-nome"
            value={nome}
            maxLength={LIMITES_DA_FERRAMENTA.nome.max}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("Ex.: Consultar pedido na loja")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="api-quando">{t("Quando o agente deve usar")}</Label>
          <Textarea
            id="api-quando"
            value={quandoUsar}
            maxLength={LIMITES_DA_FERRAMENTA.quandoUsar.max}
            onChange={(e) => setQuandoUsar(e.target.value)}
            rows={2}
            placeholder={t("Ex.: Quando o cliente perguntar onde está o pedido dele.")}
          />
          <p className="text-xs text-muted-foreground">
            {t("É assim que o agente decide se chama esta API — escreva como instrução para uma pessoa.")}
          </p>
        </div>
      </fieldset>

      {/* ── 2. Como chamar ──────────────────────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t("2. Como chamar a API")}</legend>
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          {t("Estes dados estão na documentação da API do outro sistema. Se você não a tem, peça ao suporte dele o endereço, a chave de acesso e um exemplo de chamada.")}
        </p>
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="api-metodo">{t("Operação")}</Label>
            <select
              id="api-metodo"
              className={CLASSE_DO_SELECT}
              value={metodo}
              onChange={(e) => mudarMetodo(e.target.value as MetodoDaApi)}
              data-testid="api-metodo"
            >
              {METODOS_DA_API.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-url">{t("Endereço (https)")}</Label>
            <Input
              id="api-url"
              inputMode="url"
              value={url}
              maxLength={LIMITES_DA_FERRAMENTA.url.max}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.loja.example.com/pedidos/{{numero}}"
              className="font-mono text-xs"
              data-testid="api-url"
            />
          </div>
        </div>
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          {t("GET consulta; POST, PUT e PATCH enviam dados; DELETE apaga. Para usar um campo no endereço, escreva o nome dele entre chaves duplas, depois do nome do site.")}{" "}
          {marcadores.length > 0 ? (
            <span data-testid="api-marcadores">
              {t("Campos que você pode usar:")}{" "}
              <span className="font-mono">{marcadores.map((m) => `{{${m}}}`).join("  ")}</span>
            </span>
          ) : (
            t("Crie os campos na parte 3 e eles aparecem aqui.")
          )}
        </p>
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          {opcoes.dominios_permitidos.length > 0
            ? `${t("Sites permitidos nesta organização:")} ${opcoes.dominios_permitidos.join(", ")}.`
            : t("Por segurança, endereços da rede interna ou privada são recusados.")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="api-credencial-tipo">{t("Como a API confere quem está chamando")}</Label>
            <select
              id="api-credencial-tipo"
              className={CLASSE_DO_SELECT}
              value={tipoDeCredencial}
              onChange={(e) => setTipoDeCredencial(e.target.value as TipoDeCredencial)}
              data-testid="api-credencial-tipo"
            >
              <option value="bearer">{t("Chave no formato Bearer (o mais comum)")}</option>
              <option value="cabecalho">{t("Chave em um cabeçalho com outro nome")}</option>
              <option value="basic">{t("Usuário e senha")}</option>
              <option value="nenhuma">{t("Não pede chave (API aberta)")}</option>
            </select>
          </div>
          {tipoDeCredencial === "cabecalho" ? (
            <div className="space-y-1.5">
              <Label htmlFor="api-credencial-cabecalho">{t("Nome do cabeçalho")}</Label>
              <Input
                id="api-credencial-cabecalho"
                value={cabecalhoDaCredencial}
                maxLength={LIMITES_DA_API.nomeDoCabecalho.max}
                onChange={(e) => setCabecalhoDaCredencial(e.target.value)}
                placeholder="X-API-Key"
                className="font-mono text-xs"
              />
            </div>
          ) : null}
          {tipoDeCredencial === "basic" ? (
            <div className="space-y-1.5">
              <Label htmlFor="api-usuario">{t("Usuário")}</Label>
              <Input id="api-usuario" value={usuario} maxLength={LIMITES_DA_API.usuario.max} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" />
            </div>
          ) : null}
        </div>
        {tipoDeCredencial !== "nenhuma" ? (
          <div className="space-y-1.5">
            <Label htmlFor="api-credencial">{tipoDeCredencial === "basic" ? t("Senha") : t("Chave de acesso")}</Label>
            <Input
              id="api-credencial"
              type="password"
              autoComplete="new-password"
              value={credencial}
              maxLength={LIMITES_DA_API.credencial.max}
              onChange={(e) => setCredencial(e.target.value)}
              placeholder={jaTemCredencial ? `${t("Já existe uma chave guardada, terminada em")} …${editando?.secret_last4 ?? ""}` : ""}
              data-testid="api-credencial"
            />
            <p className="max-w-[68ch] text-xs text-muted-foreground">
              {jaTemCredencial
                ? t("Deixe em branco para manter a chave guardada. Escrever aqui troca a chave. Ela é guardada cifrada e nunca é mostrada de novo.")
                : t("A chave é guardada cifrada e nunca é mostrada de novo. Se puder, crie no outro sistema uma chave só para isto, com o mínimo de permissões.")}
            </p>
          </div>
        ) : null}

        {temCorpo ? (
          <div className="space-y-2">
            <Label htmlFor="api-corpo-modo">{t("O que vai no corpo da chamada")}</Label>
            <select
              id="api-corpo-modo"
              className={CLASSE_DO_SELECT}
              value={modoDoCorpo}
              onChange={(e) => setModoDoCorpo(e.target.value as ModoDoCorpo)}
              data-testid="api-corpo-modo"
            >
              <option value="campos">{t("Os campos, do jeito que o agente preencher")}</option>
              <option value="modelo">{t("Um modelo que eu escrevo (formato da API)")}</option>
            </select>
            {modoDoCorpo === "modelo" ? (
              <>
                <Textarea
                  value={modeloDoCorpo}
                  maxLength={LIMITES_DA_API.modeloDoCorpo.max}
                  onChange={(e) => setModeloDoCorpo(e.target.value)}
                  rows={6}
                  placeholder={'{\n  "cliente": { "telefone": "{{contato_telefone}}" },\n  "produto": "{{produto}}",\n  "quantidade": "{{quantidade}}"\n}'}
                  className="font-mono text-xs"
                  aria-label={t("Modelo do corpo")}
                  data-testid="api-corpo-modelo"
                />
                <p className="max-w-[68ch] text-xs text-muted-foreground">
                  {t("Escreva o JSON que a API espera, com cada campo entre aspas e chaves duplas. Um número continua número, e um campo opcional que o agente não preencher sai do corpo.")}
                </p>
              </>
            ) : (
              <p className="max-w-[68ch] text-xs text-muted-foreground">
                {t("Os campos que não aparecem no endereço vão no corpo, cada um com o próprio nome.")}
              </p>
            )}
          </div>
        ) : (
          <p className="max-w-[68ch] text-xs text-muted-foreground">
            {t("Nesta operação não há corpo: os campos que não aparecem no endereço vão no fim dele, como ?campo=valor.")}
          </p>
        )}

        <details className="rounded-md border border-border/60 p-3" data-testid="api-cabecalhos">
          <summary className="cursor-pointer text-sm font-medium">
            {t("Cabeçalhos fixos (avançado)")} {cabecalhos.length > 0 ? `· ${cabecalhos.length}` : ""}
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-[68ch] text-xs text-muted-foreground">
              {t("Só se a documentação pedir — por exemplo, a versão da API. Não coloque a chave de acesso aqui: ela tem o campo próprio, cifrado.")}
            </p>
            {cabecalhos.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={c.nome}
                  maxLength={LIMITES_DA_API.nomeDoCabecalho.max}
                  onChange={(e) => setCabecalhos((atuais) => atuais.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                  placeholder="Accept-Version"
                  aria-label={t("Nome do cabeçalho")}
                  className="font-mono text-xs"
                />
                <Input
                  value={c.valor}
                  maxLength={LIMITES_DA_API.valorDoCabecalho.max}
                  onChange={(e) => setCabecalhos((atuais) => atuais.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  placeholder="2024-01"
                  aria-label={t("Valor do cabeçalho")}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("Remover cabeçalho")}
                  onClick={() => setCabecalhos((atuais) => atuais.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            {cabecalhos.length < LIMITES_DA_API.cabecalhos.max ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setCabecalhos((atuais) => [...atuais, { nome: "", valor: "" }])}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                {t("Adicionar cabeçalho")}
              </Button>
            ) : null}
          </div>
        </details>
      </fieldset>

      {/* ── 3. O que o agente preenche ──────────────────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("3. Dados que o agente preenche")}</legend>
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          {t("Cada campo vira um espaço que o agente completa antes de chamar. Sem campos, a chamada vai sem dados.")}
        </p>
        {campos.map((c, i) => (
          <div key={i} data-testid={`api-campo-${i}`} className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-[1fr_9rem_auto]">
            <div className="space-y-1">
              <Label htmlFor={`api-c-nome-${i}`} className="text-xs">
                {t("Nome do campo")}
              </Label>
              <Input
                id={`api-c-nome-${i}`}
                value={c.nome}
                maxLength={LIMITES_DA_FERRAMENTA.nomeDoParametro.max}
                onChange={(e) => atualizarCampo(i, { nome: e.target.value })}
                placeholder="numero"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`api-c-tipo-${i}`} className="text-xs">
                {t("Tipo")}
              </Label>
              <select
                id={`api-c-tipo-${i}`}
                className={CLASSE_DO_SELECT}
                value={c.tipo}
                onChange={(e) => atualizarCampo(i, { tipo: e.target.value as TipoDeParametro })}
              >
                {TIPOS_DE_PARAMETRO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {t(ROTULO_DO_TIPO[tipo])}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Remover campo")}
                onClick={() => setCampos((atuais) => atuais.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`api-c-desc-${i}`} className="text-xs">
                {t("O que o agente coloca aqui")}
              </Label>
              <Input
                id={`api-c-desc-${i}`}
                value={c.descricao}
                maxLength={LIMITES_DA_FERRAMENTA.descricaoDoParametro.max}
                onChange={(e) => atualizarCampo(i, { descricao: e.target.value })}
                placeholder={t("Ex.: Número do pedido que o cliente informou")}
              />
              <label className="mt-1 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-md border-border accent-primary"
                  checked={c.obrigatorio}
                  onChange={(e) => atualizarCampo(i, { obrigatorio: e.target.checked })}
                />
                {t("Obrigatório (o agente só chama com este campo preenchido)")}
              </label>
            </div>
            {/* Valores permitidos: lista para texto, faixa para número. */}
            {c.tipo === "texto" ? (
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={`api-c-opcoes-${i}`} className="text-xs">
                  {t("Valores permitidos (opcional, separados por vírgula)")}
                </Label>
                <Input
                  id={`api-c-opcoes-${i}`}
                  value={c.opcoes}
                  onChange={(e) => atualizarCampo(i, { opcoes: e.target.value })}
                  placeholder={t("Ex.: pago, cancelado, em separação")}
                  data-testid={`api-campo-opcoes-${i}`}
                />
              </div>
            ) : c.tipo === "numero" || c.tipo === "inteiro" ? (
              <div className="grid gap-2 sm:col-span-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`api-c-min-${i}`} className="text-xs">
                    {t("Mínimo permitido (opcional)")}
                  </Label>
                  <Input
                    id={`api-c-min-${i}`}
                    type="number"
                    step="any"
                    value={c.minimo}
                    onChange={(e) => atualizarCampo(i, { minimo: e.target.value })}
                    data-testid={`api-campo-minimo-${i}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`api-c-max-${i}`} className="text-xs">
                    {t("Máximo permitido (opcional)")}
                  </Label>
                  <Input
                    id={`api-c-max-${i}`}
                    type="number"
                    step="any"
                    value={c.maximo}
                    onChange={(e) => atualizarCampo(i, { maximo: e.target.value })}
                    data-testid={`api-campo-maximo-${i}`}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {campos.length < LIMITES_DA_FERRAMENTA.parametros.max ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="api-adicionar-campo"
            onClick={() =>
              setCampos((atuais) => [...atuais, { nome: "", tipo: "texto", descricao: "", obrigatorio: true, opcoes: "", minimo: "", maximo: "" }])
            }
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {t("Adicionar campo")}
          </Button>
        ) : null}
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">{t(opcaoExplicada("valores_permitidos").nome)}:</strong>{" "}
          {t(opcaoExplicada("valores_permitidos").oQueFaz)} {t(opcaoExplicada("valores_permitidos").exemplo)}
        </p>
      </fieldset>

      {/* ── 4. A segurança desta API ────────────────────────────────────────── */}
      <fieldset className="space-y-3" data-testid="seguranca-da-api">
        <legend className="text-sm font-semibold">{t("4. Segurança desta API")}</legend>
        <p className="max-w-[68ch] text-xs text-muted-foreground">
          {t("Tudo já vem na posição recomendada. Cada opção explica o que faz e o risco de mudar.")}
        </p>

        <OpcaoDeSeguranca id="efeito_e_aprovacao" fora={fora.includes("efeito_e_aprovacao")}>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="api-efeito"
                value="consulta"
                checked={efeito === "consulta"}
                onChange={() => {
                  setEfeito("consulta");
                  setEfeitoEscolhido(true);
                }}
                className="mt-1 accent-primary"
                data-testid="api-efeito-consulta"
              />
              <span>
                <strong>{t("Só consulta")}</strong> — {t("lê uma informação e devolve ao agente. Não muda nada lá.")}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="api-efeito"
                value="altera"
                checked={efeito === "altera"}
                disabled={opcoes.somente_consulta}
                onChange={() => {
                  setEfeito("altera");
                  setEfeitoEscolhido(true);
                }}
                className="mt-1 accent-primary"
                data-testid="api-efeito-altera"
              />
              <span>
                <strong>{t("Altera dados")}</strong> — {t("cria, muda ou apaga algo no outro sistema.")}
              </span>
            </label>
            {opcoes.somente_consulta ? (
              <p className="max-w-[68ch] text-xs text-info-fg" data-testid="api-aviso-somente-consulta">
                {t("A organização está em «somente consulta»: APIs que alteram dados não podem ser cadastradas. Um administrador muda isso em Segurança das APIs.")}
              </p>
            ) : null}
            {metodo !== "GET" && efeito === "consulta" ? (
              <p role="alert" className="max-w-[68ch] text-xs text-warning-fg" data-testid="api-aviso-efeito">
                {t("Esta operação costuma alterar dados. Marque «só consulta» apenas se tiver certeza de que ela não muda nada no outro sistema.")}
              </p>
            ) : null}

            <label className="flex items-start gap-2 pt-1 text-sm">
              <input
                type="checkbox"
                checked={pede}
                disabled={aprovacaoTravada}
                onChange={(e) => setPedirAprovacao(e.target.checked)}
                className="mt-1 h-4 w-4 rounded-md border-border accent-primary"
                data-testid="api-pedir-aprovacao"
              />
              <span>
                <strong>{t("Pedir aprovação")}</strong> — {t("o agente só executa depois que uma pessoa aprovar na Central de avisos, uma única vez.")}
              </span>
            </label>
            {aprovacaoTravada ? (
              <p className="max-w-[68ch] pl-6 text-xs text-info-fg" data-testid="api-aprovacao-travada">
                {t("A organização exige aprovação para toda ação que altera dados: esta chave não pode ser desligada aqui.")}
              </p>
            ) : null}
          </div>
        </OpcaoDeSeguranca>

        {pede ? (
          <OpcaoDeSeguranca id="validade_do_pedido" fora={false}>
            <div className="space-y-1.5">
              <Label htmlFor="api-validade" className="text-xs">
                {t("Se ninguém decidir, o pedido expira em (horas)")}
              </Label>
              <Input
                id="api-validade"
                type="number"
                inputMode="numeric"
                min={VALIDADE_DO_PEDIDO_HORAS.min}
                max={VALIDADE_DO_PEDIDO_HORAS.max}
                step={1}
                className="w-28"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                data-testid="api-validade"
              />
            </div>
          </OpcaoDeSeguranca>
        ) : null}

        <OpcaoDeSeguranca id="dados_do_contato_da_ferramenta" fora={false}>
          <div className="space-y-1">
            <div className="flex flex-wrap gap-4">
              {DADOS_DO_CONTATO.map((dado) => {
                const liberado = opcoes.dados_do_contato.includes(dado);
                return (
                  <label key={dado} className={`flex items-center gap-2 text-sm ${liberado ? "" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-md border-border accent-primary"
                      checked={dadosDoContato.includes(dado)}
                      disabled={!liberado && !dadosDoContato.includes(dado)}
                      onChange={(e) =>
                        setDadosDoContato((atuais) => (e.target.checked ? [...atuais, dado] : atuais.filter((d) => d !== dado)))
                      }
                      data-testid={`api-dado-${dado}`}
                    />
                    {t(ROTULO_DO_DADO_DO_CONTATO[dado])}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{`{{${MARCADOR_DO_CONTATO[dado]}}}`}</span>
                  </label>
                );
              })}
            </div>
            {DADOS_DO_CONTATO.some((d) => !opcoes.dados_do_contato.includes(d)) ? (
              <p className="max-w-[68ch] text-xs text-muted-foreground" data-testid="api-dados-nao-liberados">
                {t("Os dados em cinza não foram liberados pela organização. Um administrador libera em Segurança das APIs › Dados do contato que podem sair.")}
              </p>
            ) : null}
            <p className="max-w-[68ch] text-xs text-muted-foreground">
              {t("Depois de marcar, use o nome entre chaves duplas no endereço ou no modelo do corpo. No corpo «os campos», o dado vai sozinho.")}
            </p>
          </div>
        </OpcaoDeSeguranca>

        <OpcaoDeSeguranca id="campos_da_resposta" fora={false}>
          <div className="space-y-1">
            <Textarea
              value={camposDaResposta}
              onChange={(e) => setCamposDaResposta(e.target.value)}
              rows={3}
              placeholder={"status\nprevisao_de_entrega\ncliente.nome"}
              className="font-mono text-xs"
              aria-label={t("Informações da resposta que o agente lê, uma por linha")}
              data-testid="api-campos-da-resposta"
            />
            <p className="max-w-[68ch] text-xs text-muted-foreground">
              {t("Uma informação por linha, com o nome que aparece na resposta do outro sistema. Para algo que está dentro de outro, use ponto: cliente.nome. Em branco, o agente lê a resposta inteira (até 4.000 letras).")}
            </p>
          </div>
        </OpcaoDeSeguranca>

        <OpcaoDeSeguranca id="limite_de_uso" fora={fora.includes("limite_de_uso")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="api-limite-conversa" className="text-xs">
                {t("Por conversa, a cada 24 horas")} ({LIMITES_DA_API.limitePorConversa.min}–{LIMITES_DA_API.limitePorConversa.max})
              </Label>
              <Input
                id="api-limite-conversa"
                type="number"
                inputMode="numeric"
                className="w-28"
                value={limitePorConversa}
                disabled={semLimitePorConversa}
                onChange={(e) => setLimitePorConversa(e.target.value)}
                data-testid="api-limite-conversa"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-md border-border accent-primary"
                  checked={semLimitePorConversa}
                  onChange={(e) => setSemLimitePorConversa(e.target.checked)}
                  data-testid="api-sem-limite-conversa"
                />
                {t("Sem limite por conversa")}
              </label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-limite-dia" className="text-xs">
                {t("No total, a cada 24 horas")} ({LIMITES_DA_API.limitePorDia.min}–{LIMITES_DA_API.limitePorDia.max})
              </Label>
              <Input
                id="api-limite-dia"
                type="number"
                inputMode="numeric"
                className="w-28"
                value={limitePorDia}
                disabled={semLimitePorDia}
                onChange={(e) => setLimitePorDia(e.target.value)}
                data-testid="api-limite-dia"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-md border-border accent-primary"
                  checked={semLimitePorDia}
                  onChange={(e) => setSemLimitePorDia(e.target.checked)}
                  data-testid="api-sem-limite-dia"
                />
                {t("Sem limite por dia")}
              </label>
            </div>
          </div>
        </OpcaoDeSeguranca>

        <OpcaoDeSeguranca id="pausa_automatica" fora={fora.includes("pausa_automatica")}>
          <div className="space-y-1">
            <Label htmlFor="api-pausa" className="text-xs">
              {t("Pausar depois de quantas falhas seguidas")} ({LIMITES_DA_API.pausaAposFalhas.min}–{LIMITES_DA_API.pausaAposFalhas.max})
            </Label>
            <Input
              id="api-pausa"
              type="number"
              inputMode="numeric"
              className="w-28"
              value={pausaAposFalhas}
              disabled={semPausa}
              onChange={(e) => setPausaAposFalhas(e.target.value)}
              data-testid="api-pausa"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-md border-border accent-primary"
                checked={semPausa}
                onChange={(e) => setSemPausa(e.target.checked)}
                data-testid="api-sem-pausa"
              />
              {t("Nunca pausar sozinha")}
            </label>
          </div>
        </OpcaoDeSeguranca>

        <OpcaoDeSeguranca id="agentes_e_pausa" fora={false}>
          <p className="max-w-[68ch] text-sm text-muted-foreground">
            {t("Depois de salvar, abra a tela de um agente e marque esta API no grupo «Ferramentas externas». Para pausar, use o interruptor na lista de APIs.")}
          </p>
        </OpcaoDeSeguranca>
      </fieldset>

      {erro ? (
        <p role="alert" data-testid="erro-do-formulario-da-api" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={salvando} data-testid="salvar-api">
          {salvando ? t("Salvando…") : editando ? t("Salvar") : t("Cadastrar")}
        </Button>
      </DialogFooter>

      {/* Salvar com algo fora do recomendado: os riscos ANTES de salvar. */}
      <AlertDialog open={confirmando !== null} onOpenChange={(abrir) => (abrir ? null : setConfirmando(null))}>
        <AlertDialogContent data-testid="confirmar-risco-da-api">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Esta API vai ficar fora do recomendado")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {(confirmando ?? []).map((id) => {
                  const opcao = opcaoExplicada(id);
                  return (
                    <div key={id} className="space-y-1" data-testid={`risco-da-api-${id}`}>
                      <p className="font-medium text-foreground">{t(opcao.nome)}</p>
                      <p>
                        <strong>{t("Risco:")}</strong> {t(opcao.risco)}
                      </p>
                      <p>
                        <strong>{t("Recomendação:")}</strong> {t(opcao.recomendacao)}
                      </p>
                    </div>
                  );
                })}
                <p className="text-muted-foreground">
                  {t("Se você salvar assim, a API fica marcada como «Fora do recomendado» na lista e a mudança fica registrada com o seu nome.")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* O destaque é de quem VOLTA: o caminho fácil de clicar é o seguro. */}
            <AlertDialogCancel data-testid="voltar-e-ajustar" className={buttonVariants({ variant: "primary" })}>
              {t("Voltar e ajustar (recomendado)")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="salvar-mesmo-assim"
              className={buttonVariants({ variant: "outline" })}
              disabled={salvando}
              onClick={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              {salvando ? t("Salvando…") : t("Salvar mesmo assim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// ─── Testar de verdade ───────────────────────────────────────────────────────

type ResultadoDoTeste =
  | { ok: true; http_status: number; content: string; truncated: boolean; attempts: number; duration_ms: number; sent: unknown }
  | { ok: false; reason: string; message: string; http_status: number | null; attempts: number; duration_ms: number; sent: unknown };

export function TesteDaApiDialog({ ferramenta, onFechar }: { ferramenta: FerramentaExterna | null; onFechar: () => void }) {
  const t = useT();
  return (
    <Dialog open={ferramenta !== null} onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="teste-da-api">
        <DialogHeader>
          <DialogTitle>{t("Testar de verdade")}</DialogTitle>
          <DialogDescription>
            {t("Isto faz uma chamada real à API, com os dados de exemplo que você escrever. Nada é enviado a nenhum cliente.")}
          </DialogDescription>
        </DialogHeader>
        {ferramenta ? <CorpoDoTeste key={ferramenta.id} ferramenta={ferramenta} onFechar={onFechar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CorpoDoTeste({ ferramenta, onFechar }: { ferramenta: FerramentaExterna; onFechar: () => void }) {
  const t = useT();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [contato, setContato] = useState<Partial<Record<DadoDoContato, string>>>({});
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoTeste | null>(null);
  const dadosDoContato = ferramenta.api?.config.dados_contato ?? [];

  /** Os dados de exemplo no tipo que o campo declarou; vazio e opcional = não manda. */
  function argumentos(): Record<string, unknown> {
    const saida: Record<string, unknown> = {};
    for (const p of ferramenta.parameters) {
      const bruto = valores[p.nome] ?? "";
      if (p.tipo === "booleano") {
        if (bruto !== "") saida[p.nome] = bruto === "true";
        continue;
      }
      if (bruto.trim() === "") continue;
      saida[p.nome] = p.tipo === "texto" ? bruto : Number(bruto);
    }
    return saida;
  }

  async function executar() {
    setExecutando(true);
    setResultado(null);
    try {
      // Duas tentativas de até 8 s cada: o prazo do navegador precisa ser maior que o do servidor.
      const res = await apiClient.post<{ data: ResultadoDoTeste }>(
        `/api/v1/ai/api-tools/${ferramenta.id}/test`,
        { arguments: argumentos(), contact: contato },
        { timeoutMs: 45_000 },
      );
      setResultado(res.data);
    } catch (err) {
      showApiError(err);
    } finally {
      setExecutando(false);
    }
  }

  return (
    // `min-w-0`: o diálogo é uma grade, e uma resposta longa sem espaço empurrava a coluna para
    // além da borda — o botão «Fechar» saía da tela.
    <div className="min-w-0 space-y-4">
      <p className="text-sm font-medium">{ferramenta.name}</p>

      {ferramenta.effect === "altera" ? (
        <p role="alert" data-testid="api-aviso-altera-teste" className="rounded-md border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
          {t(
            "Esta API ALTERA dados no outro sistema. Chamar agora faz a alteração de verdade, com os dados de exemplo — sem pedir aprovação, porque quem clica aqui é você.",
          )}
        </p>
      ) : null}

      {ferramenta.parameters.length === 0 && dadosDoContato.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Esta API não tem campos: a chamada vai sem dados.")}</p>
      ) : (
        <div className="space-y-3">
          {ferramenta.parameters.map((p) => (
            <div key={p.nome} className="space-y-1">
              <Label htmlFor={`api-teste-${p.nome}`}>
                {p.nome}{" "}
                <span className="text-xs text-muted-foreground">
                  ({t(ROTULO_DO_TIPO[p.tipo])}
                  {p.obrigatorio ? `, ${t("obrigatório")}` : ""})
                </span>
              </Label>
              {p.tipo === "booleano" ? (
                <select
                  id={`api-teste-${p.nome}`}
                  className={CLASSE_DO_SELECT}
                  value={valores[p.nome] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.nome]: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="true">{t("Sim")}</option>
                  <option value="false">{t("Não")}</option>
                </select>
              ) : p.tipo === "texto" && p.opcoes && p.opcoes.length > 0 ? (
                <select
                  id={`api-teste-${p.nome}`}
                  className={CLASSE_DO_SELECT}
                  value={valores[p.nome] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.nome]: e.target.value }))}
                >
                  <option value="">—</option>
                  {p.opcoes.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`api-teste-${p.nome}`}
                  type={p.tipo === "texto" ? "text" : "number"}
                  step={p.tipo === "inteiro" ? 1 : "any"}
                  value={valores[p.nome] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.nome]: e.target.value }))}
                />
              )}
              <p className="text-xs text-muted-foreground">{p.descricao}</p>
            </div>
          ))}
          {dadosDoContato.map((dado) => (
            <div key={dado} className="space-y-1">
              <Label htmlFor={`api-teste-contato-${dado}`}>
                {t(ROTULO_DO_DADO_DO_CONTATO[dado])} <span className="text-xs text-muted-foreground">({t("dado do contato, de exemplo")})</span>
              </Label>
              <Input
                id={`api-teste-contato-${dado}`}
                value={contato[dado] ?? ""}
                onChange={(e) => setContato((c) => ({ ...c, [dado]: e.target.value }))}
                data-testid={`api-teste-contato-${dado}`}
              />
              <p className="text-xs text-muted-foreground">
                {t("Num atendimento real, o sistema preenche com o dado de quem está na conversa. Aqui, escreva um de exemplo.")}
              </p>
            </div>
          ))}
        </div>
      )}

      {resultado ? (
        <div
          role="status"
          data-testid="api-resultado-do-teste"
          data-ok={resultado.ok ? "sim" : "nao"}
          className={`min-w-0 space-y-2 overflow-hidden rounded-md border p-3 text-sm ${
            resultado.ok ? "border-success/40 bg-success-bg text-success-fg" : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {resultado.ok ? (
            <p>
              {t("Funcionou. O outro sistema respondeu")} {resultado.http_status} {t("em")} {resultado.duration_ms} ms.
            </p>
          ) : (
            <p>
              {t("Não funcionou.")} {resultado.message}
              {resultado.http_status ? ` (HTTP ${resultado.http_status})` : ""}
            </p>
          )}
          {resultado.ok ? (
            <div className="space-y-1 text-foreground">
              <p className="text-xs font-medium">
                {t("O que o agente vai ler")}
                {resultado.truncated ? ` (${t("cortado")})` : ""}:
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs [overflow-wrap:anywhere]" data-testid="api-conteudo-do-teste">
                {resultado.content || t("(resposta vazia)")}
              </pre>
            </div>
          ) : null}
          {resultado.sent ? (
            <details className="text-xs text-foreground" data-testid="api-enviado-no-teste">
              <summary className="cursor-pointer text-muted-foreground">{t("O que foi enviado (sem a chave de acesso)")}</summary>
              <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono [overflow-wrap:anywhere]">
                {JSON.stringify(resultado.sent, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Fechar")}
        </Button>
        <Button type="button" disabled={executando} onClick={() => void executar()} data-testid="api-executar-teste">
          {executando ? t("Chamando…") : ferramenta.effect === "altera" ? t("Executar de verdade") : t("Chamar agora")}
        </Button>
      </DialogFooter>
    </div>
  );
}

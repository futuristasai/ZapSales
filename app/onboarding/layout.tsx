import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { Trilha, type PassoDaTrilha } from "./_components/Trilha";
import { TITULO } from "./_components/fonte";
import { fonteDeTitulo } from "./fonte-de-titulo";
import { OutrasOrganizacoes } from "./_components/OutrasOrganizacoes";
import { SkipToEnd } from "./_components/SkipToEnd";
import { SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { marcaEhADoProduto } from "@/lib/branding";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { ICONE_DESENHADO, iconeDaAba } from "@/lib/branding/icone";
import { marcaDaSaida } from "@/lib/branding/saida";
import { baseDoStorage } from "@/lib/branding/logo";
import { passosVisiveis } from "@/lib/onboarding/passos";
import { AJUDA_DOS_PASSOS, textoDoPasso, textosDaCasca } from "@/lib/onboarding/ajuda";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // Acompanhamento observa a organização incompleta no shell com saída explícita.
  if (user.support) redirect("/app/inbox");
  // Sem organização o onboarding não tem o que mostrar — mas mandar para
  // `/login` fechava o círculo: quem entrasse de novo voltaria para cá. A saída
  // é a tela que CRIA a organização que falta.
  if (!activeOrg) redirect("/get-started");

  const { state, onboardedAt } = await loadOnboardingState(activeOrg.orgId);
  if (onboardedAt) redirect("/app/inbox");
  // A configuração inicial é de quem administra (as ações recusam os demais —
  // `requireOnboardingCtx`). Mostrar o assistente a quem não pode concluí-lo
  // seria uma tela em que todo botão falha; a espera tem tela própria, fora
  // deste layout e do de `/app`, para não haver laço entre os dois.
  if (!roleAtLeast(activeOrg.role, "admin")) redirect("/aguardando-administrador");

  // Os passos que ESTA instalação oferece, com o que já foi resolvido. A trilha
  // não decide mais nada sozinha — ela desenha o que recebe. "Pulado" vem do
  // estado gravado, nunca de a pessoa estar adiante: estar adiante não conclui
  // o que ficou para trás.
  const idioma = user.idioma;
  const casca = textosDaCasca(idioma);
  const passos: PassoDaTrilha[] = passosVisiveis().map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo,
    resumo: textoDoPasso(p.segmento, idioma)?.resumo ?? "",
    minutos: AJUDA_DOS_PASSOS[p.segmento]?.minutos ?? 0,
    estado: p.pulado(state) ? "pulado" : p.cumprido(state) ? "feito" : "pendente",
  }));

  const isDev = process.env.NODE_ENV !== "production";
  // Ícone pequeno de REFORÇO, nunca o logotipo completo: o nome já é escrito
  // como legenda ao lado (`marca.name`), então usar o logo inteiro aqui duplica
  // a marca em dois formatos ao mesmo tempo. `iconeDaAba` é a mesma resolução
  // de `app/icon.tsx` — arquivo subido em Marca › ícone da aba, com fallback
  // para o ladrilho desenhado quando não há upload.
  //
  // Sem ícone subido e sem marca própria, o `/icon` desenharia o símbolo do
  // produto num PNG sempre claro. Aí vale o SVG inline, que acompanha o tema:
  // a marca padrão não muda de cara. A condição é a MESMA de `app/icon.tsx`
  // (`marcaDaSaida(null)`, banco acima do `.env`). Nenhuma das duas lança.
  const linhaDaMarca = await marcaDaInstalacao();
  const iconeUrl = iconeDaAba(linhaDaMarca?.favicon_path, baseDoStorage());
  const marcaDoIcone = await marcaDaSaida(null);
  const simboloDoProduto =
    iconeUrl === ICONE_DESENHADO &&
    marcaEhADoProduto({ name: marcaDoIcone.nome, logoUrl: marcaDoIcone.logoUrl });

  return (
    <IdiomaProvider locale={user.idioma}>
      {/* A variável da fonte de título vive só aqui: o resto do app não carrega a Bricolage. O fundo
          ganha um véu da cor de destaque da marca no alto — calor sem competir com o formulário. */}
      <div
        className={`${fonteDeTitulo.variable} flex min-h-screen flex-col bg-background bg-[radial-gradient(70rem_28rem_at_70%_-6rem,color-mix(in_srgb,var(--primary)_9%,transparent),transparent)]`}
      >
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* O nome está escrito logo abaixo — o símbolo é reforço, não legenda. */}
              {simboloDoProduto ? (
                <SimboloDoProduto
                  nome={marcaDoIcone.nome}
                  decorativo
                  className="h-9 w-9 shrink-0"
                />
              ) : (
                // <img> em vez de next/image de propósito, mesmo motivo de
                // `components/shell/Sidebar.tsx`: a URL vem de quem hospeda (banco),
                // fora da allowlist de domínios fechada no build da imagem pré-buildada.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconeUrl}
                  alt=""
                  aria-hidden
                  decoding="async"
                  className="h-9 w-9 shrink-0 rounded-md object-contain"
                />
              )}
              <div className="min-w-0">
                <h1 className={`${TITULO} truncate text-lg leading-tight`}>{activeOrg.name}</h1>
                <p className="truncate text-xs text-muted-foreground">{marcaDoIcone.nome}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/*
                A SAÍDA, para quem tem outra organização. Ver o cabeçalho de
                `OutrasOrganizacoes`: sem ela, trocar de organização pelo seletor
                do topo levava a um wizard sem porta de volta — o layout de `/app`
                sai da árvore e leva o `TenantSwitcher` junto.
              */}
              <OutrasOrganizacoes
                outras={user.organizations
                  .filter((o) => o.organization_id !== activeOrg.orgId)
                  .map((o) => ({ id: o.organization_id, nome: o.organization_name }))}
              />
              {isDev ? <SkipToEnd /> : null}
            </div>
          </div>
        </header>

        {/*
          Duas colunas no computador: a trilha (onde estou, o que falta) e o passo.
          No celular a trilha vira a barra fixa no topo e o passo ocupa a largura toda.
        */}
        <div className="mx-auto grid w-full max-w-[84rem] flex-1 grid-cols-1 gap-x-12 px-0 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:px-6 lg:pt-10">
          <Trilha
            passos={passos}
            textos={{
              titulo: casca.trilha,
              navegacao: casca.navegacao,
              funcionario: casca.funcionario,
              emTreinamento: casca.emTreinamento,
              prontoParaAtender: casca.prontoParaAtender,
              passoDe: casca.passoDe,
              faltam: casca.faltam,
              faltamUm: casca.faltamUm,
              tudoMontado: casca.tudoMontado,
              progressoSalvo: casca.progressoSalvo,
              feito: casca.feito,
              pulado: casca.pulado,
              atual: casca.atual,
              chipMinutos: casca.chipMinutos,
            }}
          />
          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-0 lg:pt-0 lg:pb-16">{children}</main>
        </div>
      </div>
    </IdiomaProvider>
  );
}

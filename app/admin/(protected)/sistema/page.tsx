import { notFound } from "next/navigation";

import { LinhaDoRecurso } from "@/components/recursos-opcionais/LinhaDoRecurso";
import { loadAuthUser } from "@/lib/auth/server";
import { carregarComportamentoDaInstalacao } from "@/lib/instalacao/comportamento-servidor";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  RECURSOS_OPCIONAIS,
  ROTULO_DO_ESTADO,
  estadoDoRecurso,
  type EstadoDoRecurso,
} from "@/lib/recursos-opcionais/catalogo";
import { detectarServidor } from "@/lib/recursos-opcionais/estado";

import { ModulosManager } from "@/components/modulos/ModulosManager";
import { listarModulos } from "@/lib/modulos/service";

import { FormularioDeComportamento, FormularioDeModulos } from "./_form";
import { CabecalhoDaPlataforma } from "@/components/admin/CabecalhoDaPlataforma";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/sistema");

/** Para o que depende do servidor, a voz é "configurado", não "ligado". */
const ROTULO_NO_SERVIDOR: Record<EstadoDoRecurso, string> = {
  ...ROTULO_DO_ESTADO,
  ligado: "Configurado",
  desligado: "Não configurado",
  nao_verificado: "Não dá para ver daqui",
};
export const dynamic = "force-dynamic";

/**
 * A tela onde o dono da instalação decide COMO ela se comporta, sem SSH.
 *
 * ── O defeito que ela fecha (issue #1034) ───────────────────────────────────
 *
 * As chaves que decidem o comportamento de uma instalação JÁ EM OPERAÇÃO — o
 * kill switch do orçamento de IA, a exigência de assinatura no webhook do
 * canal, o modo do portão de divulgação e a camada semântica de promessa — só
 * existiam no `.env`: quem instalou a VPS era o único que conseguia mudá-las,
 * por SSH. É a decisão de produto escondida atrás de infraestrutura.
 *
 * ── Por que `/admin`, e não `/app/settings` ─────────────────────────────────
 *
 * O objeto é a INSTALAÇÃO inteira, não uma empresa. Num revendedor que hospeda
 * várias organizações, deixar o admin de um tenant desligar o bloqueio de gasto
 * mudaria o comportamento de TODOS os clientes daquele servidor. Mesmo
 * argumento de `/admin/cadastro`, `/admin/marca` e `/admin/google` — esta tela
 * é irmã das três, e usa o mesmo `traduzir`/`_form` das irmãs.
 *
 * ── Por que `notFound()`, e não `redirect('/403')` ──────────────────────────
 *
 * Para quem não administra a instalação, esta tela não faz parte do produto. O
 * layout de `(protected)` já roda `requirePlatformAdmin()`, então o gate abaixo
 * é redundante HOJE; ele fica porque a garantia precisa ser local, e um layout
 * pode ser movido. Mesma decisão, mesma frase, de `/admin/cadastro`.
 *
 * ── Por que ela virou "Recursos opcionais" (doc 80) ─────────────────────────
 *
 * Os módulos se ligavam aqui, e a porta se chamava "Comportamento": o
 * mantenedor procurou onde ligar recursos e não achou. Agora são três blocos —
 * Módulos, Comportamento e o que Depende do servidor (só leitura, detectado
 * pelos mesmos leitores das telas de cada recurso). Os dois primeiros continuam
 * gravando pelos formulários de sempre; a lista de recursos é
 * `lib/recursos-opcionais/catalogo.ts`.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();
  const idioma = usuario.idioma;

  // O valor EFETIVO (linha acima, `.env` como piso): a tela mostra o que está
  // valendo de verdade, e não o que a linha diria se ela existisse.
  const [comportamento, ligados, servidor] = await Promise.all([
    carregarComportamentoDaInstalacao(),
    modulosLigados(createAdminClient()),
    detectarServidor(),
  ]);
  const fontes = { modulos: ligados, settings: null, servidor };

  // Os módulos de TABELA (ADR-0002) se instalam aqui mesmo desde a issue #308 — era uma
  // tela própria (`/admin/modulos`, hoje só redirecionamento) com um item de menu para um
  // botão só. A leitura é a mesma do serviço de módulos, e a escrita continua sendo a de
  // sempre (`/api/v1/modulos/instalar` → `fn_modulo_instalar`). Leitura que falha não
  // derruba a tela: o bloco diz que não conseguiu ler, e o resto continua.
  const modulosDeTabela = await listarModulos().catch(() => null);
  const outrasChaves = RECURSOS_OPCIONAIS.filter(
    (r) => r.nivel === "instalacao" && !r.modulo && r.href !== "/admin/sistema",
  );
  const doServidor = RECURSOS_OPCIONAIS.filter((r) => r.nivel === "servidor");

  return (
    <div className="space-y-8">
      <CabecalhoDaPlataforma href="/admin/sistema" />

      <section id="modulos" className="scroll-mt-16 space-y-3" aria-labelledby="bloco-modulos">
        <h2 id="bloco-modulos" className="text-lg font-semibold">
          {traduzir("Módulos", idioma)}
        </h2>
        <FormularioDeModulos ligados={ligados} />
        {modulosDeTabela ? (
          <ModulosManager inicial={modulosDeTabela} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {traduzir(
              "Não consegui ler os módulos com tabela própria agora. Recarregue a página.",
              idioma,
            )}
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="bloco-comportamento">
        <h2 id="bloco-comportamento" className="text-lg font-semibold">
          {traduzir("Comportamento", idioma)}
        </h2>
        <FormularioDeComportamento inicial={comportamento} />
        <ul className="space-y-3">
          {outrasChaves.map((r) => {
            // Quem tem leitura (Marca, Quem pode criar conta — issue #308) mostra o estado
            // de verdade, o MESMO que o checklist do Painel lê; o resto segue "veja na tela".
            const estado = r.ler ? estadoDoRecurso(r, fontes) : "nao_verificado";
            return (
              <LinhaDoRecurso
                key={r.id}
                recurso={r}
                estado={estado}
                rotuloDoEstado={traduzir(
                  r.ler ? ROTULO_NO_SERVIDOR[estado] : "Veja na tela dele",
                  idioma,
                )}
                ajustar={r.href}
                idioma={idioma}
              />
            );
          })}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="bloco-servidor">
        <div className="space-y-1">
          <h2 id="bloco-servidor" className="text-lg font-semibold">
            {traduzir("Depende do servidor", idioma)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {traduzir(
              "Só leitura. Estes dependem de credencial ou do arquivo de ambiente do servidor. Nenhum valor de segredo aparece aqui.",
              idioma,
            )}
          </p>
        </div>
        <ul className="space-y-3">
          {doServidor.map((r) => {
            const estado = estadoDoRecurso(r, fontes);
            return (
              <LinhaDoRecurso
                key={r.id}
                recurso={r}
                estado={estado}
                rotuloDoEstado={traduzir(ROTULO_NO_SERVIDOR[estado], idioma)}
                ajustar={r.href}
                idioma={idioma}
              />
            );
          })}
        </ul>
      </section>
    </div>
  );
}

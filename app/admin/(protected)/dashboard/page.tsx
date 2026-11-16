import { notFound } from "next/navigation";
import { Suspense } from "react";

import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";
import { loadAuthUser } from "@/lib/auth/server";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { checklistDaInstalacao } from "@/lib/recursos-opcionais/checklist";
import { detectarServidor } from "@/lib/recursos-opcionais/estado";
import { createAdminClient } from "@/lib/supabase/admin";
import { detalhesDaLicenca } from "@/lib/licenca/situacao";
import { saudeDaInstalacaoAgora } from "@/lib/saude/painel";
import type { ChecklistVisto } from "@/components/admin/dashboard/ChecklistDaInstalacao";
import {
  CartaoDaLicenca,
  type LicencaNoPainel,
} from "@/components/admin/dashboard/CartaoDaLicenca";
import {
  LicencaCarregando,
  SaudeCarregando,
  SaudeDaInstalacao,
} from "@/components/admin/dashboard/SaudeDaInstalacao";

import { DashboardClient } from "./_client";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/dashboard");
export const dynamic = "force-dynamic";

/**
 * O Painel da administração (issue #308). Os números continuam vindo do cliente (a
 * cada 30 s, pela rota de KPIs); o checklist "Sua instalação está pronta?" é calculado
 * AQUI, no servidor, com as MESMAS leituras de Recursos opcionais (`detectarServidor`,
 * `modulosLigados`) — nenhum segredo sai daqui, só "feito" ou "falta" por item.
 *
 * A saúde da instalação e o cartão da licença (issue #310) também são lidos aqui, cada um
 * no seu `Suspense`: as sondas têm teto de 3 s, e o Painel não espera por elas para mostrar
 * o checklist e os números.
 *
 * O gate local repete o do layout de `(protected)` de propósito, como em
 * `/admin/sistema`: esta página usa o cliente de serviço, e a garantia precisa
 * morar aqui — um layout pode ser movido.
 */
export default async function AdminDashboardPage() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();
  const [servidor, modulos] = await Promise.all([
    detectarServidor(),
    modulosLigados(createAdminClient()).catch(() => null),
  ]);
  const calculado = checklistDaInstalacao({ modulos, settings: null, servidor });
  const checklist: ChecklistVisto = {
    ...calculado,
    itens: calculado.itens.map((i) => ({
      id: i.recurso.id,
      nome: i.recurso.nome,
      oQueFaz: i.recurso.oQueFaz,
      href: i.recurso.href ?? "/admin/sistema",
      nivel: i.nivel,
      estado: i.estado,
      feito: i.feito,
    })),
  };
  return (
    <DashboardClient
      checklist={checklist}
      saude={
        <Suspense fallback={<SaudeCarregando />}>
          <BlocoDaSaude />
        </Suspense>
      }
      licenca={
        <Suspense fallback={<LicencaCarregando />}>
          <BlocoDaLicenca />
        </Suspense>
      }
    />
  );
}

/** As mesmas sondas do `/api/v1/health`, mais a fila — sem endereço nem segredo. */
async function BlocoDaSaude() {
  return <SaudeDaInstalacao saude={await saudeDaInstalacaoAgora()} />;
}

/** A mesma leitura da tela de licença, recortada ao que o Painel mostra. Nunca lança. */
async function BlocoDaLicenca() {
  const detalhes = await detalhesDaLicenca().catch(() => null);
  const licenca: LicencaNoPainel | null = detalhes
    ? {
        estado: detalhes.estado,
        opera: detalhes.opera,
        diasRestantes: detalhes.diasRestantes,
        modo: detalhes.modo,
        ativadaEm: detalhes.ativadaEm,
        ultimaConsultaOkEm: detalhes.ultimaConsultaOkEm,
      }
    : null;
  return <CartaoDaLicenca licenca={licenca} />;
}

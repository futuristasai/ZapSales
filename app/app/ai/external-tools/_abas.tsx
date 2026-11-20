"use client";
/**
 * As três formas de dar ferramenta externa ao agente: a API pronta de outro sistema (#372), o
 * webhook que você cadastra (#94, #95) e as ferramentas de um servidor MCP de terceiro (#96). Uma
 * tela só, uma porta só: quem procura «ferramentas externas» acha as três, e o aviso da Central
 * leva à aba certa.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";

import { ApisClient } from "./_apis";
import { FerramentasExternasClient } from "./_client";
import { ServidoresMcpClient } from "./_mcp";

export function AbasDeFerramentas({
  inicial,
  souAdmin,
  abaInicial,
}: {
  inicial: FerramentaExterna[];
  souAdmin: boolean;
  abaInicial: "webhooks" | "mcp" | "apis";
}) {
  const t = useT();
  return (
    <Tabs defaultValue={abaInicial} className="space-y-4">
      <TabsList aria-label={t("Tipos de ferramenta externa")}>
        <TabsTrigger value="webhooks" data-testid="aba-webhooks">
          {t("Webhooks")}
        </TabsTrigger>
        <TabsTrigger value="apis" data-testid="aba-apis">
          {t("APIs")}
        </TabsTrigger>
        <TabsTrigger value="mcp" data-testid="aba-mcp">
          {t("Servidores MCP")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="webhooks">
        <FerramentasExternasClient inicial={inicial} />
      </TabsContent>
      <TabsContent value="apis">
        <ApisClient souAdmin={souAdmin} />
      </TabsContent>
      <TabsContent value="mcp">
        <ServidoresMcpClient souAdmin={souAdmin} />
      </TabsContent>
    </Tabs>
  );
}

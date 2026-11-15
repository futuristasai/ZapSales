import { ChatCircle } from "@/lib/ui/icons";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";
import { CabecalhoDaPlataforma } from "@/components/admin/CabecalhoDaPlataforma";
import { metadadosDaTelaDoAdmin } from "@/lib/admin/metadados";

export const generateMetadata = metadadosDaTelaDoAdmin("/admin/inbox");

/**
 * O painel da direita quando nenhuma conversa está aberta. É aqui que mora o
 * cabeçalho padrão (issue #308): a lista da esquerda vem do `layout.tsx`, e
 * repetir o cabeçalho em cada conversa aberta roubaria altura da leitura.
 */
export default async function AdminInboxIndexPage() {
  const { user } = await requirePlatformAdmin();
  const idioma = normalizarIdioma((user.user_metadata?.locale as string | undefined) ?? null);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <CabecalhoDaPlataforma href="/admin/inbox" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <ChatCircle size={40} weight="duotone" className="opacity-40" aria-hidden />
        <p className="text-sm font-medium">
          {traduzir("Selecione uma conversa para visualizar", idioma)}
        </p>
        <p className="max-w-xs text-xs opacity-70">
          {traduzir(
            "Modo somente-leitura. Para responder como atendente, abra a organização e use “Acompanhar organização”.",
            idioma,
          )}
        </p>
      </div>
    </div>
  );
}

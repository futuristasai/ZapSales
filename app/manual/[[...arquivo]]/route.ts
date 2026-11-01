import { readFile } from "node:fs/promises";

import { createClient } from "@/lib/supabase/server";
import { resolverArquivoDoManual } from "@/lib/manual/arquivo";

/**
 * GET /manual/index.html — o manual do usuário, dentro da própria instalação.
 *
 * Só para quem está logado, de qualquer papel. A autenticação é feita AQUI e
 * não só no `proxy`: o matcher dele deixa passar caminho que termina em `.png`,
 * e é por esse caminho que as imagens do manual chegam — sem a checagem abaixo
 * os prints (que mostram telas reais de uma empresa de demonstração) seriam
 * públicos. `getUser()` e nunca `getSession()`, como em todo o backend.
 *
 * Não há escrita nem dado de organização: ler arquivo de disco não é mutação,
 * então não audita e não passa por `requireSupportWrite`.
 *
 * O endereço de entrada é `/manual/index.html` (e `/manual` redireciona para
 * ele) porque o manual referencia as imagens por caminho relativo (`img/x.png`):
 * em `/manual` sem barra final o navegador as procuraria em `/img/x.png`.
 */
export const dynamic = "force-dynamic";

const ENTRADA = "/manual/index.html";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ arquivo?: string[] }> },
): Promise<Response> {
  const { arquivo: segmentos } = await params;

  if (!segmentos || segmentos.length === 0) {
    // Location relativa de propósito: atrás do proxy (Caddy/Traefik) o host que o
    // Next enxerga é o interno, e uma URL absoluta montada daqui apontaria para ele.
    return new Response(null, { status: 308, headers: { Location: ENTRADA } });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return segmentos[0] === "index.html"
      ? new Response(null, { status: 307, headers: { Location: "/login" } })
      : new Response("Entre para ver o manual.", { status: 401 });
  }

  const alvo = resolverArquivoDoManual(segmentos);
  if (!alvo) return new Response("Não encontrado.", { status: 404 });

  try {
    const conteudo = await readFile(alvo.caminho);
    return new Response(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": alvo.tipo,
        // `private`: o conteúdo só vale para quem está logado, e um cache
        // compartilhado (CDN, proxy) não pode guardá-lo para outra pessoa.
        "Cache-Control": `private, max-age=${alvo.segundosDeCache}`,
      },
    });
  } catch {
    return new Response("O manual não está disponível nesta instalação.", { status: 404 });
  }
}

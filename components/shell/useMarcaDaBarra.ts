"use client";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";

/**
 * A marca que a navegação mostra — a MESMA para a faixa do computador e para o
 * a marca no topo do celular (`TopBar`), por isso mora aqui e não em um dos dois.
 *
 * O CONSUMIDOR do nome por organização. Sem ele, `settings.branding.app_name`
 * seria campo decorativo: medido, o nome da org não aparece em lugar nenhum da
 * casca para o cliente típico de um revendedor — o único outro leitor é o
 * `TenantSwitcher`, e ele devolve `null` com uma organização só.
 *
 * A marca da INSTALAÇÃO continua embaixo: a organização que não definiu nome vê
 * exatamente o que via antes. O que mudou é POR ONDE ela chega — era
 * `branding()`, que no navegador lê `window.__PUBLIC_ENV__` e no servidor lê
 * `process.env`, e essas duas fontes passaram a divergir quando o layout raiz
 * começou a injetar a marca do BANCO. Divergência entre SSR e cliente aqui não é
 * detalhe: com logo no banco e `APP_LOGO_URL` vazio, o servidor desenhava o
 * `<span>` e o cliente desenhava o `<img>` — React #418 em toda tela. Hoje a
 * marca vem por PROP do servidor (`useMarcaDaInstalacao`), pela mesma rota de
 * `activeOrg`, e os dois lados leem o mesmo objeto por construção.
 */
export function useMarcaDaBarra() {
  const brand = useMarcaDaInstalacao();
  const { activeOrg } = useAuth();
  const nome = activeOrg?.marca?.nome ?? brand.name;
  /**
   * O mesmo desenho para o LOGO — e é este par de linhas que fecha o caminho do
   * `logo_url` gravado até a tela.
   *
   * `||` e não `??`: vazio é AUSÊNCIA de logo, não "logo em branco". É a regra
   * que `resolveBranding` e `primeiroDefinido` já aplicam nas camadas de baixo, e
   * com `??` um `""` vindo de cima apagaria o logo do revendedor em vez de
   * descer para ele — que é o contrário do que a precedência por campo promete.
   */
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  const logoEscuro =
    activeOrg?.marca?.logoDarkUrl !== undefined
      ? activeOrg.marca.logoDarkUrl
      : activeOrg?.marca?.logoUrl
        ? null
        : brand.logoDarkUrl;
  // Só quando NINGUÉM — nem a instalação, nem a organização — pôs marca própria:
  // é a condição de `lib/branding.ts`, avaliada sobre o que a barra vai mostrar.
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });
  // Só o da INSTALAÇÃO, e só quando a organização não pôs logo próprio: com logo da
  // organização, o ícone do revendedor seria a marca errada naquela casca.
  const icone = activeOrg?.marca?.logoUrl ? null : (brand.iconUrl ?? null);
  return { nome, logo, logoEscuro, marcaDoProduto, icone, inicial: brand.initial };
}

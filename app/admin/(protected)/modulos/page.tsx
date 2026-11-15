import { permanentRedirect } from "next/navigation";

/**
 * O ENDEREÇO ANTIGO DOS MÓDULOS (issue #308, história 27).
 *
 * Instalar módulo com tabela própria (ADR-0002) passou a morar no bloco Módulos de
 * Recursos opcionais: esta tela ocupava um item inteiro do menu para um botão só. O
 * endereço continua valendo para favoritos e mensagens antigas, e leva direto ao bloco.
 * Declarado em `REDIRECIONAMENTOS_DO_ADMIN` (`lib/admin/catalogo.ts`), que é o que
 * deixa a cerca de porta no menu aceitar uma tela de primeiro nível sem item.
 */
export default function Page() {
  permanentRedirect("/admin/sistema#modulos");
}

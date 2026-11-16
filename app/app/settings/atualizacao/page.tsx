import { permanentRedirect } from "next/navigation";

/**
 * O ENDEREÇO ANTIGO DA ATUALIZAÇÃO (issue #311). A tela foi para a
 * administração da instalação (`/admin/atualizacao`), no grupo "Configurar a
 * instalação": atualizar o servidor vale para todas as empresas, e não é
 * configuração da empresa. O endereço continua valendo para favoritos e para o
 * rodapé de versão de uma aba antiga.
 */
export default function Page() {
  permanentRedirect("/admin/atualizacao");
}

/**
 * A busca da tabela "escolher pessoas do CRM" — puro: devolve o texto do `.or()` do PostgREST.
 *
 * Procura por NOME, TELEFONE, E-MAIL e ETIQUETA. As regras de segurança são as da busca da tela
 * de Contatos (`app/api/v1/contacts/_handler.ts`), de propósito: o piso de dois caracteres, o
 * curinga digitado virando literal, o parêntese que derrubaria o `.or()` inteiro. Esta função
 * não busca por CPF — não há por que uma tela de campanha descobrir quem tem um CPF.
 *
 * ⚠️ Duas gramáticas, uma dentro da outra: o termo vai dentro do `or=` do PostgREST, e a
 * etiqueta vai como literal de array dentro dele. Quem escreve esse escape à mão erra; por isso
 * a etiqueta passa por `arrayDeUmValorParaOr`.
 */
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { arrayDeUmValorParaOr } from "@/lib/inbox/marcador-da-conversa";
import { buscaValeConsulta, normalizarTermoDeBusca } from "@/lib/inbox/termo-de-busca";

/**
 * O `or=` da busca, ou `null` quando o termo é curto demais para valer uma consulta.
 *
 * `null` NÃO quer dizer "sem filtro": quem recebe `null` para uma busca digitada devolve lista
 * vazia. Lista inteira sob busca não é resposta, é ruído que parece resposta.
 */
export function condicaoDaBuscaDeContato(digitado: string): string | null {
  // Os parênteses saem ANTES da régua: são delimitador do DSL do `.or()`.
  const termo = digitado.replace(/[()]/g, " ");
  if (!buscaValeConsulta(termo)) return null;

  const s = normalizarTermoDeBusca(termo).replace(/[%_]/g, (m) => `\\${m}`);
  const partes = [
    `name.ilike.%${s}%`,
    // `display_name` é o nome que a tela mostra: contato que entra pelo WhatsApp nasce só com ele.
    `display_name.ilike.%${s}%`,
    `email.ilike.%${s}%`,
    `phone_number.ilike.%${s}%`,
    // Etiqueta é igualdade exata, não parte do texto.
    `tags.cs.${arrayDeUmValorParaOr(digitado.trim())}`,
  ];

  const digitos = digitado.replace(/\D/g, "");
  if (digitos.length >= 8) {
    // 10/11 dígitos sem o 55 é DDD + número: sem o código do país a variante com o 9 não nasce
    // e o cadastro `+5532984793302` some da busca por `3284793302`.
    const base =
      !digitos.startsWith("55") && (digitos.length === 10 || digitos.length === 11)
        ? `55${digitos}`
        : digitos;
    for (const variante of phoneLookupVariants(base)) {
      const d = variante.replace(/\D/g, "");
      if (d && d !== digitos) partes.push(`phone_number.ilike.%${d}%`);
    }
  }
  return partes.join(",");
}

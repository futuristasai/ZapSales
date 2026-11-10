/**
 * Os comandos que as telas mandam rodar no servidor para atualizar (#173).
 *
 * Existe um só caminho de atualização, e ele é o da instalação: rodar o
 * `kit/obter.sh` de novo. Ele traz a versão nova, reaplica o schema e o
 * `kit/instalar.sh` faz o resto, com backup antes (docs/runbooks/instalacao-vps-limpa.md,
 * seção "Atualizar"). Não existe `kit/update.sh`, e nem o `obter.sh` nem o
 * `instalar.sh` aceitam `--to` ou `--force`: quem fixa a versão é a variável
 * `ZAPSALES_REF` (documentada no cabeçalho do `obter.sh`).
 *
 * Quem cobra que isto continue verdade é `tests/unit/comandos-de-atualizacao.test.ts`,
 * que lê o `kit/` em vez de acreditar neste comentário.
 *
 * Módulo puro (sem `server-only` nem React): é usado por uma tela de servidor
 * (Admin › Cadastro) e por uma de cliente (Configurações › Atualização).
 */

/** Onde o `obter.sh` é publicado (o mesmo endereço do guia de instalação). */
export const ENDERECO_DO_OBTER = "https://zapinstalador.futuristas.app/obter.sh";

/** Atualiza para a última versão publicada. Roda de qualquer pasta, como root. */
export const COMANDO_DE_ATUALIZAR = `curl -fsSL ${ENDERECO_DO_OBTER} | sudo bash`;

/** Tira o "v" das versões: a tela fala "1.1.0", não "v1.1.0". */
export function semV(versao: string | undefined): string {
  return (versao ?? "").replace(/^v/i, "");
}

/**
 * O comando que RESOLVE depois de uma tentativa fracassada — e resolver aqui é
 * voltar para a versão que funcionava, não reinstalar a que acabou de quebrar.
 *
 * O código do servidor já está na versão nova (a troca acontece antes de o app
 * subir): o comando sem versão levaria de novo à última release, que é
 * exatamente a que quebrou. Por isso, quando se sabe para onde voltar, o
 * comando fixa a versão com `ZAPSALES_REF`.
 *
 * Só aponta para trás quando sabe para onde: `from_version` pode ser uma marca
 * de desenvolvimento (instalação fora de release), e aí não existe versão
 * publicada com esse nome — nesse caso, o comando de atualizar.
 */
export function comandoDeVolta(fromVersion: string | undefined): string {
  const anterior = semV(fromVersion);
  return /^\d+\.\d+\.\d+$/.test(anterior)
    ? `curl -fsSL ${ENDERECO_DO_OBTER} | sudo ZAPSALES_REF=v${anterior} bash`
    : COMANDO_DE_ATUALIZAR;
}

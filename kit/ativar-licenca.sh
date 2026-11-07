#!/usr/bin/env bash
# kit/ativar-licenca.sh — ativa a licença de uma instalação que ficou em "ativação pendente".
#
#   sudo kit/ativar-licenca.sh
#
# Com terminal ele pergunta o e-mail da compra e o código da transação (o código não aparece na tela).
# Sem terminal (instalação automática), lê as variáveis ZAPSALES_LICENCA_EMAIL e
# ZAPSALES_LICENCA_TRANSACAO — mas ATENÇÃO: `sudo VAR=valor …` deixa o valor visível no `ps` e no
# histórico de quem digitou. O caminho que não vaza é o arquivo /etc/zapsales/licenca-compra (modo 600,
# duas linhas: e-mail e código), que o kit lê e apaga. Os dados não vão para o .env nem para o log.
# Rodar de novo é seguro: instalação já ativada não pede nada. Sai com 0 se a licença está ativa e
# com 1 se ainda está pendente.
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$KIT")"
# shellcheck source=lib/comum.sh
. "$KIT/lib/comum.sh"
# shellcheck source=lib/stack.sh
. "$KIT/lib/stack.sh"
# shellcheck source=lib/licenca.sh
. "$KIT/lib/licenca.sh"

ESTADO=/etc/zapsales
LOGS=/var/log/zapsales

exigir_root
mkdir -p "$LOGS"
# O mesmo cadeado do instalador: não ativa no meio de uma instalação ou atualização.
exec 9>/run/zapsales-kit.lock
flock -n 9 || falha "Outra execução do kit está em andamento."
[ -f "$RAIZ/.env" ] || falha "Não achei o .env em $RAIZ — rode primeiro o kit/instalar.sh."
servico_saudavel worker || falha "O worker não está de pé. Veja: cd $RAIZ && docker compose ps"

ativar_licenca_da_compra
[ "$LICENCA_RC" -eq 0 ]

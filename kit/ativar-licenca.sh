#!/usr/bin/env bash
# kit/ativar-licenca.sh — ativa a licença de uma instalação que ficou em "ativação pendente".
#
#   sudo kit/ativar-licenca.sh
#   sudo ZAPSALES_LICENCA_EMAIL=voce@empresa.com ZAPSALES_LICENCA_TRANSACAO=HP... kit/ativar-licenca.sh
#
# Com terminal ele pergunta o e-mail da compra e o código da transação (o código não aparece na tela).
# Sem terminal, lê as duas variáveis. Os dados nunca vão na linha de comando nem para o .env.
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
[ -f "$RAIZ/.env" ] || falha "Não achei o .env em $RAIZ — rode primeiro o kit/instalar.sh."
servico_saudavel worker || falha "O worker não está de pé. Veja: cd $RAIZ && docker compose ps"

ativar_licenca_da_compra
[ "$LICENCA_RC" -eq 0 ]

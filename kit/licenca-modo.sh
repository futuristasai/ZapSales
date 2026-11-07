#!/usr/bin/env bash
# kit/licenca-modo.sh — mostra ou troca o modo da trava de licença desta instalação.
#
#   sudo kit/licenca-modo.sh            mostra o modo em vigor
#   sudo kit/licenca-modo.sh valendo    a trava passa a recusar (fase «Ligar», ADR-0005)
#   sudo kit/licenca-modo.sh sombra     a trava volta a só observar (o padrão)
#
# Sai com 0 se deu certo, 1 se não foi possível e 2 se o argumento é inválido.
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$KIT")"
# shellcheck source=lib/comum.sh
. "$KIT/lib/comum.sh"
# shellcheck source=lib/stack.sh
. "$KIT/lib/stack.sh"
# shellcheck source=lib/licenca.sh
. "$KIT/lib/licenca.sh"

LOGS=/var/log/zapsales

exigir_root
mkdir -p "$LOGS"
[ -f "$RAIZ/.env" ] || falha "Não achei o .env em $RAIZ — rode primeiro o kit/instalar.sh."
exec 9>/run/zapsales-kit.lock
flock -n 9 || falha "Outra execução do kit está em andamento."
if [ -n "${1:-}" ]; then
  servico_saudavel worker || falha "O worker não está de pé. Veja: cd $RAIZ && docker compose ps"
fi

rc=0
definir_modo_da_licenca "${1:-}" || rc=$?
exit "$rc"

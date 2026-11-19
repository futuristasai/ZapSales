#!/usr/bin/env bash
# Gate de `aplicar_schema` (kit/lib/stack.sh): a falha do baseline NÃO some.
#
# O defeito, medido em produção em 19/11/2026: a atualização das 23h27 reaplicou
# o baseline com o app em uso, o banco escolheu a sessão do kit como vítima de
# um deadlock, e o `psql` parou no meio do arquivo. O kit seguiu, subiu o app e
# escreveu "Pronto". O banco ficou meio atualizado — duas sobrecargas de
# `fn_comando_da_conversa`, chamada ambígua — e a caixa de conversas respondeu
# "Erro interno" por dez horas, com a implantação marcada como sucesso.
#
# Duas causas, e este arquivo cobra as duas:
#
# 1. FALHA ENGOLIDA. `aplicar_schema || falha "…"` chama a função num contexto
#    em que o bash DESLIGA o `set -e` dentro dela. O `psql` do baseline falhava,
#    os dois comandos seguintes davam certo, e a função devolvia o código do
#    ÚLTIMO: zero. O `|| falha` nunca disparava. Cada passo agora devolve a
#    própria falha, e o teste chama a função do mesmo jeito que o kit chama.
# 2. DEADLOCK É PASSAGEIRO, E O BASELINE É IDEMPOTENTE. Quando o banco desiste
#    por disputa com o app, rodar de novo é o conserto — e parar ali deixa o
#    schema no meio do caminho, que é pior do que qualquer um dos dois lados.
#    Erro de outro tipo NÃO é tentado de novo: defeito do arquivo se repete, e
#    repetir só triplica o barulho na tela de quem instala.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { # nome esperado obtido
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi
}

# shellcheck source=/dev/null
. kit/lib/comum.sh
# shellcheck source=/dev/null
. kit/lib/stack.sh

# Uma instalação de mentira: `.env`, um baseline com marcador e o SQL do worker.
RAIZ="$TMP/instalacao"
mkdir -p "$RAIZ/supabase" "$RAIZ/kit/sql"
printf 'INTEGRATIONS_OAUTH_ENCRYPTION_KEY=chave\nAGENT_WORKER_DB_PASSWORD=senha\n' > "$RAIZ/.env"
printf -- '-- BASELINE-DE-TESTE\nselect 1;\n' > "$RAIZ/supabase/baseline.sql"
printf -- '-- PAPEL-DO-WORKER\n' > "$RAIZ/kit/sql/papel-do-worker.sql"

# O `psql` de mentira. Lê a entrada como o de verdade, reconhece o baseline pelo
# marcador e obedece ao ROTEIRO: uma palavra por chamada do baseline —
#   ok        aplica
#   deadlock  o banco desiste por disputa (mensagem real do Postgres, código 3)
#   defeito   erro do próprio arquivo (código 3)
# Depois do fim do roteiro, toda chamada aplica. Os outros passos sempre dão
# certo: é exatamente a condição em que a falha do baseline era engolida.
ROTEIRO="$TMP/roteiro"
CHAMADAS="$TMP/chamadas"
DEPOIS="$TMP/depois"
psql_falso() {
  local entrada passo
  entrada="$(cat)"
  case "$entrada" in
    *BASELINE-DE-TESTE*)
      echo x >> "$CHAMADAS"
      passo="$(sed -n "$(wc -l < "$CHAMADAS" | tr -d ' ')p" "$ROTEIRO")"
      case "$passo" in
        deadlock)
          printf 'ERROR:  deadlock detected\nDETAIL:  Process 1 waits for AccessExclusiveLock on relation 18202 of database 5; blocked by process 2.\n' >&2
          return 3 ;;
        defeito)
          printf 'ERROR:  column "nao_existe" does not exist\n' >&2
          return 3 ;;
      esac ;;
    *) echo x >> "$DEPOIS" ;;
  esac
  return 0
}
psql_db()    { psql_falso; }
psql_admin() { psql_falso; }
BASELINE_ESPERA_S=0

# rodar ROTEIRO... — chama `aplicar_schema` COMO O KIT CHAMA (`|| …`, o contexto
# que desliga o `set -e` dentro da função) e imprime "código chamadas-do-baseline".
rodar() {
  printf '%s\n' "$@" > "$ROTEIRO"
  : > "$CHAMADAS"; : > "$DEPOIS"
  local codigo=0
  aplicar_schema >/dev/null 2>"$TMP/erros" || codigo=$?
  printf '%s %s' "$codigo" "$(wc -l < "$CHAMADAS" | tr -d ' ')"
}

echo "baseline que aplica de primeira"
igual "sucesso, uma passada só" "0 1" "$(rodar ok)"

echo "falha do baseline não é engolida pelos passos seguintes"
r="$(rodar defeito)"
igual "aplicar_schema devolve falha mesmo com os passos seguintes dando certo" "falhou" \
  "$([ "${r%% *}" != "0" ] && echo falhou || echo engoliu)"
igual "defeito do arquivo não é tentado de novo" "1" "${r##* }"
# Controle da contagem: sem falha, os TRÊS outros passos rodam (extensões antes
# do baseline; semente da chave e papel do worker depois). Com falha, só o de antes.
rodar ok >/dev/null
igual "controle: sem falha, os três outros passos rodam" "3" "$(wc -l < "$DEPOIS" | tr -d ' ')"
rodar defeito >/dev/null
igual "depois da falha, a semente e o papel do worker não rodam" "1" "$(wc -l < "$DEPOIS" | tr -d ' ')"
rodar defeito >/dev/null
igual "o erro do banco chega à tela" "1" "$(grep -c 'does not exist' "$TMP/erros")"

echo "deadlock: o baseline é idempotente, então roda de novo"
igual "um deadlock e depois aplica: sucesso na segunda passada" "0 2" "$(rodar deadlock ok)"
igual "dois deadlocks e depois aplica: sucesso na terceira" "0 3" "$(rodar deadlock deadlock ok)"
r="$(rodar deadlock deadlock deadlock ok)"
igual "deadlock que insiste: desiste na terceira e devolve falha" "falhou 3" \
  "$([ "${r%% *}" != "0" ] && echo falhou || echo engoliu) ${r##* }"
rodar deadlock ok >/dev/null
igual "a nova tentativa é avisada na tela" "1" "$(grep -c 'de novo' "$TMP/erros")"
r="$(rodar deadlock defeito ok)"
igual "deadlock seguido de defeito: para no defeito" "falhou 2" \
  "$([ "${r%% *}" != "0" ] && echo falhou || echo engoliu) ${r##* }"

echo "o que é passageiro"
printf 'ERROR:  deadlock detected\n' > "$TMP/e1"
printf 'psql:<stdin>:6941: ERROR:  deadlock detected\nCONTEXT:  SQL statement "drop policy if exists x on public.y"\n' > "$TMP/e2"
printf 'ERROR:  relation "x" does not exist\n' > "$TMP/e3"
printf 'NOTICE:  extension "vector" already exists, skipping\n' > "$TMP/e4"
igual "deadlock é passageiro" "sim" "$(erro_passageiro_do_banco "$TMP/e1" && echo sim || echo nao)"
igual "deadlock com prefixo do psql é passageiro" "sim" "$(erro_passageiro_do_banco "$TMP/e2" && echo sim || echo nao)"
igual "erro de schema não é passageiro" "nao" "$(erro_passageiro_do_banco "$TMP/e3" && echo sim || echo nao)"
igual "aviso sem erro não é passageiro" "nao" "$(erro_passageiro_do_banco "$TMP/e4" && echo sim || echo nao)"

echo "o kit chama aplicar_schema de um jeito que a falha alcança"
# A restauração chamava `aplicar_schema` solto, dentro de uma função: basta
# alguém chamar ESSA função com `||` para o `set -e` sumir de novo. A chamada
# carrega o próprio `|| falha`.
igual "nenhuma chamada solta de aplicar_schema no kit" "0" \
  "$(grep -nE '^\s*aplicar_schema\s*$' kit/*.sh kit/lib/*.sh | wc -l | tr -d ' ')"

[ "$fail" = "0" ] && echo "kit-aplicar-schema: tudo certo" || echo "kit-aplicar-schema: FALHOU"
exit "$fail"

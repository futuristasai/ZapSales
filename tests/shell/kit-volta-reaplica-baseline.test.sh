#!/usr/bin/env bash
# Gate da volta da implantação quando o BASELINE parou no meio (issue #360).
#
# A volta põe de volta código, `.env` e imagens e deixava o banco como estava,
# com a justificativa "o baseline é aditivo, e o código anterior roda sobre ele".
# Vale quando o baseline CHEGOU AO FIM. Interrompido no meio ele deixa o banco
# entre duas versões — o arquivo redefine a mesma função mais de uma vez no
# caminho, e foi esse meio do caminho que derrubou a tela de Conversas em
# 19/11/2026 (#355). Desde então o kit repete o baseline em deadlock e devolve
# a falha; sobrava o baseline com defeito de verdade: a implantação falhava,
# voltava o código e o banco ficava no meio do caminho até alguém rodar o kit.
#
# O que este arquivo cobra:
#
# 1. A VOLTA SABE POR QUE VOLTOU. Só o kit dizendo "o baseline falhou no meio"
#    dispara a reaplicação. Falha DEPOIS do baseline (app que não sobe, saúde
#    que piora) não reaplica: ali o schema novo está inteiro, e aplicar o
#    arquivo antigo por cima de um schema mais novo é um rebaixamento que
#    ninguém provou.
# 2. O ARQUIVO REAPLICADO É O DA VERSÃO PARA A QUAL SE VOLTA, depois de o código
#    dela estar de volta em $RAIZ e ANTES de os serviços subirem.
# 3. DEADLOCK GANHA NOVA PASSADA (a volta também roda com o app em uso), e
#    defeito não.
# 4. REAPLICAÇÃO QUE FALHA É "A VOLTA TAMBÉM FALHOU" (código 4): o banco está
#    num estado que ninguém conhece, e alguém precisa olhar agora.
# 5. A SAÍDA DO PSQL NÃO SAI DA VPS: vai para um arquivo em $LOGS. O que a
#    implantação imprime vira log público do GitHub.
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
. kit/lib/implantar.sh
# shellcheck source=/dev/null
. kit/lib/rotina.sh

FRASE='O baseline.sql falhou no meio'

echo "a volta reconhece o baseline interrompido pelo que o kit disse"
printf '▶ Aplicando o schema do ZapSales (supabase/baseline.sql)\nERROR:  column "x" does not exist\n\n✖ %s e o banco ficou entre duas versões.\n' "$FRASE" > "$TMP/kit-parou.log"
printf '▶ Aplicando o schema do ZapSales (supabase/baseline.sql)\n▶ Subindo o app, o worker, o agendador, o WhatsApp (WAHA) e o Redis\n✖ O app não ficou saudável: docker compose logs app\n' > "$TMP/kit-app.log"
printf '▶ Aplicando o schema do ZapSales (supabase/baseline.sql)\n▶ Pronto\n' > "$TMP/kit-ok.log"
igual "kit que parou no baseline" "sim" "$(baseline_parou_no_meio "$TMP/kit-parou.log" && echo sim || echo nao)"
igual "kit que falhou DEPOIS do baseline" "nao" "$(baseline_parou_no_meio "$TMP/kit-app.log" && echo sim || echo nao)"
igual "kit que terminou" "nao" "$(baseline_parou_no_meio "$TMP/kit-ok.log" && echo sim || echo nao)"
igual "sem registro do kit (falha antes de instalar)" "nao" "$(baseline_parou_no_meio "" && echo sim || echo nao)"
igual "registro que não existe" "nao" "$(baseline_parou_no_meio "$TMP/nao-existe.log" && echo sim || echo nao)"

echo "a frase que a volta procura é a que o kit escreve"
# A volta lê o registro do kit. Se alguém reescrever a mensagem de falha do
# baseline em kit/instalar.sh, a volta deixa de reconhecê-la em silêncio.
igual "kit/instalar.sh falha o baseline com a frase" "1" \
  "$(grep -c "aplicar_schema || falha \"$FRASE" kit/instalar.sh)"

# ─── a instalação de mentira ────────────────────────────────────────────────
RAIZ="$TMP/raiz"; LOGS="$TMP/logs"; ESTADO="$TMP/estado"; ENV_ARQ="$RAIZ/.env"
ALVO=1111111111111111111111111111111111111111
ATUAL=0000000000000000000000000000000000000000
DOMINIO=exemplo.test
mkdir -p "$RAIZ/supabase" "$LOGS" "$ESTADO/$ALVO"
printf 'A=1\n' > "$ESTADO/$ALVO/env.antes"
printf -- '-- BASELINE-DO-ALVO\n' > "$RAIZ/supabase/baseline.sql"
SAUDE_ANTES='{"data":{"status":"healthy","version":"0000000","checks":{"supabase":{"status":"ok"}}}}'
ESPERA_DA_VOLTA_S=0

ROTEIRO="$TMP/roteiro"; ORDEM="$TMP/ordem"
# copiar_codigo ID — a volta traz o código (e o baseline) da versão anterior.
copiar_codigo() {
  echo "copiar_codigo" >> "$ORDEM"
  printf -- '-- BASELINE-DE-%s\n' "$1" > "$RAIZ/supabase/baseline.sql"
}
servicos_saudaveis() { return 0; }
local_https() { printf '307'; }
saude() { printf '%s' "$SAUDE_ANTES"; }
# O `docker` de mentira: registra a ordem e obedece ao roteiro no psql.
docker() {
  case "$*" in
    *"exec -T db psql"*)
      local entrada passo
      entrada="$(cat)"
      echo "psql:${entrada#-- BASELINE-DE-}" | head -1 >> "$ORDEM"
      passo="$(sed -n "$(grep -c '^psql:' "$ORDEM")p" "$ROTEIRO")"
      case "$passo" in
        deadlock) printf 'ERROR:  deadlock detected\nDETAIL:  tabela_secreta\n' >&2; return 3 ;;
        defeito)  printf 'ERROR:  column "tabela_secreta" does not exist\n' >&2; return 3 ;;
      esac ;;
    *"restart realtime"*) echo "restart-realtime" >> "$ORDEM" ;;
    *"up -d"*) echo "up" >> "$ORDEM" ;;
  esac
  return 0
}

# volta REGISTRO ROTEIRO... — roda `voltar` num subshell (ela termina o processo)
# e imprime "código|ordem das ações".
volta() {
  local reg="$1"; shift
  printf '%s\n' "$@" > "$ROTEIRO"
  : > "$ORDEM"
  local codigo=0
  ( REG_KIT="$reg"; voltar "motivo de teste" ) > "$TMP/saida" 2>&1 || codigo=$?
  printf '%s|%s' "$codigo" "$(tr '\n' ' ' < "$ORDEM" | sed 's/ $//')"
}

echo "volta por baseline interrompido: reaplica o baseline da versão anterior"
igual "código 3 (voltou); código, baseline ANTERIOR, tempo real, serviços — nesta ordem" \
  "3|copiar_codigo psql:$ATUAL restart-realtime up" "$(volta "$TMP/kit-parou.log" ok)"
igual "o que foi ao banco é o baseline da versão anterior, não o do alvo" "0" \
  "$(grep -c "psql:.*ALVO" "$ORDEM")"

echo "volta por outro motivo: o banco não é tocado"
igual "kit falhou depois do baseline" "3|copiar_codigo up" "$(volta "$TMP/kit-app.log")"
igual "falha na prova (o kit terminou)" "3|copiar_codigo up" "$(volta "$TMP/kit-ok.log")"
igual "erro antes de o kit rodar" "3|copiar_codigo up" "$(volta "")"

echo "deadlock na reaplicação ganha nova passada; defeito, não"
igual "um deadlock e depois aplica" \
  "3|copiar_codigo psql:$ATUAL psql:$ATUAL restart-realtime up" "$(volta "$TMP/kit-parou.log" deadlock ok)"
igual "defeito: uma passada só, e a volta também falhou (código 4)" \
  "4|copiar_codigo psql:$ATUAL up" "$(volta "$TMP/kit-parou.log" defeito)"
igual "deadlock que insiste: três passadas, código 4" \
  "4|copiar_codigo psql:$ATUAL psql:$ATUAL psql:$ATUAL up" "$(volta "$TMP/kit-parou.log" deadlock deadlock deadlock ok)"

echo "a saída do psql fica na VPS"
volta "$TMP/kit-parou.log" defeito >/dev/null
igual "o erro do banco não vai para a saída da implantação" "0" "$(grep -c 'tabela_secreta' "$TMP/saida")"
igual "o erro do banco fica num arquivo em \$LOGS" "sim" "$(cat "$LOGS"/*volta-baseline*.log 2>/dev/null | grep -q 'tabela_secreta' && echo sim || echo nao)"
igual "a saída diz onde o registro ficou" "1" "$(grep -c 'volta-baseline' "$TMP/saida")"

echo "código que não voltou: o baseline em \$RAIZ pode ser o do alvo, então não se aplica nada"
copiar_codigo() { echo "copiar_codigo" >> "$ORDEM"; return 1; }
igual "sem reaplicar, e a volta falhou" "4|copiar_codigo up" "$(volta "$TMP/kit-parou.log" ok)"

[ "$fail" = "0" ] && echo "kit-volta-reaplica-baseline: tudo certo" || echo "kit-volta-reaplica-baseline: FALHOU"
exit "$fail"

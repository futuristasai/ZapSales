#!/usr/bin/env bash
# Gate das funções puras do programa do servidor (kit/lib/agente.sh, issue #311).
#
# O programa atualiza o ZapSales quando alguém clica "Atualizar agora". O que
# não pode errar, e é provado aqui sem uma VPS:
#
# 1. MODO. Só a instalação que está numa RELEASE executa pedido. A produção do
#    próprio projeto anda pela main (imagem `sha-<commit>`) e só anuncia — ali
#    quem atualiza é a implantação contínua, e os dois não podem brigar.
# 2. ALVO. Só tag vX.Y.Z, e só para CIMA: nunca a main, nunca rebaixamento.
# 3. FRONTEIRA. Da resposta do app sai só "há pedido" + o id da rodada (um
#    uuid). Qualquer outra coisa é ignorada: o app não manda comando.
# 4. BATIDA. O corpo que vai ao app tem os campos que o contrato espera, com
#    data vazia virando null e nenhum segredo (só "o R2 está configurado").
# 5. DESFECHO. O código de saída da rotina vira o status que a tela entende.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { # nome esperado obtido
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi
}
verdade() { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$nome"; else nok "$nome"; fi; }
falso()   { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then nok "$nome"; else ok "$nome"; fi; }

command -v python3 >/dev/null || { echo "  ✗ python3 ausente — este teste precisa dele"; exit 1; }

# shellcheck source=/dev/null
. kit/lib/comum.sh
# shellcheck source=/dev/null
. kit/lib/implantar.sh
# shellcheck source=/dev/null
. kit/lib/agente.sh

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "a etiqueta das imagens diz o modo"
igual "imagem de release" "1.2.1" "$(versao_da_imagem ghcr.io/futuristasai/zapsales:1.2.1)"
igual "imagem da main" "sha-0123456789abcdef0123456789abcdef01234567" \
  "$(versao_da_imagem ghcr.io/futuristasai/zapsales:sha-0123456789abcdef0123456789abcdef01234567)"
igual "registro com porta não confunde" "1.0.0" "$(versao_da_imagem localhost:5000/zapsales:1.0.0)"
igual "sem etiqueta é vazio" "" "$(versao_da_imagem ghcr.io/futuristasai/zapsales)"
igual "release executa" "release" "$(modo_do_agente 1.2.1)"
igual "main só anuncia" "acompanha" "$(modo_do_agente sha-0123456789abcdef0123456789abcdef01234567)"
igual "imagem construída na VPS só anuncia" "acompanha" "$(modo_do_agente abc1234)"
igual "latest só anuncia" "acompanha" "$(modo_do_agente latest)"
igual "vazio só anuncia" "acompanha" "$(modo_do_agente "")"

echo "o alvo é sempre uma release, e só para cima"
verdade "v1.3.0 é release" tag_de_release_valida v1.3.0
falso "main não é release" tag_de_release_valida main
falso "sem o v não é tag" tag_de_release_valida 1.3.0
falso "pré-lançamento não entra" tag_de_release_valida v1.3.0-rc1
falso "comando embutido não entra" tag_de_release_valida 'v1.3.0;rm'
verdade "1.2.1 → v1.3.0 sobe" sobe 1.2.1 v1.3.0
verdade "1.9.0 → 1.10.0 sobe (ordem de versão, não de texto)" sobe 1.9.0 1.10.0
falso "mesma versão não sobe" sobe 1.3.0 v1.3.0
falso "1.3.0 → 1.2.9 é rebaixamento" sobe 1.3.0 v1.2.9
falso "da main não se compara" sobe sha-0123456 v1.3.0
falso "para a main não se vai" sobe 1.2.0 main

echo "a resposta do GitHub"
igual "tag da última release" "v1.3.0" "$(printf '{"tag_name": "v1.3.0", "name": "1.3.0"}' | tag_da_resposta)"
igual "JSON quebrado é vazio" "" "$(printf 'rate limit' | tag_da_resposta)"
igual "repo pelo remoto https" "futuristasai/ZapSales" "$(repo_do_remoto https://github.com/futuristasai/ZapSales.git)"
igual "repo pelo remoto ssh" "dono/fork" "$(repo_do_remoto git@github.com:dono/fork.git)"
igual "remoto que não é GitHub é vazio" "" "$(repo_do_remoto https://gitlab.com/x/y)"

echo "da resposta do app sai só o pedido"
RUN=3f2b9c1e-8d4a-4f6b-9c2e-1a2b3c4d5e6f
igual "há pedido" "$RUN" "$(printf '{"data":{"update_requested":true,"run_id":"%s"}}' "$RUN" | pedido_da_resposta)"
igual "sem pedido" "" "$(printf '{"data":{"update_requested":false,"run_id":null}}' | pedido_da_resposta)"
igual "run_id que não é uuid é ignorado" "" \
  "$(printf '{"data":{"update_requested":true,"run_id":"$(reboot)"}}' | pedido_da_resposta)"
igual "erro do app não vira pedido" "" "$(printf '{"error":{"code":"unauthorized"}}' | pedido_da_resposta)"
igual "HTML do proxy não vira pedido" "" "$(printf '<html>502</html>' | pedido_da_resposta)"

echo "o andamento pelos títulos do kit"
igual "imagens = código" "codigo" "$(passo_do_titulo 'Imagens: puxando do registro')"
igual "schema = banco" "banco" "$(passo_do_titulo 'Aplicando o schema do ZapSales (supabase/baseline.sql)')"
igual "outro título não muda o passo" "" "$(passo_do_titulo 'Provando')"

echo "o desfecho"
igual "0 = success" "success" "$(status_do_codigo 0)"
igual "2 = refused (nada mudou)" "refused" "$(status_do_codigo 2)"
igual "3 = voltou sozinho" "failed_rolled_back" "$(status_do_codigo 3)"
igual "4 = a volta falhou" "failed" "$(status_do_codigo 4)"
igual "qualquer outro = failed" "failed" "$(status_do_codigo 137)"

echo "o texto que volta para a tela cabe no contrato"
grande="$(python3 -X utf8 -c 'print("é" * 9000)')"
igual "corta em bytes sem partir letra" "8000" "$(printf '%s' "$grande" | cortar_em_bytes 16000 | python3 -X utf8 -c 'import sys; print(len(sys.stdin.read()))')"
igual "texto curto passa inteiro" "abc" "$(printf 'abc' | cortar_em_bytes 10)"

echo "o backup, sem segredo"
mkdir -p "$TMP/bk/db"
igual "nunca houve backup" "" "$(ultimo_backup_em "$TMP/bk")"
: > "$TMP/bk/db/zapsales-20261101T031500Z.dump"
touch -d '2026-11-01 03:15:00 UTC' "$TMP/bk/db/zapsales-20261101T031500Z.dump"
igual "sem marcador, o dump mais novo" "2026-11-01T03:15:00Z" "$(ultimo_backup_em "$TMP/bk")"
: > "$TMP/bk/db/zapsales-20261114T031500Z.dump"
touch -d '2026-11-14 03:15:00 UTC' "$TMP/bk/db/zapsales-20261114T031500Z.dump"
printf '%s\n' "$TMP/bk/db/zapsales-20261114T031500Z.dump" > "$TMP/bk/ultimo-diario"
igual "o marcador do último diário" "2026-11-14T03:15:00Z" "$(ultimo_backup_em "$TMP/bk")"
igual "sem cópia semanal" "" "$(ultima_copia_externa_em "$TMP/bk")"
printf '2026-11-09T04:31:12Z\n' > "$TMP/bk/ultimo-semanal"
igual "a cópia semanal" "2026-11-09T04:31:12Z" "$(ultima_copia_externa_em "$TMP/bk")"
printf 'nunca\n' > "$TMP/bk/ultimo-semanal"
igual "marcador estranho não vira data" "" "$(ultima_copia_externa_em "$TMP/bk")"

echo "a batida"
printf '## [1.3.0] — 2026-11-16\n\n- Botão de atualizar.\n' > "$TMP/changelog.md"
corpo="$(A_ATUAL=1.2.1 A_SHA=abc1234 A_FORA_DA_RELEASE=0 A_ULTIMA=1.3.0 A_FALHOU=0 A_TEM_RELEASE=1 \
  A_CHANGELOG="$TMP/changelog.md" A_BACKUP_EM=2026-11-14T03:15:00Z A_EXTERNO_EM= A_R2=1 A_EXECUTA=1 corpo_da_batida)"
campo() { CORPO="$corpo" python3 -I -X utf8 -c 'import json,os,sys; v=json.loads(os.environ["CORPO"])[sys.argv[1]]; print(json.dumps(v))' "$1"; }
igual "kind" '"heartbeat"' "$(campo kind)"
igual "versão instalada" '"1.2.1"' "$(campo current_version)"
igual "última release" '"1.3.0"' "$(campo latest_version)"
igual "booleanos são booleanos" 'false' "$(campo off_release)"
igual "R2 é só um booleano" 'true' "$(campo backup_offsite_configured)"
igual "data vazia vira null" 'null' "$(campo last_offsite_backup_at)"
igual "data do backup" '"2026-11-14T03:15:00Z"' "$(campo last_backup_at)"
igual "executa pedidos" 'true' "$(campo executes_updates)"
igual "notas da versão, inteiras" "sim" "$(CORPO="$corpo" ARQ="$TMP/changelog.md" python3 -I -X utf8 -c 'import json,os; print("sim" if json.loads(os.environ["CORPO"])["changelog"] == open(os.environ["ARQ"], encoding="utf-8").read() else "não")')"
sem_changelog="$(A_ATUAL=x A_CHANGELOG="$TMP/nao-existe" corpo_da_batida)"
igual "sem notas, texto vazio" '""' "$(CORPO="$sem_changelog" python3 -I -c 'import json,os; print(json.dumps(json.loads(os.environ["CORPO"])["changelog"]))')"

echo "a trava é a do zapsales-implantar"
igual "mesmo arquivo de trava" "/run/zapsales-implantar.lock" "$TRAVA_DAS_ATUALIZACOES"
if command -v flock >/dev/null; then
  T="$TMP/trava"
  verdade "livre quando ninguém segura" trava_livre "$T"
  ( exec 7>"$T"; flock -n 7; sleep 3 ) &
  sleep 1
  falso "ocupada enquanto o outro segura" trava_livre "$T"
  wait
else
  echo "  · flock ausente nesta máquina: a trava é provada no CI (Linux)"
fi

echo "sintaxe"
verdade "bash -n kit/agente.sh" bash -n kit/agente.sh
verdade "bash -n kit/lib/agente.sh" bash -n kit/lib/agente.sh
verdade "bash -n kit/lib/rotina.sh" bash -n kit/lib/rotina.sh

echo "o kit instala e mantém o programa"
if grep -q 'agente.sh" instalar-comando' kit/instalar.sh; then ok "kit/instalar.sh chama kit/agente.sh instalar-comando a cada rodada"
else nok "kit/instalar.sh não instala o programa do servidor"; fi
if grep -q 'OnUnitActiveSec=60' kit/agente.sh || grep -q 'OnCalendar=minutely' kit/agente.sh; then ok "o temporizador bate a cada minuto"
else nok "o temporizador não bate a cada minuto"; fi
if grep -q 'lib/rotina.sh' kit/agente.sh; then ok "o programa usa a mesma rotina protegida do zapsales-implantar"
else nok "kit/agente.sh não carrega kit/lib/rotina.sh"; fi

[ "$fail" = 0 ] && echo ok || { echo FALHOU; exit 1; }

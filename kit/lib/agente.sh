# shellcheck shell=bash
# Funções puras do programa do servidor (kit/agente.sh, issue #311).
#
# Cada função responde uma pergunta sobre um texto, um arquivo pequeno ou o
# ambiente — nada aqui fala com o Docker, com o app ou com o GitHub. É o que
# deixa tests/shell/kit-agente.test.sh provar, sem uma VPS, as decisões que não
# podem errar: em que modo o programa está, para onde ele pode ir, e o que ele
# aceita da resposta do app.
#
# JSON com python3, pela mesma razão de kit/lib/implantar.sh: vem no Ubuntu e no
# Debian de fábrica, e o jq não.

# A MESMA trava do zapsales-implantar: uma atualização por vez na máquina, venha
# ela da implantação contínua ou do botão.
TRAVA_DAS_ATUALIZACOES=/run/zapsales-implantar.lock

# versao_da_imagem IMAGEM — a etiqueta (o que vem depois do último `:` que não
# é porta de registro). `ghcr.io/x/zapsales:1.2.1` → `1.2.1`.
versao_da_imagem() {
  local img="${1:-}" ultimo
  ultimo="${img##*/}"
  case "$ultimo" in *:*) printf '%s\n' "${ultimo##*:}" ;; *) printf '\n' ;; esac
}

# modo_do_agente ETIQUETA — `release` quando a instalação está numa versão
# publicada (etiqueta X.Y.Z, imutável): só aí o programa executa pedido.
# Qualquer outra coisa (`sha-<commit>` da implantação contínua, imagem
# construída na VPS, `latest`) é `acompanha`: o programa só anuncia.
modo_do_agente() {
  if [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then printf 'release\n'; else printf 'acompanha\n'; fi
}

# tag_de_release_valida TAG — vX.Y.Z, e nada além. Pré-lançamento não entra:
# o botão leva só a versão que passou pelo corte.
tag_de_release_valida() { [[ "${1:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# sobe ATUAL ALVO — ALVO é uma versão MAIOR que ATUAL (as duas X.Y.Z, com ou
# sem o `v`). Igual não sobe; menor é rebaixamento; o que não é versão nunca
# sobe — inclusive para a main ou a partir dela.
sobe() {
  local a="${1#v}" b="${2#v}" re='^[0-9]+\.[0-9]+\.[0-9]+$'
  [[ "$a" =~ $re ]] && [[ "$b" =~ $re ]] || return 1
  [ "$a" != "$b" ] || return 1
  [ "$(printf '%s\n%s\n' "$a" "$b" | sort -V | tail -1)" = "$b" ]
}

# tag_da_resposta — lê o JSON de /releases/latest na entrada; imprime tag_name.
tag_da_resposta() {
  python3 -I -X utf8 -c '
import json, sys
try:
    v = json.load(sys.stdin).get("tag_name")
except Exception:
    sys.exit(0)
if isinstance(v, str): print(v)' | tr -d '\r'
}

# repo_do_remoto URL — `dono/repo` de um remoto do GitHub (https ou ssh), ou vazio.
repo_do_remoto() {
  printf '%s\n' "${1:-}" | sed -nE 's#^(https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\2#p' \
    | sed -E 's#\.git$##'
}

# pedido_da_resposta — lê a resposta do app à batida; imprime o run_id quando
# há pedido. É TUDO o que atravessa a fronteira: um booleano e um uuid. Um
# run_id que não é uuid é ignorado — ele vira nome de arquivo e argumento.
pedido_da_resposta() {
  python3 -I -X utf8 -c '
import json, re, sys
try:
    d = json.load(sys.stdin).get("data") or {}
except Exception:
    sys.exit(0)
r = d.get("run_id")
if d.get("update_requested") is True and isinstance(r, str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", r):
    print(r)' | tr -d '\r'
}

# passo_do_titulo TÍTULO — o andamento que um título de passo do kit/instalar.sh
# anuncia: as imagens são o código novo chegando; o schema é o banco.
passo_do_titulo() {
  case "${1:-}" in
    "Imagens:"*) printf 'codigo\n' ;;
    "Aplicando o schema"*) printf 'banco\n' ;;
  esac
}

# status_do_codigo CÓDIGO — a saída da rotina vira o desfecho que a tela entende.
#   0 instalou e provou · 2 recusou antes de tocar · 3 falhou e voltou sozinho
#   4 (e o resto) falhou e a volta também falhou
status_do_codigo() {
  case "${1:-}" in
    0) printf 'success\n' ;;
    2) printf 'refused\n' ;;
    3) printf 'failed_rolled_back\n' ;;
    *) printf 'failed\n' ;;
  esac
}

# cortar_em_bytes N — no máximo N bytes da entrada, sem partir uma letra no
# meio (o contrato do app conta o tamanho do texto, e UTF-8 cortado é lixo).
cortar_em_bytes() {
  python3 -I -X utf8 -c '
import sys
b = sys.stdin.buffer.read()[: int(sys.argv[1])]
sys.stdout.write(b.decode("utf-8", "ignore"))' "${1:-16000}"
}

# instante_iso EPOCH — 2026-11-14T03:15:00Z.
instante_iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

# ultimo_backup_em PASTA — quando foi o último dump BEM-SUCEDIDO. O kit/backup.sh
# só grava `ultimo-diario` depois de o dump ser lido pelo pg_restore e movido
# para o lugar; sem o marcador (instalação antiga), vale o dump mais novo da
# pasta (o `.parcial` de um dump que falhou não tem o nome que a busca pega).
ultimo_backup_em() {
  local pasta="$1" dump=""
  if [ -s "$pasta/ultimo-diario" ]; then
    dump="$(head -1 "$pasta/ultimo-diario" | tr -d '\r')"
    [ -f "$dump" ] || dump=""
  fi
  if [ -z "$dump" ]; then
    dump="$(find "$pasta/db" -maxdepth 1 -type f -name 'zapsales-*.dump' -printf '%T@ %p\n' 2>/dev/null \
      | sort -n | tail -1 | cut -d' ' -f2-)"
  fi
  [ -n "$dump" ] || return 0
  instante_iso "$(stat -c %Y "$dump")"
}

# ultima_copia_externa_em PASTA — quando a cópia semanal (R2) terminou bem. O
# kit/backup.sh grava a data em `ultimo-semanal` só no fim de uma rodada inteira.
ultima_copia_externa_em() {
  local v
  v="$(head -1 "$1/ultimo-semanal" 2>/dev/null | tr -d '\r' || true)"
  [[ "$v" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] && printf '%s\n' "$v"
  return 0
}

# corpo_da_batida — o JSON da batida, montado das variáveis A_* (nenhuma é
# segredo; o R2 entra como "configurado ou não", nunca a credencial):
#   A_ATUAL A_SHA A_ULTIMA          versão instalada, commit, última release (sem o v)
#   A_FORA_DA_RELEASE A_FALHOU A_TEM_RELEASE A_R2 A_EXECUTA   1 ou 0
#   A_CHANGELOG                     arquivo com as notas (já cortado)
#   A_BACKUP_EM A_EXTERNO_EM        ISO-8601, ou vazio
corpo_da_batida() {
  python3 -I -X utf8 -c '
import json, os
E = os.environ
def b(k, padrao="0"): return E.get(k, padrao) == "1"
def d(k): return E.get(k) or None
notas = ""
try:
    with open(E.get("A_CHANGELOG", ""), encoding="utf-8", errors="ignore") as f:
        notas = f.read()
except OSError:
    pass
print(json.dumps({
    "kind": "heartbeat",
    "current_version": E.get("A_ATUAL", "")[:64],
    "current_sha": E.get("A_SHA", "")[:64],
    "off_release": b("A_FORA_DA_RELEASE"),
    "latest_version": E.get("A_ULTIMA", "")[:64],
    "compare_failed": b("A_FALHOU"),
    "has_known_release": b("A_TEM_RELEASE", "1"),
    "changelog": notas,
    "last_backup_at": d("A_BACKUP_EM"),
    "last_offsite_backup_at": d("A_EXTERNO_EM"),
    "backup_offsite_configured": b("A_R2"),
    "executes_updates": b("A_EXECUTA"),
}, ensure_ascii=False))'
}

# trava_livre ARQUIVO — ninguém segura a trava agora? (Sem tomá-la.)
trava_livre() { ( exec 7>"$1" && flock -n 7 ) 2>/dev/null; }

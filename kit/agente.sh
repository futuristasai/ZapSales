#!/usr/bin/env bash
# kit/agente.sh — o programa do servidor (issue #311): o botão "Atualizar agora".
#
# O app não alcança o servidor; quem puxa é este programa, a cada minuto, por um
# temporizador do systemd. Em cada batida ele:
#
#   1. conta ao app a versão instalada, a última release publicada (perguntada ao
#      GitHub como o kit/obter.sh pergunta, guardada por 15 minutos) e as notas
#      dela, quando foi o último backup e se a cópia externa (R2) está
#      configurada — "configurado", nunca a credencial;
#   2. lê na resposta UM booleano, "alguém pediu atualização", e o id da rodada.
#      Nenhum comando atravessa a fronteira: com o app comprometido, o atacante
#      não escolhe o que roda aqui;
#   3. se há pedido, atualiza para a última RELEASE (nunca a main, nunca para
#      trás) pela mesma rotina protegida do zapsales-implantar (kit/lib/rotina.sh):
#      cópia do banco → instala → prova por 2 minutos → volta sozinho em
#      qualquer falha — e conta à tela o andamento e o desfecho.
#
# Na produção do próprio projeto, que anda pela main (imagem `sha-<commit>`), o
# programa só anuncia: quem atualiza ali é a implantação contínua, e os dois
# usam a mesma trava (/run/zapsales-implantar.lock) — nunca atualizam juntos.
#
# Formas de chamar (todas como root):
#   zapsales-agente                    uma batida (o que o temporizador faz)
#   zapsales-agente status             o que a batida contaria, sem falar com o app
#   kit/agente.sh instalar-comando     instala/atualiza o programa e o temporizador
#                                      (o kit/instalar.sh faz isto a cada rodada)
#
# Ensaio da volta, para provar o caminho de volta pela tela sem publicar uma
# release quebrada: ZAPSALES_ENSAIAR_VOLTA=1 em /etc/zapsales/agente.env. A
# versão nova sobe, passa nas provas e mesmo assim volta. Tire a linha depois.
set -Eeuo pipefail

AQUI="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
if [ -f "$AQUI/lib/agente.sh" ]; then LIB="$AQUI/lib"; else LIB=/usr/local/lib/zapsales-implantar; fi
# shellcheck source=lib/comum.sh
. "$LIB/comum.sh"
# shellcheck source=lib/implantar.sh
. "$LIB/implantar.sh"
# shellcheck source=lib/rotina.sh
. "$LIB/rotina.sh"
# shellcheck source=lib/agente.sh
. "$LIB/agente.sh"

RAIZ="${ZAPSALES_PASTA:-/opt/zapsales}"
ENV_ARQ="$RAIZ/.env"
REPO_PADRAO="futuristasai/ZapSales"
REGISTRO_IMAGENS="ghcr.io/futuristasai"
IMAGENS=(zapsales zapsales-worker zapsales-scheduler)
COMANDO=/usr/local/sbin/zapsales-agente
LIB_INSTALADA=/usr/local/lib/zapsales-implantar
UNIDADE=zapsales-agente
CASA=/var/lib/zapsales/agente
ESTADO="$CASA/rodadas"
VERSOES="$CASA/versoes"
LOGS=/var/log/zapsales
CORRIDA=/run/zapsales-agente
BACKUPS=/var/backups/zapsales
CONFIG_R2="${ZAPSALES_ESTADO:-/etc/zapsales}/backup.env"
AJUSTES="${ZAPSALES_ESTADO:-/etc/zapsales}/agente.env"
TRAVA_DO_KIT=/run/zapsales-kit.lock
CONSULTA_S=900
NOTAS_MAX_BYTES=60000
PREFIXO_DO_REGISTRO=atualizar
NOME_DO_PROGRAMA=kit/agente.sh

# ─── Instalação ──────────────────────────────────────────────────────────────

# instalar_comando — copia o programa e as bibliotecas para fora de
# /opt/zapsales (como o zapsales-implantar: a atualização troca o código no meio
# da própria execução, e cada arquivo entra por `mv`, rename atômico — quem está
# rodando segue lendo o arquivo antigo) e liga o temporizador. Idempotente.
instalar_comando() {
  exigir_root
  install -d -m 755 "$LIB_INSTALADA"
  local f
  for f in comum implantar rotina agente; do
    install -m 644 "$AQUI/lib/$f.sh" "$LIB_INSTALADA/.$f.sh.novo"
    mv -f "$LIB_INSTALADA/.$f.sh.novo" "$LIB_INSTALADA/$f.sh"
  done
  install -m 755 "$AQUI/agente.sh" "$(dirname "$COMANDO")/.$UNIDADE.novo"
  mv -f "$(dirname "$COMANDO")/.$UNIDADE.novo" "$COMANDO"

  if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    cat > "/etc/systemd/system/$UNIDADE.service.novo" <<EOF
# Gerenciado por kit/agente.sh (issue #311). Rodar o kit regrava.
[Unit]
Description=ZapSales: conta a versão ao app e atende o botão "Atualizar agora"
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$COMANDO
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/root
# Uma atualização inteira (cópia do banco, imagens, schema, 2 minutos de prova e,
# se for o caso, a volta) cabe aqui com folga.
TimeoutStartSec=60min
EOF
    cat > "/etc/systemd/system/$UNIDADE.timer.novo" <<EOF
# Gerenciado por kit/agente.sh (issue #311). Rodar o kit regrava.
[Unit]
Description=ZapSales: batida do programa do servidor a cada minuto

[Timer]
OnBootSec=60
OnUnitActiveSec=60
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF
    mv -f "/etc/systemd/system/$UNIDADE.service.novo" "/etc/systemd/system/$UNIDADE.service"
    mv -f "/etc/systemd/system/$UNIDADE.timer.novo" "/etc/systemd/system/$UNIDADE.timer"
    systemctl daemon-reload
    # Só o temporizador: nunca reiniciar o serviço — ele pode ser justamente a
    # atualização que chamou o kit que chamou esta função.
    systemctl enable --now "$UNIDADE.timer" >/dev/null 2>&1
    msg "  programa do servidor: $COMANDO, batida a cada minuto ($UNIDADE.timer)."
  else
    # Sem systemd (contêiner, sistema antigo): o cron faz a batida.
    printf '# Gerenciado por kit/agente.sh (issue #311). Rodar o kit regrava.\n* * * * * root %s >> %s/agente.log 2>&1\n' \
      "$COMANDO" "$LOGS" > /etc/cron.d/zapsales-agente
    chmod 644 /etc/cron.d/zapsales-agente
    msg "  programa do servidor: $COMANDO, batida a cada minuto (cron)."
  fi
}

# ─── O que o programa sabe sobre esta instalação ─────────────────────────────

DOMINIO=""
SEGREDO=""
ETIQUETA=""
MODO=""
REPO=""

carregar_instalacao() {
  [ -f "$ENV_ARQ" ] || falha "Não há instalação em $RAIZ (falta o .env)."
  DOMINIO="$(env_ler "$ENV_ARQ" DOMAIN)"
  [ -n "$DOMINIO" ] || falha "O .env não tem DOMAIN."
  SEGREDO="$(env_ler "$ENV_ARQ" INTERNAL_CRON_SECRET)"
  [ -n "$SEGREDO" ] || SEGREDO="$(env_ler "$ENV_ARQ" INTERNAL_SECRET)"
  ETIQUETA="$(versao_da_imagem "$(env_ler "$ENV_ARQ" APP_IMAGE)")"
  MODO="$(modo_do_agente "$ETIQUETA")"
  REPO=""
  if [ -d "$RAIZ/.git" ]; then REPO="$(repo_do_remoto "$(git -C "$RAIZ" remote get-url origin 2>/dev/null || true)")"; fi
  REPO="${REPO:-$REPO_PADRAO}"
  install -d -m 700 "$CASA" "$CORRIDA"
}

commit_instalado() {
  local c=""
  # Numa release instalada por clone (o kit/obter.sh), quem diz o commit é o
  # git: o .zapsales-revisao é da implantação contínua e pode ser de antes.
  if [ "$MODO" = "release" ] && [ -d "$RAIZ/.git" ]; then
    c="$(git -C "$RAIZ" rev-parse HEAD 2>/dev/null || true)"
    [ -z "$c" ] || { printf '%s\n' "$c"; return 0; }
  fi
  c="$(tr -d '[:space:]' 2>/dev/null < "$RAIZ/.zapsales-revisao" || true)"
  [ -n "$c" ] || c="$(git -C "$RAIZ" rev-parse HEAD 2>/dev/null || true)"
  printf '%s\n' "$c"
}

# consultar_release [agora] — a última release, perguntada ao GitHub no máximo a
# cada 15 minutos (a API anônima dá 60 perguntas por hora por endereço, e a
# máquina pode ter vizinhos). Grava em $CASA: release.json (a última resposta
# boa), release.estado (ok | sem-release | falhou) e release.ok-em (epoch).
consultar_release() {
  local arq="$CASA/release.json" est="$CASA/release.estado" tmp codigo idade=999999
  [ -f "$est" ] && idade=$(( $(date +%s) - $(stat -c %Y "$est") ))
  if [ "${1:-}" = "agora" ] || [ "$idade" -ge "$CONSULTA_S" ]; then
    tmp="$(mktemp "$CASA/.release.XXXXXX")"
    codigo="$(curl -sS -L --max-time 20 -o "$tmp" -w '%{http_code}' \
      -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || true)"
    case "$codigo" in
      200) if [ -n "$(tag_da_resposta < "$tmp")" ]; then mv -f "$tmp" "$arq"; printf 'ok\n' > "$est"; date +%s > "$CASA/release.ok-em"
           else rm -f "$tmp"; printf 'falhou\n' > "$est"; fi ;;
      404) rm -f "$tmp"; : > "$arq"; printf 'sem-release\n' > "$est"; date +%s > "$CASA/release.ok-em" ;;
      *)   rm -f "$tmp"; printf 'falhou\n' > "$est" ;;
    esac
  fi
}

ultima_tag() { tag_da_resposta < "$CASA/release.json" 2>/dev/null || true; }

# A comparação "falhou" só quando o GitHub não responde há mais de 6 horas: um
# soluço não pode virar "não sei se estou em dia" na tela.
comparacao_falhou() {
  local ok_em
  ok_em="$(cat "$CASA/release.ok-em" 2>/dev/null || echo 0)"
  [ "$(cat "$CASA/release.estado" 2>/dev/null || echo falhou)" = "falhou" ] || return 1
  [ $(( $(date +%s) - ok_em )) -gt 21600 ]
}

# notas_da_tag TAG — o CHANGELOG.md daquela tag, cortado, guardado por tag.
notas_da_tag() {
  local tag="$1" arq="$CASA/notas-$1.md" tmp
  tag_de_release_valida "$tag" || return 0
  if [ ! -s "$arq" ]; then
    tmp="$(mktemp "$CASA/.notas.XXXXXX")"
    if curl -fsSL --max-time 20 "https://raw.githubusercontent.com/$REPO/$tag/CHANGELOG.md" 2>/dev/null \
        | cortar_em_bytes "$NOTAS_MAX_BYTES" > "$tmp" && [ -s "$tmp" ]; then
      mv -f "$tmp" "$arq"
      find "$CASA" -maxdepth 1 -name 'notas-v*.md' ! -name "notas-$tag.md" -delete 2>/dev/null || true
    else
      rm -f "$tmp"
    fi
  fi
  printf '%s\n' "$arq"
}

# corpo — monta a batida a partir do estado da instalação.
corpo() {
  local tag="" atual sha fora=0 ultima="" tem=1 falhou=0 notas="" executa=0
  sha="$(commit_instalado)"
  if [ "$MODO" = "release" ]; then
    atual="$ETIQUETA"
    executa=1
    consultar_release
    tag="$(ultima_tag)"
    [ "$(cat "$CASA/release.estado" 2>/dev/null)" = "sem-release" ] && tem=0
    comparacao_falhou && falhou=1
    # Só anuncia o que é para CIMA: a tela nunca oferece rebaixamento.
    if sobe "$atual" "$tag"; then
      ultima="${tag#v}"
      notas="$(notas_da_tag "$tag")"
    else
      ultima="$atual"
    fi
  else
    # Anda pela main: a marca da versão é o commit, e a release publicada fica
    # para trás dele — anunciá-la seria oferecer rebaixamento.
    atual="${sha:0:7}"
    atual="${atual:-$ETIQUETA}"
    fora=1
  fi
  A_ATUAL="$atual" A_SHA="$sha" A_FORA_DA_RELEASE="$fora" A_ULTIMA="$ultima" A_FALHOU="$falhou" \
  A_TEM_RELEASE="$tem" A_CHANGELOG="$notas" A_BACKUP_EM="$(ultimo_backup_em "$BACKUPS")" \
  A_EXTERNO_EM="$(ultima_copia_externa_em "$BACKUPS")" A_R2="$([ -s "$CONFIG_R2" ] && echo 1 || echo 0)" \
  A_EXECUTA="$executa" corpo_da_batida
}

# falar_com_o_app JSON — POST no endpoint único do agente, pelo proxy desta
# máquina. O segredo vai por arquivo de configuração na entrada do curl, nunca
# por argumento (que qualquer usuário lê em /proc). Imprime o código HTTP na
# primeira linha e o corpo da resposta depois (`codigo_da_resposta` e
# `corpo_da_resposta`, em kit/lib/agente.sh, separam os dois).
falar_com_o_app() {
  local corpo_arq resp_arq codigo
  corpo_arq="$(mktemp "$CORRIDA/corpo.XXXXXX")"
  resp_arq="$(mktemp "$CORRIDA/resposta.XXXXXX")"
  printf '%s' "$1" > "$corpo_arq"
  codigo="$(printf 'header = "Authorization: Bearer %s"\n' "$SEGREDO" \
    | curl -s --max-time 20 --resolve "$DOMINIO:443:127.0.0.1" -K - -o "$resp_arq" -w '%{http_code}' \
        -H 'Content-Type: application/json' --data-binary "@$corpo_arq" \
        "https://$DOMINIO/api/v1/system/agent" 2>/dev/null || true)"
  printf '%s\n' "${codigo:-000}"
  cat "$resp_arq" 2>/dev/null || true
  rm -f "$corpo_arq" "$resp_arq"
}

relatar_andamento() { # RUN PASSO — sem insistir: andamento perdido não é desfecho perdido
  [ -n "${RUN_ID:-}" ] || return 0
  falar_com_o_app "$(printf '{"kind":"run_progress","run_id":"%s","step":"%s"}' "$RUN_ID" "$1")" >/dev/null || true
}

relatar_desfecho() { # RUN STATUS ARQUIVO_DA_CAUDA — insiste por ~4 min (o app pode estar reiniciando)
  local corpo_json resp
  corpo_json="$(RUN="$1" STATUS="$2" CAUDA="$3" python3 -I -X utf8 -c '
import json, os
with open(os.environ["CAUDA"], encoding="utf-8", errors="ignore") as f: cauda = f.read()
print(json.dumps({"kind": "run_result", "run_id": os.environ["RUN"], "status": os.environ["STATUS"], "log_tail": cauda}, ensure_ascii=False))')"
  for _ in $(seq 1 24); do
    resp="$(falar_com_o_app "$corpo_json")"
    desfecho_entregue "$(codigo_da_resposta "$resp")" && return 0
    sleep 10
  done
  aviso "não consegui contar ao app o desfecho da rodada $1 ($2); conto de novo na próxima batida que a trouxer."
  return 1
}

# ─── A batida ────────────────────────────────────────────────────────────────

bater() {
  exigir_root
  carregar_instalacao
  # Sem o segredo, não há com quem falar — e falhar a unidade a cada minuto só
  # enche o journal. O aviso fica; a tela mostra "programa desligado".
  [ -n "$SEGREDO" ] || { aviso "O .env não tem INTERNAL_CRON_SECRET: sem ele o app não aceita a batida."; exit 0; }
  local resp pedido
  resp="$(falar_com_o_app "$(corpo)")"
  [ "$(codigo_da_resposta "$resp")" = "200" ] \
    || { aviso "o app não respondeu à batida (código $(codigo_da_resposta "$resp"); está no ar?)."; exit 0; }
  pedido="$(corpo_da_resposta "$resp" | pedido_da_resposta)"
  [ -n "$pedido" ] || exit 0
  # Uma rodada se executa UMA vez. Se esta já foi executada aqui e o desfecho
  # não chegou ao app (ele estava fora do ar), conta de novo — nunca repete a
  # atualização, que refaria cópia, instalação e volta a cada minuto.
  install -d -m 700 "$ESTADO"
  if [ -s "$ESTADO/$pedido.desfecho" ]; then
    msg "Pedido $pedido já foi executado ($(cat "$ESTADO/$pedido.desfecho")); contando o desfecho de novo."
    relatar_desfecho "$pedido" "$(cat "$ESTADO/$pedido.desfecho")" "$ESTADO/$pedido.cauda" || true
    exit 0
  fi
  if [ "$MODO" != "release" ]; then
    msg "Há pedido de atualização, e esta instalação anda pela main: quem a atualiza é a implantação contínua. Nada a fazer."
    exit 0
  fi
  # Uma atualização por vez na máquina: a trava do zapsales-implantar fica com
  # esta execução até o fim. Ocupada, a próxima batida tenta de novo.
  exec 8>"$TRAVA_DAS_ATUALIZACOES"
  flock -n 8 || { msg "Outra atualização está em andamento nesta máquina; tento na próxima batida."; exit 0; }
  trava_livre "$TRAVA_DO_KIT" || { msg "O kit está rodando nesta máquina (alguém atualizou pelo terminal?); tento na próxima batida."; exit 0; }

  install -d -m 755 "$LOGS"
  local registro rc=0 cauda status
  registro="$LOGS/atualizar-$(date -u +%Y%m%dT%H%M%SZ).log"
  msg "Pedido $pedido: atualizando. Registro: $registro"
  "$COMANDO_EM_USO" --executar "$pedido" > "$registro" 2>&1 < /dev/null || rc=$?
  status="$(status_do_codigo "$rc")"
  cauda="$ESTADO/$pedido.cauda"
  # Para a tela vão só as linhas que a rotina marcou, redigidas — as mesmas
  # duas camadas da saída do zapsales-implantar para o GitHub (issue #39).
  etapas_do_registro < "$registro" | redigir | tail -n 120 | cortar_em_bytes 15000 > "$cauda"
  # O desfecho fica guardado ANTES de ir ao app: é ele que impede esta rodada
  # de ser executada de novo se o app não o receber agora.
  printf '%s\n' "$status" > "$ESTADO/$pedido.desfecho"
  relatar_desfecho "$pedido" "$status" "$cauda" || true
  find "$ESTADO" -maxdepth 1 -type f \( -name '*.desfecho' -o -name '*.cauda' \) -mtime +30 -delete 2>/dev/null || true
  msg "Pedido $pedido: $status (código $rc)."
}

# ─── O executor: a rotina protegida com alvo numa release ────────────────────

RUN_ID=""
ATUAL=""
ALVO=""
VERSAO_IMAGENS=""
OBSERVAR_S=120
GIT=0

copiar_codigo() { # ID — a tag pedida, ou de volta o commit que estava no ar
  if [ "$GIT" = "1" ]; then
    local ref="refs/tags/$1"
    [ "$1" = "$ATUAL" ] && ref="$(cat "$ESTADO/$ALVO/commit.antes")"
    git -C "$RAIZ" -c advice.detachedHead=false checkout --quiet "$ref"
  else
    copiar_arvore "$VERSOES/$1" "$RAIZ"
  fi
}

guardar_codigo_de_agora() {
  if [ "$GIT" = "1" ]; then
    git -C "$RAIZ" rev-parse HEAD > "$ESTADO/$ALVO/commit.antes"
  elif [ ! -f "$VERSOES/$ATUAL/kit/instalar.sh" ]; then
    local tmp
    tmp="$(mktemp -d "$VERSOES/.guardando.XXXXXX")"
    copiar_arvore "$RAIZ" "$tmp"
    rm -rf "${VERSOES:?}/$ATUAL"
    mv "$tmp" "$VERSOES/$ATUAL"
  fi
}

# A imagem de release grava a versão (1.3.0) em APP_VERSION, que é o que
# /api/v1/health responde.
alvo_responde() { [ -n "${1:-}" ] && [ "${1#v}" = "${ALVO#v}" ]; }

ao_ver_titulo_do_kit() {
  local p
  p="$(passo_do_titulo "$1")"
  [ "$p" = "banco" ] && relatar_andamento banco
  return 0
}

conferir_e_baixar() {
  passo "Conferindo o pedido"
  [ "$MODO" = "release" ] || recusar "esta instalação não está numa versão publicada (imagem '${ETIQUETA:-nenhuma}'): o botão só atualiza instalações que andam por release."
  ATUAL="v$ETIQUETA"
  consultar_release agora
  ALVO="$(ultima_tag)"
  tag_de_release_valida "$ALVO" || recusar "não consegui saber qual é a última versão publicada (o GitHub respondeu '$(cat "$CASA/release.estado" 2>/dev/null || echo nada)')."
  sobe "$ATUAL" "$ALVO" || recusar "a última versão publicada ($ALVO) não é mais nova que a instalada ($ATUAL): não há para onde subir, e o botão nunca volta versão."
  VERSAO_IMAGENS="${ALVO#v}"
  msg "  de $ATUAL para $ALVO."

  install -d -m 700 "$ESTADO" "$VERSOES"
  if [ -d "$RAIZ/.git" ]; then
    GIT=1
    [ -z "$(git -C "$RAIZ" status --porcelain --untracked-files=no 2>/dev/null)" ] \
      || recusar "$RAIZ tem arquivos do projeto alterados à mão (git status); o programa não os sobrescreve."
    git -C "$RAIZ" fetch --quiet --tags origin \
      || recusar "não consegui baixar as versões do GitHub (git fetch)."
    git -C "$RAIZ" rev-parse --verify --quiet "refs/tags/$ALVO" >/dev/null \
      || recusar "a tag $ALVO não chegou ao repositório local."
    msg "  código: tag $ALVO."
  else
    GIT=0
    if [ ! -f "$VERSOES/$ALVO/kit/instalar.sh" ]; then
      local tmp
      tmp="$(mktemp -d "$VERSOES/.baixando.XXXXXX")"
      curl -fsSL --max-time 300 "https://api.github.com/repos/$REPO/tarball/$ALVO" 2>/dev/null \
        | tar -xz -C "$tmp" --strip-components=1 \
        || { rm -rf "$tmp"; recusar "não consegui baixar o código de $ALVO do GitHub."; }
      [ -f "$tmp/kit/instalar.sh" ] || { rm -rf "$tmp"; recusar "o código baixado de $ALVO não tem kit/instalar.sh."; }
      rm -rf "${VERSOES:?}/$ALVO"
      mv "$tmp" "$VERSOES/$ALVO"
    fi
    msg "  código: $VERSOES/$ALVO."
  fi

  # As imagens antes de tocar: imagem que não existe é recusa, não volta.
  local n
  for n in "${IMAGENS[@]}"; do
    docker pull --quiet "$REGISTRO_IMAGENS/$n:$VERSAO_IMAGENS" >/dev/null 2>&1 \
      || recusar "a imagem $REGISTRO_IMAGENS/$n:$VERSAO_IMAGENS não existe ou não pôde ser puxada."
  done
  msg "  as três imagens $VERSAO_IMAGENS estão nesta máquina."
}

copia_do_banco() {
  passo "Cópia de segurança do banco"
  relatar_andamento backup
  "$RAIZ/kit/backup.sh" diario >/dev/null 2>&1 || recusar "a cópia do banco falhou (sudo kit/backup.sh diario mostra o motivo)."
  local dump
  dump="$(cat "$BACKUPS/ultimo-diario" 2>/dev/null || true)"
  msg "  cópia do banco: $dump ($(ultimo_backup_em "$BACKUPS"))."
  msg "  para voltar o banco a este ponto: docs/runbooks/backup-e-restauracao.md."
}

executar() {
  usar_saida_de_etapa
  # Antes de tocar, toda parada é recusa (código 2, "nada foi alterado"), nunca
  # a falha que a tela lê como "não consegui voltar".
  falha() { recusar "$*"; }
  RUN_ID="${1:-}"
  [[ "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || falha "--executar é interno."
  trap 'ao_errar $LINENO' ERR
  exigir_root
  carregar_instalacao
  local ajuste
  ajuste="$(env_ler "$AJUSTES" ZAPSALES_OBSERVAR_S)"
  [[ "$ajuste" =~ ^[0-9]+$ ]] && OBSERVAR_S="$ajuste"
  msg "Atualização pedida pela tela (rodada $RUN_ID) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  conferir_e_baixar
  copia_do_banco
  guardar_o_que_esta_no_ar
  # O kit tem a própria trava, e alguém pode tê-lo começado pelo terminal desde
  # a batida: aqui, ainda sem tocar, isso é recusa — depois seria uma volta.
  trava_livre "$TRAVA_DO_KIT" || recusar "o kit começou a rodar nesta máquina (alguém atualizou pelo terminal?); tente de novo quando ele terminar."
  # Daqui em diante a instalação vai ser tocada: toda parada é volta, nunca a
  # recusa "nada foi alterado".
  falha() { voltar "$*"; }
  relatar_andamento codigo
  # O kit/instalar.sh reinstala este programa e as bibliotecas fora de
  # /opt/zapsales; a volta não as desfaz. É de propósito: o processo em curso
  # segue lendo os arquivos antigos (cada um entrou por rename), e a versão
  # anterior do kit os reinstala na próxima rodada dela.
  instalar
  relatar_andamento conferencia
  provar
  if [ "$(env_ler "$AJUSTES" ZAPSALES_ENSAIAR_VOLTA)" = "1" ]; then
    voltar "ensaio da volta (ZAPSALES_ENSAIAR_VOLTA=1 em $AJUSTES)."
  fi
  trap - ERR
  TOCOU=0
  passo "Atualizado: $ALVO está no ar em https://$DOMINIO"
}

status_cmd() {
  exigir_root
  carregar_instalacao
  msg "Instalação: $RAIZ (imagem ${ETIQUETA:-?}, modo $MODO)"
  msg "Repositório: $REPO"
  msg "A batida seria:"
  corpo | python3 -I -X utf8 -c 'import json,sys; d=json.load(sys.stdin); d["changelog"]="(%d caracteres)" % len(d["changelog"]); print(json.dumps(d, indent=2, ensure_ascii=False))'
}

# O executor roda num processo filho com o MESMO arquivo que a batida usou —
# o instalado, ou a cópia do repositório quando chamada direto.
COMANDO_EM_USO="$(readlink -f "${BASH_SOURCE[0]}")"

case "${1:-}" in
  instalar-comando) instalar_comando ;;
  status)           status_cmd ;;
  --executar)       shift; executar "$@" ;;
  "")               bater ;;
  *)                falha "Uso: zapsales-agente [status] · kit/agente.sh instalar-comando" ;;
esac

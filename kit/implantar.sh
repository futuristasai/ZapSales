#!/usr/bin/env bash
# kit/implantar.sh — implantação contínua da produção (issue #24).
#
# O workflow `.github/workflows/implantar.yml` decide QUANDO (topo da main com
# ci, e2e, perf e as imagens verdes); este arquivo decide SE e COMO, do lado da
# VPS, sem confiar no que o chamador diz:
#
#   1. recusa, ANTES de tocar em qualquer coisa: commit fora da main (perguntado
#      ao GitHub, não ao chamador), rebaixamento, e imagem cuja revisão gravada
#      não é o commit pedido;
#   2. instala pelo próprio kit (kit/instalar.sh, que faz o dump do banco antes
#      do baseline), com a imagem EXATA do commit — `sha-<commit>`, imutável;
#   3. prova: /api/v1/health responde a versão nova, nenhuma dependência que
#      estava ok piora, e app/worker/agendador ficam saudáveis e sem reinício
#      por 2 minutos;
#   4. qualquer falha depois de tocar volta sozinha para a versão anterior —
#      código, .env e imagens. O banco NÃO volta (o baseline é aditivo), com uma
#      exceção: se o baseline da versão nova parou NO MEIO, a volta reaplica o
#      da versão anterior, para o banco não ficar entre duas versões (#360).
#
# Três formas de chamar:
#
#   sudo kit/implantar.sh acesso "ssh-ed25519 AAAA… github-implantar" [endereço público]
#       Prepara a VPS uma vez: instala o comando, cria o usuário zapsales-deploy
#       com a chave (sem terminal, sem túnel, um comando só) e imprime a linha
#       de known_hosts que vai para o segredo do GitHub.
#
#   ssh zapsales-deploy@vps "implantar <sha>"  (stdin: token do GitHub, opcional)
#       O que o workflow faz. A chave só alcança este comando; o token (o
#       GITHUB_TOKEN do job, que expira com ele) serve para perguntar ao GitHub
#       e puxar a imagem, e nunca é gravado em disco fora de uma pasta
#       temporária apagada na saída.
#
#   sudo zapsales-implantar <sha>
#       O mesmo, à mão, de dentro da VPS.
#
# Saída: 0 implantado (ou já estava nesta versão) · 2 recusado, nada foi tocado
#        3 falhou e voltou para a anterior · 4 falhou e a volta também falhou
set -Eeuo pipefail

# As bibliotecas ficam ao lado na cópia do repositório (kit/lib) e numa pasta
# própria na cópia instalada — que é a que roda, para o kit poder sobrescrever
# /opt/zapsales no meio de uma implantação sem trocar o script em execução.
AQUI="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
if [ -f "$AQUI/lib/implantar.sh" ]; then LIB="$AQUI/lib"; else LIB=/usr/local/lib/zapsales-implantar; fi
# shellcheck source=lib/comum.sh
. "$LIB/comum.sh"
# shellcheck source=lib/implantar.sh
. "$LIB/implantar.sh"
# shellcheck source=lib/rotina.sh
. "$LIB/rotina.sh"

RAIZ="${ZAPSALES_PASTA:-/opt/zapsales}"
ENV_ARQ="$RAIZ/.env"
REPO_GITHUB="futuristasai/ZapSales"
REGISTRO_IMAGENS="ghcr.io/futuristasai"
IMAGENS=(zapsales zapsales-worker zapsales-scheduler)
USUARIO=zapsales-deploy
COMANDO=/usr/local/sbin/zapsales-implantar
LIB_INSTALADA=/usr/local/lib/zapsales-implantar
ESTADO=/var/lib/zapsales/implantar
VERSOES="$ESTADO/versoes"
LOGS=/var/log/zapsales
CORRIDA=/run/zapsales-implantar
GUARDAR=3
OBSERVAR_S="${ZAPSALES_OBSERVAR_S:-120}"

# ─── Instalação do comando e do acesso ───────────────────────────────────────

# instalar_comando — copia este script e as bibliotecas para fora de
# /opt/zapsales. Cada arquivo entra por `mv` (rename atômico): uma implantação
# em andamento segue lendo o arquivo antigo, intacto. O kit/instalar.sh chama
# isto a cada rodada — é como o comando se atualiza junto com o código.
instalar_comando() {
  exigir_root
  install -d -m 755 "$LIB_INSTALADA"
  local f
  for f in comum implantar rotina; do
    install -m 644 "$AQUI/lib/$f.sh" "$LIB_INSTALADA/.$f.sh.novo"
    mv -f "$LIB_INSTALADA/.$f.sh.novo" "$LIB_INSTALADA/$f.sh"
  done
  install -m 755 "$AQUI/implantar.sh" "$(dirname "$COMANDO")/.zapsales-implantar.novo"
  mv -f "$(dirname "$COMANDO")/.zapsales-implantar.novo" "$COMANDO"
}

acesso() {
  exigir_root
  local chave host="${2:-}" casa
  chave="$(chave_publica_limpa "${1:-}")"
  [ -n "$chave" ] \
    || falha "Passe a chave PÚBLICA (ed25519 ou ecdsa), numa linha: sudo kit/implantar.sh acesso \"\$(cat implantar.pub)\""
  command -v python3 >/dev/null || falha "python3 não está instalado (a implantação lê JSON com ele)."
  instalar_comando
  passo "Usuário $USUARIO"
  if ! id "$USUARIO" >/dev/null 2>&1; then
    # Shell de verdade é obrigatório: o sshd executa o comando forçado por ele.
    # Sem senha: só a chave abaixo entra.
    useradd --system --create-home --home-dir "/var/lib/$USUARIO" --shell /bin/bash "$USUARIO"
    msg "  criado."
  else
    msg "  já existe."
  fi
  passwd -l "$USUARIO" >/dev/null 2>&1 || true
  casa="$(getent passwd "$USUARIO" | cut -d: -f6)"
  # A pasta e o arquivo são do root: o próprio usuário não reescreve a regra
  # que o prende a um comando.
  install -d -m 755 -o root -g root "$casa/.ssh"
  printf 'restrict,command="%s" %s\n' "$COMANDO" "$chave" > "$casa/.ssh/authorized_keys.novo"
  chmod 644 "$casa/.ssh/authorized_keys.novo"
  mv -f "$casa/.ssh/authorized_keys.novo" "$casa/.ssh/authorized_keys"
  msg "  chave autorizada só para '$COMANDO' (sem terminal, sem túnel, sem encaminhamento)."

  passo "Permissão de root só para a implantação"
  local regra=/etc/sudoers.d/zapsales-implantar
  printf '# Gerenciado por kit/implantar.sh (issue #24). A chave do GitHub chega aqui.\n%s ALL=(root) NOPASSWD: %s\n' \
    "$USUARIO" "$COMANDO" > "$regra.novo"
  chmod 440 "$regra.novo"
  if command -v visudo >/dev/null && ! visudo -c -f "$regra.novo" >/dev/null 2>&1; then
    rm -f "$regra.novo"
    falha "O sudo recusou a regra nova; nada foi alterado."
  fi
  mv -f "$regra.novo" "$regra"
  msg "  $regra"

  passo "Para os segredos do GitHub (Settings › Secrets and variables › Actions)"
  # O endereço público pode não ser o primeiro de `hostname -I` (rede privada,
  # IPv6): passe-o como segundo argumento quando for o caso. Porta 22.
  [ -n "$host" ] || host="$(hostname -I | awk '{print $1}')"
  msg "  DEPLOY_SSH_HOST         $host"
  msg "  DEPLOY_SSH_KNOWN_HOSTS  (a linha abaixo, inteira)"
  msg "$host $(cut -d' ' -f1-2 /etc/ssh/ssh_host_ed25519_key.pub)"
  msg "  DEPLOY_SSH_KEY          a chave PRIVADA que corresponde à pública passada aqui"
  msg "  E a variável DEPLOY_AUTOMATICO=ligado liga a implantação automática."
}

# ─── A frente: o que o sshd chama ────────────────────────────────────────────

# Sem root, a única entrada é a do comando forçado: o sha vem do
# SSH_ORIGINAL_COMMAND, conferido aqui E de novo como root.
entrar_pelo_ssh() {
  local sha
  sha="$(sha_do_comando "${SSH_ORIGINAL_COMMAND:-}")" \
    || { printf 'Recusado: o único comando aceito é "implantar <sha de 40 caracteres>".\n' >&2; exit 2; }
  exec sudo -n "$COMANDO" "$sha"
}

# A implantação roda numa UNIDADE PRÓPRIA do systemd (systemd-run): fora da
# sessão SSH e com ambiente limpo. Se a conexão do GitHub cair no meio, ela
# termina — e volta, se for o caso — sozinha; quem chamou só deixa de ver o
# registro. Sem systemd (contêiner de teste), cai para uma sessão destacada.
#
# O token vai por um arquivo só do root, apagado pelo executor ao lê-lo — nunca
# pelo ambiente da unidade, que `systemctl show` mostra a qualquer usuário.
#
# O registro inteiro fica em $LOGS. Pela sessão — que vira log PÚBLICO do
# Actions e corpo de issue — sai só o que saida_para_o_ssh deixa: as linhas que
# o executor marcou, redigidas (kit/lib/implantar.sh, issue #39).
frente() {
  local sha="$1" token="" carimbo registro situacao arq_token unidade codigo
  sha_valido "$sha" || { aviso "sha inválido: '$sha'"; exit 2; }
  # O token chega pela entrada padrão, nunca pela linha de comando (que
  # qualquer usuário da máquina lê em /proc).
  if [ ! -t 0 ]; then IFS= read -r -t 10 token || true; fi
  install -d -m 700 "$CORRIDA"
  mkdir -p "$LOGS"
  carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
  registro="$LOGS/implantar-$carimbo-${sha:0:7}.log"
  situacao="$CORRIDA/$carimbo-$$.saida"
  arq_token="$CORRIDA/$carimbo-$$.token"
  unidade="zapsales-implantar-$carimbo-$$"
  rm -f "$situacao"
  (umask 077 && printf '%s' "$token" > "$arq_token")
  token=""
  : > "$registro"
  local extra=()
  [ -z "${ZAPSALES_ENSAIAR_VOLTA:-}" ] || extra+=(--setenv=ZAPSALES_ENSAIAR_VOLTA="$ZAPSALES_ENSAIAR_VOLTA")
  [ -z "${ZAPSALES_OBSERVAR_S:-}" ] || extra+=(--setenv=ZAPSALES_OBSERVAR_S="$ZAPSALES_OBSERVAR_S")
  if command -v systemd-run >/dev/null && [ -d /run/systemd/system ]; then
    systemd-run --quiet --collect --unit="$unidade" \
      --property=StandardOutput="append:$registro" --property=StandardError="append:$registro" \
      --setenv=PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" --setenv=HOME=/root "${extra[@]}" \
      "$COMANDO" --executar "$sha" "$situacao" "$arq_token"
    # A unidade não é filha deste shell: um vigia espera ela acabar, e o tail
    # termina junto com ele (--pid), depois de uma última leitura.
    ( while systemctl is-active --quiet "$unidade"; do sleep 2; done; sleep 1 ) &
    local vigia=$!
    tail -n +1 -F --pid="$vigia" "$registro" 2>/dev/null | saida_para_o_ssh || true
    wait "$vigia" 2>/dev/null || true
  else
    env -u SUDO_USER -u SUDO_UID -u SUDO_GID -u SUDO_COMMAND \
      setsid "$COMANDO" --executar "$sha" "$situacao" "$arq_token" > "$registro" 2>&1 < /dev/null &
    local pid=$!
    tail -n +1 -F --pid="$pid" "$registro" 2>/dev/null | saida_para_o_ssh || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$arq_token"
  codigo="$(tr -d '[:space:]' < "$situacao" 2>/dev/null || true)"
  rm -f "$situacao"
  msg "fim: código ${codigo:-4} (0 implantado · 2 recusado · 3 voltou · 4 a volta falhou)"
  msg "registro completo na VPS: $registro"
  exit "${codigo:-4}"
}

# ─── O executor ──────────────────────────────────────────────────────────────

# A rotina protegida (guardar → instalar → provar → voltar) mora em
# kit/lib/rotina.sh e é a mesma do programa do servidor (kit/agente.sh). Daqui
# saem só as partes que dependem do alvo — um commit da main.
SHA=""
ATUAL=""
ALVO=""
VERSAO_IMAGENS=""
DOMINIO=""
TOKEN=""
CONF_DOCKER=""

# github CAMINHO — GET na API do repositório. O token vai por arquivo de
# configuração na entrada padrão do curl, não por argumento.
github() {
  local cabecalho=""
  [ -n "$TOKEN" ] && cabecalho="header = \"Authorization: Bearer $TOKEN\""
  # -L: o tarball responde 302 para o codeload; o curl não leva o cabeçalho de
  # autorização para o outro host.
  printf '%s\n' "$cabecalho" | curl -fsSL --max-time 120 -K - \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO_GITHUB/$1"
}

# status_do_compare BASE CABECA — identical | ahead | behind | diverged | vazio.
status_do_compare() {
  github "compare/$1...$2?per_page=1" 2>/dev/null \
    | python3 -I -X utf8 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: pass' | tr -d '\r' || true
}

imagem() { printf '%s/%s:sha-%s' "$REGISTRO_IMAGENS" "$1" "$2"; }

conferir_pedido() {
  passo "Conferindo o pedido: $SHA"
  [ -f "$ENV_ARQ" ] || recusar "não há instalação em $RAIZ (falta o .env)."
  DOMINIO="$(env_ler "$ENV_ARQ" DOMAIN)"
  [ -n "$DOMINIO" ] || recusar "o .env não tem DOMAIN."
  ATUAL="$(tr -d '[:space:]' < "$RAIZ/.zapsales-revisao" 2>/dev/null || true)"
  sha_valido "$ATUAL" || recusar "não sei qual commit está instalado ($RAIZ/.zapsales-revisao vazio ou abreviado): sem isso não há como recusar rebaixamento nem voltar. Grave o sha inteiro do que está no ar nesse arquivo."

  local st
  st="$(status_do_compare "$SHA" main)"
  sha_esta_na_main "$st" || recusar "o commit $SHA não está na main (o GitHub respondeu '${st:-nada}')."
  msg "  está na main (o GitHub respondeu '$st')."

  case "$(movimento "$(status_do_compare "$ATUAL" "$SHA")")" in
    mesma)   msg "  $SHA já é o que está no ar — nada a fazer."; exit 0 ;;
    avanca)  msg "  avança de ${ATUAL:0:7} para ${SHA:0:7}." ;;
    rebaixa) recusar "rebaixamento: $SHA é anterior ao que está no ar ($ATUAL)." ;;
    desvia)  recusar "$SHA não descende do que está no ar ($ATUAL)." ;;
    *)       recusar "não consegui comparar $ATUAL com $SHA no GitHub." ;;
  esac
}

conferir_imagens() {
  passo "Imagens do commit (etiqueta sha-$SHA)"
  CONF_DOCKER="$(mktemp -d "$CORRIDA/docker.XXXXXX")"
  export DOCKER_CONFIG="$CONF_DOCKER"
  if [ -n "$TOKEN" ]; then
    printf '%s' "$TOKEN" | docker login ghcr.io -u x-access-token --password-stdin >/dev/null 2>&1 \
      || aviso "o login no ghcr.io com o token falhou; tentando puxar sem ele."
  fi
  local n img rev
  for n in "${IMAGENS[@]}"; do
    img="$(imagem "$n" "$SHA")"
    docker pull --quiet "$img" >/dev/null 2>&1 || recusar "a imagem $img não existe ou não pôde ser puxada."
    rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$img" 2>/dev/null || true)"
    [ "$rev" = "$SHA" ] || recusar "a imagem $img diz ser do commit '${rev:-nenhum}', não de $SHA."
    msg "  $n: revisão confere."
  done
  # O login acaba aqui. O token é o do job do GitHub e é revogado quando o job
  # termina — se a conexão cair, um `pull` mais adiante com a credencial morta
  # seria recusado até para imagem pública, e uma versão boa voltaria à toa. O
  # kit não precisa dele: as três imagens já estão no disco, e etiqueta `sha-`
  # é imutável (kit/instalar.sh não a puxa de novo).
  rm -rf "$CONF_DOCKER"
  CONF_DOCKER=""
  unset DOCKER_CONFIG
}

baixar_codigo() {
  passo "Código do commit"
  mkdir -p "$VERSOES"
  if [ -f "$VERSOES/$SHA/kit/instalar.sh" ]; then msg "  já baixado."; return; fi
  local tmp
  tmp="$(mktemp -d "$VERSOES/.baixando.XXXXXX")"
  github "tarball/$SHA" 2>/dev/null | tar -xz -C "$tmp" --strip-components=1 \
    || { rm -rf "$tmp"; recusar "não consegui baixar o código de $SHA do GitHub."; }
  [ -f "$tmp/kit/instalar.sh" ] || { rm -rf "$tmp"; recusar "o código baixado de $SHA não tem kit/instalar.sh."; }
  rm -rf "${VERSOES:?}/$SHA"
  mv "$tmp" "$VERSOES/$SHA"
  msg "  $VERSOES/$SHA"
}

copiar_codigo() { # SHA — o código daquela versão em $RAIZ (o .env fica)
  copiar_arvore "$VERSOES/$1" "$RAIZ"
  printf '%s\n' "$1" > "$RAIZ/.zapsales-revisao"
}

# guardar_codigo_de_agora — a primeira implantação contínua chega numa pasta
# copiada à mão, que nunca passou por $VERSOES.
guardar_codigo_de_agora() {
  if [ ! -f "$VERSOES/$ATUAL/kit/instalar.sh" ]; then
    local tmp
    tmp="$(mktemp -d "$VERSOES/.guardando.XXXXXX")"
    copiar_arvore "$RAIZ" "$tmp"
    rm -rf "${VERSOES:?}/$ATUAL"
    mv "$tmp" "$VERSOES/$ATUAL"
  fi
}

# alvo_responde VERSAO — a imagem do CI grava o sha curto do commit.
alvo_responde() { versao_bate "${1:-}" "$SHA"; }

# O código de saída fica num arquivo que a frente lê — inclusive o 2 de uma
# recusa e o 3/4 da volta, que saem por `exit` de dentro de funções. E o login
# do registro (DOCKER_CONFIG temporário) não sobrevive à implantação.
SITUACAO=""
ao_sair_executor() {
  local c=$?
  if [ -n "$CONF_DOCKER" ]; then rm -rf "$CONF_DOCKER"; fi
  if [ -n "$SITUACAO" ]; then printf '%s\n' "$c" > "$SITUACAO"; fi
}

podar() {
  passo "Guardando só as $GUARDAR últimas versões"
  printf '%s\n' "$SHA" >> "$ESTADO/historico"
  local manter v n
  manter="$(versoes_a_guardar "$GUARDAR" < "$ESTADO/historico" | awk '!v[$0]++')"
  # O que estava no ar antes da primeira implantação contínua também conta.
  manter="$(printf '%s\n%s\n' "$manter" "$ATUAL")"
  for v in "$VERSOES"/*/; do
    v="$(basename "$v")"
    sha_valido "$v" || continue
    grep -qx "$v" <<< "$manter" && continue
    rm -rf "${VERSOES:?}/$v" "${ESTADO:?}/$v"
    for n in "${IMAGENS[@]}"; do docker image rm "$(imagem "$n" "$v")" >/dev/null 2>&1 || true; done
    msg "  removida: ${v:0:7}"
  done
}

executar() {
  # Toda linha que o executor escreve sai marcada; o que não tiver a marca
  # (docker, curl, tar, um erro do bash) fica só no registro, na VPS.
  usar_saida_de_etapa
  SHA="${1:-}"
  ALVO="$SHA"
  VERSAO_IMAGENS="sha-$SHA"
  local situacao="${2:-}" arq_token="${3:-}"
  # Uso INTERNO: só a frente chega aqui, numa unidade do systemd (ambiente
  # limpo). Pelo sudo, os dois caminhos seriam escolhidos por quem chama, e o
  # trap de saída grava num deles como root.
  [ -z "${SUDO_USER:-}" ] || falha "--executar é interno; use: zapsales-implantar <sha>"
  sha_valido "$SHA" || falha "sha inválido."
  case "$situacao" in "$CORRIDA"/*.saida) ;; *) falha "arquivo de saída fora de $CORRIDA." ;; esac
  case "$arq_token" in "$CORRIDA"/*.token) ;; *) falha "arquivo do token fora de $CORRIDA." ;; esac
  SITUACAO="$situacao"
  trap ao_sair_executor EXIT
  trap 'ao_errar $LINENO' ERR
  TOKEN="$(cat "$arq_token" 2>/dev/null || true)"
  rm -f "$arq_token"
  exigir_root
  command -v python3 >/dev/null || recusar "python3 não está instalado."
  install -d -m 700 "$CORRIDA" "$ESTADO"
  exec 8>/run/zapsales-implantar.lock
  flock -n 8 || recusar "outra implantação está em andamento."
  msg "Implantação de $SHA — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  conferir_pedido
  conferir_imagens
  baixar_codigo
  guardar_o_que_esta_no_ar
  instalar
  provar
  # Ensaio da volta: a versão nova passou em tudo, e mesmo assim volta. Só
  # alcançável como root na própria VPS — pela chave do GitHub o sudo limpa o
  # ambiente, e esta variável nunca chega aqui.
  if [ "${ZAPSALES_ENSAIAR_VOLTA:-}" = "1" ]; then voltar "ensaio da volta (ZAPSALES_ENSAIAR_VOLTA=1)."; fi
  # Daqui em diante a versão nova está aprovada: nenhum erro da arrumação a
  # derruba.
  trap - ERR
  TOCOU=0
  podar || aviso "a arrumação das versões antigas falhou; a implantação vale."
  TOKEN=""
  passo "Implantado: ${SHA:0:7} está no ar em https://$DOMINIO"
}

# O usuário da implantação, pelo sudo, só alcança `<sha>` — mesmo que um dia
# tenha um terminal, `acesso` e `instalar-comando` não são dele.
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" = "$USUARIO" ] && ! sha_valido "${1:-}"; then
  printf 'Recusado: o único comando aceito é "implantar <sha de 40 caracteres>".\n' >&2
  exit 2
fi

case "${1:-}" in
  acesso)            shift; acesso "$@" ;;
  instalar-comando)  instalar_comando ;;
  --executar)        shift; executar "$@" ;;
  "")
    [ "$(id -u)" -eq 0 ] && falha "Uso: sudo zapsales-implantar <sha> · sudo kit/implantar.sh acesso \"<chave pública>\""
    entrar_pelo_ssh ;;
  *)
    [ "$(id -u)" -eq 0 ] || entrar_pelo_ssh
    frente "$1" ;;
esac

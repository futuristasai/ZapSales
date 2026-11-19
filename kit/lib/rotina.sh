# shellcheck shell=bash
# A ROTINA PROTEGIDA — guardar → instalar → provar → voltar (issue #311).
#
# Nasceu dentro do kit/implantar.sh (issue #24), que leva o topo da `main` à
# produção. O programa do servidor (kit/agente.sh) faz a mesma coisa com outro
# alvo — a última RELEASE —, então a rotina mora aqui e os dois a chamam, em vez
# de existirem duas cópias que divergem no primeiro conserto.
#
# O que a rotina garante, para qualquer alvo:
#   1. guarda o que está no ar: o .env de agora e o código de agora;
#   2. instala pelo próprio kit (kit/instalar.sh, que faz o dump do banco antes
#      do baseline), com as imagens da versão pedida;
#   3. prova: /api/v1/health responde a versão nova, nenhuma dependência que
#      estava ok piora, e app/worker/agendador ficam saudáveis e sem reinício
#      por OBSERVAR_S segundos (2 minutos);
#   4. qualquer falha depois de tocar volta sozinha para a versão anterior —
#      código, .env e imagens. O banco NÃO volta (o baseline é aditivo), com uma
#      exceção: se o baseline da versão nova parou NO MEIO, a volta reaplica o
#      da versão anterior, para o banco não ficar entre duas versões (#360).
#
# ─── O contrato com quem chama ───────────────────────────────────────────────
#
# Variáveis (definidas antes de chamar):
#   RAIZ ENV_ARQ ESTADO LOGS CORRIDA  onde a instalação mora
#   ALVO            o que vai entrar (um sha inteiro, ou uma tag vX.Y.Z)
#   ATUAL           o que está no ar (no mesmo formato)
#   VERSAO_IMAGENS  a etiqueta das imagens do ALVO (`sha-<commit>` ou `X.Y.Z`)
#   DOMINIO OBSERVAR_S
#   PREFIXO_DO_REGISTRO NOME_DO_PROGRAMA  (opcionais) como os registros e erros se chamam
#
# Funções que quem chama define (o que muda de um alvo para o outro):
#   copiar_codigo ID          põe em $RAIZ o código da versão ID (o .env fica)
#   guardar_codigo_de_agora   garante que `copiar_codigo "$ATUAL"` vai funcionar
#   alvo_responde VERSAO      a versão que /api/v1/health respondeu é a do ALVO?
#   ao_ver_titulo_do_kit T    (opcional) chamada a cada título de passo do kit
#
# A rotina escreve pelas funções de saída de comum.sh/implantar.sh (msg, passo,
# aviso): quem chama decide se elas marcam a linha (usar_saida_de_etapa).
#
# Saída: voltar() termina o processo com 3 (voltou) ou 4 (a volta falhou).

TOCOU=0
REG_KIT=""
SAUDE_ANTES=""

# curto ID — o jeito de mostrar uma versão: 7 caracteres de um sha, a tag inteira.
curto() {
  if sha_valido "${1:-}"; then printf '%s' "${1:0:7}"; else printf '%s' "${1:-}"; fi
}

# local_https CAMINHO [args do curl] — pelo proxy DESTA máquina, com o
# certificado conferido, sem depender do DNS de fora.
local_https() {
  local caminho="$1"; shift
  curl -s --max-time 10 --resolve "$DOMINIO:443:127.0.0.1" "$@" "https://$DOMINIO$caminho" 2>/dev/null || true
}

saude() { local_https /api/v1/health; }

id_do_servico() { (cd "$RAIZ" && docker compose ps -q "$1" 2>/dev/null | head -1) || true; }

# guardar_o_que_esta_no_ar — o que a volta vai precisar: o .env de agora e o
# código de agora.
guardar_o_que_esta_no_ar() {
  passo "Guardando o que está no ar ($(curto "$ATUAL")) para uma volta"
  install -d -m 700 "$ESTADO/$ALVO"
  cp -p "$ENV_ARQ" "$ESTADO/$ALVO/env.antes"
  guardar_codigo_de_agora
  SAUDE_ANTES="$(saude)"
  msg "  .env e código guardados; saúde de antes: $(deps_ok "$SAUDE_ANTES" | tr '\n' ' ')"
}

# copiar_arvore DE PARA — sobrepõe, sem o .env. Sobrepõe e não espelha: arquivo
# que só existe numa versão fica para trás depois de trocar (inofensivo — o
# compose e o kit só leem os arquivos que a versão em vigor nomeia), e um
# espelho com remoção apagaria o que mora em $RAIZ sem ser do repositório.
copiar_arvore() { tar -C "$1" --exclude=./.env -cf - . | tar -xf - -C "$2"; }

# _avisar_titulos_do_kit — passa a saída do kit adiante, linha por linha, sem
# mudar nada, e chama `ao_ver_titulo_do_kit TÍTULO` (se quem chama a definiu) a
# cada título de passo (a linha que COMEÇA com `▶ `, como em titulos_do_kit). É
# por aqui que o programa do servidor conta à tela quando o banco começou. O
# gancho escreve só em stderr/arquivo: o que ele imprimir em stdout iria parar
# no registro como se fosse do kit.
_avisar_titulos_do_kit() {
  local l t
  while IFS= read -r l || [ -n "$l" ]; do
    printf '%s\n' "$l"
    if declare -F ao_ver_titulo_do_kit >/dev/null; then
      t="$(printf '%s' "$l" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g')"
      case "$t" in "▶ "*) ao_ver_titulo_do_kit "${t#"▶ "}" >/dev/null || true ;; esac
    fi
  done
  return 0
}

instalar() {
  passo "Instalando $(curto "$ALVO") pelo kit"
  TOCOU=1
  copiar_codigo "$ALVO"
  # O registro inteiro do kit fica SÓ na VPS: ele traz o e-mail do
  # administrador e os domínios dos sites vizinhos, e o log de um workflow de
  # repositório público é público. Ao registro da implantação — e dele ao
  # GitHub ou à tela — vão só os títulos dos passos do kit (frases fixas),
  # reescritos como etapa por titulos_do_kit.
  local reg_kit rc_arq
  reg_kit="$LOGS/${PREFIXO_DO_REGISTRO:-implantar}-$(date -u +%Y%m%dT%H%M%SZ)-$(curto "$ALVO")-kit.log"
  # A volta lê este registro para saber POR QUE voltou (baseline_parou_no_meio).
  REG_KIT="$reg_kit"
  rc_arq="$CORRIDA/$ALVO.kit"
  rm -f "$rc_arq"
  msg "  registro completo do kit (só na VPS): $reg_kit"
  # O kit não recebe token nem login. O trap ERR sai do grupo: a falha do kit é
  # tratada abaixo, uma vez.
  { trap - ERR; set +e
    ZAPSALES_IMAGENS=registro ZAPSALES_VERSAO="$VERSAO_IMAGENS" bash "$RAIZ/kit/instalar.sh" < /dev/null 2>&1
    printf '%s\n' "$?" > "$rc_arq"
  } | tee "$reg_kit" | _avisar_titulos_do_kit | titulos_do_kit
  [ "$(cat "$rc_arq" 2>/dev/null)" = "0" ] || voltar "o kit/instalar.sh falhou — o motivo está no fim de $reg_kit, na VPS."
}

estado_dos_servicos() { # "serviço id reinícios" por linha
  local s id
  for s in app worker scheduler; do
    id="$(id_do_servico "$s")"
    [ -n "$id" ] || { printf '%s ausente 0\n' "$s"; continue; }
    printf '%s %s\n' "$s" "$(docker inspect -f '{{.Id}} {{.RestartCount}}' "$id" 2>/dev/null || echo "ausente 0")"
  done
}

servicos_saudaveis() {
  local s id estado
  for s in app worker scheduler; do
    id="$(id_do_servico "$s")"
    [ -n "$id" ] || return 1
    estado="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
    [ "$estado" = "healthy" ] || [ "$estado" = "running" ] || return 1
  done
}

provar() {
  passo "Provando a versão nova"
  local s="" v=""
  for _ in $(seq 1 30); do
    s="$(saude)"
    v="$(versao_da_saude "$s")"
    alvo_responde "$v" && break
    sleep 4
  done
  alvo_responde "$v" || voltar "/api/v1/health responde a versão '${v:-nenhuma}', não $(curto "$ALVO")."
  msg "  /api/v1/health responde $v."
  local piores
  piores="$(dependencias_que_pioraram "$SAUDE_ANTES" "$s" | tr '\n' ' ')"
  [ -z "${piores// /}" ] || voltar "dependência que estava ok piorou: $piores"
  msg "  nenhuma dependência piorou ($(deps_ok "$s" | tr '\n' ' ')ok)."

  # O worker tem healthcheck com início de 20 s e intervalo de 30 s: logo depois
  # do kit ele ainda pode estar `starting`, o que não é falha.
  local espera=0
  until servicos_saudaveis; do
    [ "$espera" -lt 180 ] || voltar "app, worker ou agendador não ficaram saudáveis em 180s."
    sleep 5
    espera=$((espera + 5))
  done
  local base agora t=0
  base="$(estado_dos_servicos)"
  msg "  observando app, worker e agendador por ${OBSERVAR_S}s (saudáveis e sem reinício)…"
  while [ "$t" -lt "$OBSERVAR_S" ]; do
    sleep 10
    t=$((t + 10))
    agora="$(estado_dos_servicos)"
    [ "$agora" = "$base" ] || voltar "reinício durante a observação: antes [$base] · agora [$agora]"
    servicos_saudaveis || voltar "um serviço deixou de estar saudável aos ${t}s."
  done
  piores="$(dependencias_que_pioraram "$SAUDE_ANTES" "$(saude)" | tr '\n' ' ')"
  [ -z "${piores// /}" ] || voltar "dependência que estava ok piorou durante a observação: $piores"
  msg "  ${OBSERVAR_S}s sem reinício; tudo saudável."
}

# baseline_parou_no_meio REGISTRO_DO_KIT — o kit desta rodada disse que o
# baseline falhou no meio? A frase é a do `falha` de kit/instalar.sh (o teste
# tests/shell/kit-volta-reaplica-baseline.test.sh cobra que as duas pontas dizem
# o mesmo). Sem registro, ou com falha em outro passo, a resposta é não.
baseline_parou_no_meio() {
  [ -n "${1:-}" ] && [ -f "$1" ] && grep -q 'O baseline.sql falhou no meio' "$1"
}

# Passadas e pausa da reaplicação (a pausa é variável para o teste não esperar).
VOLTA_BASELINE_TENTATIVAS=3
: "${ESPERA_DA_VOLTA_S:=5}"

# reaplicar_baseline_da_volta — aplica o baseline que está em $RAIZ (o da versão
# para a qual se volta) e reinicia o tempo real, como o kit faz depois de todo
# baseline. A volta também roda com o app em uso, então deadlock ganha nova
# passada; defeito, não. A saída do psql vai para um arquivo em $LOGS: o que a
# implantação imprime vira log público.
reaplicar_baseline_da_volta() {
  local reg tentativa=1 codigo
  reg="$LOGS/${PREFIXO_DO_REGISTRO:-implantar}-$(date -u +%Y%m%dT%H%M%SZ)-$(curto "$ATUAL")-volta-baseline.log"
  msg "  registro da reaplicação (só na VPS): $reg"
  while :; do
    codigo=0
    (cd "$RAIZ" && docker compose exec -T db psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q) \
      < "$RAIZ/supabase/baseline.sql" >> "$reg" 2>&1 || codigo=$?
    [ "$codigo" = "0" ] && break
    if [ "$tentativa" -ge "$VOLTA_BASELINE_TENTATIVAS" ] || ! tail -40 "$reg" | grep -q 'deadlock detected'; then
      return 1
    fi
    tentativa=$((tentativa + 1))
    msg "  o banco interrompeu a reaplicação por disputa com o app em uso; de novo (passada $tentativa de $VOLTA_BASELINE_TENTATIVAS)."
    printf '\n== passada %s ==\n' "$tentativa" >> "$reg"
    sleep "$ESPERA_DA_VOLTA_S"
  done
  (cd "$RAIZ" && docker compose restart realtime) >> "$reg" 2>&1 || return 1
}

# voltar MOTIVO — põe de volta código, .env e imagens da versão anterior.
#
# O BANCO: fica como está quando o baseline da versão nova CHEGOU AO FIM — ele é
# aditivo, e o código anterior roda sobre ele. Quando o kit disse que o baseline
# parou NO MEIO, o banco não é o de versão nenhuma (o arquivo redefine a mesma
# função mais de uma vez no caminho; foi esse meio do caminho que derrubou a
# tela de Conversas em 19/11/2026), e a volta reaplica o baseline da versão
# ANTERIOR, que é idempotente e leva cada objeto de volta à definição final
# daquela versão. O que a versão nova tiver criado de novo antes de parar fica
# (é aditivo). Só nesse caso: aplicar o arquivo antigo por cima de um schema
# novo INTEIRO seria um rebaixamento que ninguém provou.
voltar() {
  trap - ERR
  { _etapa ""; _etapa "✖ FALHOU: $*"; } >&2
  passo "Voltando para $(curto "$ATUAL")"
  local ok=1 codigo_voltou=1
  copiar_codigo "$ATUAL" || { ok=0; codigo_voltou=0; }
  cp -p "$ESTADO/$ALVO/env.antes" "$ENV_ARQ" || ok=0
  chmod 600 "$ENV_ARQ" || true
  # Antes de subir os serviços, e só com o código anterior de volta em $RAIZ:
  # sem ele, o baseline que está lá pode ser o do alvo — o que acabou de falhar.
  if baseline_parou_no_meio "${REG_KIT:-}"; then
    if [ "$codigo_voltou" = "1" ]; then
      msg "  o baseline de $(curto "$ALVO") parou no meio: reaplicando o de $(curto "$ATUAL") para o banco voltar a um estado inteiro."
      if reaplicar_baseline_da_volta; then
        msg "  baseline de $(curto "$ATUAL") reaplicado."
      else
        aviso "A reaplicação do baseline de $(curto "$ATUAL") falhou: o banco segue entre duas versões."
        ok=0
      fi
    else
      aviso "O baseline de $(curto "$ALVO") parou no meio e o código de $(curto "$ATUAL") não voltou: o banco segue entre duas versões."
    fi
  fi
  (cd "$RAIZ" && docker compose up -d --remove-orphans) || ok=0
  local cod=""
  for _ in $(seq 1 60); do
    servicos_saudaveis && cod="$(local_https / -o /dev/null -w '%{http_code}')"
    [ "$cod" = "307" ] && break
    sleep 4
  done
  [ "$cod" = "307" ] || ok=0
  # A versão que respondia antes tem de voltar a responder (quando havia uma).
  local v_antes v_agora=""
  v_antes="$(versao_da_saude "$SAUDE_ANTES")"
  if [ -n "$v_antes" ]; then
    v_agora="$(versao_da_saude "$(saude)")"
    [ "$v_agora" = "$v_antes" ] || ok=0
  fi
  if [ "$ok" = "1" ]; then
    msg "  de volta em $(curto "$ATUAL"): serviços saudáveis, https://$DOMINIO/ → 307${v_antes:+, /api/v1/health responde $v_antes}."
    exit 3
  fi
  aviso "A VOLTA TAMBÉM FALHOU (https://$DOMINIO/ → '${cod:-nada}', versão '${v_agora:-?}' em vez de '${v_antes:-?}'). Veja: cd $RAIZ && docker compose ps"
  exit 4
}

# recusar MOTIVO — antes de tocar em qualquer coisa: nada foi alterado.
recusar() { { _etapa ""; _etapa "✖ RECUSADO: $*"; _etapa "  Nada foi alterado na instalação."; } >&2; exit 2; }

# Erro inesperado (comando que falhou sob set -e) depois de tocar também volta.
ao_errar() {
  local linha="$1"
  # Com `set -E` o trap vale também dentro de $(...). Lá ele só sai com erro: a
  # atribuição no shell de cima falha e o trap de lá decide — uma vez.
  if [ "${BASH_SUBSHELL:-0}" -gt 0 ]; then exit 1; fi
  if [ "$TOCOU" = "1" ]; then voltar "erro inesperado na linha $linha de ${NOME_DO_PROGRAMA:-kit/implantar.sh}."; fi
  { _etapa ""; _etapa "✖ RECUSADO: erro inesperado na linha $linha, antes de alterar a instalação."; } >&2
  exit 2
}

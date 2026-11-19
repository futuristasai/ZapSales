# shellcheck shell=bash
# Operações sobre a stack em Docker: compose, banco e espera de saúde.
#
# Tudo aqui supõe RAIZ (a pasta da instalação, com o .env) já definida.

# garantir_docker — instala o Docker pelo script oficial se faltar, e o deixa
# habilitado no boot (é o que traz a stack de volta depois de um reboot).
garantir_docker() {
  if ! command -v docker >/dev/null; then
    msg "  Docker ausente — instalando pelo script oficial (get.docker.com)."
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
}

# dc — o `docker compose` da instalação. O COMPOSE_FILE e o
# COMPOSE_PROJECT_NAME moram no .env, que o Compose lê sozinho na pasta do
# projeto: é o que faz um `docker compose up -d` digitado à mão, sem o kit,
# subir o MESMO conjunto de arquivos (incluindo o override do modo convivendo).
dc() { (cd "$RAIZ" && docker compose "$@"); }

# psql_db [args...] — psql dentro do contêiner do banco, como o DONO (postgres).
psql_db() { dc exec -T db psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# psql_admin [args...] — como supabase_admin, o superusuário da imagem do
# Supabase. Só para o que o dono não pode: restauração com gatilhos
# desligados e o papel do worker (BYPASSRLS).
psql_admin() { dc exec -T db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# sql_valor "SELECT ..." — imprime o valor de uma consulta de uma célula.
sql_valor() { psql_db -At -c "$1" 2>/dev/null | tr -d '[:space:]'; }

# esperar NOME SEGUNDOS COMANDO... — repete o comando até dar certo.
esperar() {
  local nome="$1" limite="$2" i=0
  shift 2
  until "$@" >/dev/null 2>&1; do
    i=$((i + 2))
    if [ "$i" -ge "$limite" ]; then
      aviso "$nome não ficou pronto em ${limite}s."
      return 1
    fi
    sleep 2
  done
  msg "  $nome pronto."
}

banco_aceita_conexao() { dc exec -T db pg_isready -U postgres -h localhost; }

# O GoTrue e o Storage criam os schemas `auth` e `storage` nas próprias
# migrations, no primeiro boot. O baseline tem chave estrangeira para
# auth.users e insere em storage.buckets: aplicar antes disso falha.
schemas_do_supabase_prontos() {
  [ "$(sql_valor "select (to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null)::int")" = "1" ]
}

# redigir_log ENV — filtro: mascara segredo em linha de log que vai SAIR da VPS
# (tela do comprador e, pelo executor do instalador guiado, a ficha no servidor
# de licenças). Troca LITERALMENTE todo valor do .env cuja chave nomeia segredo
# (o banco o devolve verbatim numa URL de conexão, por exemplo) e, por padrão,
# credencial em URL, JWT e `password=`. Corta a linha em 300 caracteres: o
# GoTrue e o Storage logam JSON de uma linha só, e a ficha guarda 20 linhas.
redigir_log() {
  local segredos
  segredos="$(grep -E '^[A-Z0-9_]*(SECRET|PASSWORD|PASS|KEY|TOKEN|SENHA|CHAVE)[A-Z0-9_]*=.' "$1" 2>/dev/null \
    | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/" || true)"
  # ENVIRON e não -v: o -v do awk interpreta barra invertida, e segredo pode ter.
  SEGREDOS="$segredos" awk '
    BEGIN { n = split(ENVIRON["SEGREDOS"], s, "\n") }
    {
      linha = $0
      for (i = 1; i <= n; i++) {
        v = s[i]
        if (length(v) < 8) continue   # valor curto (true, 1, porta) apagaria texto à toa
        while ((p = index(linha, v)) > 0)
          linha = substr(linha, 1, p - 1) "***" substr(linha, p + length(v))
      }
      print linha
    }' \
    | sed -E \
      -e 's#(://[^:/@[:space:]]+):[^@[:space:]]+@#\1:***@#g' \
      -e 's#eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#***#g' \
      -e "s#((password|passwd|pwd|secret|token)[\"']?[[:space:]]*[=:][[:space:]]*[\"']?)[^\"'[:space:],&}]+#\1***#gI" \
    | cut -c1-300
}

# linhas_que_explicam — das últimas linhas de um log, as que dizem o motivo:
# as 3 últimas com cara de erro (em qualquer ponto da cauda) e as 2 finais,
# na ordem em que aconteceram, sem repetir. Máximo 5.
linhas_que_explicam() {
  awk '
    # `"level":50/60` é erro/fatal no pino (o log do Storage), que nem sempre diz "error" por extenso.
    { l[NR] = $0; if (tolower($0) ~ /fatal|panic|error|erro|failed|falh|refused|denied|cannot|could not|unable|"level": ?(50|60)[,}]/) e[++ne] = NR }
    END {
      for (i = (ne > 3 ? ne - 2 : 1); i <= ne; i++) escolhida[e[i]] = 1
      for (i = (NR > 2 ? NR - 1 : 1); i <= NR; i++) escolhida[i] = 1
      for (i = 1; i <= NR; i++) if (escolhida[i]) print l[i]
    }'
}

# diagnosticar_servicos ENV SERVIÇO... — antes de desistir de um serviço que não
# ficou pronto, imprime o estado de cada um (situação, reinícios, código de
# saída) e as linhas do log que explicam por quê, já mascaradas. Sem isto a
# ficha do instalador guiado só guardava "não ficou pronto em 240s" e o motivo
# morria na VPS do comprador (17/11/2026). Nunca falha: é diagnóstico, e o kit
# vai falhar logo em seguida com a mensagem de sempre.
diagnosticar_servicos() {
  local env="$1" s id estado
  shift
  for s in "$@"; do
    estado=""
    id="$(dc ps -q "$s" 2>/dev/null | head -1)" || id=""
    if [ -n "$id" ]; then
      estado="$(docker inspect -f '{{.State.Status}} reinícios={{.RestartCount}} saída={{.State.ExitCode}}' "$id" 2>/dev/null)" || estado=""
    fi
    msg "  Diagnóstico · $s: ${estado:-sem contêiner}"
    { dc logs --no-color --tail 200 "$s" 2>/dev/null | linhas_que_explicam | redigir_log "$env" | sed 's/^/    /'; } || true
  done
  return 0
}

servico_saudavel() { # NOME
  local id estado
  id="$(dc ps -q "$1")"
  [ -n "$id" ] || return 1
  estado="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
  [ "$estado" = "healthy" ] || [ "$estado" = "running" ]
}

# erro_passageiro_do_banco ARQUIVO — verdadeiro quando a saída de erro do psql
# diz que o banco DESISTIU por disputa com outra sessão, e não por defeito do
# que foi pedido. Hoje é um caso só, o que foi medido: deadlock. A mensagem é a
# do servidor, em inglês — a imagem do banco é a que o compose do kit fixa, e
# ela nasce com `lc_messages` em inglês.
erro_passageiro_do_banco() { grep -q 'deadlock detected' "$1"; }

# Quantas passadas o baseline ganha quando o banco desiste por disputa, e a
# pausa entre elas (a pausa é variável para o teste de shell não esperar).
BASELINE_TENTATIVAS=3
: "${BASELINE_ESPERA_S:=5}"

# aplicar_baseline — o baseline.sql, de novo quando o banco desiste por disputa.
#
# Na atualização o baseline roda com o app EM USO, e ele troca policy em quase
# toda tabela (`fn_aplicar_travas_de_suporte`): quando uma requisição do app
# segura duas dessas tabelas na ordem contrária, o Postgres resolve o deadlock
# derrubando uma das duas sessões — e pode ser esta. Parar ali deixa o schema
# NO MEIO do arquivo, que não é o estado de versão nenhuma: o baseline redefine
# a mesma função mais de uma vez no caminho, e o meio do caminho tem chamada
# ambígua (19/11/2026: a caixa de conversas respondeu "Erro interno" por dez
# horas). O arquivo é idempotente, então rodar de novo é o conserto.
#
# Só o erro passageiro ganha nova passada. Defeito do próprio arquivo se repete
# igual, e repetir só triplicaria o erro na tela de quem instala.
aplicar_baseline() {
  local erros tentativa=1 codigo
  erros="$(mktemp)"
  while :; do
    codigo=0
    psql_db < "$RAIZ/supabase/baseline.sql" 2>"$erros" || codigo=$?
    cat "$erros" >&2
    if [ "$codigo" = "0" ]; then
      rm -f "$erros"
      return 0
    fi
    if [ "$tentativa" -ge "$BASELINE_TENTATIVAS" ] || ! erro_passageiro_do_banco "$erros"; then
      rm -f "$erros"
      return "$codigo"
    fi
    tentativa=$((tentativa + 1))
    aviso "O banco interrompeu o baseline por disputa com o app em uso (deadlock). O arquivo é idempotente: aplicando de novo (passada $tentativa de $BASELINE_TENTATIVAS)."
    sleep "$BASELINE_ESPERA_S"
  done
}

# aplicar_schema — extensões + baseline.sql (o MESMO arquivo em instalação e
# atualização: ele é idempotente, e o CI prova as duas passadas com
# ON_ERROR_STOP=1) + semente da chave de cifra das integrações + papel do
# worker. Mesmo roteiro do e2e (.github/workflows/e2e.yml).
#
# ⚠️ Cada passo termina em `|| return 1`, e não é enfeite. Quem chama escreve
# `aplicar_schema || falha "…"`, e nesse contexto o bash DESLIGA o `set -e`
# dentro da função: sem o `return`, o baseline falhava, os dois passos seguintes
# davam certo, e a função devolvia o código do ÚLTIMO — zero. A atualização
# seguia, subia o app sobre um schema pela metade e escrevia "Pronto".
# Cobrado por tests/shell/kit-aplicar-schema.test.sh.
aplicar_schema() {
  local chave_integracoes senha_worker
  chave_integracoes="$(env_ler "$RAIZ/.env" INTEGRATIONS_OAUTH_ENCRYPTION_KEY)"
  senha_worker="$(env_ler "$RAIZ/.env" AGENT_WORKER_DB_PASSWORD)"

  psql_db <<'SQL' || return 1
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
SQL
  aplicar_baseline || return 1

  # Sem a chave, `fn_encrypt_oauth` recusa salvar qualquer segredo de
  # integração. `do nothing`: a chave de uma instalação existente nunca muda,
  # senão o que já foi cifrado vira lixo.
  psql_db -v chave="$chave_integracoes" <<'SQL' || return 1
insert into private.app_secrets (name, value) values ('integrations_oauth_key', :'chave')
on conflict (name) do nothing;
SQL

  psql_admin -v senha="$senha_worker" < "$RAIZ/kit/sql/papel-do-worker.sql" || return 1
}

# O Realtime precisa reiniciar DEPOIS do baseline: ele lê a publication
# `supabase_realtime` no boot, e é o baseline que põe as tabelas nela. Sem o
# restart, o canal responde SUBSCRIBED e nunca entrega (medido no e2e, PR #327).
reiniciar_realtime() {
  dc restart realtime >/dev/null
  esperar "Realtime" 120 servico_saudavel realtime
}

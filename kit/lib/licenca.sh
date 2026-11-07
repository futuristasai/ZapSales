# shellcheck shell=bash
# Ativação da licença (ADR-0005, Fase 3): o instalador troca "e-mail da compra + código da transação"
# por uma licença, falando com o servidor de licenças POR DENTRO do contêiner do worker
# (scripts/ativar-licenca.ts). Supõe comum.sh e stack.sh carregados e RAIZ, ESTADO e LOGS definidos.
#
# TRÊS REGRAS, todas provadas em tests/shell/kit-ativar-licenca.test.sh:
#
#  1. A INSTALAÇÃO NUNCA FALHA POR CAUSA DA LICENÇA. Sem os dados, com a compra recusada ou com o servidor
#     fora do ar, ela termina do mesmo jeito, no estado "ativação pendente", e um comando posterior
#     (kit/ativar-licenca.sh) ativa. Quem acabou de pagar não pode ver a instalação abortar por isso.
#  2. O KIT NUNCA PÕE A COMPRA NA LINHA DE COMANDO. Ela chega ao contêiner por variável de ambiente
#     (`-e NOME`, sem valor: o Docker herda do ambiente de quem chamou) — argumento apareceria em `ps` e no
#     histórico. Não vai para o .env, para o log do kit nem para a tela, e as variáveis são retiradas do
#     ambiente assim que lidas (não seguem para o proxy, o backup nem a implantação contínua).
#     ATENÇÃO, quem chama: `sudo ZAPSALES_LICENCA_…=valor kit/…` deixa o valor no argv do próprio `sudo`.
#     Sem terminal, o caminho que não vaza é o ARQUIVO protegido (`ler_compra_do_arquivo`, abaixo).
#  3. SEM TERMINAL, NUNCA ESPERA. Pergunta só com `[ -t 0 ]`. Sem terminal usa, nesta ordem: as variáveis
#     ZAPSALES_LICENCA_EMAIL/ZAPSALES_LICENCA_TRANSACAO, o arquivo; sem nenhum dos dois, fica pendente.

LICENCA_EMAIL=""
LICENCA_TRANSACAO=""
LICENCA_ARQUIVO_USADO=""
# 0 = ativada (ou já estava) · diferente de 0 = pendente. Quem chama decide o que fazer; o kit só avisa.
LICENCA_RC=0

licenca_ja_ativada() {
  [ "$(sql_valor "select count(*) from public.platform_licenca where ativada_em is not null")" = "1" ]
}

# A mesma régua do app (lib/licenca/ativar-kit.ts); aqui serve para pedir de novo antes de gastar uma chamada.
licenca_email_ok() { [[ "${1:-}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }
licenca_codigo_ok() { [[ "${1:-}" =~ ^[A-Za-z0-9_-]{4,64}$ ]]; }

# ler_compra — completa LICENCA_EMAIL/LICENCA_TRANSACAO (já vindos do ambiente, em ativar_licenca_da_compra)
# com o arquivo e, por fim, a pergunta (só com terminal). Enter = ativar depois.
ler_compra() {
  if [ -z "$LICENCA_EMAIL" ] || [ -z "$LICENCA_TRANSACAO" ]; then ler_compra_do_arquivo; fi
  [ -t 0 ] || return 0
  local t
  for t in 1 2 3; do
    if licenca_email_ok "$LICENCA_EMAIL"; then break; fi
    [ "$t" -eq 1 ] && [ -z "$LICENCA_EMAIL" ] || aviso "Esse e-mail não parece correto."
    LICENCA_EMAIL=""
    read -r -p "E-mail da compra do ZapSales (Enter = ativar depois): " LICENCA_EMAIL || true
    [ -n "$LICENCA_EMAIL" ] || return 0
  done
  for t in 1 2 3; do
    if licenca_codigo_ok "$LICENCA_TRANSACAO"; then break; fi
    [ "$t" -eq 1 ] && [ -z "$LICENCA_TRANSACAO" ] || aviso "Esse código não parece correto."
    LICENCA_TRANSACAO=""
    read -r -s -p "Código da transação, começa com HP (não aparece na tela; Enter = ativar depois): " LICENCA_TRANSACAO || true
    printf '\n' >&2
    [ -n "$LICENCA_TRANSACAO" ] || return 0
  done
}

# ler_compra_do_arquivo — a via SEM TERMINAL que não deixa a compra no `ps` nem no histórico: um arquivo
# de duas linhas (e-mail, código) em ZAPSALES_LICENCA_ARQUIVO ou /etc/zapsales/licenca-compra. Só é lido
# se for arquivo comum, do usuário que roda o kit, com modo 600 ou 400; senão é ignorado COM AVISO (um
# arquivo legível por outros já vazou a compra). É apagado depois da tentativa (ativar_licenca_da_compra).
ler_compra_do_arquivo() {
  local arq="${ZAPSALES_LICENCA_ARQUIVO:-${ESTADO:-/etc/zapsales}/licenca-compra}" modo dono e="" c=""
  [ -f "$arq" ] && [ ! -L "$arq" ] || return 0
  modo="$(stat -c %a "$arq" 2>/dev/null || true)"
  dono="$(stat -c %u "$arq" 2>/dev/null || true)"
  if { [ "$modo" != "600" ] && [ "$modo" != "400" ]; } || [ "$dono" != "$(id -u)" ]; then
    aviso "Ignorei $arq: ele precisa ser do usuário que roda o kit e ter modo 600 (chmod 600)."
    return 0
  fi
  { IFS= read -r e || true; IFS= read -r c || true; } < "$arq"
  e="${e%$'\r'}"; c="${c%$'\r'}"
  LICENCA_ARQUIVO_USADO="$arq"
  [ -n "$LICENCA_EMAIL" ] || LICENCA_EMAIL="$e"
  [ -n "$LICENCA_TRANSACAO" ] || LICENCA_TRANSACAO="$c"
}

licenca_pendente() { # MOTIVO — a instalação segue; diz como ativar depois
  aviso "Licença: ativação pendente — $1"
  msg "  O sistema já funciona. Quando tiver os dados da compra: sudo $KIT/ativar-licenca.sh"
}

# licenca_desfecho LINHA — a mensagem, em português, para cada desfecho de scripts/ativar-licenca.ts.
# Rede fora do ar e falha LOCAL são coisas diferentes: dizer "rede" para um erro de gravação manda o
# comprador esperar por algo que não vai se resolver sozinho.
licenca_desfecho() {
  local log="${LOGS:-/var/log/zapsales}/licenca.log"
  case "$1" in
    LICENCA=ativada:permanente) msg "  licença ativada (permanente)." ;;
    LICENCA=ativada:*) msg "  licença ativada (temporária: vira definitiva sozinha depois do prazo de garantia)." ;;
    LICENCA=recusada:compra_nao_encontrada) licenca_pendente "não encontrei essa compra. Confira o e-mail e o código da transação." ;;
    LICENCA=recusada:compra_nao_aprovada) licenca_pendente "a compra ainda não foi aprovada (aguarde a confirmação do pagamento)." ;;
    LICENCA=recusada:licenca_bloqueada) licenca_pendente "essa licença está bloqueada. Fale com quem vendeu o sistema." ;;
    LICENCA=recusada:rate_limited) licenca_pendente "muitas tentativas seguidas. Espere alguns minutos." ;;
    LICENCA=recusada:*) licenca_pendente "o servidor de licenças recusou os dados informados." ;;
    LICENCA=dados_invalidos) licenca_pendente "o e-mail ou o código da transação não parecem corretos." ;;
    LICENCA=falhou:servidor_inalcancavel) licenca_pendente "não consegui falar com o servidor de licenças agora (a rede ou o servidor está fora do ar). Tente de novo mais tarde." ;;
    LICENCA=falhou:gravacao_falhou) licenca_pendente "o servidor aceitou, mas não consegui gravar a licença aqui. Rode o comando de novo; se repetir, veja $log." ;;
    LICENCA=falhou:sem_resposta) licenca_pendente "o instalador não conseguiu rodar a ativação nesta máquina (veja $log). Numa instalação com imagem antiga, atualize e rode de novo." ;;
    LICENCA=falhou:*) licenca_pendente "falha local ao ativar (veja $log)." ;;
    *) licenca_pendente "não consegui ativar agora (veja $log)." ;;
  esac
}

# ativar_licenca_da_compra — o passo inteiro. Devolve 0 SEMPRE (regra 1); o resultado fica em LICENCA_RC.
ativar_licenca_da_compra() {
  passo "Licença"
  LICENCA_RC=0
  LICENCA_ARQUIVO_USADO=""
  LICENCA_EMAIL="${ZAPSALES_LICENCA_EMAIL:-}"
  LICENCA_TRANSACAO="${ZAPSALES_LICENCA_TRANSACAO:-}"
  # Exportadas pelo operador, elas herdariam para TODO filho do kit (proxy, backup, implantação). Daqui em
  # diante só a chamada ao worker as vê, pelo prefixo de uma única linha.
  unset ZAPSALES_LICENCA_EMAIL ZAPSALES_LICENCA_TRANSACAO
  if licenca_ja_ativada; then
    LICENCA_EMAIL=""; LICENCA_TRANSACAO=""
    msg "  já ativada — nada a fazer (rodar o kit de novo nunca pede a compra outra vez)."
    return 0
  fi

  ler_compra
  if [ -z "$LICENCA_EMAIL" ] || [ -z "$LICENCA_TRANSACAO" ]; then
    LICENCA_RC=12
    licenca_pendente "faltam o e-mail e o código da compra."
    LICENCA_EMAIL=""; LICENCA_TRANSACAO=""
    return 0
  fi

  local log="${LOGS:-/tmp}/licenca.log" bruto saida rc=0
  (umask 077 && : >> "$log") 2>/dev/null || log=/dev/null
  # Os dados entram no ambiente SÓ desta chamada, e o `-e NOME` (sem valor) os repassa ao contêiner.
  bruto="$(ZAPSALES_LICENCA_EMAIL="$LICENCA_EMAIL" ZAPSALES_LICENCA_TRANSACAO="$LICENCA_TRANSACAO" \
    dc run --rm --no-deps -T \
      -e NEXT_PUBLIC_SUPABASE_URL="http://caddy:8000" \
      -e ZAPSALES_LICENCA_EMAIL -e ZAPSALES_LICENCA_TRANSACAO \
      worker pnpm exec tsx scripts/ativar-licenca.ts 2>>"$log")" || rc=$?
  LICENCA_EMAIL=""; LICENCA_TRANSACAO=""
  # A compra não fica em disco depois da tentativa: se for preciso tentar de novo, o operador a entrega outra vez.
  [ -z "$LICENCA_ARQUIVO_USADO" ] || rm -f "$LICENCA_ARQUIVO_USADO"

  saida="$(printf '%s\n' "$bruto" | grep -E '^LICENCA=' | tail -1 || true)"
  [ -n "$saida" ] || saida="LICENCA=falhou:sem_resposta"
  LICENCA_RC="$rc"
  licenca_desfecho "$saida"
  return 0
}

# definir_modo_da_licenca [sombra|valendo] — o interruptor da trava (ADR-0005, D-7).
#   sem argumento: mostra o modo em vigor;  com argumento: troca, por dentro do worker
#   (scripts/definir-modo-da-licenca.ts). Devolve 0 ok · 1 não foi possível · 2 argumento inválido.
# Não é uma tela nem uma API: quem tem root na máquina decide, como em qualquer outra configuração da
# instalação. A troca fica registrada em $LOGS/licenca.log (quando e por quem).
definir_modo_da_licenca() {
  local pedido="${1:-}" atual
  atual="$(sql_valor "select modo from public.platform_licenca limit 1")"
  if [ -z "$pedido" ]; then
    msg "  modo da trava de licença: ${atual:-desconhecido (a instalação ainda não consultou a licença)}"
    msg "  sombra  = calcula e registra, nunca restringe (o padrão)"
    msg "  valendo = recusa a instalação ativada cuja licença venceu ou foi bloqueada (dados e exportação ficam)"
    return 0
  fi
  case "$pedido" in
    sombra|valendo) ;;
    *) aviso "Use: sudo $KIT/licenca-modo.sh [sombra|valendo]"; return 2 ;;
  esac

  local log="${LOGS:-/tmp}/licenca.log" bruto linha rc=0
  (umask 077 && : >> "$log") 2>/dev/null || log=/dev/null
  bruto="$(dc run --rm --no-deps -T \
    -e NEXT_PUBLIC_SUPABASE_URL="http://caddy:8000" \
    -e ZAPSALES_LICENCA_MODO="$pedido" \
    worker pnpm exec tsx scripts/definir-modo-da-licenca.ts 2>>"$log")" || rc=$?
  linha="$(printf '%s\n' "$bruto" | grep -E '^LICENCA_MODO=' | tail -1 || true)"
  if [ "$rc" -eq 0 ] && [ "$linha" = "LICENCA_MODO=$pedido" ]; then
    msg "  modo da trava de licença: ${atual:-?} → $pedido"
    printf '%s modo %s -> %s por %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${atual:-?}" "$pedido" "${SUDO_USER:-${USER:-root}}" >> "$log" 2>/dev/null || true
    [ "$pedido" != "valendo" ] || msg "  Atenção: a partir de agora a trava recusa. Volte com: sudo $KIT/licenca-modo.sh sombra"
    return 0
  fi
  aviso "Não consegui trocar o modo (${linha:-sem resposta do worker}). Detalhes: $log"
  return 1
}

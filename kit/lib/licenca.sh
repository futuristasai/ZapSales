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
#  2. A CREDENCIAL NUNCA VAI NA LINHA DE COMANDO. O e-mail e o código chegam ao contêiner por variável de
#     ambiente (`-e NOME`, sem valor: o Docker herda do ambiente de quem chamou) — argumento apareceria em
#     `ps` e no histórico. Também não vão para o .env, para o log do kit nem para a tela.
#  3. SEM TERMINAL, NUNCA ESPERA. Pergunta só com `[ -t 0 ]`; sem terminal usa as variáveis
#     ZAPSALES_LICENCA_EMAIL e ZAPSALES_LICENCA_TRANSACAO, e sem elas fica pendente.

LICENCA_EMAIL=""
LICENCA_TRANSACAO=""
# 0 = ativada (ou já estava) · diferente de 0 = pendente. Quem chama decide o que fazer; o kit só avisa.
LICENCA_RC=0

licenca_ja_ativada() {
  [ "$(sql_valor "select count(*) from public.platform_licenca where ativada_em is not null")" = "1" ]
}

# ler_compra — variável de ambiente primeiro; sem ela, pergunta (só com terminal). Enter = ativar depois.
ler_compra() {
  LICENCA_EMAIL="${ZAPSALES_LICENCA_EMAIL:-}"
  LICENCA_TRANSACAO="${ZAPSALES_LICENCA_TRANSACAO:-}"
  [ -t 0 ] || return 0
  if [ -z "$LICENCA_EMAIL" ]; then
    read -r -p "E-mail da compra do ZapSales (Enter = ativar depois): " LICENCA_EMAIL || true
  fi
  if [ -n "$LICENCA_EMAIL" ] && [ -z "$LICENCA_TRANSACAO" ]; then
    read -r -s -p "Código da transação, começa com HP (não aparece na tela): " LICENCA_TRANSACAO || true
    printf '\n' >&2
  fi
}

licenca_pendente() { # MOTIVO — a instalação segue; diz como ativar depois
  aviso "Licença: ativação pendente — $1"
  msg "  O sistema já funciona. Quando tiver os dados da compra: sudo $KIT/ativar-licenca.sh"
}

# licenca_desfecho LINHA — a mensagem, em português, para cada desfecho de scripts/ativar-licenca.ts.
licenca_desfecho() {
  case "$1" in
    LICENCA=ativada:permanente) msg "  licença ativada (permanente)." ;;
    LICENCA=ativada:*) msg "  licença ativada (temporária: vira definitiva sozinha depois do prazo de garantia)." ;;
    LICENCA=recusada:compra_nao_encontrada) licenca_pendente "não encontrei essa compra. Confira o e-mail e o código da transação." ;;
    LICENCA=recusada:compra_nao_aprovada) licenca_pendente "a compra ainda não foi aprovada (aguarde a confirmação do pagamento)." ;;
    LICENCA=recusada:licenca_bloqueada) licenca_pendente "essa licença está bloqueada. Fale com quem vendeu o sistema." ;;
    LICENCA=recusada:rate_limited) licenca_pendente "muitas tentativas seguidas. Espere alguns minutos." ;;
    LICENCA=recusada:*) licenca_pendente "o servidor de licenças recusou os dados informados." ;;
    LICENCA=dados_invalidos) licenca_pendente "o e-mail ou o código da transação não parecem corretos." ;;
    *) licenca_pendente "não consegui falar com o servidor de licenças agora (a rede ou o servidor está fora do ar)." ;;
  esac
}

# ativar_licenca_da_compra — o passo inteiro. Devolve 0 SEMPRE (regra 1); o resultado fica em LICENCA_RC.
ativar_licenca_da_compra() {
  passo "Licença"
  LICENCA_RC=0
  if licenca_ja_ativada; then
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

  saida="$(printf '%s\n' "$bruto" | grep -E '^LICENCA=' | tail -1 || true)"
  [ -n "$saida" ] || saida="LICENCA=falhou:sem_resposta"
  LICENCA_RC="$rc"
  licenca_desfecho "$saida"
  return 0
}

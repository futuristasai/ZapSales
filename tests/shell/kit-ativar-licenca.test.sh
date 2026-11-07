#!/usr/bin/env bash
# Gate da ativação de licença do kit (issue #224, ADR-0005; kit/lib/licenca.sh e kit/ativar-licenca.sh).
#
# Três regras do kit, que um teste de função pura não alcança — por isso um `docker` FALSO no PATH registra
# exatamente o que o kit entrega ao Docker (argumentos e ambiente) e responde o que o worker responderia:
#
#  1. A INSTALAÇÃO NUNCA FALHA POR CAUSA DA LICENÇA. Sem dados, recusada, servidor fora do ar, `docker`
#     quebrado: a função devolve 0 sob `set -Eeuo pipefail` e o kit segue ("ativação pendente").
#  2. A CREDENCIAL NUNCA VAI NA LINHA DE COMANDO. O e-mail e o código da compra chegam pelo AMBIENTE de
#     quem chama (`-e NOME`, sem valor) — nunca em argumento (`ps`, histórico), nem na tela, nem no log.
#  3. SEM TERMINAL NUNCA ESPERA. Todo `read` do arquivo vem depois do `[ -t 0 ] || return`.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
RAIZ_DO_REPO="$(pwd)"

fail=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi; }
contem()  { if grep -qF -- "$2" "$3"; then ok "$1"; else nok "$1 — não achei [$2]"; fi; }
ausente() { if grep -qF -- "$2" "$3"; then nok "$1 — achei [$2]"; else ok "$1"; fi; }

EMAIL='comprador.secreto@exemplo.com'
CODIGO='HP98765432109876'

# ─── o docker falso ──────────────────────────────────────────────────────────
mkdir -p "$TMP/bin" "$TMP/raiz" "$TMP/logs"
cat > "$TMP/bin/docker" <<'FALSO'
#!/usr/bin/env bash
# `docker compose exec …` (2º argumento) é a pergunta "já está ativada?"; `docker compose run …` é a ativação.
case "${2:-}" in
  exec) printf '%s\n' "${FAKE_ATIVADA:-0}"; exit 0 ;;
  run)
    printf '%s\n' "$@" > "$FAKE_DIR/argv"
    printf 'email=%s\ntransacao=%s\n' "${ZAPSALES_LICENCA_EMAIL:-<ausente>}" "${ZAPSALES_LICENCA_TRANSACAO:-<ausente>}" > "$FAKE_DIR/ambiente"
    [ -z "${FAKE_STDERR:-}" ] || printf '%s\n' "$FAKE_STDERR" >&2
    [ -z "${FAKE_STDOUT:-}" ] || printf '%s\n' "$FAKE_STDOUT"
    exit "${FAKE_RC:-0}" ;;
esac
exit 0
FALSO
chmod +x "$TMP/bin/docker"

# caso NOME FAKE_RC FAKE_STDOUT FAKE_ATIVADA [VAR=valor …] — roda o passo inteiro sem terminal,
# sob `set -Eeuo pipefail` como no instalador. Deixa: $TMP/saida (tela), $TMP/rc-da-funcao,
# $TMP/licenca-rc, e os registros do docker falso em $TMP/fake/.
caso() {
  local rc="$1" saida_falsa="$2" ativada="$3"; shift 3
  rm -rf "$TMP/fake"; mkdir -p "$TMP/fake"
  rm -f "$TMP/logs/licenca.log"
  env -i PATH="$TMP/bin:$PATH" HOME="$TMP" FAKE_DIR="$TMP/fake" FAKE_RC="$rc" FAKE_STDOUT="$saida_falsa" \
    FAKE_ATIVADA="$ativada" KIT="$RAIZ_DO_REPO/kit" RAIZ="$TMP/raiz" LOGS="$TMP/logs" "$@" \
    timeout 30 bash -c '
      set -Eeuo pipefail
      . "$KIT/lib/comum.sh"; . "$KIT/lib/stack.sh"; . "$KIT/lib/licenca.sh"
      ativar_licenca_da_compra
      echo "FUNCAO_VOLTOU_COM=$?" >&2
      echo "$LICENCA_RC" > "$FAKE_DIR/licenca-rc"
      printf "%s|%s" "$LICENCA_EMAIL" "$LICENCA_TRANSACAO" > "$FAKE_DIR/residuo"
    ' < /dev/null > "$TMP/saida" 2>&1
  echo $? > "$TMP/rc-da-funcao"
  # Em QUALQUER desfecho: a tela e o log não repetem a compra, e as variáveis do kit não a guardam.
  if grep -qF -e "$EMAIL" -e "$CODIGO" "$TMP/saida"; then nok "a tela vazou a compra (caso rc=$rc, saída=$saida_falsa)"; fi
  if [ -f "$TMP/logs/licenca.log" ] && grep -qF -e "$EMAIL" -e "$CODIGO" "$TMP/logs/licenca.log"; then nok "o log vazou a compra"; fi
  if [ -f "$TMP/fake/residuo" ] && [ "$(cat "$TMP/fake/residuo")" != "|" ]; then nok "o kit guardou a compra em variável depois de usar (caso rc=$rc)"; fi
}
foi_chamado() { [ -f "$TMP/fake/argv" ]; }

echo "1. sem os dados e sem terminal: pendente, sem falar com o servidor"
caso 0 "" 0
igual "a função volta 0 sob set -e" "0" "$(cat "$TMP/rc-da-funcao")"
igual "o worker nem é chamado" "nao" "$(foi_chamado && echo sim || echo nao)"
igual "fica pendente (12)" "12" "$(cat "$TMP/fake/licenca-rc")"
contem "diz que está pendente" "ativação pendente" "$TMP/saida"
contem "diz como ativar depois" "kit/ativar-licenca.sh" "$TMP/saida"
caso 0 "" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL"
igual "só o e-mail, sem o código: também pendente" "nao" "$(foi_chamado && echo sim || echo nao)"

echo "2. com os dados: a credencial vai pelo AMBIENTE, nunca pela linha de comando"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
igual "a função volta 0" "0" "$(cat "$TMP/rc-da-funcao")"
igual "o worker é chamado" "sim" "$(foi_chamado && echo sim || echo nao)"
igual "ativada (LICENCA_RC=0)" "0" "$(cat "$TMP/fake/licenca-rc")"
ausente "o e-mail NÃO está nos argumentos do docker" "$EMAIL" "$TMP/fake/argv"
ausente "o código NÃO está nos argumentos do docker" "$CODIGO" "$TMP/fake/argv"
contem "o nome da variável do e-mail é repassado (-e NOME, sem valor)" "ZAPSALES_LICENCA_EMAIL" "$TMP/fake/argv"
contem "o nome da variável do código é repassado" "ZAPSALES_LICENCA_TRANSACAO" "$TMP/fake/argv"
contem "o e-mail chegou ao docker pelo ambiente" "email=$EMAIL" "$TMP/fake/ambiente"
contem "o código chegou ao docker pelo ambiente" "transacao=$CODIGO" "$TMP/fake/ambiente"
contem "roda o script de ativação" "scripts/ativar-licenca.ts" "$TMP/fake/argv"
contem "sem TTY (-T): a saída é capturável e não trava sem terminal" "-T" "$TMP/fake/argv"
ausente "o e-mail não aparece na tela" "$EMAIL" "$TMP/saida"
ausente "o código não aparece na tela" "$CODIGO" "$TMP/saida"
contem "avisa que ativou" "licença ativada" "$TMP/saida"
if [ -f "$TMP/logs/licenca.log" ]; then ausente "o log do kit não guarda o e-mail" "$EMAIL" "$TMP/logs/licenca.log"; fi

echo "3. a licença permanente é dita como tal"
caso 0 "LICENCA=ativada:permanente" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "permanente" "(permanente)" "$TMP/saida"

echo "4. o servidor recusa: a instalação segue, com a razão em português"
for par in "compra_nao_encontrada|não encontrei essa compra" "compra_nao_aprovada|ainda não foi aprovada" \
           "licenca_bloqueada|está bloqueada" "rate_limited|muitas tentativas" "outro|recusou os dados"; do
  codigo="${par%%|*}"; frase="${par#*|}"
  caso 10 "LICENCA=recusada:$codigo" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
  igual "recusada $codigo: a função volta 0" "0" "$(cat "$TMP/rc-da-funcao")"
  igual "recusada $codigo: fica pendente" "10" "$(cat "$TMP/fake/licenca-rc")"
  contem "recusada $codigo: a frase" "$frase" "$TMP/saida"
done

echo "5. falha do servidor, da rede ou do próprio docker: nunca derruba a instalação"
caso 11 "LICENCA=falhou:servidor_inalcancavel" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
igual "servidor fora do ar: a função volta 0" "0" "$(cat "$TMP/rc-da-funcao")"
contem "servidor fora do ar: mensagem" "servidor de licenças agora" "$TMP/saida"
caso 125 "" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO" FAKE_STDERR="docker: Error response from daemon"
igual "docker quebrado (125, sem linha): a função volta 0" "0" "$(cat "$TMP/rc-da-funcao")"
igual "docker quebrado: fica pendente" "125" "$(cat "$TMP/fake/licenca-rc")"
contem "docker quebrado: mensagem" "ativação pendente" "$TMP/saida"
caso 12 "LICENCA=dados_invalidos" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "dados que o app achou tortos" "não parecem corretos" "$TMP/saida"
caso 0 "ruído do tsx
LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "ruído antes da linha LICENCA= não atrapalha" "licença ativada" "$TMP/saida"

echo "6. instalação já ativada: rodar o kit de novo não pede a compra outra vez"
caso 0 "LICENCA=ativada:temporario" 1
igual "o worker NÃO é chamado" "nao" "$(foi_chamado && echo sim || echo nao)"
contem "diz que já está ativada" "já ativada" "$TMP/saida"
igual "LICENCA_RC=0" "0" "$(cat "$TMP/fake/licenca-rc")"
caso 0 "LICENCA=ativada:temporario" 1 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
igual "mesmo com as variáveis, não reativa" "nao" "$(foi_chamado && echo sim || echo nao)"

echo "7. nenhum read escapa da guarda de terminal"
LIC=kit/lib/licenca.sh
guarda="$(grep -nE '^\s*\[ -t 0 \] \|\| return 0' "$LIC" | head -1 | cut -d: -f1)"
primeiro_read="$(grep -vE '^\s*#' "$LIC" | grep -n '' >/dev/null; grep -nE '(^|[^[:alnum:]_])read([^[:alnum:]_]|$)' "$LIC" | grep -vE '^[0-9]+:\s*#' | head -1 | cut -d: -f1)"
if [ -n "$guarda" ] && [ -n "$primeiro_read" ] && [ "$guarda" -lt "$primeiro_read" ]; then
  ok "o '[ -t 0 ] || return 0' (linha $guarda) vem antes do primeiro read (linha $primeiro_read)"
else
  nok "guarda de terminal na linha [${guarda:-nenhuma}], primeiro read na linha [${primeiro_read:-nenhum}]"
fi
igual "todo read termina com '|| true' (EOF não derruba o set -e)" "0" \
  "$(grep -E '(^|[^[:alnum:]_])read([^[:alnum:]_]|$)' "$LIC" | grep -vE '^\s*#' | grep -vc '|| true')"

echo "8. o encaixe no instalador"
l_admin="$(grep -n '^criar_primeiro_admin$' kit/instalar.sh | cut -d: -f1)"
l_lic="$(grep -n '^ativar_licenca_da_compra$' kit/instalar.sh | cut -d: -f1)"
l_proxy="$(grep -n '^configurar_proxy$' kit/instalar.sh | cut -d: -f1)"
if [ -n "$l_admin" ] && [ -n "$l_lic" ] && [ -n "$l_proxy" ] && [ "$l_admin" -lt "$l_lic" ] && [ "$l_lic" -lt "$l_proxy" ]; then
  ok "ativa depois do primeiro administrador e antes do proxy"
else
  nok "ordem: admin=$l_admin licença=$l_lic proxy=$l_proxy"
fi
igual "o instalador carrega a biblioteca" "1" "$(grep -c '^\. "\$KIT/lib/licenca.sh"$' kit/instalar.sh)"
igual "kit/ativar-licenca.sh é executável no git" "100755" "$(git ls-files -s kit/ativar-licenca.sh | awk '{print $1}')"
igual "a variável de e-mail está documentada no cabeçalho do instalador" "1" \
  "$(grep -c '^#   ZAPSALES_LICENCA_EMAIL e ZAPSALES_LICENCA_TRANSACAO' kit/instalar.sh)"
igual "o resumo avisa quando a ativação ficou pendente" "1" \
  "$(grep -c 'Licença:    ativação pendente' kit/instalar.sh)"
for f in kit/lib/licenca.sh kit/ativar-licenca.sh; do
  if bash -n "$f" 2>/dev/null; then ok "bash -n $f"; else nok "bash -n $f"; fi
done

if [ "$fail" -ne 0 ]; then echo "FALHOU: kit-ativar-licenca"; exit 1; fi
echo "OK: kit-ativar-licenca"

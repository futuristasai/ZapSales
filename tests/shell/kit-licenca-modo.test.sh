#!/usr/bin/env bash
# Gate do interruptor do modo da trava (issue #224 item 6, ADR-0005 D-7; kit/lib/licenca.sh e
# kit/licenca-modo.sh). Um `docker` FALSO registra o que o kit entrega ao Docker e responde o que o
# worker responderia.
#
#  1. SEM ARGUMENTO SÓ MOSTRA. Nunca grava.
#  2. VALOR ESTRANHO NUNCA LIGA A TRAVA. Só `sombra` e `valendo`; qualquer outra coisa sai 2 e nem
#     chega ao worker — um erro de digitação não pode virar «valendo».
#  3. A TROCA SÓ É DADA COMO FEITA QUANDO O WORKER CONFIRMA a mesma palavra que foi pedida (código 0 E a
#     linha LICENCA_MODO=<pedido>); worker quebrado, sem resposta ou com outra resposta é falha (1).
#  4. FICA REGISTRADA (quando, de quê para quê, por quem) no log do kit.
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

mkdir -p "$TMP/bin" "$TMP/raiz" "$TMP/logs"
cat > "$TMP/bin/docker" <<'FALSO'
#!/usr/bin/env bash
# `docker compose exec …` (2º argumento) lê o modo atual; `docker compose run …` é a troca.
case "${2:-}" in
  exec) printf '%s\n' "${FAKE_MODO_ATUAL:-sombra}"; exit 0 ;;
  run)
    printf '%s\n' "$@" > "$FAKE_DIR/argv"
    [ -z "${FAKE_STDOUT:-}" ] || printf '%s\n' "$FAKE_STDOUT"
    exit "${FAKE_RC:-0}" ;;
esac
exit 0
FALSO
chmod +x "$TMP/bin/docker"

# caso FAKE_RC FAKE_STDOUT FAKE_MODO_ATUAL [argumento] — roda definir_modo_da_licenca sem terminal.
caso() {
  local rc="$1" saida_falsa="$2" atual="$3"; shift 3
  rm -rf "$TMP/fake"; mkdir -p "$TMP/fake"; rm -f "$TMP/logs/licenca.log"
  env -i PATH="$TMP/bin:$PATH" HOME="$TMP" FAKE_DIR="$TMP/fake" FAKE_RC="$rc" FAKE_STDOUT="$saida_falsa" \
    FAKE_MODO_ATUAL="$atual" KIT="$RAIZ_DO_REPO/kit" RAIZ="$TMP/raiz" LOGS="$TMP/logs" SUDO_USER=operadora \
    timeout 30 bash -c '
      . "$KIT/lib/comum.sh"; . "$KIT/lib/stack.sh"; . "$KIT/lib/licenca.sh"
      definir_modo_da_licenca "$@"
    ' _ "$@" < /dev/null > "$TMP/saida" 2>&1
  echo $? > "$TMP/rc"
}
foi_chamado() { [ -f "$TMP/fake/argv" ]; }
chamado() { foi_chamado && echo sim || echo nao; }

echo "1. sem argumento: só mostra"
caso 0 "" sombra
igual "sai 0" "0" "$(cat "$TMP/rc")"
igual "não chama o worker" "nao" "$(chamado)"
contem "mostra o modo em vigor" "modo da trava de licença: sombra" "$TMP/saida"
caso 0 "" valendo
contem "mostra valendo quando é valendo" "modo da trava de licença: valendo" "$TMP/saida"

echo "2. valor estranho nunca liga a trava"
for v in valedo ligado on true 1 SOMBRA "sombra;valendo" "valendo " "--help"; do
  caso 0 "LICENCA_MODO=valendo" sombra "$v"
  igual "[$v]: sai 2" "2" "$(cat "$TMP/rc")"
  igual "[$v]: o worker NEM é chamado" "nao" "$(chamado)"
done

echo "3. a troca"
caso 0 "LICENCA_MODO=valendo" sombra valendo
igual "valendo: sai 0" "0" "$(cat "$TMP/rc")"
igual "valendo: chama o worker" "sim" "$(chamado)"
contem "valendo: o script certo" "scripts/definir-modo-da-licenca.ts" "$TMP/fake/argv"
contem "valendo: o pedido vai por variável" "ZAPSALES_LICENCA_MODO=valendo" "$TMP/fake/argv"
contem "valendo: diz de → para" "sombra → valendo" "$TMP/saida"
contem "valendo: avisa como voltar" "licenca-modo.sh sombra" "$TMP/saida"
caso 0 "LICENCA_MODO=sombra" valendo sombra
igual "sombra: sai 0" "0" "$(cat "$TMP/rc")"
contem "sombra: diz de → para" "valendo → sombra" "$TMP/saida"
ausente "sombra: não assusta com o aviso de recusa" "a trava recusa" "$TMP/saida"

echo "4. só vale com a confirmação do worker"
caso 11 "LICENCA_MODO=falhou:banco_recusou" sombra valendo
igual "worker falhou: sai 1" "1" "$(cat "$TMP/rc")"
contem "diz o motivo" "banco_recusou" "$TMP/saida"
ausente "e NÃO diz que trocou" "sombra → valendo" "$TMP/saida"
caso 0 "" sombra valendo
igual "worker sem resposta: sai 1" "1" "$(cat "$TMP/rc")"
caso 0 "LICENCA_MODO=sombra" sombra valendo
igual "worker confirmou OUTRA palavra: sai 1 (não se dá por feito)" "1" "$(cat "$TMP/rc")"
caso 125 "" sombra valendo
igual "docker quebrado: sai 1" "1" "$(cat "$TMP/rc")"
caso 1 "LICENCA_MODO=valendo" sombra valendo
igual "linha certa mas o worker saiu com erro: sai 1 (os dois têm de concordar)" "1" "$(cat "$TMP/rc")"

echo "5. fica registrada"
caso 0 "LICENCA_MODO=valendo" sombra valendo
contem "o log tem de → para" "modo sombra -> valendo" "$TMP/logs/licenca.log"
contem "e quem pediu" "por operadora" "$TMP/logs/licenca.log"
caso 11 "LICENCA_MODO=falhou:banco_recusou" sombra valendo
ausente "troca que falhou não entra como feita" "modo sombra -> valendo" "$TMP/logs/licenca.log"

echo "6. o comando avulso"
for f in kit/licenca-modo.sh kit/lib/licenca.sh; do
  if bash -n "$f" 2>/dev/null; then ok "bash -n $f"; else nok "bash -n $f"; fi
done
igual "kit/licenca-modo.sh é executável no git" "100755" "$(git ls-files -s kit/licenca-modo.sh | awk '{print $1}')"
igual "usa o mesmo cadeado do instalador" "1" "$(grep -c '^flock -n 9 || falha' kit/licenca-modo.sh)"
igual "só o modo vigente (sem argumento) dispensa o worker de pé" "1" "$(grep -c 'servico_saudavel worker' kit/licenca-modo.sh)"

if [ "$fail" -ne 0 ]; then echo "FALHOU: kit-licenca-modo"; exit 1; fi
echo "OK: kit-licenca-modo"

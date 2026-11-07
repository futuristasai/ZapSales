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
mkdir -p "$TMP/bin" "$TMP/raiz" "$TMP/logs" "$TMP/estado"
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
# O chmod não pega em todo sistema de arquivos (Windows), então o modo e o dono vêm de um `stat` falso:
# a lógica do kit é a mesma em qualquer lugar, e quem responde é o teste.
cat > "$TMP/bin/stat" <<'FALSO'
#!/usr/bin/env bash
case "$*" in
  *"%a"*) printf '%s\n' "${FAKE_MODO:-600}" ;;
  *"%u"*) printf '%s\n' "${FAKE_DONO:-0}" ;;
esac
FALSO
chmod +x "$TMP/bin/stat"

# caso NOME FAKE_RC FAKE_STDOUT FAKE_ATIVADA [VAR=valor …] — roda o passo inteiro sem terminal,
# sob `set -Eeuo pipefail` como no instalador. Deixa: $TMP/saida (tela), $TMP/rc-da-funcao,
# $TMP/licenca-rc, e os registros do docker falso em $TMP/fake/.
caso() {
  local rc="$1" saida_falsa="$2" ativada="$3"; shift 3
  rm -rf "$TMP/fake"; mkdir -p "$TMP/fake"
  rm -f "$TMP/logs/licenca.log"
  env -i PATH="$TMP/bin:$PATH" HOME="$TMP" FAKE_DIR="$TMP/fake" FAKE_RC="$rc" FAKE_STDOUT="$saida_falsa" \
    FAKE_ATIVADA="$ativada" KIT="$RAIZ_DO_REPO/kit" RAIZ="$TMP/raiz" LOGS="$TMP/logs" ESTADO="$TMP/estado" \
    FAKE_MODO=600 FAKE_DONO="$(id -u)" "$@" \
    timeout 30 bash -c '
      set -Eeuo pipefail
      . "$KIT/lib/comum.sh"; . "$KIT/lib/stack.sh"; . "$KIT/lib/licenca.sh"
      ativar_licenca_da_compra
      echo "FUNCAO_VOLTOU_COM=$?" >&2
      echo "$LICENCA_RC" > "$FAKE_DIR/licenca-rc"
      printf "%s|%s" "$LICENCA_EMAIL" "$LICENCA_TRANSACAO" > "$FAKE_DIR/residuo"
      printf "%s|%s" "${ZAPSALES_LICENCA_EMAIL-vazio}" "${ZAPSALES_LICENCA_TRANSACAO-vazio}" > "$FAKE_DIR/residuo-env"
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
igual "as variáveis exportadas NÃO seguem para os filhos do kit (proxy, backup, implantação)" "vazio|vazio" "$(cat "$TMP/fake/residuo-env")"

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
caso 11 "LICENCA=falhou:gravacao_falhou" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "gravação local falhou: não culpa a rede" "o servidor aceitou, mas não consegui gravar" "$TMP/saida"
ausente "gravação local falhou: não manda esperar a rede" "fora do ar" "$TMP/saida"
caso 11 "LICENCA=falhou:selo_rejeitado" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "falha local: manda ver o log" "licenca.log" "$TMP/saida"
ausente "falha local: não culpa a rede" "fora do ar" "$TMP/saida"
caso 1 "" 0 ZAPSALES_LICENCA_EMAIL="$EMAIL" ZAPSALES_LICENCA_TRANSACAO="$CODIGO"
contem "sem resposta do script (imagem antiga): manda ver o log" "não conseguiu rodar a ativação" "$TMP/saida"
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
igual "e também aí as variáveis saem do ambiente" "vazio|vazio" "$(cat "$TMP/fake/residuo-env")"

echo "6b. sem terminal e sem variável: o ARQUIVO protegido (a via que não deixa a compra no ps)"
COMPRA="$TMP/licenca-compra"
printf '%s\n%s\n' "$EMAIL" "$CODIGO" > "$COMPRA"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA"
igual "o arquivo basta: o worker é chamado" "sim" "$(foi_chamado && echo sim || echo nao)"
contem "o e-mail do arquivo chegou ao docker pelo ambiente" "email=$EMAIL" "$TMP/fake/ambiente"
contem "o código do arquivo chegou ao docker pelo ambiente" "transacao=$CODIGO" "$TMP/fake/ambiente"
ausente "e-mail do arquivo fora do argv" "$EMAIL" "$TMP/fake/argv"
ausente "código do arquivo fora do argv" "$CODIGO" "$TMP/fake/argv"
igual "o arquivo é apagado depois da tentativa" "nao" "$([ -e "$COMPRA" ] && echo sim || echo nao)"
printf '%s\r\n%s\r\n' "$EMAIL" "$CODIGO" > "$COMPRA"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA"
igual "arquivo com fim de linha do Windows (CRLF): nenhum CR chega ao worker" "0" "$(tr -cd '\015' < "$TMP/fake/ambiente" | wc -c | tr -d ' ')"
printf '%s\n%s\n' "$EMAIL" "$CODIGO" > "$COMPRA"
caso 10 "LICENCA=recusada:compra_nao_encontrada" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA"
igual "recusada: o arquivo também é apagado (não fica compra em disco)" "nao" "$([ -e "$COMPRA" ] && echo sim || echo nao)"
printf '%s\n%s\n' "$EMAIL" "$CODIGO" > "$COMPRA"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA" FAKE_MODO=644
igual "modo 644 (outros leem): ignorado, o worker NÃO é chamado" "nao" "$(foi_chamado && echo sim || echo nao)"
contem "e avisa por quê" "modo 600" "$TMP/saida"
igual "arquivo ignorado não é apagado" "sim" "$([ -e "$COMPRA" ] && echo sim || echo nao)"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA" FAKE_DONO=4242
igual "arquivo de outro dono: ignorado" "nao" "$(foi_chamado && echo sim || echo nao)"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$TMP/nao-existe"
igual "arquivo ausente: pendente, sem erro" "nao" "$(foi_chamado && echo sim || echo nao)"
igual "arquivo ausente: a função volta 0" "0" "$(cat "$TMP/rc-da-funcao")"
printf '%s\n%s\n' "$EMAIL" "$CODIGO" > "$TMP/verdadeiro"
if ln -s "$TMP/verdadeiro" "$TMP/atalho" 2>/dev/null && [ -L "$TMP/atalho" ]; then
  caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$TMP/atalho"
  igual "link simbólico: ignorado (alguém poderia apontá-lo para outro arquivo)" "nao" "$(foi_chamado && echo sim || echo nao)"
else
  ok "link simbólico: sistema de arquivos sem links — coberto no CI Linux"
fi
printf '%s\n' "$EMAIL" > "$COMPRA"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA"
igual "arquivo só com o e-mail (faltou o código): pendente" "nao" "$(foi_chamado && echo sim || echo nao)"
printf '%s\n%s\n' "outro@exemplo.com" "HPDOARQUIVO0001" > "$COMPRA"
caso 0 "LICENCA=ativada:temporario" 0 ZAPSALES_LICENCA_ARQUIVO="$COMPRA" ZAPSALES_LICENCA_EMAIL="$EMAIL"
contem "a variável vale mais que o arquivo (e-mail)" "email=$EMAIL" "$TMP/fake/ambiente"
contem "o que faltou vem do arquivo (código)" "transacao=HPDOARQUIVO0001" "$TMP/fake/ambiente"
printf '%s\n%s\n' "$EMAIL" "$CODIGO" > "$TMP/estado/licenca-compra"
caso 0 "LICENCA=ativada:temporario" 0
igual "sem nada configurado, o arquivo padrão em \$ESTADO/licenca-compra é lido" "sim" "$(foi_chamado && echo sim || echo nao)"
rm -f "$TMP/estado/licenca-compra" "$COMPRA"

echo "6c. a régua que pede de novo no terminal"
validar() { env -i PATH="$PATH" bash -c '. "$1"; "$2" "$3"' _ kit/lib/licenca.sh "$1" "$2" >/dev/null 2>&1 && echo sim || echo nao; }
for v in "comprador@exemplo.com" "a.b+c@d.co"; do igual "e-mail aceito: $v" "sim" "$(validar licenca_email_ok "$v")"; done
for v in "" "sem-arroba" "a@b" "a b@c.de" "@c.de"; do igual "e-mail recusado: [$v]" "nao" "$(validar licenca_email_ok "$v")"; done
for v in "HP12345678901234" "abc-123_X" "HPAB"; do igual "código aceito: $v" "sim" "$(validar licenca_codigo_ok "$v")"; done
for v in "" "abc" "HP 123 456" "$(printf 'x%.0s' $(seq 1 65))" 'HP1;rm'; do igual "código recusado: [${v:0:12}]" "nao" "$(validar licenca_codigo_ok "$v")"; done

echo "7. nenhum read escapa da guarda de terminal"
LIC=kit/lib/licenca.sh
guarda="$(grep -nE '^\s*\[ -t 0 \] \|\| return 0' "$LIC" | head -1 | cut -d: -f1)"
# Os reads INTERATIVOS são os que mostram pergunta (-p); o único outro lê de um ARQUIVO (< "$arq").
primeiro_read="$(grep -nE '(^|[^[:alnum:]_])read +.*-p ' "$LIC" | grep -vE '^[0-9]+:\s*#' | head -1 | cut -d: -f1)"
if [ -n "$guarda" ] && [ -n "$primeiro_read" ] && [ "$guarda" -lt "$primeiro_read" ]; then
  ok "o '[ -t 0 ] || return 0' (linha $guarda) vem antes do primeiro read interativo (linha $primeiro_read)"
else
  nok "guarda de terminal na linha [${guarda:-nenhuma}], primeiro read interativo na linha [${primeiro_read:-nenhum}]"
fi
igual "todo read que não é de pergunta lê de arquivo" "0" \
  "$(grep -E '(^|[^[:alnum:]_])read([^[:alnum:]_]|$)' "$LIC" | grep -vE '^\s*#' | grep -vE -e '-p ' -e '< "\$arq"' | wc -l | tr -d ' ')"
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
igual "o comando avulso usa o mesmo cadeado do instalador" "1" \
  "$(grep -c '^flock -n 9 || falha' kit/ativar-licenca.sh)"
for f in kit/lib/licenca.sh kit/ativar-licenca.sh; do
  if bash -n "$f" 2>/dev/null; then ok "bash -n $f"; else nok "bash -n $f"; fi
done

if [ "$fail" -ne 0 ]; then echo "FALHOU: kit-ativar-licenca"; exit 1; fi
echo "OK: kit-ativar-licenca"

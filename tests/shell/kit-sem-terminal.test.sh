#!/usr/bin/env bash
# Gate do instalador SEM TERMINAL (issue #222, item 7; ADR-0005).
#
# O servidor de licenças vai instalar o ZapSales numa VPS de comprador por SSH
# (Fase 3), sem ninguém na frente de um teclado. O instalador tem de ler TUDO por
# variável de ambiente e nunca ficar esperando uma resposta que não virá — um
# `read` sem guarda trava a instalação para sempre, e travar aqui é travar na
# primeira impressão de quem acabou de pagar.
#
# O `kit/instalar.sh` exige root, `flock` e Docker, então a prova não o executa
# inteiro: ela extrai do arquivo REAL as funções que leem a configuração
# (`perguntar`, `perguntar_senha`, `ler_configuracao`) e as roda com stdin em
# /dev/null, que é exatamente o que um SSH sem terminal entrega. Extrair do
# arquivo (em vez de copiar) é o que mantém a prova atada ao código que roda.
#
#  1. COM VARIÁVEIS, NÃO PERGUNTA NADA. Domínio, e-mail, empresa, idioma e senha
#     vêm do ambiente e chegam intactos.
#  2. SEM VARIÁVEL E SEM TERMINAL, FALHA RÁPIDO E DIZ POR QUÊ. Nunca pendura (o
#     `timeout` reprova), e a mensagem nomeia o campo que faltou.
#  3. O QUE TEM PADRÃO USA O PADRÃO. Empresa e idioma não são obrigatórios; sem
#     terminal valem "Minha Empresa" e pt-BR. A senha sai vazia — o kit gera uma.
#  4. ATUALIZAR NÃO PEDE NADA. Com o .env de uma instalação existente, a segunda
#     rodada não precisa de variável nenhuma.
#  5. NENHUM `read` NOVO ESCAPA DA GUARDA. Fora de `perguntar` e `perguntar_senha`,
#     o instalador não lê o teclado; e a senha só é perguntada com terminal.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { # nome esperado obtido
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi
}

INSTALAR=kit/instalar.sh

# funcao NOME — o corpo de `NOME() { ... }` até o `}` na coluna 0.
funcao() { awk -v n="$1" '$0 ~ "^"n"\\(\\) *\\{" { d = 1 } d { print } d && /^}/ { exit }' "$INSTALAR"; }

for f in perguntar perguntar_senha ler_configuracao; do
  if [ -z "$(funcao "$f")" ]; then nok "função $f não encontrada em $INSTALAR"; exit 1; fi
done

# O corpo que roda: os helpers reais do kit + as três funções reais do instalador.
{
  echo 'set -Eeuo pipefail'
  echo '. kit/lib/comum.sh'
  echo '. kit/lib/segredos.sh'
  funcao perguntar
  funcao perguntar_senha
  funcao ler_configuracao
  echo 'DOMINIO=""; EMAIL=""; EMPRESA=""; IDIOMA=""; SENHA=""'
  echo 'ler_configuracao >/dev/null'
  echo 'printf "dominio=%s\nemail=%s\nempresa=%s\nidioma=%s\nsenha=[%s]\n" "$DOMINIO" "$EMAIL" "$EMPRESA" "$IDIOMA" "$SENHA"'
} > "$TMP/corpo.sh"

# rodar ENV_ARQ [VAR=valor ...] — roda sem terminal, com limite de tempo; imprime a saída
# e deixa o código de saída em $TMP/saida.
rodar() {
  local env_arq="$1"; shift
  env -i PATH="$PATH" HOME="$TMP" ENV_ARQ="$env_arq" "$@" \
    timeout 15 bash "$TMP/corpo.sh" < /dev/null > "$TMP/stdout" 2> "$TMP/stderr"
  echo $? > "$TMP/saida"
  cat "$TMP/stdout" "$TMP/stderr"
}
campo() { sed -n "s/^$1=//p" "$TMP/stdout"; }
saida() { cat "$TMP/saida"; }

echo "1. com variáveis não pergunta nada"
rodar "$TMP/nao-existe.env" \
  ZAPSALES_DOMINIO=zap.exemplo.com ZAPSALES_EMAIL=dono@exemplo.com \
  ZAPSALES_EMPRESA="Loja do Zé" ZAPSALES_IDIOMA=es ZAPSALES_SENHA='Senha-Forte-123' >/dev/null
igual "termina (sem travar)" "0" "$(saida)"
igual "domínio" "zap.exemplo.com" "$(campo dominio)"
igual "e-mail" "dono@exemplo.com" "$(campo email)"
igual "empresa" "Loja do Zé" "$(campo empresa)"
igual "idioma" "es" "$(campo idioma)"
igual "senha vinda do ambiente" "[Senha-Forte-123]" "$(campo senha)"

echo "2. sem variável e sem terminal falha rápido, nomeando o campo"
rodar "$TMP/nao-existe.env" >/dev/null
igual "não pendura e recusa" "1" "$(saida)"
igual "diz que o domínio é inválido" "1" "$(grep -c 'Domínio inválido' "$TMP/stderr")"
rodar "$TMP/nao-existe.env" ZAPSALES_DOMINIO=zap.exemplo.com >/dev/null
igual "com domínio e sem e-mail: recusa" "1" "$(saida)"
igual "diz que o e-mail é inválido" "1" "$(grep -c 'E-mail inválido' "$TMP/stderr")"

echo "3. o que tem padrão usa o padrão"
rodar "$TMP/nao-existe.env" ZAPSALES_DOMINIO=zap.exemplo.com ZAPSALES_EMAIL=dono@exemplo.com >/dev/null
igual "termina" "0" "$(saida)"
igual "empresa padrão" "Minha Empresa" "$(campo empresa)"
igual "idioma padrão" "pt-BR" "$(campo idioma)"
igual "senha vazia (o kit gera uma)" "[]" "$(campo senha)"
rodar "$TMP/nao-existe.env" ZAPSALES_DOMINIO=zap.exemplo.com ZAPSALES_EMAIL=dono@exemplo.com ZAPSALES_IDIOMA=fr >/dev/null
igual "idioma que não existe é recusado, não perguntado" "1" "$(saida)"

echo "4. atualizar (o .env já existe) não pede nada"
printf 'DOMAIN=zap.exemplo.com\nACME_EMAIL=dono@exemplo.com\nZAPSALES_EMPRESA=Loja do Zé\nAPP_LOCALE=en\n' > "$TMP/existente.env"
rodar "$TMP/existente.env" >/dev/null
igual "termina sem variável nenhuma" "0" "$(saida)"
igual "domínio lembrado" "zap.exemplo.com" "$(campo dominio)"
igual "idioma lembrado" "en" "$(campo idioma)"
igual "empresa lembrada" "Loja do Zé" "$(campo empresa)"
igual "senha não é pedida" "[]" "$(campo senha)"

echo "5. nenhum read escapa da guarda"
# Remove as duas funções do texto e procura teclado no que sobra.
sem_as_duas="$TMP/sem-as-duas.sh"
awk '
  /^perguntar\(\) *\{/ || /^perguntar_senha\(\) *\{/ { pulando = 1 }
  !pulando { print }
  pulando && /^}/ { pulando = 0 }
' "$INSTALAR" > "$sem_as_duas"
igual "fora de perguntar/perguntar_senha não há read de teclado" "0" \
  "$(grep -vE '^\s*#' "$sem_as_duas" | grep -cE '(^|[;&| (])read +-|/dev/tty')"
igual "o read de perguntar tem a guarda de terminal" "1" \
  "$(funcao perguntar | grep -cE '\[ -t 0 \]; then read')"
igual "a senha só é perguntada com terminal" "1" \
  "$(grep -cE '\[ -z "\$SENHA" \] && \[ ! -f "\$ENV_ARQ" \] && \[ -t 0 \]' "$INSTALAR")"

if [ "$fail" -ne 0 ]; then echo "FALHOU: kit-sem-terminal"; exit 1; fi
echo "OK: kit-sem-terminal"

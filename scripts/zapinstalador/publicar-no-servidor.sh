#!/usr/bin/env bash
# scripts/zapinstalador/publicar-no-servidor.sh — o ÚNICO comando que a chave SSH do CI consegue rodar
# na VPS de licenças (issue #224 item 4; ADR-0005, "risco aceito pelo dono").
#
# ONDE VIVE: copiado para /usr/local/sbin/zapinstalador-publicar (dono root, modo 755 — o usuário
# publicador NÃO pode alterá-lo) e amarrado à chave por `command=` no authorized_keys. Como se instala
# e se troca a chave: docs/runbooks/publicar-obter-sh.md.
#
# O QUE FAZ: recebe o kit/obter.sh na entrada padrão e o pedido em SSH_ORIGINAL_COMMAND
#   publicar <versão> <sha256 do conteúdo>
# onde <versão> é a tag `vX.Y.Z` ou, enquanto o projeto não tem release (o próprio obter.sh cai na `main`
# nesse caso), `main-<sha do commit, 40 hex>`. Confere, e troca o arquivo servido em https://zapinstalador.futuristas.app/obter.sh.
#
# POR QUE É ESTREITO: o que esse arquivo contém roda como administrador na VPS de quem compra. A
# credencial do CI, portanto, não pode ser um shell. Ela só chega aqui, e aqui só se escreve UM
# arquivo (mais dois de registro). SSH_ORIGINAL_COMMAND é tratada como entrada hostil: só o formato
# exato é aceito; nada dela vira caminho, comando ou argumento.
#
# O QUE ESTE COMANDO NÃO PROMETE: ele não prova que o obter.sh é «o bom» — quem tem a chave publica
# um obter.sh válido qualquer. As conferências abaixo pegam engano e arquivo truncado, não adversário
# com a chave do CI. Contra esse, a defesa é a chave só existir como segredo do repositório oficial,
# e o hash registrado em obter.sh.versao permitir comparar o que está no ar com a tag.
#
# Códigos de saída: 0 publicado · 2 pedido fora do formato · 3 conteúdo recusado · 4 falha ao gravar.
set -uo pipefail

DESTINO="${ZAPINSTALADOR_DESTINO:-/srv/zapinstalador}"
TETO_BYTES=262144   # 256 KB; o obter.sh de hoje tem ~7 KB

recusa() { printf 'recusado: %s\n' "$2" >&2; exit "$1"; }

# ─── 1. o pedido ───────────────────────────────────────────────────────────────────────────────
pedido="${SSH_ORIGINAL_COMMAND-}"
if [[ ! "$pedido" =~ ^publicar\ (v[0-9]+\.[0-9]+\.[0-9]+|main-[0-9a-f]{40})\ ([0-9a-f]{64})$ ]]; then
  recusa 2 "o pedido tem de ser exatamente «publicar <vX.Y.Z ou main-commit> <sha256>»"
fi
versao="${BASH_REMATCH[1]}"
hash_pedido="${BASH_REMATCH[2]}"

[ -d "$DESTINO" ] || recusa 4 "a pasta de destino não existe"

# ─── 2. o conteúdo ─────────────────────────────────────────────────────────────────────────────
# Lê um byte além do teto: se vier, o arquivo é grande demais (e não se lê o resto da conexão).
novo="$(mktemp "$DESTINO/.obter.novo.XXXXXX")" || recusa 4 "não consegui criar o arquivo temporário"
trap 'rm -f "$novo"' EXIT
head -c $((TETO_BYTES + 1)) > "$novo"

tamanho="$(wc -c < "$novo" | tr -d ' ')"
[ "$tamanho" -gt 0 ]             || recusa 3 "conteúdo vazio"
[ "$tamanho" -le "$TETO_BYTES" ] || recusa 3 "conteúdo acima de ${TETO_BYTES} bytes"

hash_real="$(sha256sum "$novo" | cut -d' ' -f1)"
[ "$hash_real" = "$hash_pedido" ] || recusa 3 "o hash do conteúdo não é o do pedido (transferência cortada?)"

[ "$(sed -n 1p "$novo")" = '#!/usr/bin/env bash' ] || recusa 3 "a 1ª linha não é «#!/usr/bin/env bash»"
case "$(sed -n 2p "$novo")" in
  '# kit/obter.sh'*) ;;
  *) recusa 3 "a 2ª linha não declara «# kit/obter.sh»: não parece o instalador" ;;
esac
bash -n "$novo" 2>/dev/null || recusa 3 "o conteúdo tem erro de sintaxe em bash"

# ─── 3. a troca ────────────────────────────────────────────────────────────────────────────────
# Uma publicação por vez: duas trocas ao mesmo tempo embaralhariam «anterior» e «versao».
if command -v flock >/dev/null 2>&1; then
  exec 9> "$DESTINO/.publicar.lock"
  flock 9
fi

chmod 644 "$novo" || recusa 4 "não consegui ajustar a permissão"

# Guarda a anterior (cópia, não mv: o arquivo no ar nunca deixa de existir). Republicar o MESMO
# conteúdo não a sobrescreve — senão «voltar» devolveria o que já está no ar.
if [ -f "$DESTINO/obter.sh" ] && [ "$(sha256sum "$DESTINO/obter.sh" | cut -d' ' -f1)" != "$hash_real" ]; then
  cp -f "$DESTINO/obter.sh" "$DESTINO/obter.sh.anterior" || recusa 4 "não consegui guardar a versão anterior"
fi

# rename(2) no mesmo diretório é atômico: quem baixa recebe o arquivo velho inteiro ou o novo inteiro.
mv -f "$novo" "$DESTINO/obter.sh" || recusa 4 "não consegui publicar"
trap - EXIT

printf '%s %s %s\n' "$versao" "$hash_real" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DESTINO/obter.sh.versao.tmp" \
  && mv -f "$DESTINO/obter.sh.versao.tmp" "$DESTINO/obter.sh.versao" \
  || recusa 4 "publicou, mas não consegui registrar a versão"
chmod 644 "$DESTINO/obter.sh.versao" 2>/dev/null || true

printf 'publicado %s %s\n' "$versao" "$hash_real"

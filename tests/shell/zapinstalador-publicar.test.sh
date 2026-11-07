#!/usr/bin/env bash
# Gate do comando restrito que a VPS de licenças roda quando o CI publica o kit/obter.sh em
# zapinstalador.futuristas.app (issue #224 item 4, ADR-0005; scripts/zapinstalador/publicar-no-servidor.sh).
#
# A chave SSH do CI só consegue rodar ESTE comando, e ele só consegue escrever UM arquivo. O que
# este gate cobra é a metade do "credencial restrita a esse arquivo" que mora no servidor:
#
#  1. PUBLICA o que chega, inteiro, com a permissão certa, e registra versão + hash + quando.
#  2. SÓ ACEITA o pedido no formato exato `publicar vX.Y.Z <sha256>` — qualquer outro texto (um
#     `rm -rf`, um caminho, vazio) sai 2 sem tocar em nada: SSH_ORIGINAL_COMMAND é entrada hostil.
#  3. RECUSA conteúdo que não é o obter.sh (hash diferente, não é bash, não é o kit, sintaxe quebrada,
#     grande demais) com 3, e o arquivo no ar FICA como estava — publicar errado não pode derrubar o
#     comando que todo comprador novo cola.
#  4. GUARDA a versão anterior, para voltar sem refazer o CI.
#  5. NÃO deixa lixo (arquivo temporário) quando recusa.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
RAIZ_DO_REPO="$(pwd)"
SCRIPT="$RAIZ_DO_REPO/scripts/zapinstalador/publicar-no-servidor.sh"

fail=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi; }
contem()  { if grep -qF -- "$2" "$3"; then ok "$1"; else nok "$1 — não achei [$2]"; fi; }

sha() { sha256sum "$1" | cut -d' ' -f1; }

DEST="$TMP/destino"
BOM="$TMP/bom.sh"
cat > "$BOM" <<'EOF'
#!/usr/bin/env bash
# kit/obter.sh — o comando único: baixa o ZapSales para /opt/zapsales e instala.
set -Eeuo pipefail
echo "instalando"
EOF

# publicar COMANDO ARQUIVO — roda o script como o sshd roda: o pedido em SSH_ORIGINAL_COMMAND, o
# conteúdo na entrada padrão. Guarda o código de saída em $TMP/rc.
publicar() {
  local comando="$1" arquivo="$2"
  env -i PATH="$PATH" HOME="$TMP" ZAPINSTALADOR_DESTINO="$DEST" SSH_ORIGINAL_COMMAND="$comando" \
    bash "$SCRIPT" < "$arquivo" > "$TMP/saida" 2>&1
  echo $? > "$TMP/rc"
}
rc() { cat "$TMP/rc"; }
zerar() { rm -rf "$DEST"; mkdir -p "$DEST"; }
sobras() { find "$DEST" -mindepth 1 ! -name 'obter.sh' ! -name 'obter.sh.versao' ! -name 'obter.sh.anterior' ! -name '.publicar.lock' | wc -l | tr -d ' '; }

echo "0. o script existe e é bash válido"
if [ -f "$SCRIPT" ] && bash -n "$SCRIPT"; then ok "scripts/zapinstalador/publicar-no-servidor.sh"; else nok "script ausente ou com sintaxe quebrada"; fi

echo "1. publica o que chega"
zerar
publicar "publicar v1.2.3 $(sha "$BOM")" "$BOM"
igual "sai 0" "0" "$(rc)"
igual "o arquivo no ar é idêntico ao enviado" "$(sha "$BOM")" "$(sha "$DEST/obter.sh")"
case "$(uname -s)" in
  # NTFS não guarda modo Unix: o Git Bash devolve 755 para qualquer arquivo. No CI (Linux) vale.
  MINGW*|MSYS*|CYGWIN*) ok "permissão 644 (pulado no Windows: o sistema de arquivos não guarda modo)" ;;
  *) igual "permissão 644 (o Caddy lê, ninguém executa lá)" "644" "$(stat -c '%a' "$DEST/obter.sh")" ;;
esac
contem "registra a versão" "v1.2.3" "$DEST/obter.sh.versao"
contem "registra o hash" "$(sha "$BOM")" "$DEST/obter.sh.versao"
igual "sem arquivo temporário sobrando" "0" "$(sobras)"

echo "2. só o pedido no formato exato"
for ruim in "" "rm -rf /" "publicar" "publicar v1.2 $(sha "$BOM")" "publicar ../v1.2.3 $(sha "$BOM")" \
            "publicar v1.2.3 abc" "publicar v1.2.3 $(sha "$BOM"); id" "publicar v1.2.3 $(sha "$BOM") extra" \
            "PUBLICAR v1.2.3 $(sha "$BOM")" "publicar v1.2.3-rc1 $(sha "$BOM")"             "publicar main $(sha "$BOM")" "publicar main-abc123 $(sha "$BOM")"             "publicar main-$(printf 'g%.0s' $(seq 40)) $(sha "$BOM")"; do
  zerar
  publicar "$ruim" "$BOM"
  igual "recusa [$ruim] com 2" "2" "$(rc)"
  [ ! -e "$DEST/obter.sh" ] && ok "  e não escreveu nada" || nok "  e escreveu mesmo assim"
done

echo "2b. sem release, a main publica rotulada pelo commit"
zerar
COMMIT="$(printf 'a%.0s' $(seq 40))"
publicar "publicar main-$COMMIT $(sha "$BOM")" "$BOM"
igual "sai 0" "0" "$(rc)"
contem "registra o rótulo com o commit" "main-$COMMIT" "$DEST/obter.sh.versao"

echo "3. recusa conteúdo que não é o obter.sh — e o que está no ar não muda"
zerar
publicar "publicar v1.0.0 $(sha "$BOM")" "$BOM"
no_ar="$(sha "$DEST/obter.sh")"

errado="$TMP/outro.sh"; printf '#!/usr/bin/env bash\n# kit/obter.sh — x\necho outro\n' > "$errado"
publicar "publicar v1.0.1 $(sha "$BOM")" "$errado"
igual "hash diferente do pedido: sai 3" "3" "$(rc)"
igual "  e o arquivo no ar não mudou" "$no_ar" "$(sha "$DEST/obter.sh")"

sem_shebang="$TMP/sem-shebang.sh"; printf 'echo oi\n# kit/obter.sh\n' > "$sem_shebang"
publicar "publicar v1.0.1 $(sha "$sem_shebang")" "$sem_shebang"
igual "sem #!/usr/bin/env bash na 1ª linha: sai 3" "3" "$(rc)"
igual "  e o arquivo no ar não mudou" "$no_ar" "$(sha "$DEST/obter.sh")"

nao_e_o_kit="$TMP/nao-kit.sh"; printf '#!/usr/bin/env bash\n# outra coisa qualquer\necho oi\n' > "$nao_e_o_kit"
publicar "publicar v1.0.1 $(sha "$nao_e_o_kit")" "$nao_e_o_kit"
igual "2ª linha que não declara kit/obter.sh: sai 3" "3" "$(rc)"
igual "  e o arquivo no ar não mudou" "$no_ar" "$(sha "$DEST/obter.sh")"

quebrado="$TMP/quebrado.sh"; printf '#!/usr/bin/env bash\n# kit/obter.sh — x\nif then fi (\n' > "$quebrado"
publicar "publicar v1.0.1 $(sha "$quebrado")" "$quebrado"
igual "sintaxe quebrada: sai 3" "3" "$(rc)"
igual "  e o arquivo no ar não mudou" "$no_ar" "$(sha "$DEST/obter.sh")"

vazio="$TMP/vazio.sh"; : > "$vazio"
publicar "publicar v1.0.1 $(sha "$vazio")" "$vazio"
igual "vazio: sai 3" "3" "$(rc)"

grande="$TMP/grande.sh"
{ cat "$BOM"; head -c 300000 /dev/zero | tr '\0' '#'; printf '\n'; } > "$grande"
publicar "publicar v1.0.1 $(sha "$grande")" "$grande"
igual "acima de 256 KB: sai 3" "3" "$(rc)"
igual "  e o arquivo no ar não mudou" "$no_ar" "$(sha "$DEST/obter.sh")"
igual "  e não sobrou arquivo temporário" "0" "$(sobras)"

echo "4. guarda a versão anterior"
zerar
publicar "publicar v1.0.0 $(sha "$BOM")" "$BOM"
segundo="$TMP/segundo.sh"; { cat "$BOM"; echo '# segunda'; } > "$segundo"
publicar "publicar v1.0.1 $(sha "$segundo")" "$segundo"
igual "sai 0" "0" "$(rc)"
igual "no ar está a nova" "$(sha "$segundo")" "$(sha "$DEST/obter.sh")"
igual "a anterior ficou guardada" "$(sha "$BOM")" "$(sha "$DEST/obter.sh.anterior")"
contem "a versão registrada é a nova" "v1.0.1" "$DEST/obter.sh.versao"

echo "5. republicar a mesma versão é seguro (idempotente)"
publicar "publicar v1.0.1 $(sha "$segundo")" "$segundo"
igual "sai 0" "0" "$(rc)"
igual "continua a mesma" "$(sha "$segundo")" "$(sha "$DEST/obter.sh")"

[ "$fail" -eq 0 ] && echo "OK" || { echo "FALHOU"; exit 1; }

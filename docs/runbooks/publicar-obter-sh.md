# Publicar o `kit/obter.sh` em `zapinstalador.futuristas.app`

> Para quem opera o **servidor de licenças** (VPS `2.24.94.245`). Quem só instala o ZapSales numa VPS
> não precisa disto — o comando que ele cola está em [`instalacao-vps-limpa.md`](instalacao-vps-limpa.md).

O comprador cola um comando na VPS dele:

```bash
curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sudo bash
```

O que vem dali **roda como administrador na máquina dele**. Por isso o arquivo não sai do GitHub cru
(`raw.githubusercontent.com`, que muda a cada push na `main`): ele é **publicado** por um workflow, a
partir de uma versão. Decisão: [ADR-0005](../adr/0005-licenciamento-tecnico.md), issue #224 item 4.

## O caminho, de ponta a ponta

```
tag vX.Y.Z (release.yml → cortar-tag)  ─┐
                                        ├─► .github/workflows/publicar-obter.yml
Run workflow (main, antes da 1ª release) ┘        │  confere: commit contido na main, é a tag mais nova, bash -n
                                                  │  ssh com a chave restrita ─► "publicar <rótulo> <sha256>"
                                                  ▼
   VPS de licenças: /usr/local/sbin/zapinstalador-publicar   (scripts/zapinstalador/publicar-no-servidor.sh)
        confere hash, 1ª linha, 2ª linha, sintaxe, tamanho ─► /srv/zapinstalador/obter.sh   (troca atômica)
                                                  │
   contêiner estático (/opt/zapinstalador, 172.17.0.1:3300, só leitura, só /obter.sh)
                                                  ▼
   Caddy que já ocupa as portas 80/443 da VPS     ─►  https://zapinstalador.futuristas.app/obter.sh
```

O último passo do workflow baixa o arquivo **pelo endereço público** e compara o hash. Verde = o que o
comprador recebe é o que saiu da tag.

## Publicar

- **Automático:** cada tag `vX.Y.Z` empurrada pelo corte de release publica sozinha — se for a tag mais
  nova. (Duas tags empurradas juntas rodam em paralelo; a mais velha pula para não ficar por cima.)
- **Antes da primeira release** o projeto não tem tag, e o próprio `obter.sh` instala a `main`. Então
  quem muda o `kit/obter.sh` publica à mão: **Actions → Publicar obter.sh (zapinstalador) → Run workflow**,
  escolhendo a `main`. O rótulo registrado é `main-<commit inteiro>`.
- **Voltar uma versão:** Run workflow escolhendo a **tag antiga** (é o único caminho que publica uma tag que
  não é a mais nova). Ou, direto na VPS, sem CI: `cp /srv/zapinstalador/obter.sh.anterior /srv/zapinstalador/obter.sh`.

## O que está no ar agora

```bash
ssh root@2.24.94.245 'cat /srv/zapinstalador/obter.sh.versao'   # rótulo, sha256, quando
curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sha256sum   # tem de bater com o sha256 acima
```

## Por que a chave do CI é estreita (e o que isso NÃO garante)

- Na VPS, a chave pública está em `/home/zapinstalador-pub/.ssh/authorized_keys` com
  `restrict,command="/usr/local/sbin/zapinstalador-publicar"`: **não abre shell, não encaminha porta**,
  e o único comando que roda é o script, que aceita só `publicar <vX.Y.Z | main-<commit>> <sha256>`.
  O usuário `zapinstalador-pub` não pode alterar o script (dono `root`) nem escreve fora de `/srv/zapinstalador`.
- No GitHub, a chave privada é segredo do **ambiente** `zapinstalador`, que só entrega o segredo a runs da
  `main` e de tags `v*`. Um PR, ou um branch de colaborador, não a lê — nem editando o workflow.
- **Limite honesto (risco aceito pelo dono, ADR-0005):** quem controlar o CI da `main` publica um `obter.sh`
  válido qualquer. As conferências do script pegam engano e arquivo cortado, não esse adversário. A defesa é a
  chave existir só ali e o hash registrado em `obter.sh.versao` permitir comparar com a tag.

## Trocar a chave (suspeita de vazamento, ou rotina)

```bash
# 1. gere um par novo (em máquina sua; a privada nunca vai para chat nem para arquivo versionado)
ssh-keygen -q -t ed25519 -N "" -C ci-zapsales-publica-obter-sh -f ./zi_key
# 2. GitHub: grave a privada como segredo do ambiente e apague o arquivo
gh secret set ZAPINSTALADOR_CHAVE_SSH --repo futuristasai/ZapSales --env zapinstalador < ./zi_key
# 3. VPS: troque a linha do authorized_keys (mantenha as opções restrict,command=…)
ssh root@2.24.94.245 'printf "restrict,command=\"/usr/local/sbin/zapinstalador-publicar\" %s ci-zapsales-publica-obter-sh\n" "<conteúdo de zi_key.pub, só os 2 primeiros campos>" > /home/zapinstalador-pub/.ssh/authorized_keys'
shred -u ./zi_key ./zi_key.pub 2>/dev/null || rm -f ./zi_key ./zi_key.pub
# 4. prove: Run workflow na main e confira o último passo (hash no ar)
```

Se a **VPS** for refeita, mude também a variável `ZAPINSTALADOR_CHAVE_DO_SERVIDOR` do ambiente
(`cut -d" " -f1,2 /etc/ssh/ssh_host_ed25519_key.pub`, precedido do endereço) e `ZAPINSTALADOR_SERVIDOR`.

## Reconstruir o servidor do zero

Tudo o que não está no repositório é só isto (a VPS tem outros apps; nada abaixo toca neles além do Caddy):

1. `useradd --system --create-home --shell /bin/bash zapinstalador-pub && passwd -l zapinstalador-pub`
2. `install -d -o zapinstalador-pub -g zapinstalador-pub -m 755 /srv/zapinstalador`
3. `install -o root -g root -m 755 scripts/zapinstalador/publicar-no-servidor.sh /usr/local/sbin/zapinstalador-publicar`
4. A chave, como acima.
5. Contêiner estático: `/opt/zapinstalador/compose.yaml` (imagem `caddy:2.11.4-alpine` fixada, `read_only`,
   `cap_drop: [ALL]` + `cap_add: [NET_BIND_SERVICE]` — o binário do Caddy tem essa capacidade embutida e não executa sem ela —,
   porta `172.17.0.1:3300:80`, `/srv/zapinstalador` montado `:ro`) e `/opt/zapinstalador/Caddyfile`
   (`auto_https off`, `admin off`, serve **somente** `/obter.sh`, com `Cache-Control: no-cache`).
6. No Caddy que já ocupa as portas 80/443 da VPS (ache o contêiner com `docker ps --filter publish=443` e o
   arquivo montado em `/etc/caddy/Caddyfile` com `docker inspect`), o bloco `zapinstalador.futuristas.app` faz
   `handle /obter.sh { reverse_proxy 172.17.0.1:3300 }`. **Copie antes, `caddy validate` antes do `reload`,
   e prove depois** (os outros domínios continuam respondendo): `cp Caddyfile Caddyfile.antes-…`,
   `docker exec <contêiner> caddy validate --config /etc/caddy/Caddyfile`, `… caddy reload …`.

## Quando a Fase 4 (página do instalador) chegar

O bloco `handle { respond "Em breve." 200 }` do Caddy é o espaço reservado para a página do comprador. Quando ela
existir, ela entra ali (ADR-0005: um programa só atende `licencas.` e `zapinstalador.`); o `handle /obter.sh`
continua indo para o contêiner estático, para o arquivo seguir sendo estático e somente leitura.

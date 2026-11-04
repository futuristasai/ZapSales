# Runbook — segurança do GitHub (conta e repositório)

Para quem opera o repositório `futuristasai/ZapSales`. O objetivo é **segurança que roda sozinha**:
configurada uma vez, ninguém precisa aprovar nada a cada PR ou a cada deploy. Só dois tipos de coisa
pedem uma pessoa — o que é da **conta** (o GitHub exige) e o que decide **dinheiro ou licença**.

Nada aqui guarda segredo. Cada afirmação de estado vem com o comando que a confere: números e
nomes envelhecem, comandos não.

## 1. O que já está aplicado no repositório

| Proteção | O que faz | Como conferir |
|---|---|---|
| Regra da `main` (ruleset) | Exige os 5 checks (`verify`, `invariants`, `build-and-size`, `e2e`, `imagens-ok`), bloqueia force push e exclusão. Não exige revisão de outra pessoa | `gh api repos/futuristasai/ZapSales/rules/branches/main --jq '.[].type'` |
| Tags de versão imutáveis | Tag `v*` não pode ser apagada nem movida depois de publicada | `gh api repos/futuristasai/ZapSales/rulesets --jq '.[].name'` |
| Detecção de segredos + bloqueio no push | O GitHub recusa o push que contém uma chave de provedor conhecido | `gh api repos/futuristasai/ZapSales --jq '.security_and_analysis\|{secret_scanning,secret_scanning_push_protection}'` |
| Denúncia privada de vulnerabilidade | É para onde o `SECURITY.md` manda o relato | `gh api repos/futuristasai/ZapSales/private-vulnerability-reporting --jq .enabled` |
| Dependabot (alertas + atualização de segurança) | Abre PR quando uma dependência tem falha conhecida | `gh api repos/futuristasai/ZapSales --jq '.security_and_analysis.dependabot_security_updates.status'` |
| Actions fixadas por SHA, exigido | Uma action só entra com o commit exato, não com uma tag que pode ser movida | `gh api repos/futuristasai/ZapSales/actions/permissions --jq .sha_pinning_required` |
| Permissão padrão dos workflows: só leitura | Um workflow só escreve onde declara | `gh api repos/futuristasai/ZapSales/actions/permissions/workflow --jq .default_workflow_permissions` |
| Varredura de segredos no CI | `segredos.yml` roda a cada PR | `ls .github/workflows/segredos.yml` |

### Por que a regra da `main` não incomoda

- **Sem revisão obrigatória.** Quem trabalha sozinho não tem a quem pedir; exigir uma aprovação só
  criaria um clique inútil.
- **Sem "branch atualizada".** Não obriga a rebasear a cada merge de outro PR.
- **Escape deliberado.** O administrador pode mesclar um PR com check vermelho de propósito
  (`gh pr merge N --admin`). Direto na `main` não: só por PR.
- **Quando o `e2e` falha sem motivo**, rode `gh run rerun <id> --failed` antes de suspeitar do código.

### O que NÃO muda com estas regras

O deploy automático (`implantar.yml`) continua igual: ele já esperava os mesmos checks. O fluxo de
release (`release.yml`) depende de um GitHub App que ainda não foi configurado; quando for, o App
precisa entrar na lista de bypass da regra da `main`, senão os PRs dele ficam esperando.

## 2. O que só o dono pode fazer (é da conta)

- [ ] Verificação em duas etapas com **passkey** nas duas contas
- [ ] **Códigos de recuperação** guardados num cofre de senhas (não só no computador)
- [ ] Uma **segunda passkey** ou chave de segurança, em outro aparelho
- [ ] Revisar **Settings › Applications** (autorizadas e instaladas) e revogar o que não reconhece
- [ ] Revisar **Settings › SSH and GPG keys** e **Personal access tokens**; apagar os que não usa
- [ ] Revisar **Settings › Sessions** (aparelhos conectados)
- [ ] Quando a conta antiga não for mais necessária: tirar o acesso dela do repositório
  (`gh api -X DELETE repos/futuristasai/ZapSales/collaborators/leandromastelliniai`) e, depois, apagar
  os pacotes e o resto da conta

## 3. Se um segredo vazar (chave, token, senha)

1. **Revogue e troque a chave no provedor primeiro.** Apagar o commit não adianta: o histórico, os
   forks e os caches já podem ter a cópia. Quem leu uma vez, leu.
2. Só depois limpe o commit, se ainda valer a pena.
3. Confira o que a chave alcançava (logs do provedor) e registre o ocorrido.
4. Se o aviso veio do GitHub: `gh api repos/futuristasai/ZapSales/secret-scanning/alerts --jq '.[]|select(.state=="open")'`.

## 4. Conferir tudo de uma vez

```bash
R=futuristasai/ZapSales
gh api repos/$R/rules/branches/main --jq '[.[].type]|sort|join(",")'
gh api repos/$R --jq '.security_and_analysis|{secret_scanning:.secret_scanning.status,push_protection:.secret_scanning_push_protection.status,dependabot:.dependabot_security_updates.status}'
gh api repos/$R/actions/permissions --jq '{sha_pinning_required}'
gh api repos/$R/secret-scanning/alerts --jq 'map(select(.state=="open"))|length'   # esperado: 0
```

## 5. Limites, ditos às claras

- **Quem clonou o repositório antes da proteção continua com a cópia.** Nenhuma regra recolhe isso.
- **Detecção de segredos vê padrões de provedores conhecidos.** Uma senha própria num arquivo de
  teste passa; por isso a varredura do histórico por `gitleaks` roda também no CI.
- **Repositório privado no plano Free não tem proteção de branch** e tem cota de minutos de CI.
  Decidir tornar o repositório privado muda esta página.

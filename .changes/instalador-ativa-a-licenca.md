---
impacto: capacidade_nova
secao: adicionado
titulo: O instalador pode ativar a licença da compra (e a instalação termina mesmo sem ela)
---

O instalador agora pergunta, no fim da instalação, o **e-mail da compra** e o **código da transação** (o que começa com `HP`, que não aparece na tela ao digitar) e ativa a licença. **Nada muda para quem já instalou:** o sistema segue funcionando como antes, e quem atualiza com a licença já ativada não é perguntado de novo.

Se você não tem os dados à mão — ou se o servidor de licenças estiver fora do ar, ou a compra ainda não tiver sido aprovada —, **a instalação termina do mesmo jeito**, na situação «ativação pendente», e o resumo final diz como ativar depois: `sudo kit/ativar-licenca.sh`. Em instalação automática, sem terminal, os dados vêm do arquivo `/etc/zapsales/licenca-compra` (duas linhas, modo 600, que o instalador apaga depois de usar) ou das variáveis `ZAPSALES_LICENCA_EMAIL` e `ZAPSALES_LICENCA_TRANSACAO` — com a ressalva de que `sudo VAR=valor` deixa o valor visível no `ps`, então prefira o arquivo.

O instalador não passa o e-mail e o código em argumento de programa, não os grava no arquivo `.env` e eles não aparecem na tela nem nos registros dele. O instalador também deixou de poder abrir diálogos do `apt` quando roda sem terminal.

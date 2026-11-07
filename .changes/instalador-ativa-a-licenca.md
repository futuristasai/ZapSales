---
impacto: capacidade_nova
secao: adicionado
titulo: O instalador pode ativar a licença da compra (e a instalação termina mesmo sem ela)
---

O instalador agora pergunta, no fim da instalação, o **e-mail da compra** e o **código da transação** (o que começa com `HP`, que não aparece na tela ao digitar) e ativa a licença. **Nada muda para quem já instalou:** o sistema segue funcionando como antes, e quem atualiza com a licença já ativada não é perguntado de novo.

Se você não tem os dados à mão — ou se o servidor de licenças estiver fora do ar, ou a compra ainda não tiver sido aprovada —, **a instalação termina do mesmo jeito**, na situação «ativação pendente», e o resumo final diz como ativar depois: `sudo kit/ativar-licenca.sh`. Em instalação automática, sem terminal, os dados vêm das variáveis `ZAPSALES_LICENCA_EMAIL` e `ZAPSALES_LICENCA_TRANSACAO`.

O e-mail e o código **não vão na linha de comando**, não são gravados no arquivo `.env` e não aparecem na tela nem nos registros do instalador. O instalador também deixou de poder abrir diálogos do `apt` quando roda sem terminal.

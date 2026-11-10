---
impacto: nada_mudou
secao: corrigido
titulo: As telas Atualização e Cadastro passam a mostrar o comando de atualização que existe de verdade
---

As telas **Configurações › Atualização** e **Admin › Cadastro** mandavam rodar `bash kit/update.sh`, um arquivo que não existe no kit — quem copiava o comando recebia "No such file or directory" justo na tela cuja função é atualizar o servidor. Agora elas mostram o comando de atualização de verdade (`curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sudo bash`), o mesmo da instalação. Depois de uma atualização que não deu certo, o comando que volta para a versão que funcionava passa a fixar a versão com `ZAPSALES_REF=vX.Y.Z`, em vez das opções `--to` e `--force`, que o kit nunca teve. Nada muda no servidor: é só o texto que a tela mostra.

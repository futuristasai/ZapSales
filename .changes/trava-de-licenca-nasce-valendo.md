---
impacto: capacidade_nova
secao: alterado
titulo: A trava de licença passa a valer nas instalações novas
---

A trava de licença, que até aqui só **observava** (modo «sombra»), passa a **valer** nas instalações novas (modo «valendo»). Na prática: se uma compra é reembolsada ou sofre chargeback, o servidor de licenças bloqueia a licença e a instalação **ativada** com ela deixa de operar. Os dados continuam preservados, e login, exportação dos próprios dados e a tela de Licença seguem liberados. Instalação que **nunca foi ativada** continua funcionando como uso não comercial.

**Nada muda para quem já instalou:** cada instalação guarda o modo que tem. Só o padrão de quem instala agora mudou. Quem quiser voltar ao modo que só observa roda `sudo kit/licenca-modo.sh sombra`.

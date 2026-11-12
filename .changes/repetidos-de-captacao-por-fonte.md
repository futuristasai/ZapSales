---
impacto: nada_mudou
secao: corrigido
titulo: Correção de segurança na checagem de leads repetidos das fontes de captação
---

Quando uma integração ou um formulário envia um lead com um identificador próprio, o sistema usa esse identificador para não criar o mesmo lead duas vezes. Essa checagem passa a valer **por fonte de captação**: cada formulário e cada integração tem os seus próprios identificadores.

Antes, a checagem era feita para a organização inteira. Quem preenchesse um formulário público usando o identificador que uma integração assinada ia enviar fazia o lead da integração ser tratado como repetido — e ele não era criado.

Nada muda no uso: o reenvio do mesmo lead pela mesma fonte continua sem duplicar. Os leads que já existem são preservados; a atualização só passa a registrar, em cada um, de qual fonte ele veio.

**Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

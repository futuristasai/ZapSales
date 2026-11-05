<!--
  Modelo de contrato publicado pelo Titular. NÃO foi revisado por advogado (decisão do dono em
  2026-11-04). Cada venda preenche só o Anexo I (Pedido); o corpo não muda de um cliente para
  outro. Qualquer alteração do corpo deve vir de uma decisão explícita, e vale a pena levar o texto
  a um advogado antes de usá-lo em venda de valor alto. Os pontos que são decisão comercial, e não
  texto jurídico, estão marcados com [DECISÃO] na descrição do PR que o introduziu.
-->

# Contrato de Licença Comercial — ZapSales

**Versão 1.0** · Modelo geral, preenchido a cada venda pelo [Pedido de Licença](#anexo-i--pedido-de-licença).

Este contrato dá permissão para usar o ZapSales **em uma empresa** ou **para atender outras empresas**.
A licença pública do código, a [PolyForm Noncommercial 1.0.0](LICENSE), só permite uso sem fins
comerciais; este contrato é a permissão adicional para o uso comercial e **não a revoga**. Um resumo
em linguagem simples está em [`LICENSING.md`](LICENSING.md).

## 1. Partes e documentos

1.1. **Licenciante** é o titular indicado na linha `Required Notice` do arquivo [`LICENSE`](LICENSE),
com os dados completos no Pedido. **Licenciado** é a pessoa ou empresa identificada no Pedido.

1.2. Fazem parte deste contrato: (a) o **Pedido**, que preenche os dados de cada venda; e (b) este
texto. Se houver divergência, **vale o Pedido**, e depois este texto.

1.3. O contrato é aceito quando o Licenciado assina o Pedido ou confirma o aceite por e-mail ou pelo
canal de compra. O aceite eletrônico tem o mesmo valor que a assinatura, nos termos da lei.

## 2. Definições

- **Software**: o ZapSales, em código-fonte e em imagens prontas, e a documentação que o acompanha.
- **Versão Licenciada**: a versão do Software obtida pelo Licenciado até a data de cada ativação, e
  as que o Licenciado instalar depois, nos termos da cláusula 9.
- **Instalação**: cada implantação independente do Software em ambiente de produção, com banco de
  dados próprio. Ambientes de desenvolvimento, teste e homologação do Licenciado **não** contam como
  Instalação, desde que não atendam clientes de verdade.
- **Modalidade**: **Uso Próprio** ou **Revenda**, conforme o Pedido.
- **Cliente Final**: na Revenda, a empresa que usa o Software por meio do Licenciado.
- **Marco Inicial**: a data e a hora da compra registradas no Pedido.
- **Janela de Validação**: os **10 dias corridos** a partir do Marco Inicial.

## 3. Concessão da licença

3.1. O Licenciante concede ao Licenciado uma licença **não exclusiva, intransferível (salvo o que
prevê a cláusula 14) e perpétua para a Versão Licenciada**, para instalar, executar, copiar para
fins de segurança e **modificar** o código-fonte, nos limites da Modalidade e do número de
Instalações previstos no Pedido.

3.2. A licença vale em qualquer país, respeitadas as leis aplicáveis ao Licenciado e à atividade dele.

3.3. A licença é concedida **mediante o pagamento único** previsto no Pedido, que **não** gera
assinatura nem renovação.

## 4. Modalidades

### 4.1. Uso Próprio

O Licenciado pode usar o Software **no próprio negócio**, inclusive para atender os clientes dele pelo
WhatsApp. Não inclui hospedar para terceiros, instalar para terceiros, revender ou redistribuir.

### 4.2. Revenda

O Licenciado pode atender **Clientes Finais**, dentro do limite contratado no Pedido, e pode aplicar a
própria marca na interface usando os recursos de marca própria do Software. **Cada uma das permissões
abaixo é concedida separadamente, e só as marcadas "Sim" no Pedido valem. Nenhuma decorre de outra:**

| Permissão                                     | O que significa                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| **(a) Operar como serviço**                   | Operar o Software para o Cliente Final, em infraestrutura que o Licenciado controla |
| **(b) Instalar na infraestrutura do cliente** | Instalar o Software no servidor do Cliente Final                                    |
| **(c) Entregar o código-fonte**               | Entregar o código-fonte ao Cliente Final                                            |
| **(d) Autorizar redistribuição**              | Permitir que o Cliente Final redistribua o Software a terceiros                     |

4.3. **Instalações de Clientes Finais.** Cada Instalação de um Cliente Final é registrada e ativada
vinculada à licença do Licenciado, e conta no limite do Pedido.

4.4. **Responsabilidade pelo Cliente Final.** O Licenciado é responsável perante o Licenciante pelo
cumprimento deste contrato pelos Clientes Finais, e a relação comercial com eles é **só do Licenciado**:
o Cliente Final não é parte deste contrato e o Licenciante não responde a ele. Os direitos do Cliente
Final são **derivados** dos do Licenciado. Se este contrato for rescindido por culpa do Licenciado, o
Licenciante **poderá** oferecer licença direta aos Clientes Finais de boa-fé, mas **não é obrigado** a
isso.

## 5. Restrições

O Licenciado **não pode**:

a) **sublicenciar, ceder, vender, alugar ou redistribuir** o Software, exceto no que a Modalidade e o
Pedido permitem expressamente;
b) **remover, ocultar ou alterar** os avisos de titularidade, o `Required Notice` e os avisos de
terceiros (`NOTICE`) do Software;
c) **remover, desativar ou contornar** o mecanismo de verificação de licença descrito na cláusula 6, ou
ajudar alguém a fazê-lo;
d) apresentar o Software ou o código-fonte original como **obra própria**;
e) usar as marcas **ZapSales** e **Futuristas.ai** de modo que sugira que o Licenciante patrocina ou
endossa o produto ou o serviço do Licenciado, ou fora de referência factual (por exemplo, "baseado
no ZapSales").

## 6. Verificação de licença

6.1. O Software **poderá** conter um mecanismo que, em intervalos, consulta um servidor do Licenciante
para confirmar que a licença está ativa. **Quando houver**, durante a Janela de Validação o Software
recebe autorizações temporárias, renovadas enquanto a licença estiver regular; **depois dela**, uma
licença regular recebe uma **autorização permanente**, e a Instalação deixa de depender de consultas.

6.2. Essa consulta envia **apenas** o necessário para identificar a licença e a Instalação (por
exemplo, identificador da Instalação, versão e domínio). **Nunca** envia conversas, mensagens,
contatos, dados de clientes ou o conteúdo do banco de dados do Licenciado, **e o Licenciante não tem
acesso à Instalação por esse mecanismo**.

6.3. Uma autorização permanente já entregue **não é revogada à distância**. A falta temporária de
conexão com o servidor não é considerada violação nem bloqueio de licença.

## 7. Preço e pagamento

7.1. O preço é **único**, previsto no Pedido, e inclui a licença da Versão Licenciada. Impostos e
tributos são devidos conforme a lei, e o Licenciante emite o documento fiscal correspondente.

7.2. Em caso de atraso, incidem **multa de 2%** e **juros de 1% ao mês**, calculados sobre o valor em
atraso, até o pagamento.

## 8. Janela de Validação e reembolso

8.1. Dentro da Janela de Validação, o Licenciado pode **pedir o reembolso integral**, por escrito, para
o e-mail do Licenciante indicado no Pedido, **sem precisar justificar**.

8.2. O Licenciante restitui o valor pago em até **10 dias úteis** depois do pedido. A licença é então
**bloqueada**, o Licenciado deixa de usar o Software e remove as Instalações de produção, podendo
exportar os próprios dados antes disso (cláusula 13.3).

8.3. A Janela de Validação é um prazo **contratual e técnico**. Ela **não reduz** nenhum prazo ou direito
que a lei garanta ao Licenciado, inclusive o direito de arrependimento nos casos em que ele se aplica.

8.4. Passada a Janela de Validação, a licença é permanente e o pagamento **não é reembolsável**, salvo
violação do Licenciante a este contrato ou o que a lei determinar.

## 9. Atualizações e suporte

9.1. O Licenciante **pode** publicar novas versões e correções, **sem obrigação** de fazê-lo. O
Licenciado **não é obrigado** a atualizar, e **a licença permanente não depende de atualização**.

9.2. O Licenciado que instalar uma nova versão continua sob este contrato, **salvo** se a nova versão
trouxer termos de licença diferentes, que serão informados antes e dependerão de aceite.

9.3. **Suporte** só existe se estiver contratado no Pedido. Sem isso, o Licenciante responde apenas a
dúvidas sobre este contrato, pelo e-mail do Pedido.

## 10. Propriedade intelectual

10.1. O Software e seus componentes pertencem ao Licenciante, ou aos respectivos titulares quando são
de terceiros. Este contrato **não transfere** a titularidade.

10.2. As **modificações** que o Licenciado fizer são do Licenciado e ele não precisa compartilhá-las,
mas o código original continua do Licenciante e as modificações só podem ser usadas nos limites deste
contrato.

10.3. Os componentes de terceiros mantêm as licenças próprias, listadas no arquivo `NOTICE`, e **não**
são relicenciados por este contrato.

## 11. Dados pessoais e serviços de terceiros

11.1. **Dados do Licenciado e dos clientes dele.** Em uma Instalação, quem decide como os dados são
tratados é o Licenciado (ou o Cliente Final), que é o **controlador** deles perante a LGPD. O
Licenciante **não acessa** o servidor nem o banco de dados e **não trata** esses dados.

11.2. **Dados do contrato.** O Licenciante trata os dados cadastrais do Licenciado (nome, documento,
e-mail, dados de pagamento e de licença) como controlador, para executar este contrato, controlar a
licença e cumprir obrigações legais. Os direitos do titular podem ser exercidos pelo e-mail do Pedido.

11.3. **Uso responsável.** O Licenciado é o único responsável por: o consentimento e a possibilidade de
descadastro dos contatos que recebem mensagens; o uso do WhatsApp conforme os termos e políticas da
Meta; os custos e termos dos serviços de terceiros que ele ligar ao Software (por exemplo, API Oficial
da Meta, WAHA, provedores de IA, hospedagem). **O Licenciante não controla esses serviços e não
responde por bloqueio de número, limite, preço ou indisponibilidade deles.**

11.4. O Licenciado é responsável por **cópias de segurança** dos próprios dados, e pela segurança do
servidor onde instala o Software.

## 12. Garantias e limitação de responsabilidade

12.1. O Licenciante declara que **tem o direito de conceder** esta licença. Fora isso, o Software é
fornecido **no estado em que se encontra**, sem garantia de que atenda a uma finalidade específica ou
funcione sem falhas.

12.2. Se um terceiro alegar que o Software, como entregue, infringe direito dele, o Licenciante poderá,
a seu critério, obter o direito de continuar usando, modificar o Software para eliminar a infração ou
reembolsar o valor pago pelo Software afetado.

12.3. **Limite.** Na medida em que a lei permitir, a responsabilidade total do Licenciante por tudo o
que decorrer deste contrato fica **limitada ao valor pago pelo Licenciado no Pedido**, e o Licenciante
**não responde** por lucros cessantes, perda de dados ou danos indiretos. Esse limite **não** vale
para dolo, culpa grave ou o que a lei não permitir limitar.

## 13. Vigência e rescisão

13.1. O contrato vigora por **prazo indeterminado**. O Licenciado pode encerrá-lo quando quiser,
deixando de usar o Software; fora da Janela de Validação isso não gera reembolso.

13.2. O Licenciante pode rescindir o contrato se o Licenciado **violar** as cláusulas 4, 5 ou 7 e não
corrigir a violação em **15 dias** depois de avisado por escrito. Em caso de contornar a verificação de
licença (cláusula 5, "c") ou de redistribuição não autorizada, a rescisão pode ser **imediata**.

13.3. **Depois da rescisão** o Licenciado deve cessar o uso do Software em **até 30 dias**. Nesse prazo
ele pode **exportar e migrar os próprios dados**, que **sempre pertencem ao Licenciado**: nenhuma
rescisão, bloqueio ou falta de pagamento impede a consulta e a exportação dos dados dele.

13.4. As cláusulas 5, 10, 11, 12 e 15 continuam valendo depois do fim do contrato.

## 14. Cessão e mudança de servidor

14.1. O Licenciado **não pode ceder** este contrato sem consentimento escrito do Licenciante, **exceto**
em fusão, incorporação ou venda do negócio inteiro, mediante aviso ao Licenciante e desde que o novo
titular assuma o contrato.

14.2. O Licenciado **pode mudar uma Instalação de servidor** (por exemplo, migrar de VPS) pedindo ao
Licenciante a reassociação da licença à nova Instalação. A mudança **não reinicia** a Janela de
Validação e não gera custo.

## 15. Disposições gerais

15.1. **Chave de ativação.** A chave de ativação é pessoal e intransferível. O Licenciado a mantém em
sigilo e responde pelo uso dela. Este contrato também protege as condições comerciais do Pedido.

15.2. **Comunicações.** As comunicações são feitas por e-mail, para os endereços indicados no Pedido.

15.3. **Lei e foro.** Este contrato é regido pelas **leis da República Federativa do Brasil**. As
partes elegem o **foro indicado no Pedido** para resolver as controvérsias, ressalvado o foro que a
lei imponha em favor de consumidor.

15.4. **Integralidade.** Este contrato e o Pedido são o acordo completo sobre o assunto e substituem
conversas e propostas anteriores. Alterações só valem por escrito, aceitas pelas duas partes.

15.5. **Nulidade parcial.** Se uma cláusula for considerada inválida, as demais continuam valendo. Não
exercer um direito não é renunciar a ele.

---

## Anexo I — Pedido de Licença

Preencha uma vez por venda. O que não estiver marcado **não** é concedido.

| Campo                                                      | Preenchimento                           |
| ---------------------------------------------------------- | --------------------------------------- |
| **Licenciante** (nome ou razão social, CPF/CNPJ, endereço) | `[                                   ]` |
| **E-mail do Licenciante** (pedidos, reembolso, dúvidas)    | `contato@futuristas.ai`                 |
| **Licenciado** (nome ou razão social, CPF/CNPJ, endereço)  | `[                                   ]` |
| **E-mail do Licenciado**                                   | `[                                   ]` |
| **Modalidade**                                             | `[ ] Uso Próprio` · `[ ] Revenda`       |
| **Nº de Instalações de produção**                          | `[    ]` (padrão: 1)                    |
| **Revenda — limite de Clientes Finais**                    | `[    ]` (se Revenda)                   |
| **Revenda (a) — operar como serviço**                      | `[ ] Sim` · `[ ] Não`                   |
| **Revenda (b) — instalar na infraestrutura do cliente**    | `[ ] Sim` · `[ ] Não`                   |
| **Revenda (c) — entregar o código-fonte**                  | `[ ] Sim` · `[ ] Não`                   |
| **Revenda (d) — autorizar redistribuição**                 | `[ ] Sim` · `[ ] Não`                   |
| **Preço único** (R$)                                       | `[           ]`                         |
| **Marco Inicial** (data e hora da compra)                  | `[           ]`                         |
| **Suporte contratado**                                     | `[ ] Não` · `[ ] Sim: [descrever]`      |
| **Foro**                                                   | `Comarca de [           ]`              |
| **Condições especiais**                                    | `[ nenhuma ]`                           |

**Aceite.** O Licenciado declara que leu e aceita o Contrato de Licença Comercial (versão 1.0) e
este Pedido.

Local e data: `[                  ]`

Licenciante: `[                  ]` · Licenciado: `[                  ]`

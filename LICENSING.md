# Licenciamento do ZapSales

Este documento **resume** a situação em linguagem simples. Ele não substitui o texto da licença:
em caso de divergência, vale o [`LICENSE`](LICENSE).

## Em cinco linhas

1. O código é **público**, mas o ZapSales **não é open source** no sentido da OSI. O termo correto é
   _source-available_ (código à vista, uso comercial controlado).
2. A licença pública é a [PolyForm Noncommercial 1.0.0](LICENSE): livre para estudar, testar e usar
   **sem fins comerciais**.
3. **Usar numa empresa exige licença comercial**, de **pagamento único**, sem assinatura.
4. A licença comercial tem duas modalidades: **uso próprio** e **revenda**.
5. As versões publicadas **até** o commit marcado `ultima-versao-mit` foram MIT, e continuam MIT
   para quem as obteve.

## O que é livre (PolyForm Noncommercial)

- **Pessoas:** pesquisa, experimento, teste, estudo, hobby e projetos pessoais, **sem aplicação
  comercial prevista**.
- **Entidades sem fim comercial:** instituições de ensino, pesquisa pública, organizações de caridade,
  de saúde ou segurança pública, de proteção ambiental e órgãos de governo — qualquer que seja a
  fonte de financiamento.
- Nesses casos você pode **ler, alterar e redistribuir** o código, mantendo o `LICENSE` e a linha
  `Required Notice` que o acompanham.

## O que exige licença comercial

- Usar o ZapSales **na sua empresa**, inclusive para atender os seus clientes pelo WhatsApp.
- **Avaliar ou testar** com a intenção de usar no negócio: a permissão de teste do item acima
  vale só "sem aplicação comercial prevista".
- **Hospedar para terceiros**, instalar na VPS de um cliente, **revender** ou redistribuir.

### As modalidades

| Modalidade      | Para quem                                                         | O que cobre                                                                                |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Uso próprio** | A empresa que usa o ZapSales no próprio negócio                   | Instalar, adaptar e usar na empresa licenciada; número de instalações definido no contrato |
| **Revenda**     | Agências, consultorias e revendedores que atendem outras empresas | Atender clientes dentro de um limite contratado                                            |

Na revenda, cada permissão é concedida **separadamente**, nunca por implicação: operar o sistema como
serviço para um cliente, instalá-lo na VPS dele, entregar o código a ele e autorizar redistribuição
posterior são coisas diferentes.

> **Estado atual:** o contrato da licença comercial ainda está em elaboração. Até ele ser publicado,
> a licença comercial é concedida caso a caso, **por escrito**, pelo Titular.

## Versões anteriores (MIT)

O ZapSales foi publicado sob a licença MIT até um certo commit. Quem obteve o código nessas versões
mantém os direitos da MIT **sobre elas**. Para ver exatamente qual é o último commit MIT:

```bash
git rev-parse ultima-versao-mit
```

Tudo o que vier depois dele é só PolyForm Noncommercial ou licença comercial.

## Contribuir

Contribuições de terceiros exigem a assinatura do [`CLA.md`](CLA.md). Você continua dono do que
enviar; o contrato permite ao projeto distribuí-lo, inclusive sob licença comercial.

## Componentes de terceiros

As dependências mantêm as próprias licenças e não são relicenciadas por esta. Veja o
[`NOTICE`](NOTICE). Para a lista completa e atual: `pnpm licenses list --prod`.

## O que a licença não faz

Uma licença é o **fundamento legal**: ela diz o que é permitido e dá base para cobrar quem passa
do limite. Ela **não impede tecnicamente** ninguém de rodar o código. Quem controla um servidor
pode tentar contornar qualquer verificação; fazer isso fora dos termos da licença é violá-la.

## Dúvidas e licença comercial

Escreva para **contato@futuristas.ai**.

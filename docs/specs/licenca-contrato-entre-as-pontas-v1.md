# Licenciamento técnico — contrato entre as duas pontas (v1)

> Decisões e motivos: [ADR-0005](../adr/0005-licenciamento-tecnico.md). Este arquivo só fixa o que as
> duas bases de código **compartilham**, para que o aplicativo (este repositório) e o servidor de
> licenças (repositório privado) sejam construídos em paralelo sem se desencontrar. Se divergir da ADR,
> vale a ADR.

**Fora deste contrato:** a integração com a Hotmart (é detalhe interno do servidor de licenças), o painel
e o executor SSH. Nada disto muda o formato do selo nem a API abaixo.

## 1. O selo

Um **selo** é um JWS compacto (três partes em base64url separadas por ponto), assinado com **Ed25519**
(algoritmo `EdDSA`), produzido e conferido com a biblioteca `jose`. Não se escreve criptografia própria.

### Cabeçalho

| Campo | Valor                                                               |
| ----- | ------------------------------------------------------------------- |
| `alg` | exatamente `EdDSA`. Qualquer outro (`none`, `HS256`, …) é rejeitado |
| `typ` | exatamente `zapsales-selo`                                          |
| `kid` | identificador da chave que assinou, escolhida da lista do app       |

### Conteúdo (payload)

| Campo  | Tipo    | Obrigatório   | Significado                                                        |
| ------ | ------- | ------------- | ------------------------------------------------------------------ |
| `v`    | inteiro | sim           | versão do formato. Hoje `1`                                        |
| `iss`  | texto   | sim           | exatamente `zapsales-licencas`                                     |
| `sub`  | UUID v4 | sim           | **identificador da instalação** a que o selo pertence (nunca o IP) |
| `lic`  | UUID v4 | sim           | identificador da licença                                           |
| `tipo` | texto   | sim           | `temporario` ou `permanente`                                       |
| `iat`  | inteiro | sim           | emissão, em segundos Unix UTC, carimbada pelo servidor             |
| `exp`  | inteiro | só temporário | vencimento, em segundos Unix UTC. **Ausente** no permanente        |
| `jti`  | UUID v4 | sim           | identificador do selo                                              |

Não há campo de modalidade, de limite de empresas, de marca ou de permissão: o selo é **único** (ADR-0005,
D-1). Campo desconhecido no payload faz o selo ser **rejeitado** (leitura estrita), para que uma versão
futura do formato nunca seja aceita em silêncio por um app antigo.

### Como o app confere (nesta ordem; a primeira falha rejeita)

1. Tem três partes, e o cabeçalho é JSON válido.
2. `alg` e `typ` são os esperados.
3. `kid` está na **lista fixa de chaves públicas da imagem**. O app nunca baixa chave em tempo de execução.
4. A assinatura confere com a chave do `kid`.
5. O payload passa pelo esquema estrito (sem campo extra, tipos certos).
6. `v` é `1` e `iss` é o esperado.
7. `sub` é igual ao identificador **desta** instalação.
8. `tipo` e `exp` são coerentes: temporário com `exp`, permanente sem.
9. `exp` é maior que o **agora efetivo** (seção 2).
10. `iat` não passa de 5 minutos além do agora efetivo.

Selo que falha é tratado como **ausente** (seção 2). Em ambiente de produção a lista de chaves é a da imagem; fora
de produção pode-se acrescentar chaves de teste.

## 2. Estado local e decisão

### O que a instalação guarda

Uma linha por instalação (não é tabela de organização; sem acesso pelo PostgREST), com o conceito abaixo.
Implementado na tabela `platform_licenca` (migration 0556, singleton `id = 1`; leitura e escrita só por
`lib/licenca/armazem.ts`, a parte pura em `lib/licenca/estado.ts`). O banco garante por gatilho que o
`maior_horario_visto` só avança, que `ativada_em` não se desfaz e que `instalacao_id` não muda, e `service_role`
não tem `delete`/`truncate` nela. O UUID nasce do `INSTALACAO_ID` do `.env` (o `kit/instalar.sh` o grava) ou, na
falta dele, é gerado pelo app; depois de criada a linha, o banco vale mais que o `.env`.

| Campo                   | Para quê                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `instalacao_id`         | UUID gerado na instalação; também no `.env`, e acompanha o backup                          |
| `credencial`            | o `zpl_…` recebido na ativação, protegido em repouso como os demais segredos da instalação |
| `selo_atual`            | o último selo recebido                                                                     |
| `maior_horario_visto`   | o maior instante já observado (relógio local e respostas do servidor)                      |
| `ativada_em`            | marca de que a instalação **já foi ativada** alguma vez                                    |
| `bloqueio`              | motivo (código) e instante, quando o servidor respondeu bloqueio                           |
| `ultima_consulta_ok_em` | última resposta válida do servidor                                                         |
| `janela_termina_em`     | informado pelo servidor, só para a mensagem "faltam N dias"                                |
| `modo`                  | `sombra` (calcula e registra, não restringe) ou `valendo`                                  |

### O agora efetivo

`agora_efetivo = max(relógio_local, maior_horario_visto)`. Relógio que volta **não estende** nada: o selo
temporário vence pelo agora efetivo, e o app registra o recuo como suspeito. **Toda função de prazo recebe o
"agora" como parâmetro**, inclusive em SQL.

### A decisão (função pura)

`decidir(estado_local, agora) → { estado, opera, mensagem }`. Sem efeito colateral, sem I/O.

| Estado               | Quando                                                          | Opera?  | Mensagem                                                |
| -------------------- | --------------------------------------------------------------- | ------- | ------------------------------------------------------- |
| `sem_selo`           | nunca foi ativada                                               | sim     | faixa "Uso não comercial: uso em empresa exige licença" |
| `ativacao_pendente`  | `sem_selo` durante a instalação, com a ativação ainda por fazer | sim     | faixa "Ativação pendente"                               |
| `temporario_valido`  | selo temporário que passa nas dez conferências                  | sim     | "Licença temporária, faltam N dias"                     |
| `permanente_valido`  | selo permanente que passa nas conferências                      | sim     | nenhuma                                                 |
| `temporario_vencido` | `ativada_em` preenchido, sem selo válido e **sem bloqueio**     | **não** | "Autorização vencida por falta de contato"              |
| `bloqueada`          | o servidor respondeu bloqueio                                   | **não** | "Licença bloqueada"                                     |

Pontos fixos:

- Instalação com `ativada_em` **nunca** volta a `sem_selo` por perder o selo: um selo apagado ou adulterado leva
  a `temporario_vencido`. Reinstalar do zero (novo `instalacao_id`) é o caso que a documentação declara como limite.
- **Permanente** não é revogado à distância e não expira: depois de recebê-lo o app **para de consultar** o servidor.
- **Bloqueada ou vencida** = "não opera": backend, worker e scheduler recusam o trabalho. Continuam liberados:
  a verificação de saúde, o login e o encerramento de sessão, a **exportação autenticada dos próprios dados** e a
  tela de licença (que mostra a mensagem e oferece "tentar renovar agora"). Nenhum dado é apagado.
- Em modo `sombra` a decisão é calculada e registrada, **nunca aplicada**.

## 3. API do servidor de licenças

Base: `https://licencas.futuristas.app/api/v1`. Só HTTPS. JSON em `snake_case`, datas em ISO-8601 UTC. Sucesso
`{ "data": … }`, erro `{ "error": { "code", "message" } }`, com `X-Request-Id`. Os `POST` aceitam
`Idempotency-Key`.

### 3.1 `POST /licenca/ativar`

Primeira vez que uma instalação se apresenta.

| Corpo              | Descrição                                                        |
| ------------------ | ---------------------------------------------------------------- |
| `email`            | e-mail da compra (o servidor normaliza: minúsculas, sem espaços) |
| `codigo_transacao` | código da transação, formato `HP…`                               |
| `instalacao_id`    | UUID desta instalação                                            |
| `versao`           | versão do ZapSales instalada                                     |
| `dominio`          | domínio da instalação                                            |

Sucesso `200`: `{ credencial, selo, tipo, proxima_consulta_em, janela_termina_em }`. A `credencial` (`zpl_…`) é
mostrada **uma vez**; o servidor guarda só o hash SHA256. Repetir a chamada com o mesmo `instalacao_id` e a mesma
compra é idempotente.

Erros: `404 compra_nao_encontrada`, `409 compra_nao_aprovada`, `403 licenca_bloqueada`, `422 validation_error`,
`429 rate_limited`. O `tipo` devolvido é `temporario` dentro da janela e `permanente` depois dela (ADR-0005, D-2).

### 3.2 `POST /licenca/renovar`

`Authorization: Bearer zpl_…`. Corpo: `versao`, `dominio`.

Sucesso `200`: `{ selo, tipo, proxima_consulta_em, janela_termina_em }`. Quando o `tipo` for `permanente`, o app
deixa de renovar.

Erros: `401 credencial_invalida`, `403 licenca_bloqueada`, `403 instalacao_bloqueada` (com `motivo_codigo`, nunca
texto livre), `429 rate_limited`. O app trata `403 …bloqueada` gravando o estado `bloqueada` (sem selo novo).

### 3.3 `POST /instalacao/eventos`

Usado no modo manual (comando colado), para a página mostrar o progresso. `Authorization: Bearer zpl_…`. Corpo:
`etapa`, `total`, `rotulo`, `situacao` (`iniciada`, `concluida` ou `falhou`). No modo guiado pelo executor SSH o
progresso vem do próprio log e esta chamada não é necessária.

### 3.4 `GET /chaves-publicas`

Lista das chaves públicas (formato JWKS) **só para consulta e auditoria**. O app não confia em chave obtida por aqui:
as chaves aceitas vão na imagem. Rotacionar uma chave é lançar uma versão que aceita as duas por um período.

## 4. Tempo

| Parâmetro                   | Padrão                            | Quem manda                                       |
| --------------------------- | --------------------------------- | ------------------------------------------------ |
| Consulta de renovação       | 1 hora, com variação de ±20 %     | o servidor sugere em `proxima_consulta_em`       |
| Validade do selo temporário | 48 horas                          | o servidor, ao emitir                            |
| Janela de Validação         | 10 dias a partir do Marco Inicial | o servidor (o app só mostra `janela_termina_em`) |
| Intervalo aceito pelo app   | entre 5 minutos e 24 horas        | o app ignora sugestão fora da faixa              |

Os valores de consulta e de validade são configuráveis no servidor. O cálculo de qualquer prazo usa o "agora" do
**servidor**, nunca o do comprador.

## 5. O que o canal pode levar

Só o necessário para identificar a licença e a instalação: `email` e `codigo_transacao` (na ativação),
`instalacao_id`, `versao`, `dominio` e a credencial. **Nunca** conversas, mensagens, contatos, dados de clientes
finais ou conteúdo do banco da instalação (contrato, cláusula 6.2). O servidor não registra corpo de requisição além
destes campos.

## 6. Vetores de teste (compartilhados)

O primeiro PR da Fase 1 traz um conjunto de selos de exemplo, gerados com um **par de chaves de teste** (`kid` de
teste, publicado como tal e **nunca** usado em produção). O repositório do servidor consome o mesmo conjunto, e os
dois lados testam contra ele. O conjunto cobre, no mínimo:

1. temporário válido;
2. permanente válido;
3. temporário vencido;
4. `iat` no futuro;
5. assinatura adulterada;
6. `alg` igual a `none`;
7. `kid` desconhecido;
8. `sub` de outra instalação;
9. payload com campo extra;
10. `v` diferente de `1`;
11. permanente com `exp`, e temporário sem `exp`.

## 7. Versionamento do contrato

O formato do selo é versionado em `v`, e a API pelo prefixo `/api/v1`. O app **ignora campos desconhecidos na
resposta** da API, mas **rejeita** campos desconhecidos no selo. Mudança incompatível vira `v: 2` e `/api/v2`, com as
duas versões aceitas durante a migração.

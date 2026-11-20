# API genérica como ferramenta do agente — guia de quem cadastra

> **Para quem é:** quem vai ligar o agente de IA à API pronta de outro sistema (loja virtual,
> ERP, CRM) — a pessoa técnica que lê a documentação dessa API e preenche o cadastro em
> **Agente de IA › Ferramentas externas › APIs**.
> **O que responde:** o que o cadastro aceita, o que sai em cada chamada, o que o agente lê
> de volta e o que cada opção de segurança faz.
> **Fonte da verdade no código:** `lib/ai/ferramentas-externas/api/` — `montagem.ts` (o que
> sai), `chamar.ts` (como sai), `seguranca.ts` e `travas.ts` (o que a organização proíbe),
> `opcoes.ts` (os textos que a tela mostra).
> **Não é o webhook:** no webhook ([`ferramentas-externas-do-agente.md`](ferramentas-externas-do-agente.md))
> o outro sistema é feito para receber um envelope assinado do ZapSales. Aqui é o contrário: o
> ZapSales fala o formato que a API do outro sistema já tem.

---

## 1. Ligar o recurso

O recurso vem **desligado**, e a instalação funciona normalmente sem ele. Um administrador liga
em **Ferramentas externas › APIs**, marcando o aceite de que o agente passa a poder enviar aos
sistemas cadastrados os dados que preencher. Desligar não apaga nada: as APIs, as credenciais
cifradas e as opções ficam guardadas; as APIs somem do atendimento e pedido pendente não executa.

## 2. O cadastro

| Campo | O que é |
|---|---|
| Nome e «quando usar» | O que o agente lê para decidir se chama a API. Escreva como instrução para uma pessoa. |
| Operação | `GET`, `POST`, `PUT`, `PATCH` ou `DELETE`. |
| Endereço | `https`, sem usuário e senha. Os campos entram como `{{campo}}`, **só depois do nome do site**: `https://api.loja.example.com/pedidos/{{numero}}?detalhe={{detalhe}}`. |
| Credencial | `Authorization: Bearer <chave>`, um cabeçalho próprio (`X-API-Key: <chave>`, ou `Authorization` com um valor seu, como `Token abc`), usuário e senha (Basic) ou nenhuma. Sempre em cabeçalho; credencial em query string não é aceita. |
| Cabeçalhos fixos | Até 5, sem segredo (`Accept-Version: 2024-01`). `Authorization`, `Host`, `Cookie`, `Content-Type` e os do protocolo são recusados. |
| Corpo | Só em `POST`, `PUT` e `PATCH`. «Os campos» manda um objeto JSON com cada campo; «um modelo» manda o JSON que você escrever. |
| Dados que o agente preenche | Até 10 campos: texto, número, número inteiro ou sim/não, com descrição. |

### O endereço

- O **host nunca é marcador**. O agente preenche o número do pedido, nunca para onde a chamada
  vai; e o endereço montado é conferido de novo contra o host cadastrado.
- Todo valor entra **codificado**. Um valor vazio ou que é só pontos (`..`) no caminho não monta
  a chamada.
- Na consulta (`?a={{a}}`), o par de um campo opcional que o agente não preencheu **sai inteiro**.
- Em `GET` e `DELETE`, os campos que o endereço não cita vão no fim dele, como `?campo=valor`.

### O corpo em modelo

O modelo é JSON de verdade, com os marcadores **dentro de textos**:

```json
{
  "cliente": { "telefone": "{{contato_telefone}}" },
  "produto": "{{produto}}",
  "quantidade": "{{quantidade}}",
  "observacao": "Pedido feito pelo atendimento de {{produto}}"
}
```

- Um texto que é **só** o marcador recebe o valor com o tipo dele: `"{{quantidade}}"` vira `3`.
- Um campo opcional que o agente não preencheu **sai do corpo** (a chave some).
- Os valores entram na árvore do JSON, não no texto: nenhum valor fecha uma aspa ou acrescenta
  um campo.

No corpo «os campos», o que o endereço já levou não se repete, e cada dado do contato marcado
vai com o nome do marcador (`contato_telefone`).

## 3. Dados do contato

O telefone, o nome e o e-mail **não são campos do agente**. Quando liberados, quem os preenche é
o sistema, com os dados de quem está na conversa:

| Dado | Marcador |
|---|---|
| Telefone | `{{contato_telefone}}` |
| Nome | `{{contato_nome}}` |
| E-mail | `{{contato_email}}` |

É o que impede o agente de consultar o pedido de outra pessoa a pedido de quem digita um número
qualquer. Um dado só sai se a **organização o liberou** (Segurança das APIs) **e** a ferramenta o
marca. Contato anonimizado (LGPD) e conversa de grupo não enviam dado nenhum. Um campo do agente
não pode ter o nome de um desses marcadores.

## 4. O que sai e o que o outro sistema devolve

Cada chamada leva `Accept: application/json`, os cabeçalhos fixos, a credencial e, com corpo,
`Content-Type: application/json`. A execução de um **pedido aprovado** leva também
`Idempotency-Key: <id do pedido>`: se a sua API honra esse cabeçalho, uma ação nunca é feita em
dobro nem se alguém tentar de novo.

| Resposta da API | O que acontece |
|---|---|
| 2xx | O corpo chega ao agente como informação. |
| 401 ou 403 | «Credencial recusada». Não repete. O dono vê o aviso. |
| 5xx, 408, 429 ou sem resposta | Uma **consulta** tenta mais uma vez. Uma **ação que altera** tem uma tentativa só, e o desfecho fica incerto. |
| 4xx (outros) | Não repete. |
| 3xx | **Não é seguido.** Cadastre o endereço final. |

Prazo de **8 segundos** por tentativa; resposta acima de **64 KiB** faz a chamada falhar; e o
agente recebe no máximo **4.000 caracteres**. Com «o que o agente lê da resposta» preenchido, só
os caminhos escolhidos chegam (`status`, `cliente.nome`, `itens.titulo`), como
`{ "caminho": valor }`.

A resposta chega ao agente como **dado, nunca como instrução**, e a mensagem que ele escreve
ainda passa pelas conferências antes de sair ao cliente.

## 5. Segurança da organização

Só administrador muda. Toda opção nasce na posição recomendada; sair dela pede confirmação na
tela, deixa o selo «Fora do recomendado» e fica na auditoria (`ai.api_security_changed`).

| Opção | Posição recomendada | O que faz |
|---|---|---|
| Quem pode cadastrar APIs | Só administrador | Ou administrador e gerente. |
| Endereços permitidos | (lista sua) | `api.loja.example.com` ou `*.loja.example.com`. Vazia = qualquer endereço público. |
| Somente consulta | Ligado | Nenhuma API que altera dados é cadastrada nem executada. |
| Aprovação sempre obrigatória | Ligado | Toda ação que altera espera aprovação, qualquer que seja a chave da ferramenta. |
| Dados do contato que podem sair | Nenhum | Telefone, nome e e-mail, um a um. |
| Quem pode aprovar | Só administrador | Ou administrador e gerente. Vale para aprovar e para recusar. |
| Aviso ao administrador | Ligado | Aviso na Central a cada mudança de cadastro ou de segurança e a cada ação executada sem aprovação. |

O **nível de segurança** aplica várias de uma vez: «Mais seguro» (a posição recomendada) e
«Equilibrado» (o agente pode alterar, sempre com aprovação; gerente aprova). O nível não é
guardado: é calculado dos valores em vigor.

A verificação em duas etapas **não** é exigida para mexer nas APIs (decisão do dono do produto,
20/11/2026). Quem tem a verificação ativa na conta continua provando-a na sessão, como em
qualquer tela.

**As travas valem na execução**, não só no cadastro. Uma API gravada antes de a trava ser ligada
deixa de ser oferecida ao agente no turno seguinte, sem ninguém editá-la, e a tela diz por quê.

## 6. Segurança de cada API

| Opção | Padrão | O que faz |
|---|---|---|
| Efeito | `GET` consulta; os demais alteram | «Altera dados» nunca é repetida sozinha. |
| Pedir aprovação | Ligada no que altera | O agente abre um pedido na Central e só executa depois de aprovado. |
| Prazo da aprovação | 24 h (1 a 168) | Passado o prazo, o pedido expira e o agente sabe que não foi feito. |
| Dados do contato | Nenhum | Dentro do que a organização liberou. |
| O que o agente lê da resposta | Tudo (cortado) | Até 10 caminhos. |
| Limite de uso | 5 por conversa e 200 no total, a cada 24 h | A chamada que passa do limite não sai; o agente é orientado e a Central ganha um aviso. |
| Valores permitidos por campo | Sem limite | Lista de opções (texto) ou mínimo e máximo (número). |
| Pausa automática | Após 5 falhas seguidas | A API é desativada sozinha e a Central avisa. Reativar zera a contagem. |

## 7. O que esta versão não faz

- Login que se renova sozinho (OAuth) — Mercado Livre, Bling e semelhantes.
- Credencial em query string.
- Campos que são lista ou objeto preenchidos pelo agente (um pedido com vários itens).
- Sincronização (importar contatos, catálogo) e recebimento de avisos do outro sistema.
- Endereços da rede interna, privada ou local: são recusados no cadastro e a cada chamada, e
  nenhuma opção da organização os libera.

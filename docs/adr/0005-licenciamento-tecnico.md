# ADR-0005 — Licenciamento técnico: selo assinado, servidor de licenças e instalação guiada

- **Status:** aceito em 2026-11-05 pelo dono do produto (aprovação do PR #221)
- **Data:** 2026-11-05
- **Contexto medido em:** `1f647c3` (topo de `origin/main` em 05/11/2026)
- **Lei que muda quando aceita:** a doutrina "Licença e contribuição" do `CLAUDE.md` e do `AGENTS.md`, item 5 ("nada aqui é trava técnica"). A mudança só é feita quando a trava passar a valer (ver "Consequências")
- **Contrato entre as duas pontas:** [`docs/specs/licenca-contrato-entre-as-pontas-v1.md`](../specs/licenca-contrato-entre-as-pontas-v1.md)

---

## Contexto

O ZapSales é _source-available_ (ver [`LICENSING.md`](../../LICENSING.md)): código e imagens são públicos, e o uso comercial exige a licença comercial de pagamento único ([`LICENCA-COMERCIAL.md`](../../LICENCA-COMERCIAL.md)). A venda é feita pela Hotmart.

A licença é o fundamento **legal**. Este documento decide a peça **técnica** que a acompanha: um servidor que emite autorizações assinadas, uma trava no aplicativo que as confere e um instalador guiado para quem compra.

O objetivo do dono é estreito, e todas as decisões abaixo saem dele:

1. **Proteger o reembolso.** O comprador tem 10 dias (a Janela de Validação do contrato, cláusula 8). Se pedir reembolso nesse prazo, a instalação dele precisa poder ser bloqueada.
2. **Dificultar o uso indevido em instalações normais**, sem prometer inviolabilidade.
3. **Não piorar a primeira impressão.** A instalação fresca continua sendo o produto que se vende.

Fatos do código que moldam o desenho (conferidos em `origin/main`):

- O `proxy.ts` global só reconhece cookie de sessão e deixa passar sem login as rotas de cron e de webhook (`lib/auth/public-paths.ts`), que se autenticam por segredo ou assinatura. O scheduler é só um `curl` nessas rotas de cron.
- O worker (`workers/agent-worker/main.ts`) é um processo separado, fala direto com o banco e **nunca passa pelo proxy**.
- O `kit/instalar.sh` já roda sem terminal: domínio, e-mail, empresa, idioma e senha entram por variável de ambiente, e rodar de novo é a atualização (idempotente).
- As quatro imagens do GHCR são públicas, e o GHCR só aceita token pessoal clássico: não existe token por cliente nem de vida curta.

## Decisões

### D-1 — O selo é único, e a trava é pequena

- **Um selo só.** Uso Próprio e Revenda recebem o **mesmo** selo. A diferença entre elas (preço, permissões (a) a (d), número de instalações, limite de Clientes Finais) vive no contrato e no registro do servidor, **não** dentro do aplicativo.
- **Três estados do aplicativo:**
  1. **Sem selo:** funciona inteiro, com uma faixa fixa "Uso não comercial: uso em empresa exige licença". Nenhum recurso é desligado.
  2. **Selo válido:** sem faixa. Na janela aparece "licença temporária, faltam N dias".
  3. **Bloqueada:** a instalação para de operar (backend, worker, scheduler), mas **os dados ficam** e **a exportação autenticada dos próprios dados continua**.
- **Não há trava técnica** de número de empresas, marca própria, cobrança do revendedor ou modalidade. Isso é contratual. Foi decidido assim porque, com o código público, cada limite técnico seria contornável e ainda custaria teste, suporte e risco no cliente.

### D-2 — Janela de 10 dias e tipos de selo

- **Marco Inicial** é a data e a hora de aprovação da compra, vindas da Hotmart (D-8). Reinstalar, atualizar ou trocar de VPS **não reinicia** o prazo. Quem calcula é o servidor central, com o "agora" passado como parâmetro, nunca o relógio do comprador.
- **Selo temporário:** vale 48 horas e é renovado por consulta a cada 1 hora, com variação aleatória. Os dois valores são configuráveis. Vale durante a Janela.
- **Selo permanente:** passados 10 dias do Marco Inicial, uma licença **não bloqueada** recebe o permanente automaticamente, na próxima comunicação válida. Não há aprovação manual. Ele funciona sem o servidor e sobrevive a reinício da VPS.
- **Revenda: a mesma regra.** A janela de cada cliente final **conta da compra do revendedor**, como o contrato define. Uma instalação ativada depois do dia 10 recebe o permanente na hora, se a licença não estiver bloqueada. A trava de verdade é a **ativação**: licença bloqueada, nenhuma instalação nova recebe selo.
- **Nº de instalações do Pedido:** o painel só **conta e mostra** as instalações registradas. Não há recusa automática.

### D-3 — Bloqueio

- Bloqueia-se a **licença inteira** ou **uma instalação**. Motivo obrigatório e auditoria nos dois casos.
- O bloqueio corta renovações, ativações novas e a emissão do permanente. Instalação que já tem selo permanente **não é afetada** (contrato, cláusula 6.3).
- Bloqueio e emissão do permanente são coordenados por transação: licença bloqueada antes da emissão **nunca** recebe o permanente.
- O painel distingue **"bloqueio registrado"** de **"bloqueio confirmado pela instalação"**. Para instalação permanente mostra **"registrado, sem efeito técnico: autorização permanente (cláusula 6.3)"**, e nunca "confirmado". No topo de uma licença bloqueada mostra "X instalações afetadas, Y permanentes não afetadas".
- As mensagens ao usuário distinguem **"Licença bloqueada"** de **"autorização vencida por falta de contato"**.
- O painel exporta a lista das instalações da licença (identificador, domínio, versão, data de ativação), para o exercício da cláusula 4.4 do contrato (licença direta a clientes finais de boa-fé), que acontece fora do sistema.
- **Reembolso e chargeback** vindos da Hotmart bloqueiam **automaticamente**, com o motivo "Hotmart: reembolso, transação HP…". O desbloqueio é manual, num clique. **Protesto** só gera alerta no painel.

### D-4 — Um ponto de decisão, quatro portas de aplicação

A decisão "esta instalação pode operar?" é **uma função pura** (entrada: estado local e "agora"; saída: estado e mensagem). Ela é aplicada em quatro portas, e uma cerca de teste, no estilo da que cobra `requireSupportWrite` (`lib/impersonate/support.ts`), reprova porta nova sem a decisão:

1. telas e rotas da API (o `proxy.ts` e os handlers);
2. rotas de cron (`lib/auth/cron-auth.ts`), o que cobre o scheduler sem mexer nele;
3. o laço do worker;
4. webhooks.

A exportação dos próprios dados fica **sempre** liberada.

### D-5 — Identidade da instalação e relógio

- A instalação tem um **UUID gerado na instalação**, guardado no banco e no `.env`, que acompanha o backup. **Nunca** se usa o IP. Trocar de VPS é uma ação administrativa de "reassociar" no painel.
- O aplicativo guarda o **maior horário já visto** e trata relógio que volta como suspeito. Mudar só o relógio local não concede o permanente.
- Toda função de prazo recebe o "agora" como parâmetro, inclusive em SQL (já houve defeito de CI por usar `now()` do banco).

### D-6 — Criptografia

- Assinatura assimétrica **Ed25519**, na forma de JWS compacto, com a biblioteca `jose`. Sem criptografia própria.
- Cabeçalho `kid` para rotação. As chaves públicas aceitas **vão na imagem**, em lista fixa: o aplicativo **não** baixa chave em tempo de execução, porque quem controlasse o DNS ou o TLS injetaria uma chave. Rotacionar é uma versão nova que aceita as duas chaves por um tempo.
- A **chave privada de assinatura nunca entra em repositório algum.** Fica como segredo no servidor de licenças.
- A credencial da instalação (o que ela usa para renovar) tem prefixo `zpl_`, é mostrada uma vez e guardada no servidor como hash SHA256, no padrão dos tokens de API (`zps_`). Nunca vai na linha de comando.
- Sem segredo global embutido no código entregue.

### D-7 — Sem selo, uso interno e modo sombra

- **Quem compila do código** e quem instala sem licença cai no estado "sem selo" (D-1).
- **A produção do dono** é tratada como um cliente qualquer: recebe uma licença interna do servidor, sem compartilhar máquina nem banco.
- **CI, `test:db` e e2e** nunca dependem do servidor de licenças. Geram o próprio par de chaves a cada execução e assinam selos de teste. O aplicativo só aceita chaves extras fora de produção.
- **Modo sombra:** a trava nasce calculando o que bloquearia e **só registrando**, sem restringir. Ela passa a valer apenas depois que o kit ativar licença e a produção do dono tiver a sua. Sem isso, o deploy automático rebaixaria a produção.
- A instalação fresca (`vps-fresh-onboarding`) continua passando. Aviso é aceitável, bloqueio na primeira tela não.

### D-8 — Compra pela Hotmart, sem registro manual

- **Webhook da Hotmart (versão 2.0.0)** avisa o servidor de licenças. Do evento de compra aprovada saem: `data.buyer.email`, `data.purchase.transaction`, `data.purchase.approved_date` (milissegundos UTC, que é o Marco Inicial), `data.product.ucode` e `data.purchase.offer.code`. O código da oferta diz se é Uso Próprio ou Revenda, por uma tabela no painel.
- **Segurança do aviso.** O aviso é autenticado só pelo cabeçalho `X-HOTMART-HOTTOK`, um token fixo por conta. Por isso o servidor **confirma na API de vendas da Hotmart** antes de registrar uma compra ou bloquear uma licença. Um aviso falso não vira licença.
- **Rede de segurança.** A Hotmart **desativa a configuração do webhook** se a URL der erro. Então: o endpoint só grava o aviso e responde 200, o processamento é assíncrono, há uma **varredura periódica** pela API que recupera o que se perdeu, e o painel **alerta** se passar tempo demais sem nenhum aviso. O `id` do evento garante idempotência.
- **Na Tela 1 do instalador**, o comprador se identifica com **e-mail da compra + código da transação**, sem login e sem senha. Se o aviso ainda não chegou, o servidor consulta a API na hora.
- **Garantia na Hotmart: 7 dias.** A Hotmart só oferece prazos de garantia de 7, 15, 21 ou 30 dias (a conferir no painel), então os 10 dias do contrato ficam como **folga** para ver o pedido. O aviso traz `product.warranty_date`, e o servidor **alerta no painel** se a garantia configurada passar da Janela.
- **Minimização de dados (LGPD).** Guarda-se só e-mail, código da transação, datas, ids de produto e oferta e status. CPF, endereço e telefone do aviso não são gravados.
- Os segredos da Hotmart (hottok, `client_id`, `client_secret`) são colocados pelo dono direto no ambiente do servidor, nunca em chat nem em repositório.

### D-9 — Instalação guiada: o comprador não abre terminal

Escolha do dono em 2026-11-05: a jornada é feita para leigos, sem terminal.

1. O comprador abre a página do instalador e se identifica (D-8).
2. Informa IP, usuário e senha da VPS dele, mais domínio, e-mail do administrador e nome da empresa.
3. Acompanha as etapas ao vivo.
4. No fim, o servidor confere **de fora** que o endereço responde por HTTPS e redireciona para o login (307), mostra o acesso do primeiro administrador e orienta a trocar a senha root.

**O executor é fino:** conecta por SSH e roda o `kit/obter.sh` e o `kit/instalar.sh` já existentes, de forma não interativa, e transmite o log. A lógica de instalação continua num lugar só. Se o SSH falhar, a página mostra o comando para colar (modo manual). Rodar de novo é seguro (o kit é idempotente).

**Seis regras de contenção** (aprovadas):

1. A senha existe **só na memória** durante a instalação. Nunca vai para banco, log, ferramenta de erros ou fila, e é apagada ao terminar.
2. O executor roda **num contêiner isolado**, sem acesso ao banco de licenças nem à chave de assinatura.
3. A página só aceita um IP **depois de uma licença válida**, com no máximo 3 tentativas de senha por licença e limite de taxa. Sem isso ela seria uma ferramenta de força bruta contra a VPS de qualquer pessoa.
4. Um **aviso curto antes da senha**, em texto próprio (não é o contrato): o que se faz com ela, que não é guardada e que se recomenda uma VPS nova e vazia.
5. A página manda **trocar a senha root** depois. O instalador não mexe na configuração de SSH do comprador.
6. **Sistemas suportados:** Ubuntu **26.04 LTS** (o padrão da Hostinger) e **24.04 LTS**. Antes de instalar, a página confere sistema, memória, disco, portas 80/443 e DNS, e recusa com mensagem clara se algo não passar. A validação do kit na 26.04 é **pré-requisito para ligar a trava** (ver "Fases").

**Domínio próprio.** O comprador precisa de um domínio apontando para a VPS (o kit exige isso para o certificado HTTPS). A página explica o registro A passo a passo (Hostinger, Registro.br, Cloudflare) e tem um botão "conferir meu DNS" que só libera a instalação quando está certo.

### D-10 — Onde fica cada coisa

| Peça                                                                            | Onde vive o código                                              | Público? | Onde roda                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ------------------------------------- |
| Trava no aplicativo, biblioteca de verificação, chave pública, scripts do kit   | este repositório                                                | sim      | VPS de cada comprador                 |
| Servidor de licenças, painel, página do instalador, executor SSH, config da VPS | repositório novo, **privado**, `futuristasai/zapsales-licencas` | não      | VPS `2.24.94.245`                     |
| A instalação do dono (`zapsales.futuristas.app`)                                | é um cliente como outro qualquer                                | n/a      | VPS `187.127.43.42`, separada de tudo |

- Endereços: `licencas.futuristas.app` (painel do dono e API que as instalações consultam) e `zapinstalador.futuristas.app` (o que o comprador vê, mais o arquivo `kit/obter.sh`). Um programa só atende os dois.
- **Imagens do GHCR continuam públicas.** Privada protegeria pouco (qualquer pessoa gera a mesma imagem do código público), exigiria credencial por cliente no `.env` e quebraria a regra de packaging de que atualizar não pede edição manual ([`docs/doctrine/packaging.md`](../doctrine/packaging.md)).
- O repositório privado fica na conta `futuristasai`, no plano **GitHub Pro** (US$ 4 por mês por conta, não por colaborador), para poder proteger a `main`. A varredura de segredos de repositório privado é um complemento pago, então o CI usa uma ferramenta gratuita de caça a segredos. **Nada da sua máquina de produção se mistura com isto.**
- **Risco aceito pelo dono:** o `kit/obter.sh` é servido da mesma VPS que guarda a chave de assinatura. Quem invadisse essa VPS poderia entregar um instalador malicioso (que roda como administrador) a compradores novos. Mitigação: contêineres separados, o instalador como arquivo estático somente leitura, atualizado só por publicação automática do CI a partir de uma versão do GitHub, sem edição manual, e a chave privada legível apenas pelo contêiner de licenças.

### D-11 — Limites que a documentação diz com honestidade

Nada abaixo é prometido ao comprador como proteção:

- Quem controla a VPS e tem o código pode alterá-lo e remover a trava. Fazer isso viola o contrato (cláusula 5c), mas não é tecnicamente impossível.
- Quem reinstala **do zero sem a chave** volta ao estado "sem selo", que funciona. O bloqueio só alcança instalação que já foi ativada. A instalação lembra que já foi ativada, de modo que apagar o arquivo do selo não a devolve sozinha ao "sem selo".
- Uma cópia exata de instalação (mesmo UUID, por backup) **não é detectável** depois que tem selo permanente. A contagem só vale no ato da ativação.
- **Estorno de cartão (chargeback) depois da Janela** não é bloqueável quando o permanente já saiu. É contratual.
- O executor SSH custodia, por alguns minutos, credenciais de máquinas de terceiros. As seis regras de D-9 reduzem o risco e não o eliminam.

## Fora de escopo

Gateway de pagamento além do webhook de leitura da Hotmart, **reembolso automático** (pagar o reembolso), marketplace público, tradução do contrato para inglês, revisão por advogado e qualquer alteração em `LICENCA-COMERCIAL.md`.

## Fases

Cada fase vira uma issue com critério de aceite. As Fases 1 e 2 andam em paralelo depois deste documento aprovado, porque o contrato entre as pontas está no documento citado no topo.

| Fase  | Onde                | Entrega                                                                                                                                                                                                                                                                                          |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | este repositório    | Este documento e o contrato entre as pontas, aprovados                                                                                                                                                                                                                                           |
| 1     | este repositório    | Selos de exemplo, biblioteca de verificação, estado local (UUID, maior horário visto), cliente de renovação contra um servidor de mentira, ponto único de decisão com as quatro portas e cerca de teste, faixa e avisos pela tela. **Em modo sombra**. Valida também que o kit roda sem terminal |
| 2     | repositório privado | Servidor de licenças e painel, webhook e API da Hotmart, assinatura, teste de concorrência bloqueio × permanente, deploy na VPS (os dois endereços)                                                                                                                                              |
| 3     | este repositório    | O kit ativa a licença; o `kit/obter.sh` é publicado em `zapinstalador`; as referências à URL antiga são trocadas; **validação do kit no Ubuntu 26.04**; a doutrina do `CLAUDE.md` e do `AGENTS.md` é atualizada                                                                                  |
| 4     | repositório privado | Página do instalador, executor SSH com progresso ao vivo e as seis regras de contenção                                                                                                                                                                                                           |
| Ligar | os dois             | Instalação fresca estilo VPS, **numa VPS Ubuntu 26.04 descartável**, pela tela, contra o servidor real; licença interna da produção do dono; o modo sombra passa a valer                                                                                                                         |

## Critérios de aceite do licenciamento (viram testes)

1. Licença válida ativa dentro do limite.
2. Licença inválida ou bloqueada não ativa.
3. Bloqueio impede novas autorizações e o permanente.
4. Instalação conectada aplica o bloqueio no intervalo previsto.
5. Instalação desconectada não funciona indefinidamente com a temporária.
6. Mudar só o relógio local não concede o permanente.
7. Reinstalar não reinicia a janela.
8. Depois de 10 dias, a licença elegível recebe o permanente sozinha.
9. Emissão e bloqueio simultâneos não geram estado contraditório.
10. O permanente funciona sem o servidor central e sobrevive a reinício da VPS.
11. Selo adulterado é rejeitado.
12. Bloqueio não apaga dados nem impede a exportação.
13. Aviso da Hotmart repetido, fora de ordem ou falso não gera licença duplicada nem indevida; a queda do servidor não perde compra.
14. A senha da VPS do comprador não aparece em banco, log nem ferramenta de erros.

## Consequências

- **Doutrina.** O item 5 de "Licença e contribuição" no `CLAUDE.md` foi reescrito na Fase 3 (#224): ele dizia que a trava "não estava construída", e a Fase 1 a construiu em modo sombra. O texto novo diz que ela existe e só observa, e muda de novo na fase "Ligar", quando o modo passar a `valendo`.
- **Destino da mudança** (doutrina de extensões): infraestrutura de distribuição e licenciamento, e núcleo para a trava. A pergunta "se nenhuma organização ativar isto, a operação comum continua inteira?" tem resposta **sim**: sem selo, o produto inteiro segue funcionando.
- **Custos.** Uma VPS adicional (já existe), o GitHub Pro (US$ 4 por mês) e a operação do painel.
- **Dependência nova.** O servidor de licenças vira dependência da instalação **só** durante a Janela. Depois dela, a instalação com selo permanente não depende de nada.

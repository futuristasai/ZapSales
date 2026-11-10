# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).

Se você roda o ZapSales numa VPS, **leia a seção da versão para a qual está atualizando antes de atualizar**. Mudanças que exigem ação manual aparecem no topo da seção.

## [Não lançado]

## [1.0.0] — 2026-11-10

### Adicionado

- **A primeira versão publicada do ZapSales.** Um CRM de WhatsApp com funil (Kanban), inbox, contatos, agentes de IA e campanhas em massa, que roda na sua própria VPS. Quem instala por número de versão (`1.0.0`) não depende mais de construir o programa na máquina: as imagens já vêm prontas, para Ubuntu 24.04 e 26.04, em processadores comuns (amd64) e ARM.
- **Instalação numa VPS com um comando, ou pela página do instalador.** HTTPS automático, guia de cada pergunta, convivência com outros sites na mesma máquina, backup diário, cópia semanal criptografada e ensaio de restauração. Rodar o mesmo comando de novo é a atualização: ela mantém segredos, administrador e dados.
- **Atendimento no WhatsApp pelos dois caminhos:** a API Oficial da Meta (recomendada para campanha) e o WAHA, por QR code (atendimento). Quem responde a uma campanha cai no funil e no agente, com o contexto do que foi enviado.
- **Agentes de IA** que atendem, qualificam e movem o funil junto com a equipe: criação passo a passo com sugestões por tipo de negócio, conhecimento próprio da empresa, modelos prontos por ramo, consulta a outros sistemas (estoque, planilha, ERP, Make, n8n) e **ações em outros sistemas sempre com a sua aprovação**.
- **Campanhas em massa pela API Oficial**, com modelos aprovados escolhidos numa galeria, público escolhido numa tabela de pessoas ou por planilha CSV, listas salvas, estimativa de custo antes do disparo, teto de gasto e acompanhamento ao vivo.
- **Follow-ups automáticos**, agenda, comandas, equipe com papéis, auditoria em linguagem de gente e **LGPD de fábrica** (exportação e anonimização).
- **Licença do produto dentro do sistema:** a instalação ativa a licença da compra (e termina mesmo sem ela), mostra a situação numa faixa e numa tela de Licença, e se renova sozinha.
- **Manual do usuário completo, aberto de dentro do sistema** pelo link «Manual» do menu: cada menu, tela e botão, com prints anotados e busca.
- **Menu novo, organizado pelo que a pessoa faz no dia:** uma faixa com o painel «Todo dia» no computador, uma barra de baixo no celular, nomes simples com o termo técnico à vista e busca que acha pelos dois. O primeiro acesso guia a configuração, com modelos prontos por ramo.

### Alterado

- **A trava de licença passa a valer nas instalações novas.** Se uma compra é reembolsada ou sofre chargeback, o servidor de licenças bloqueia a licença e a instalação **ativada** com ela deixa de operar. Os dados continuam preservados, e login, exportação dos próprios dados e a tela de Licença seguem liberados. Instalação que nunca foi ativada funciona como uso não comercial. Quem quiser que a trava só observe roda `sudo kit/licenca-modo.sh sombra`.
- **A licença do ZapSales é a PolyForm Noncommercial, com licença comercial para uso em empresa** (antes era MIT). Veja `LICENSING.md`.

[Não lançado]: https://github.com/futuristasai/ZapSales/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/futuristasai/ZapSales/releases/tag/v1.0.0

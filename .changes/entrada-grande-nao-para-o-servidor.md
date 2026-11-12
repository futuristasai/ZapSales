---
impacto: nada_mudou
secao: corrigido
titulo: Correção de segurança: mensagens, planilhas e páginas muito grandes não travam mais o sistema
---

Três pontos do sistema podiam ficar parados por muito tempo ao receber um conteúdo montado para dar trabalho: uma mensagem de WhatsApp com milhares de espaços, uma planilha XLSX malformada na importação de empresas, e uma página de site adicionada à base de conhecimento do agente. Enquanto isso acontecia, o sistema parava de responder para todos. Os três foram corrigidos.

O que muda para quem usa: a importação por planilha XLSX passa a aceitar no máximo 200 colunas, e uma planilha que ocupe mais de 20 MB depois de aberta é recusada com aviso — divida o arquivo em partes. O reconhecimento de quem pede para não receber mais mensagens continua igual.

**Recomendamos atualizar.** Esta é uma correção de segurança, e não exige nenhuma ação depois da atualização.

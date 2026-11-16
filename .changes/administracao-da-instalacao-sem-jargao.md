---
impacto: nada_mudou
secao: corrigido
titulo: Administração da instalação — últimos termos técnicos trocados e conversas sem rolar a página
---

Na **Administração da instalação** (`/admin`), os últimos textos em inglês ou jargão viraram português claro:

- **Administradores da plataforma**: as colunas "Scope" e "MFA" agora se chamam **Tipo de acesso** (Acesso completo ou Só leitura) e **Exige duas etapas**. O link "Ver runbook", que não levava a lugar nenhum, foi trocado por um que abre o manual na seção que explica como incluir ou tirar alguém.
- **Uso e custo**: "Custo AI / dia (R$)" mostrava valores em dólar; agora é **Custo da IA por dia (US$)**, e as colunas são **Chamadas à IA** e **Custo da IA (US$)**.
- **Registro de ações**: o detalhe de uma ação mostra **Dados registrados** (era "Metadata") e a situação da empresa em palavras (era "active").
- Ficha da empresa: na aba Saúde, "Lag" virou **Tempo sem registro**; na aba Agente, o tipo aparece em palavras.
- **Pedidos de LGPD**: escopo, origem e os códigos do contato e do cliente aparecem em português. Resolver um incidente fala em **registro de ações**, não mais em "audit log".
- O CSV exportado em Uso e custo chama a coluna de custo de `custo_ia_dolares` (era `custo_reais`, mas o valor sempre foi em dólar).
- **Conversas de todas as empresas** cabe na janela: com muitas conversas, a lista esticava a página e o aviso "Selecione uma conversa" sumia lá embaixo.

O manual da área ganhou prints novos de todas as telas. Nada precisa ser feito no servidor.

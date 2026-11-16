---
impacto: capacidade_nova
secao: adicionado
titulo: Atualizar com um clique, com volta automática, e backup no Painel
---

O botão **Atualizar agora** voltou a funcionar, e agora mora na Administração da instalação: **Configurar a instalação › Atualização** (`/admin/atualizacao`). O endereço antigo, `/app/settings/atualizacao`, leva para lá.

- **Um programa do servidor** (`zapsales-agente`) passa a conversar com a tela a cada minuto: conta a versão instalada, a última versão publicada, com as notas, e como está o backup. É ele quem atende o botão. O sistema nunca manda comando ao servidor: só avisa que alguém pediu.
- **A atualização é protegida**: cópia do banco antes, instalação da última versão publicada (nunca o código em desenvolvimento, nunca uma versão mais antiga), conferência por 2 minutos e **volta sozinha** para a versão anterior se a nova não ficar de pé. A tela mostra o andamento, o desfecho em português e o **histórico** (quando, de qual para qual versão, quem pediu, resultado).
- Uma atualização recusada antes de começar (por exemplo, a versão nova ainda não terminou de ser publicada) diz que **nada foi alterado**, e o botão volta.
- Sem notícia do programa há mais de 5 minutos, a tela mostra **"O programa do servidor está desligado"** com o comando que o liga, e não cria pedido que ninguém vai atender.
- O **Painel** ganhou os cartões **Versão** (instalada, disponível e o caminho para atualizar) e **Backup** (data da última cópia do banco, aviso quando passa de dois dias, e se a cópia fora do servidor, no R2, está configurada, com o comando `sudo kit/backup.sh configurar-r2` quando não está). Nenhuma senha nem chave aparece.

**No servidor:** nada a editar à mão. O programa chega na próxima vez que o kit roda, ou seja, na próxima atualização pelo terminal (`curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sudo bash`). Depois dela, as atualizações seguintes podem ser feitas pelo botão.

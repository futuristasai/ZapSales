---
impacto: capacidade_nova
secao: adicionado
titulo: Painel da administração — saúde da instalação e situação da licença
---

O **Painel** da Administração da instalação (`/admin/dashboard`) agora responde "está tudo bem?":

- **Saúde da instalação**: o banco de dados, o WhatsApp (conexão por QR code), o Redis e a fila de tarefas em segundo plano aparecem em verde ou vermelho. Cada item vermelho diz, em uma frase, o que fazer — e, quando um comando resolve, mostra o comando pronto para copiar (por exemplo, `sudo docker compose up -d redis srh`). A checagem é a mesma do endereço `/api/v1/health`; o Painel nunca mostra endereço interno, senha nem chave. O botão **Conferir de novo** lê tudo outra vez.
- A fila de tarefas só fica vermelha quando uma tarefa já devia ter rodado há mais de 10 minutos. Tarefa reagendada de propósito (como um atendimento esperando atendente) não conta.
- **Licença**: um cartão mostra a situação da licença desta instalação (sem licença, temporária, permanente, vencida ou bloqueada), se ela está funcionando, quando foi ativada e a última conversa com o servidor de licenças, com as mesmas frases da tela de licença.

Nada precisa ser feito no servidor.

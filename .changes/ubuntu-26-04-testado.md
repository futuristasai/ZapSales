---
impacto: capacidade_nova
secao: adicionado
titulo: Ubuntu 26.04 LTS (o padrão da Hostinger) passa a constar como testado
---

O kit de instalação foi provado numa VPS **Ubuntu 26.04.1 LTS** limpa: instalação fresca pela página do instalador (12 serviços saudáveis, domínio com HTTPS respondendo 307), reinício da máquina, atualização (rodar o comando de novo mantém segredos, administrador e dados), backup (dump diário e cópia semanal criptografada) e um ensaio de restauração com as contagens conferidas. A tabela de sistemas passa a dizer **Ubuntu 26.04 = testado** e o kit deixa de avisar que o sistema "ainda não foi provado". Nada muda para quem já instalou. A cópia semanal para o Cloudflare R2 usa o mesmo código, mas o envio ao R2 em si não foi exercitado nesta máquina.

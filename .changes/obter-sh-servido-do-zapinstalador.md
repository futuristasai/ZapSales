---
impacto: nada_mudou
secao: alterado
titulo: O comando de instalação passa a vir de zapinstalador.futuristas.app
---

O comando que se cola na VPS para instalar ou atualizar o ZapSales agora é:

`curl -fsSL https://zapinstalador.futuristas.app/obter.sh | sudo bash`

O endereço antigo (`raw.githubusercontent.com/.../kit/obter.sh`) continua funcionando, e **quem já instalou não precisa fazer nada**: a atualização que o instalador sugere no fim da instalação já mostra o endereço novo. A diferença é de onde o arquivo vem: antes ele mudava a cada alteração no código; agora só muda quando uma versão é publicada, por um passo automático, e o endereço é da marca. Os guias de instalação e o manual foram atualizados.

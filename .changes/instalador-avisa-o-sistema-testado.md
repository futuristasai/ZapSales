---
impacto: nada_mudou
secao: alterado
titulo: O instalador diz se o seu sistema (Ubuntu 24.04 ou 26.04) é um dos testados
---

O instalador agora confere o sistema da VPS no começo e diz, em uma linha, a situação: **Ubuntu 24.04 está testado**; **Ubuntu 26.04** (o padrão atual da Hostinger) é suportado e **a validação completa numa VM limpa está em andamento**; outro Ubuntu ou Debian segue com um aviso de «não testado». Quem já tem o ZapSales instalado **nunca é barrado** na atualização por causa disso. Só a **primeira** instalação num sistema que nem Ubuntu nem Debian é — é recusada, com a explicação, porque o instalador usa o `apt` (use `ZAPSALES_IGNORAR_SO=1` por sua conta e risco).

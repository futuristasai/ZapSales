/**
 * O comando que sobe o serviço do transporte por QR code numa instalação do kit
 * (`docker-compose.prod.yml`). Mora na fronteira de canais porque nomeia o provedor
 * (`scripts/lint-channels.ts`); o Painel da administração o mostra quando a sonda do
 * transporte acusa que ele não respondeu (issue #310). Sem import nenhum: é lido por
 * código puro.
 */
export const COMANDO_PARA_SUBIR_O_TRANSPORTE_QR = "sudo docker compose up -d waha";

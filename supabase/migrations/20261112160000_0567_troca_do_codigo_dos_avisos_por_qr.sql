-- manifest: Troca, uma única vez, o código do endereço dos avisos dos números por QR code que existiam antes de a coluna ficar ilegível pela sessão — o código antigo deixa de valer na rota pública; a conexão oficial fica de fora porque o código dela é registrado na Meta (#274).
--
-- O código do endereço dos avisos (`webhook_path_token`) ficou legível por
-- qualquer membro da organização até a migration 0565. Esconder a coluna não
-- desfaz o que já pode ter sido lido: quem guardou um código antigo ainda
-- alcançaria a rota pública `/api/v1/webhooks/waha/<código>`. Este bloco troca
-- os códigos que existiam antes dele.
--
-- SÓ os números por QR code (`provider = 'waha'`), e a razão é medida: o
-- produto nunca registra esse código no WAHA — a sessão é criada só com o nome
-- (`createSession(name)`), e os avisos chegam pela rota interna, sem código,
-- configurada no próprio contêiner. Numa instalação real, os 18.877 avisos de
-- 30 dias chegaram todos pela rota interna e nenhum pela rota com código.
-- Trocar o código de um número por QR code não muda por onde as mensagens
-- chegam; só invalida o código antigo.
--
-- A conexão OFICIAL fica de fora de propósito: nela o código faz parte do
-- endereço registrado na Meta, e trocá-lo aqui cortaria a entrega. Ali a troca
-- é a que a tela já faz ao reconfigurar o aviso do número.
--
-- UMA vez só. A coluna de carimbo nasce sem padrão (as linhas que já existem
-- ficam nulas = "ainda não trocado"), a troca alcança só as nulas, e DEPOIS a
-- coluna ganha o padrão `now()`: número criado dali em diante já nasce
-- carimbado e não é tocado na próxima atualização.
alter table public.channel_sessions
  add column if not exists webhook_path_token_trocado_em timestamptz;

comment on column public.channel_sessions.webhook_path_token_trocado_em is
  'Quando o código do endereço dos avisos deste número foi trocado pela última vez, ou quando o número nasceu (issue #274). Nulo = código de antes da migration que os trocou e ainda não trocado (só acontece na conexão oficial, cujo código é registrado na Meta).';

update public.channel_sessions
   set webhook_path_token = replace(gen_random_uuid()::text, '-', ''),
       webhook_path_token_trocado_em = now()
 where provider = 'waha'
   and webhook_path_token_trocado_em is null;

alter table public.channel_sessions
  alter column webhook_path_token_trocado_em set default now();

-- O carimbo não é segredo: a sessão pode lê-lo. (O bloco da 0565 libera a
-- leitura por coluna a partir do catálogo; esta linha vale para quem aplica as
-- migrations em ordem, em que a 0565 já rodou antes de a coluna existir.)
grant select (webhook_path_token_trocado_em) on public.channel_sessions to authenticated;

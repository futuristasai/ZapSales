-- manifest: **Próxima consulta da licença.** Coluna `proxima_consulta_em` em `platform_licenca`: o instante em que o cliente de renovação deve falar de novo com o servidor de licenças (sugestão do servidor, dentro da faixa de 5 min a 24 h, ou 1 h com variação). Sem ela o cron de renovação perguntaria a cada passada. Fase 1 do licenciamento (#222, ADR-0005).
-- 0557 — Quando consultar o servidor de licenças de novo (contrato `licenca-contrato-entre-as-pontas-v1`, seção 4).
--
-- O servidor sugere o próximo contato em `proxima_consulta_em` (1 hora, com variação de ±20 %), e o
-- app aceita sugestão entre 5 minutos e 24 horas; fora da faixa, usa a própria. Quem agenda a cada
-- poucos minutos é o cron, e é esta coluna que impede cada passada de virar uma chamada à rede: a
-- rota de renovação só fala com o servidor quando o agora efetivo passou deste instante.
--
-- É só um lembrete do cliente — não é prazo de licença e não decide se a instalação opera (quem
-- decide é o selo). Por isso não entra no gatilho de invariantes: pode ser reescrita, apagada ou
-- zerada à vontade, e o pior que acontece é uma consulta a mais. Nula = "pode consultar já".
--
-- Idempotente e auto-curativa: `add column if not exists`. Sem dado a corrigir antes (coluna nova,
-- sem constraint). Os grants e a RLS da tabela são os da 0556 e não mudam.

alter table public.platform_licenca
  add column if not exists proxima_consulta_em timestamptz;

comment on column public.platform_licenca.proxima_consulta_em is
  'Quando o cliente de renovação deve consultar o servidor de licenças de novo. NULL = já. Lembrete, não prazo: não decide se a instalação opera.';

notify pgrst, 'reload schema';

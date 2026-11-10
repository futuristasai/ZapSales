-- manifest: **A trava de licença nasce em «valendo».** O padrão da coluna `modo` de `platform_licenca` passa de `sombra` para `valendo`: instalação NOVA recusa a licença vencida ou bloqueada (reembolso, chargeback). Instalação que já existe NÃO muda (a linha guarda o modo que tem), e instalação nunca ativada segue operando como uso não comercial. Fase «Ligar» do licenciamento (ADR-0005, D-7).
-- 0558 — A trava passa a valer nas instalações novas.
--
-- Decisão do dono do produto em 10/11/2026, quando as licenças começam a ser vendidas: se o comprador pede
-- reembolso, o servidor bloqueia a licença e a instalação precisa parar de operar. Em `sombra` (o padrão até
-- aqui) a trava só calculava e registrava, e o bloqueio nunca chegava ao comprador.
--
-- O QUE MUDA: só o DEFAULT da coluna. Ele vale para a linha que o app cria na primeira leitura
-- (`garantirEstado`: `upsert { id: 1, instalacao_id }`, sem `modo`). Nenhuma linha existente é tocada, e por isso
-- uma VPS que já roda continua exatamente no modo em que está (a produção do dono segue em `sombra` até ele
-- decidir; quem ligou `valendo` à mão continua em `valendo`).
--
-- O QUE NÃO MUDA: a regra de `lib/licenca/decidir.ts`. Instalação que nunca foi ativada opera como uso não
-- comercial, em qualquer modo; só a instalação ATIVADA cuja licença venceu ou foi bloqueada é recusada, e
-- dados, login, saúde e exportação continuam liberados. O operador volta atrás, por instalação, com
-- `sudo kit/licenca-modo.sh sombra`.
--
-- Idempotente: `set default` repetido não faz nada. `if exists` porque a tabela nasce na 0556.

alter table if exists public.platform_licenca
  alter column modo set default 'valendo';

do $$
begin
  if to_regclass('public.platform_licenca') is not null then
    comment on column public.platform_licenca.modo is
      'sombra = calcula e registra a decisão, nunca restringe; valendo = aplica (padrão das instalações novas, desde a 0558).';
  end if;
end
$$;

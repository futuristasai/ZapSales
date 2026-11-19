-- manifest: **Policy e gatilho só são refeitos quando a definição mudou (issue #361).** `fn_garantir_policy` e `fn_garantir_gatilho` comparam a impressão do texto e a da forma no catálogo com o que anotaram em `private.baseline_objetos`; iguais, não fazem nada. O baseline passa a usá-las no lugar de `drop … if exists` + `create …`: uma atualização recriava 228 policies e 169 gatilhos (cada policy travando também as tabelas de login, pelo `supautils`), e passa a recriar zero.
--
-- 0572 — Policy e gatilho só são refeitos quando a definição mudou.
--
-- ─── o que foi medido ─────────────────────────────────────────────────────────
--
-- Num banco com o schema de uma instalação real (imagem pg17 do Supabase),
-- reaplicando o `baseline.sql` sobre um banco já em dia:
--
--   policies derrubadas e recriadas   228, em 115 tabelas
--   gatilhos derrubados e recriados   169
--   gatilhos regravados no lugar       32 (`create or replace trigger` do dump)
--
-- Cada comando é uma transação própria e segura UMA tabela, então não fecha
-- ciclo de deadlock como a varredura das travas de suporte fechava (0571). Mas
-- `drop policy`/`drop trigger` pedem ACCESS EXCLUSIVE, que entra na fila atrás de
-- qualquer consulta em andamento e segura quem chega depois — e, no Supabase,
-- todo `create/drop policy` do papel `postgres` ainda pede ACCESS EXCLUSIVE em 23
-- tabelas de `auth`, `storage` e `realtime` (`show supautils.policy_grants`),
-- seja qual for a tabela alvo. São 456 comandos desses por atualização, com a
-- equipe logada.
--
-- ─── o que esta migration cria ────────────────────────────────────────────────
--
--   private.baseline_objetos        o que já foi aplicado: (tipo, tabela, nome) →
--                                   impressão do TEXTO e da forma no CATÁLOGO
--   fn_forma_no_catalogo            a forma de uma policy ou gatilho, como texto
--   fn_garantir_policy              ┐ recebem o `create …` como texto; só derrubam
--   fn_garantir_gatilho             ┘ e recriam quando há diferença
--
-- A decisão é por DUAS impressões, e as duas têm de bater para não fazer nada:
--
--   1. a do texto recebido contra a do texto aplicado da última vez — pega a
--      definição que MUDOU no arquivo;
--   2. a da forma que o catálogo guarda hoje contra a que ele guardava quando o
--      texto foi aplicado — pega o objeto que alguém MEXEU por fora (um `alter
--      policy` à mão, um gatilho desligado, outro bloco que o recriou diferente).
--
-- O erro possível, portanto, é refazer à toa (registro apagado, restauração de
-- backup antigo, versão maior do Postgres que imprime a expressão de outro
-- jeito): refaz uma vez e anota. Nunca é deixar no lugar um objeto que não
-- corresponde ao texto.
--
-- `p_so_se_ausente` serve à definição que NÃO é a última do arquivo: o baseline
-- define alguns objetos duas vezes (a forma antiga em cima, a que vale embaixo).
-- A de cima só existe para a instalação nova; numa atualização ela não toca o
-- objeto, senão a forma antiga voltaria a valer no intervalo, a cada aplicação.
--
-- ─── o que NÃO muda ───────────────────────────────────────────────────────────
--
-- O conjunto final de policies e de gatilhos. Medido nos dois caminhos, contra o
-- baseline anterior: atualização de um schema de instalação real (744 policies,
-- 208 gatilhos) e instalação num banco vazio (738 e 208) — zero linha diferente
-- em comando, permissividade, papéis, expressões e definição de gatilho.
--
-- ─── o baseline ───────────────────────────────────────────────────────────────
--
-- A conversão dos blocos existentes é só do `baseline.sql`: é ele que toda
-- instalação reaplica. As migrations antigas são história e ficam como estão.
-- Bloco NOVO de policy ou gatilho, em migration e no baseline, entra por estas
-- funções (tests/unit/baseline-garante-em-vez-de-recriar.test.ts).
--
-- ─── quem pode chamar ─────────────────────────────────────────────────────────
--
-- Só quem aplica o schema, que é o dono das tabelas. Nenhuma é `security
-- definer`, e o EXECUTE sai das duas origens e dos papéis que o default ACL do
-- Supabase alcança: função que executa texto não fica ao alcance da REST.
--
-- Idempotente: `create … if not exists` e `create or replace`.

create schema if not exists private;

create table if not exists private.baseline_objetos (
  tipo        text        not null check (tipo in ('policy', 'trigger')),
  tabela      text        not null,
  nome        text        not null,
  fonte       text        not null,
  catalogo    text        not null,
  aplicado_em timestamptz not null default now(),
  primary key (tipo, tabela, nome)
);

comment on table private.baseline_objetos is
  'Registro do que o baseline já aplicou de policy e de gatilho (migration 0572): a impressão do texto aplicado (fonte) e a da forma que o catálogo guardou (catalogo). fn_garantir_policy e fn_garantir_gatilho só refazem o objeto quando uma das duas mudou. Não é fonte de verdade de nada: apagar uma linha só faz o objeto ser refeito na próxima aplicação.';

-- A forma do objeto NO CATÁLOGO, como texto. `search_path = pg_catalog` de
-- propósito: `pg_get_expr` e `pg_get_triggerdef` qualificam os nomes conforme o
-- caminho de quem pergunta, e a impressão tem de ser a mesma seja quem for.
-- Devolve null quando o objeto não existe.
create or replace function public.fn_forma_no_catalogo(p_tipo text, p_tabela oid, p_nome text)
returns text
language sql
stable
set search_path = pg_catalog
as $f$
  select case p_tipo
    when 'policy' then (
      select p.polcmd::text
             || '|' || p.polpermissive::text
             || '|' || coalesce((select string_agg(x.papel, ',' order by x.papel)
                                   from (select case when r = 0 then 'public'
                                                     else (select rolname::text from pg_roles where oid = r) end as papel
                                           from unnest(p.polroles) as r) x), '')
             || '|' || coalesce(pg_get_expr(p.polqual, p.polrelid), '')
             || '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
        from pg_policy p
       where p.polrelid = p_tabela and p.polname = p_nome)
    when 'trigger' then (
      select t.tgenabled::text || '|' || pg_get_triggerdef(t.oid)
        from pg_trigger t
       where t.tgrelid = p_tabela and t.tgname = p_nome and not t.tgisinternal)
  end;
$f$;

-- O miolo das duas funções de baixo: decide se há o que fazer e, havendo, troca
-- o objeto e anota. Sem `set search_path`: a definição é executada com o caminho
-- de quem chama, exatamente como o `create policy`/`create trigger` solto que
-- ela substitui (o baseline fixa o caminho no começo do arquivo).
create or replace function public.fn_garantir_objeto_do_baseline(p_tipo text, p_tabela text, p_nome text, p_definicao text, p_so_se_ausente boolean)
returns void
language plpgsql
as $f$
declare
  v_rel      oid := to_regclass(p_tabela);
  v_chave    text;
  v_fonte    text := md5(p_definicao);
  v_forma    text;
  v_anotado  record;
begin
  if p_tipo not in ('policy', 'trigger') then
    raise exception 'fn_garantir_objeto_do_baseline: tipo desconhecido: %', p_tipo;
  end if;
  if v_rel is null then
    raise exception 'fn_garantir_%: a tabela % não existe', p_tipo, p_tabela using errcode = '42P01';
  end if;
  -- A definição é texto executado: só passa o comando que o nome da função diz.
  if p_tipo = 'policy' and p_definicao !~* '^\s*create\s+policy\s' then
    raise exception 'fn_garantir_policy(%, %): a definição não é um CREATE POLICY', p_tabela, p_nome;
  end if;
  if p_tipo = 'trigger' and p_definicao !~* '^\s*create\s+(or\s+replace\s+)?(constraint\s+)?trigger\s' then
    raise exception 'fn_garantir_gatilho(%, %): a definição não é um CREATE TRIGGER', p_tabela, p_nome;
  end if;

  select n.nspname || '.' || c.relname into v_chave
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.oid = v_rel;

  v_forma := public.fn_forma_no_catalogo(p_tipo, v_rel, p_nome);

  -- DEFINIÇÃO QUE NÃO É A ÚLTIMA DO ARQUIVO (`p_so_se_ausente`). Este arquivo
  -- define alguns objetos mais de uma vez: a forma antiga lá em cima, a que vale
  -- mais abaixo. A de cima só serve à instalação nova, para o objeto existir até
  -- a de baixo chegar. Numa atualização o objeto já está na forma final, e voltar
  -- à antiga seria derrubá-lo duas vezes por aplicação — e deixar a forma velha
  -- valendo no intervalo. Existe? Não toca, e não anota.
  if p_so_se_ausente then
    if v_forma is null then
      execute p_definicao;
      if public.fn_forma_no_catalogo(p_tipo, v_rel, p_nome) is null then
        raise exception 'fn_garantir_%(%, %): a definição não criou esse objeto nessa tabela — o nome ou a tabela do texto não batem com os argumentos', p_tipo, p_tabela, p_nome;
      end if;
    end if;
    return;
  end if;

  -- Já está como este texto o deixou? Então não há o que fazer — e não fazer é
  -- o ponto: nenhum DROP, nenhum CREATE, nenhuma trava de tabela.
  if v_forma is not null then
    select fonte, catalogo into v_anotado
      from private.baseline_objetos
     where tipo = p_tipo and tabela = v_chave and nome = p_nome;
    if found and v_anotado.fonte = v_fonte and v_anotado.catalogo = md5(v_forma) then
      return;
    end if;
  end if;

  if p_tipo = 'policy' then
    execute format('drop policy if exists %I on %s', p_nome, v_rel::regclass);
  else
    execute format('drop trigger if exists %I on %s', p_nome, v_rel::regclass);
  end if;
  execute p_definicao;

  v_forma := public.fn_forma_no_catalogo(p_tipo, v_rel, p_nome);
  if v_forma is null then
    raise exception 'fn_garantir_%(%, %): a definição não criou esse objeto nessa tabela — o nome ou a tabela do texto não batem com os argumentos', p_tipo, p_tabela, p_nome;
  end if;

  insert into private.baseline_objetos (tipo, tabela, nome, fonte, catalogo, aplicado_em)
  values (p_tipo, v_chave, p_nome, v_fonte, md5(v_forma), now())
  on conflict (tipo, tabela, nome)
  do update set fonte = excluded.fonte, catalogo = excluded.catalogo, aplicado_em = excluded.aplicado_em;
end $f$;

create or replace function public.fn_garantir_policy(p_tabela text, p_nome text, p_definicao text, p_so_se_ausente boolean default false)
returns void
language sql
as $f$
  select public.fn_garantir_objeto_do_baseline('policy', p_tabela, p_nome, p_definicao, p_so_se_ausente);
$f$;

create or replace function public.fn_garantir_gatilho(p_tabela text, p_nome text, p_definicao text, p_so_se_ausente boolean default false)
returns void
language sql
as $f$
  select public.fn_garantir_objeto_do_baseline('trigger', p_tabela, p_nome, p_definicao, p_so_se_ausente);
$f$;

-- Só quem aplica o schema (o dono das tabelas) as chama; nenhuma é `security
-- definer`. EXECUTE sai das duas origens e dos papéis que o default ACL do
-- Supabase alcança: uma função que executa texto não fica ao alcance da REST.
revoke execute on function public.fn_forma_no_catalogo(text, oid, text) from public, anon, authenticated, service_role;
revoke execute on function public.fn_garantir_objeto_do_baseline(text, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.fn_garantir_policy(text, text, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.fn_garantir_gatilho(text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on table private.baseline_objetos from public, anon, authenticated, service_role;

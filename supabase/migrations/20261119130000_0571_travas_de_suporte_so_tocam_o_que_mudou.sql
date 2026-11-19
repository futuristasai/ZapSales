-- manifest: **As travas do suporte só tocam a tabela que mudou (issue #359).** `fn_aplicar_travas_de_suporte()` derrubava e recriava as três policies `support_write_*` em toda tabela de organização, numa transação só, cinco vezes por baseline — ACCESS EXCLUSIVE em quase todo o banco com o app em uso, origem do deadlock que parou o baseline da produção em 19/11/2026 (#355). Agora ela lê o catálogo, pula a tabela cujas três travas já estão certas e percorre em ordem fixa (`oid`).
--
-- 0571 — As travas do modo somente leitura do suporte só tocam o que mudou.
--
-- ─── o que foi medido ─────────────────────────────────────────────────────────
--
-- Produção, 19/11/2026, atualização com o app em uso (issue #355):
--
--   ERROR:  deadlock detected
--   DETAIL: Process … waits for AccessExclusiveLock on relation … (api_audit_log)
--           Process … waits for RowShareLock on relation … (api_tokens)
--   CONTEXT: SQL statement "drop policy if exists support_write_insert on public.api_audit_log"
--            PL/pgSQL function fn_aplicar_travas_de_suporte() line 15 at EXECUTE
--
-- A função é uma transação só (uma chamada), e o corpo antigo fazia `drop policy`
-- + `create policy` em TODA tabela de organização: ia acumulando ACCESS EXCLUSIVE
-- em quase todo o banco e só soltava no fim. O `baseline.sql` a chama cinco vezes
-- por aplicação, e a atualização roda com a equipe logada. Uma requisição do app
-- que segura duas dessas tabelas na ordem contrária fecha o ciclo, e o Postgres
-- derruba uma das duas sessões. Quando é a do kit, o baseline para no meio.
--
-- A 0554 já tinha tirado esse desenho da instalação de módulo (lá a função irmã
-- só cria onde falta). Esta migration o tira da varredura TOTAL, que é a do
-- baseline — sem perder o que a varredura total existe para fazer.
--
-- ─── o que muda ───────────────────────────────────────────────────────────────
--
-- 1. A tabela cujas três travas JÁ ESTÃO CERTAS não é tocada. "Certa" é a forma
--    inteira, não a contagem: nome, restritiva, só o papel `authenticated`, o
--    comando daquele nome, e a expressão `fn_support_write_allowed(<coluna>)` nos
--    lados em que ela vale (e NENHUMA expressão no lado em que não vale). Ler
--    `pg_policy` não trava tabela alguma. Numa atualização sem mudança de schema
--    a função vira leitura de catálogo.
-- 2. A tabela só do servidor só perde policy que EXISTE. `drop policy` pede
--    ACCESS EXCLUSIVE mesmo com `if exists` (medido na 0554).
-- 3. Ordem fixa (`order by c.oid`), a mesma da função irmã: duas sessões que
--    percorram as mesmas tabelas na mesma ordem não fecham ciclo.
--
-- ─── o que NÃO muda ───────────────────────────────────────────────────────────
--
-- A regra de seleção é a da 0274 (a mesma da 0220), e a varredura continua
-- CONVERGINDO: trava ausente, incompleta, permissiva, para outro papel, com outra
-- expressão ou sobrando numa tabela que virou só do servidor é refeita ou
-- retirada, exatamente como antes. Quando a comparação não reconhece a trava, o
-- caminho é o antigo (`drop` + `create`) — o erro possível é travar à toa, nunca
-- deixar trava errada no lugar. O conjunto final de policies é o mesmo.
--
-- ⚠️ Três lugares carregam a MESMA forma das três policies: o `create policy`
-- deste corpo, a comparação deste corpo e `fn_aplicar_travas_de_suporte_em_tabelas_sem_trava`
-- (0554). Mudar o conjunto de travas é mudar os três.
--
-- A comparação tira o prefixo `public.` do texto que `pg_get_expr` devolve: ele
-- só aparece quando `public` não está no `search_path` de quem pergunta. A função
-- fixa `search_path = public`, mas a régua não deve depender disso.
--
-- Idempotente: `create or replace`; reaplicar não muda nada. Sem função nova (a
-- assinatura é a mesma), o `revoke` reafirma as duas origens de EXECUTE.

create or replace function public.fn_aplicar_travas_de_suporte()
returns void
language plpgsql
set search_path = public
as $f$
declare r record; v_col text; v_guarda text; v_authenticated oid;
begin
 select oid into v_authenticated from pg_roles where rolname = 'authenticated';
 for r in
   select c.oid, c.relname,
          (has_table_privilege('authenticated', c.oid, 'insert')
           or has_table_privilege('authenticated', c.oid, 'update')
           or has_table_privilege('authenticated', c.oid, 'delete')) as gravavel,
          (select count(*) from pg_policy p
            where p.polrelid = c.oid
              and p.polname in ('support_write_insert', 'support_write_update', 'support_write_delete')) as existentes
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and (exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
           or c.relname = 'organizations')
    order by c.oid
 loop
   if not r.gravavel then
     -- tabela server-only mantém ZERO policies, contrato mais restritivo. Só se
     -- derruba o que existe: `drop policy` trava a tabela mesmo com `if exists`.
     if r.existentes > 0 then
       execute format('drop policy if exists support_write_insert on public.%I', r.relname);
       execute format('drop policy if exists support_write_update on public.%I', r.relname);
       execute format('drop policy if exists support_write_delete on public.%I', r.relname);
     end if;
     continue;
   end if;

   v_col := case when r.relname = 'organizations' then 'id' else 'organization_id' end;
   v_guarda := format('fn_support_write_allowed(%I)', v_col);

   -- As três já estão como este corpo as criaria? Então não há o que fazer, e
   -- não fazer é o ponto: nenhuma trava de tabela é pedida.
   if r.existentes = 3 and (
        select count(*) from pg_policy p
         where p.polrelid = r.oid
           and not p.polpermissive
           and p.polroles = array[v_authenticated]::oid[]
           and (   (p.polname = 'support_write_insert' and p.polcmd = 'a'
                    and p.polqual is null
                    and replace(pg_get_expr(p.polwithcheck, p.polrelid), 'public.', '') = v_guarda)
                or (p.polname = 'support_write_update' and p.polcmd = 'w'
                    and replace(pg_get_expr(p.polqual, p.polrelid), 'public.', '') = v_guarda
                    and replace(pg_get_expr(p.polwithcheck, p.polrelid), 'public.', '') = v_guarda)
                or (p.polname = 'support_write_delete' and p.polcmd = 'd'
                    and replace(pg_get_expr(p.polqual, p.polrelid), 'public.', '') = v_guarda
                    and p.polwithcheck is null))
      ) = 3 then
     continue;
   end if;

   execute format('drop policy if exists support_write_insert on public.%I', r.relname);
   execute format('create policy support_write_insert on public.%I as restrictive for insert to authenticated with check (public.fn_support_write_allowed(%I))', r.relname, v_col);
   execute format('drop policy if exists support_write_update on public.%I', r.relname);
   execute format('create policy support_write_update on public.%I as restrictive for update to authenticated using (public.fn_support_write_allowed(%I)) with check (public.fn_support_write_allowed(%I))', r.relname, v_col, v_col);
   execute format('drop policy if exists support_write_delete on public.%I', r.relname);
   execute format('create policy support_write_delete on public.%I as restrictive for delete to authenticated using (public.fn_support_write_allowed(%I))', r.relname, v_col);
 end loop;
end $f$;

-- Só quem aplica o schema (o dono das tabelas) a chama; não é `security definer`.
-- EXECUTE sai das duas origens e dos papéis que o default ACL do Supabase alcança.
revoke execute on function public.fn_aplicar_travas_de_suporte() from public, anon, authenticated, service_role;

-- Converge o que houver para convergir. Num banco já em dia, não toca em nada.
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

-- manifest: A sessão do usuário deixa de escrever nas tabelas de fila, de gasto de IA e de configuração do agente (roteiro, habilidades, memória, anti-banimento) — só o servidor grava, depois de conferir o papel; a leitura não muda (#273).
--
-- O que o agente diz, a velocidade com que ele envia e a fila por onde as
-- mensagens saem moram nestas tabelas:
--
--   job_queue              a fila de turnos do agente
--   cron_jobs              as tarefas agendadas — a porta por onde toda mensagem automática sai
--   llm_calls              o registro de gasto de IA, que o teto mensal soma
--   playbook_versions      o roteiro do agente
--   playbook_pointers      qual versão do roteiro está valendo
--   skill_versions         as habilidades do agente
--   skill_pointers         qual versão de cada habilidade está valendo
--   skill_activations      quais habilidades estão ligadas
--   org_memory_versions    o documento de memória da organização
--   org_memory_pointers    qual versão da memória está valendo
--   channel_knobs          os ajustes anti-banimento de cada número (intervalo, janela de horário, teto diário)
--
-- Todas nasceram no apêndice, e o default ACL do Supabase concede escrita a
-- `authenticated` em toda tabela nova; a policy só confere a organização. Um
-- membro de qualquer papel, falando direto com o banco, agendava uma mensagem,
-- trocava o roteiro do agente ou afrouxava o anti-banimento de um número.
--
-- Nenhuma tela escreve nelas com a sessão do usuário: as rotas gravam com o
-- cliente de serviço, depois de conferir o papel, e o motor grava pela conexão
-- direta. Medido antes de retirar — a varredura das escritas por tabela, das
-- funções e dos gatilhos do banco não achou nenhum escritor com a sessão (o
-- último, a aprovação de retomada de lead, passou para o servidor na etapa
-- anterior). `tests/unit/config-do-agente-so-pelo-servidor.test.ts` mantém isso
-- verdadeiro: um escritor novo com a sessão reprova antes de quebrar em produção.
--
-- A LEITURA não muda: as telas continuam lendo com a sessão.
revoke insert, update, delete on table public.job_queue from anon, authenticated;
revoke insert, update, delete on table public.cron_jobs from anon, authenticated;
revoke insert, update, delete on table public.llm_calls from anon, authenticated;
revoke insert, update, delete on table public.playbook_versions from anon, authenticated;
revoke insert, update, delete on table public.playbook_pointers from anon, authenticated;
revoke insert, update, delete on table public.skill_versions from anon, authenticated;
revoke insert, update, delete on table public.skill_pointers from anon, authenticated;
revoke insert, update, delete on table public.skill_activations from anon, authenticated;
revoke insert, update, delete on table public.org_memory_versions from anon, authenticated;
revoke insert, update, delete on table public.org_memory_pointers from anon, authenticated;
revoke insert, update, delete on table public.channel_knobs from anon, authenticated;

-- Tabela que perde a escrita pela sessão fica sem trava de suporte (zero
-- policies `support_write_*`): a mesma chamada que o fim do baseline faz.
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

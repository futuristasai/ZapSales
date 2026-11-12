-- manifest: storage_redaction_queue deixa de ter privilégio para anon e authenticated — a fila de exclusão de arquivos só é lida e escrita pelo servidor e pelas funções do banco
-- A fila de exclusão de arquivos é do servidor.
--
-- Cada linha de `storage_redaction_queue` é uma ordem: "apague este caminho deste
-- bucket". Quem a cumpre é o worker, com a credencial de serviço. Quem a escreve
-- são as funções `security definer` do banco (cascata de LGPD, poda de mídia
-- vencida, os gatilhos que tiram da fila o que passou a ser citado) e o servidor
-- do app. Nenhuma tela lê ou grava nesta tabela com a sessão do usuário.
--
-- O dump concede `ALL` a `authenticated`, e a policy da tabela só confere a
-- organização. Uma ordem de exclusão não é dado de tela: retiramos de `anon` e
-- `authenticated` todo privilégio sobre ela. `service_role` e o dono continuam
-- como estão. A policy fica — sem privilégio ela não concede nada, e a RLS
-- continua ligada.
revoke all on table public.storage_redaction_queue from anon, authenticated;

-- Tabela que deixa de ser gravável pela sessão sai do alcance das travas do modo
-- somente leitura do suporte: o contrato da casa (migration 0274) é tabela só do
-- servidor com ZERO policies `support_write_*`. A rotina é a mesma que o resto
-- do arquivo chama; aqui ela roda de novo porque a retirada acima veio depois.
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

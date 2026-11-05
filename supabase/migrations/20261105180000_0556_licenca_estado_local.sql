-- manifest: **Estado local da licença da instalação.** Tabela de linha única `platform_licenca` (UUID da instalação, credencial cifrada, selo atual, maior horário visto, ativada_em, bloqueio, última consulta, fim da janela, modo sombra/valendo), só server-side; trigger que impede o horário de voltar, a ativação de ser desfeita e o UUID de mudar. Fase 1 do licenciamento (#222, ADR-0005).
-- 0556 — Estado local da licença (ADR-0005, contrato `licenca-contrato-entre-as-pontas-v1`, seção 2).
--
-- A instalação guarda UMA linha com o que precisa para decidir se opera: quem ela é, o último
-- selo recebido, o maior instante já observado, se já foi ativada alguma vez e se o servidor
-- de licenças a bloqueou. Nada aqui é de organização: a licença é da INSTALAÇÃO, e por isso a
-- tabela não tem `organization_id` e não entra nas varreduras de tenant (mesmo molde de
-- `platform_branding` e `platform_google_oauth`).
--
-- ⚠️ SERVER-SIDE ONLY, e isso é desenho, não descuido. A anon key vai para o browser; tabela
-- servida pelo PostgREST e "protegida por policy" depende de a policy estar certa, e esta
-- simplesmente não é servida: RLS ligada, ZERO policies, grants revogados de anon/authenticated.
-- Quem lê e escreve é o servidor, com o admin client. Tabela nova em `public` nasce concedida
-- (o `ALTER DEFAULT PRIVILEGES` do baseline vale para todo apêndice novo), então o `revoke`
-- explícito é o que protege — ver `tests/invariants/licenca-estado-local.test.ts`.
--
-- O gatilho `fn_licenca_guarda_invariantes` põe NO BANCO o que a doutrina promete, para que um
-- escritor descuidado (ou uma versão futura do app com defeito) não consiga desfazê-lo:
--   * `maior_horario_visto` só avança — relógio que volta não estende selo nenhum;
--   * `ativada_em`, uma vez gravada, não se apaga nem se troca — instalação que já foi ativada
--     NUNCA volta a `sem_selo` por perder o selo (contrato, seção 2);
--   * a linha não se apaga pela REST (`delete`/`truncate` revogados de `service_role`);
--   * `instalacao_id` e `id` não mudam — trocar de VPS é ação ADMINISTRATIVA no servidor
--     ("reassociar"), nunca uma edição local.
-- Isto é guarda, não cadeado: quem é dono do banco (`postgres`) pode desligar o gatilho, e a
-- documentação diz com honestidade que quem controla a VPS controla o código.
--
-- Não há função de prazo aqui: o "agora" é sempre do chamador (o app grava `maior_horario_visto`
-- com um parâmetro). Por isso nada usa `now()` além do carimbo de `updated_at`, que não é prazo.
--
-- Aditiva e idempotente: `create table if not exists`, `create or replace function`, `drop
-- trigger if exists` antes de recriar, `revoke`/`grant` que reafirmam. A tabela nasce vazia, então
-- não há dado a curar antes das constraints.

create table if not exists public.platform_licenca (
  id                    smallint    primary key default 1,
  instalacao_id         uuid        not null default gen_random_uuid(),
  -- A credencial `zpl_…` recebida na ativação, no envelope AES-GCM do app (`lib/crypto/aes_gcm.ts`,
  -- a mesma cifra de `platform_config`). Nunca em claro: sem a chave de cifra o app recusa gravar.
  credencial_ciphertext bytea,
  credencial_iv         bytea,
  credencial_tag        bytea,
  credencial_last4      text,
  selo_atual            text,
  maior_horario_visto   timestamptz,
  ativada_em            timestamptz,
  bloqueio_codigo       text,
  bloqueio_em           timestamptz,
  ultima_consulta_ok_em timestamptz,
  janela_termina_em     timestamptz,
  modo                  text        not null default 'sombra',
  updated_at            timestamptz not null default now(),
  constraint platform_licenca_singleton check (id = 1),
  constraint platform_licenca_modo check (modo in ('sombra', 'valendo')),
  constraint platform_licenca_credencial_inteira check (
    (credencial_ciphertext is null) = (credencial_iv is null)
    and (credencial_iv is null) = (credencial_tag is null)
  ),
  -- O motivo do bloqueio é um CÓDIGO que o servidor devolve, nunca texto livre.
  constraint platform_licenca_bloqueio_inteiro check ((bloqueio_codigo is null) = (bloqueio_em is null)),
  constraint platform_licenca_bloqueio_codigo check (
    bloqueio_codigo is null or bloqueio_codigo ~ '^[a-z0-9_]{1,64}$'
  ),
  -- Um selo legítimo tem ~300 caracteres; o teto barra lixo (mesmo limite da biblioteca de verificação).
  constraint platform_licenca_selo_tamanho check (selo_atual is null or length(selo_atual) <= 4096)
);

comment on table public.platform_licenca is
  'Estado local da licença DESTA INSTALAÇÃO (singleton, id=1). Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated. Contrato: docs/specs/licenca-contrato-entre-as-pontas-v1.md seção 2. Lida/escrita por lib/licenca/armazem.ts.';
comment on column public.platform_licenca.instalacao_id is
  'UUID v4 da instalação. Nasce aqui (ou do INSTALACAO_ID do .env, que o kit grava) e nunca muda. Nunca o IP.';
comment on column public.platform_licenca.credencial_ciphertext is
  'Credencial zpl_… cifrada (AES-256-GCM, chave AI_CRED_AES_KEY). iv e tag nas colunas irmãs. Nunca em claro.';
comment on column public.platform_licenca.maior_horario_visto is
  'Maior instante já observado (relógio local e respostas do servidor). Só avança — o gatilho garante. agora_efetivo = max(relógio local, este).';
comment on column public.platform_licenca.ativada_em is
  'Marca de que a instalação JÁ foi ativada alguma vez. Uma vez gravada não se apaga: instalação ativada nunca volta a sem_selo.';
comment on column public.platform_licenca.bloqueio_codigo is
  'Código do motivo que o servidor de licenças devolveu ao bloquear. NULL = sem bloqueio registrado.';
comment on column public.platform_licenca.janela_termina_em is
  'Informado pelo servidor, só para a mensagem "faltam N dias". O app não calcula a janela.';
comment on column public.platform_licenca.modo is
  'sombra = calcula e registra a decisão, nunca restringe (padrão); valendo = aplica.';

alter table public.platform_licenca enable row level security;

-- ZERO POLICIES, DE PROPÓSITO — ver o cabeçalho.

revoke all on public.platform_licenca from anon, authenticated;
grant select, insert, update on public.platform_licenca to service_role;

-- Sem DELETE nem TRUNCATE para quem a REST alcança. Todo projeto Supabase nasce com um default ACL
-- de tabelas que concede TUDO a `service_role` (e a chave dela está no `.env` de quem instala),
-- então o `grant` enumerado acima só ACRESCENTA — não retira. Sem este `revoke`, apagar a linha
-- faria o app recriar outro UUID e a instalação voltaria a `sem_selo`: o desfazer que o gatilho
-- impede no UPDATE ficaria aberto pelo DELETE. É a mesma lição da 0258 (audit log).
revoke delete, truncate on public.platform_licenca from service_role;

create or replace function public.fn_licenca_guarda_invariantes()
returns trigger
language plpgsql
-- Só toca `new`/`old`: não resolve nome de objeto nenhum, então o caminho de busca vazio é de graça
-- e fecha o aviso do Security Advisor (função sem `search_path` fixo).
set search_path = ''
as $$
begin
  new.id := old.id;
  new.instalacao_id := old.instalacao_id;
  -- `greatest` ignora NULL: um update que não traz horário mantém o que havia.
  new.maior_horario_visto := greatest(old.maior_horario_visto, new.maior_horario_visto);
  new.ativada_em := coalesce(old.ativada_em, new.ativada_em);
  return new;
end;
$$;

-- Função nova em `public` nasce EXPOSTA por duas origens (o grant direto a `anon` do default ACL
-- do baseline e o grant a PUBLIC que o Postgres dá ao criar). As duas saem.
revoke execute on function public.fn_licenca_guarda_invariantes() from public, anon, authenticated;

drop trigger if exists trg_platform_licenca_invariantes on public.platform_licenca;
create trigger trg_platform_licenca_invariantes
  before update on public.platform_licenca
  for each row execute function public.fn_licenca_guarda_invariantes();

drop trigger if exists trg_platform_licenca_touch on public.platform_licenca;
create trigger trg_platform_licenca_touch
  before update on public.platform_licenca
  for each row execute function public.fn_touch_updated_at();

notify pgrst, 'reload schema';

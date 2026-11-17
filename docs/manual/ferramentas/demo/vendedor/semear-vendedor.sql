-- Dados FICTÍCIOS: transforma o atendimento da Loja Aurora (organização de demonstração) num
-- VENDEDOR — catálogo com descrição de venda, funil "Vendas pelo WhatsApp", funil corporativo
-- "Aurora Empresas", agenda da consultora corporativa e conversas de exemplo do agente vendendo e
-- marcando reunião com uma pessoa da equipe.
--
-- Uso:  psql -v ON_ERROR_STOP=1 -v org=<uuid da org> -v fim=commit -f semear-vendedor.sql
--       (org SEM aspas; `fim=rollback` é o ensaio: roda tudo, mostra o que mudaria e desfaz)
-- Roda DEPOIS de semear-massa.sql e semear-ia-montar.sql. O acervo e a versão nova do agente
-- vêm depois, em semear-materiais.sql (precisa da chave de embedding da organização).
--
-- SEGURANÇA
--  * Nada aqui envia mensagem: só grava linhas, no canal inerte da demonstração.
--  * Todo evento que estas linhas fazem nascer no event_log é marcado como consumido NA MESMA
--    transação (consumed_by = {seed-demo-vendedor}): nenhum consumidor reage a mensagem de mentira
--    nem a negócio ganho de mentira (Conversões, automações, webhooks).
--  * O tipo de agenda novo nasce com lembrete DESLIGADO, e nenhum compromisso pede link de reunião.
--  * Nomes, empresas, e-mails e telefones (+55 11 99999 04xx) são inventados.

\set ON_ERROR_STOP 1
\if :{?fim}
\else
  \set fim rollback
\endif

select exists (select 1 from crm_pipelines where organization_id = :'org' and slug = 'aurora-empresas') as ja \gset
\if :ja
  \echo 'semear-vendedor.sql já foi aplicado nesta organização. Nada foi feito.'
  \quit
\endif

select id as agente from ai_agents where organization_id = :'org' and name = 'Atendente da Loja' \gset
select u.id as camila from auth.users u join user_organizations uo on uo.user_id = u.id
 where uo.organization_id = :'org' and u.email = 'camila.nunes@equipe-demo.example.com' \gset
select u.id as bruno from auth.users u join user_organizations uo on uo.user_id = u.id
 where uo.organization_id = :'org' and u.email = 'bruno.alves@equipe-demo.example.com' \gset
select id as canal from channel_sessions where organization_id = :'org' order by created_at limit 1 \gset

begin;

-- ===================================================================== Catálogo
insert into catalog_products (organization_id, codigo, nome, descricao, marca, categoria, preco_cents, custo_cents, controla_estoque, quantidade, ativo)
values
 (:'org','BOLSA-COURO','Bolsa de couro','Bolsa tiracolo em couro legítimo curtido ao vegetal, 28 x 20 cm, alça regulável e removível, forro de algodão e bolso interno com zíper. Cores: caramelo, preto e off-white. Acompanha saquinho de proteção. Garantia de 6 meses na costura.','Bossa Couros','Acessórios',45900,21000,true,3,true),
 (:'org','CAPA-ENC','Capa sob encomenda','Capa de celular personalizada com nome ou frase (até 20 caracteres). Feita sob encomenda: produção em 5 dias úteis mais o prazo do frete. Modelos iPhone 12 ao 16 e Samsung Galaxy S22 ao S25.','Aurora Essentials','Acessórios',8900,2500,false,0,true),
 (:'org','FONE-BT','Fone de ouvido sem fio','Bluetooth 5.3, cancelamento de ruído ativo, 30 horas de bateria com o estojo, resistente a suor (IPX4) e carregamento USB-C. Funciona com iPhone e Android. Cores: preto e branco. Garantia de 12 meses.','Lumi Sound','Eletrônicos',21900,9800,true,22,true),
 (:'org','KIT-SKIN','Kit skincare completo','Rotina em 4 passos: sabonete facial, tônico, sérum de vitamina C 30 ml e hidratante com FPS 30. Vegano, dermatologicamente testado, para todos os tipos de pele. Vem numa nécessaire de presente.','Aurora Bem-Estar','Cosméticos',32900,13500,true,14,true),
 (:'org','LUM-MESA','Luminária de mesa','Luminária LED com 3 temperaturas de cor, braço articulado e base com carregador por indução para celular. Esgotada no momento; reposição prevista em 10 dias.','Casa Clara','Casa',14900,6200,true,0,true),
 (:'org','PERF-IMP','Perfume importado 100ml','Eau de parfum floral amadeirado, com notas de bergamota, jasmim e sândalo. Fixação de 8 a 10 horas. Importado da França, lacrado, com nota fiscal. Combina com o Body splash da mesma linha.','Maison Lune','Perfumaria',31900,15800,true,11,true),
 (:'org','TEN-ESP','Tênis esportivo','Para corrida e academia: entressola com amortecimento, cabedal de tecido respirável e só 280 g. Numeração 34 a 44, forma normal. Cores: grafite, branco com coral e azul-marinho.','Passo Leve','Calçados',39900,17900,true,26,true),
 (:'org','VEST-MIDI','Vestido midi floral','Vestido de viscose leve, decote em V, faixa na cintura e forro até o meio da coxa. Tamanhos P (busto 84-88), M (90-94), G (96-100) e GG (102-108). Lavar à mão.','Ateliê Aurora','Roupas',24900,9900,true,9,true),
 (:'org','TEN-CASUAL','Tênis casual de couro','Tênis branco de couro com palmilha macia e sola de borracha costurada. Vai do trabalho ao fim de semana. Numeração 34 a 44.','Passo Leve','Calçados',34900,15500,true,18,true),
 (:'org','MEIA-KIT','Kit 3 pares de meia esportiva','Três pares de meia cano curto com reforço no calcanhar e fio que tira a umidade. Tamanhos 34-38 e 39-44. O par perfeito para o tênis esportivo.','Passo Leve','Calçados',5900,1800,true,60,true),
 (:'org','GARRAFA-INOX','Garrafa térmica inox 750 ml','Parede dupla de aço inox: gelado por 24 horas e quente por 12. Tampa à prova de vazamento. Cores: preto, areia e verde-oliva. Aceita gravação a laser do nome ou do logo.','Casa Clara','Casa',11900,4600,true,140,true),
 (:'org','CANECA-CER','Caneca de cerâmica 350 ml','Caneca de cerâmica esmaltada, feita à mão, pode ir ao micro-ondas e à lava-louças. Cores: off-white, terracota e azul.','Casa Clara','Casa',5900,1900,true,210,true),
 (:'org','VELA-AROM','Vela aromática de soja 200 g','Vela de cera de soja com pavio de algodão, cerca de 40 horas de queima. Aromas: lavanda, capim-limão e baunilha com âmbar. Pote de vidro reaproveitável.','Aurora Bem-Estar','Casa',7900,2600,true,95,true),
 (:'org','DIFUSOR','Difusor de aromas com varetas 250 ml','Difusor de ambiente com varetas de rattan, perfuma por até 3 meses. Aromas: lavanda, capim-limão e baunilha com âmbar. Combina com a vela aromática.','Aurora Bem-Estar','Casa',9900,3500,true,70,true),
 (:'org','MANTA-TRI','Manta de tricô 1,5 x 1,2 m','Manta de tricô de algodão, macia e encorpada, para sofá ou cama. Cores: cru, cinza mescla e mostarda.','Casa Clara','Casa',22900,9400,true,12,true),
 (:'org','NECESSAIRE','Nécessaire de viagem','Nécessaire de lona impermeável com divisórias internas e alça para pendurar no banheiro. 24 x 16 x 10 cm.','Bossa Couros','Acessórios',8900,3100,true,48,true),
 (:'org','CARTEIRA-COURO','Carteira slim de couro','Carteira fina de couro legítimo com 6 divisórias para cartões e espaço para notas. Aceita gravação de nome ou iniciais em até 3 dias úteis.','Bossa Couros','Acessórios',14900,5800,true,35,true),
 (:'org','MOCHILA-NOTE','Mochila para notebook 15,6"','Mochila com compartimento acolchoado para notebook de até 15,6", bolso antifurto nas costas, entrada USB e tecido repelente à água. Cores: preto e cinza.','Bossa Urbano','Acessórios',29900,12800,true,30,true),
 (:'org','CAIXA-SOM','Caixa de som bluetooth à prova d''água','Caixa de som portátil com 20 W, 12 horas de bateria e proteção IPX7 (aguenta mergulho). Pareia duas caixas para som estéreo.','Lumi Sound','Eletrônicos',27900,12400,true,16,true),
 (:'org','CARREG-PORT','Carregador portátil 10.000 mAh','Bateria externa fina, com carga rápida de 20 W e duas saídas (USB-C e USB-A). Carrega um celular cerca de 2 vezes. Aceita gravação do logo.','Lumi Sound','Eletrônicos',12900,5100,true,85,true),
 (:'org','SMARTWATCH','Relógio inteligente Lumi Fit','Mede batimentos, sono, passos e oxigenação; 7 dias de bateria; à prova d''água para natação; mostra notificações do celular. Pulseiras preta e rosé.','Lumi Sound','Eletrônicos',49900,23500,true,9,true),
 (:'org','HIDRAT-CORP','Hidratante corporal 250 ml','Hidratante com manteiga de karité e óleo de amêndoas, absorção rápida e perfume suave. Aromas: flor de algodão e figo.','Aurora Bem-Estar','Cosméticos',6900,2300,true,120,true),
 (:'org','BODY-SPLASH','Body splash 200 ml','Body splash da linha Maison Lune, com o mesmo acorde floral amadeirado do perfume importado, para reaplicar ao longo do dia.','Maison Lune','Perfumaria',8900,3200,true,64,true),
 (:'org','PERF-MASC','Perfume masculino 100 ml','Eau de parfum amadeirado aromático, com notas de cardamomo, vetiver e couro. Fixação de 8 horas. Importado, lacrado, com nota fiscal.','Maison Lune','Perfumaria',29900,14600,true,13,true),
 (:'org','CAMISA-LINHO','Camisa de linho','Camisa de linho com toque macio, caimento solto e botões de madrepérola. Tamanhos P ao GG. Cores: branco, areia e azul-claro.','Ateliê Aurora','Roupas',21900,8800,true,21,true),
 (:'org','CALCA-ALF','Calça de alfaiataria','Calça de alfaiataria de cintura alta, com pregas e tecido que não amassa. Tamanhos 36 ao 46. Cores: preto, caramelo e off-white.','Ateliê Aurora','Roupas',25900,10400,true,17,true),
 (:'org','OCULOS-SOL','Óculos de sol polarizado','Armação de acetato com lentes polarizadas e proteção UV400. Acompanha estojo rígido e flanela. Modelos gatinho e redondo.','Bossa Urbano','Acessórios',24900,8600,true,15,true),
 (:'org','VALE-PRES','Vale-presente digital','Vale-presente de R$ 100 a R$ 1.000, entregue no mesmo dia por WhatsApp ou e-mail, com mensagem personalizada. Vale por 12 meses no site, no WhatsApp e na loja física. O preço indicado é o vale de R$ 100.','Loja Aurora','Presentes',10000,null,false,0,true),
 (:'org','CADERNO-PERS','Caderno capa dura personalizado','Caderno A5 de capa dura com 160 páginas pautadas e elástico. Gravação do nome ou do logo na capa. Muito usado em kits corporativos.','Aurora Empresas','Presentes corporativos',4900,1600,true,300,true),
 (:'org','KIT-CORP-BV','Kit Boas-vindas (corporativo)','Kit de onboarding: caneca de cerâmica, garrafa térmica inox, caderno capa dura e caneta, com o logo da empresa e cartão de boas-vindas. Preço por unidade para 10 a 49 kits; acima disso há desconto por volume na proposta da consultora.','Aurora Empresas','Presentes corporativos',18900,8200,false,0,true),
 (:'org','KIT-CORP-FA','Caixa Fim de Ano Premium (corporativo)','Caixa rígida com fita: vela aromática, difusor de aromas, caneca de cerâmica, chocolates artesanais e cartão com mensagem da empresa. Preço por unidade para 10 a 49 caixas; acima disso há desconto por volume.','Aurora Empresas','Presentes corporativos',34900,15600,false,0,true),
 (:'org','KIT-CORP-BEM','Kit Bem-Estar (corporativo)','Hidratante corporal, body splash, vela aromática e nécessaire, em embalagem presenteável. Preço por unidade para 10 a 49 kits; acima disso há desconto por volume.','Aurora Empresas','Presentes corporativos',15900,6900,false,0,true),
 (:'org','KIT-CORP-TECH','Kit Tech Executivo (corporativo)','Fone de ouvido sem fio, carregador portátil 10.000 mAh e garrafa térmica inox, com gravação do logo. Preço por unidade para 10 a 49 kits; acima disso há desconto por volume.','Aurora Empresas','Presentes corporativos',44900,21500,false,0,true)
on conflict (organization_id, codigo) do update set
  nome = excluded.nome, descricao = excluded.descricao, marca = excluded.marca, categoria = excluded.categoria,
  custo_cents = excluded.custo_cents, quantidade = excluded.quantidade, controla_estoque = excluded.controla_estoque,
  updated_at = now();

-- ===================================================================== Funil "Vendas pelo WhatsApp"
-- O funil "Pedidos" vira funil de VENDA: começa quando a pessoa chega pelo WhatsApp e termina no
-- pagamento. As etapas de logística saem do quadro (arquivadas), e os pedidos que estavam nelas
-- já foram pagos: viram ganhos.
select id as funil from crm_pipelines where organization_id = :'org' and slug = 'pedidos' \gset

update crm_pipelines set name = 'Vendas pelo WhatsApp',
  description = 'Quem chega pelo WhatsApp (botão do site, anúncio ou Instagram) querendo comprar. Do primeiro oi ao pagamento.',
  vocabulary = jsonb_build_object('lead','Cliente','lead_plural','Clientes','deal','Pedido','deal_plural','Pedidos',
                                  'won','Pago','lost','Perdido','stage','Etapa','stage_plural','Etapas')
 where id = :'funil';

update crm_stages set name = 'Novo contato', slug = 'novo-contato', position = 1000, agent_stage_hint = 'new', color = '#94a3b8',
  description = 'Chegou pelo WhatsApp e ainda não sabemos o que procura.'
 where pipeline_id = :'funil' and name = 'Carrinho abandonado';

insert into crm_stages (organization_id, pipeline_id, name, slug, position, agent_stage_hint, color, description, win_probability)
values
 (:'org', :'funil', 'Em atendimento', 'em-atendimento', 1300, 'qualifying', '#60a5fa', 'Entendendo para quem é, a ocasião e o orçamento.', 20),
 (:'org', :'funil', 'Produto apresentado', 'produto-apresentado', 1600, 'qualified', '#a78bfa', 'Indicamos produtos com preço do catálogo.', 45);

update crm_stages set slug = 'aguardando-pagamento', position = 2000, agent_stage_hint = 'negotiating', color = '#f59e0b', win_probability = 75,
  description = 'Itens, tamanho, cor e CEP confirmados; link de pagamento ou Pix enviado.'
 where pipeline_id = :'funil' and name = 'Aguardando pagamento';
update crm_stages set slug = 'pago', position = 3000, color = '#22c55e', description = 'Pagamento confirmado pela equipe.'
 where pipeline_id = :'funil' and name = 'Pago';
update crm_stages set name = 'Perdido', slug = 'perdido', position = 9000, color = '#ef4444',
  description = 'Desistiu. Motivo registrado (preço, prazo, sem resposta, comprou em outro lugar).'
 where pipeline_id = :'funil' and name = 'Cancelado';

-- um terço dos antigos carrinhos abandonados avança para cada etapa nova
with fila as (
  select l.id, row_number() over (order by l.created_at, l.id) as n
  from crm_leads l join crm_stages s on s.id = l.stage_id
  where l.pipeline_id = :'funil' and s.slug = 'novo-contato' and l.status = 'open'
)
update crm_leads l set stage_id = case when f.n % 3 = 1 then (select id from crm_stages where pipeline_id = :'funil' and slug = 'em-atendimento')
                                       else (select id from crm_stages where pipeline_id = :'funil' and slug = 'produto-apresentado') end
from fila f where f.id = l.id and f.n % 3 <> 0;

-- pedidos em separação, enviados, entregues e em pós-venda já estão pagos: viram ganhos
update crm_leads l set stage_id = (select id from crm_stages where pipeline_id = :'funil' and is_won limit 1),
  status = 'won', closed_at = coalesce(l.last_activity_at, l.updated_at, now()), won_reason = coalesce(l.won_reason, 'Pagamento confirmado')
from crm_stages s
where s.id = l.stage_id and l.pipeline_id = :'funil' and s.name in ('Em separação','Enviado','Entregue','Pós-venda');
update crm_leads l set status = 'won', closed_at = coalesce(l.last_activity_at, now())
from crm_stages s where s.id = l.stage_id and l.pipeline_id = :'funil' and s.is_won and l.status = 'open';

update crm_stages set is_archived = true where pipeline_id = :'funil' and name in ('Em separação','Enviado','Entregue','Pós-venda');

-- ===================================================================== Funil "Aurora Empresas"
insert into crm_pipelines (organization_id, name, slug, description, is_default, position, vocabulary, settings)
values (:'org', 'Aurora Empresas', 'aurora-empresas',
  'Vendas corporativas: kits de boas-vindas, fim de ano e brindes para empresas. O atendimento qualifica e marca a conversa com a consultora.',
  false, 2000,
  jsonb_build_object('lead','Empresa','lead_plural','Empresas','deal','Oportunidade','deal_plural','Oportunidades',
                     'won','Fechado','lost','Perdido','stage','Etapa','stage_plural','Etapas'),
  jsonb_build_object('fields', '[]'::jsonb, 'canonical_tags', '[]'::jsonb,
                     'lost_reasons', jsonb_build_array('Escolheu um concorrente', 'Prazo não atende', 'Orçamento da empresa cortado'),
                     'identity_resolution', jsonb_build_object('fields_in_priority_order', jsonb_build_array('cpf', 'phone_e164', 'email'))))
returning id as corp \gset

insert into crm_stages (organization_id, pipeline_id, name, slug, position, agent_stage_hint, is_won, is_lost, requires_human, color, description, win_probability)
values
 (:'org', :'corp', 'Interesse', 'interesse', 1000, 'qualifying', false, false, false, '#60a5fa', 'A empresa demonstrou interesse; estamos entendendo quantidade, ocasião, prazo e orçamento.', 15),
 (:'org', :'corp', 'Reunião agendada', 'reuniao-agendada', 2000, 'qualified', false, false, false, '#a78bfa', 'Conversa de 30 minutos com a consultora corporativa marcada.', 35),
 (:'org', :'corp', 'Proposta enviada', 'proposta-enviada', 3000, null, false, false, true, '#f59e0b', 'A consultora enviou a proposta com valores e prazos.', 55),
 (:'org', :'corp', 'Negociação', 'negociacao', 4000, 'negotiating', false, false, true, '#fb923c', 'Ajustes de quantidade, kit, prazo ou pagamento.', 75),
 (:'org', :'corp', 'Fechado', 'fechado', 5000, 'won', true, false, true, '#22c55e', 'Proposta aprovada e pedido confirmado.', 100),
 (:'org', :'corp', 'Perdido', 'perdido', 9000, 'lost', false, true, false, '#ef4444', 'A empresa desistiu. Motivo registrado.', 0);

-- ===================================================================== Agenda da consultora
insert into calendar_event_types (organization_id, name, slug, description, category, duration_minutes, buffer_after_minutes,
  minimum_notice_minutes, booking_window_days, location_kind, location_details, requires_confirmation, is_active,
  reminder_enabled, position, default_owner_user_id)
values (:'org', 'Reunião — Aurora Empresas', 'reuniao-corporativa',
  'Conversa de 30 minutos com a consultora corporativa para montar a proposta de kits e brindes da empresa.',
  'reuniao', 30, 15, 240, 30, 'whatsapp', 'Chamada de vídeo pelo WhatsApp, neste mesmo número.', false, true,
  false, 500, :'camila')
returning id as tipo_corp \gset

-- jornada publicada da Camila: segunda a sexta, 9h–12h e 14h–18h (domingo = 0)
update attendant_availability set schedule = jsonb_build_object('timezone', 'America/Sao_Paulo', 'windows', (
    select jsonb_agg(jsonb_build_object('dow', d, 'start', h.ini, 'end', h.fim) order by d, h.ini)
    from generate_series(1, 5) d cross join (values ('09:00','12:00'), ('14:00','18:00')) h(ini, fim)))
 where organization_id = :'org' and user_id = :'camila';
insert into attendant_availability (organization_id, user_id, is_available, schedule)
select :'org', :'camila', false, jsonb_build_object('timezone', 'America/Sao_Paulo', 'windows', (
    select jsonb_agg(jsonb_build_object('dow', d, 'start', h.ini, 'end', h.fim) order by d, h.ini)
    from generate_series(1, 5) d cross join (values ('09:00','12:00'), ('14:00','18:00')) h(ini, fim)))
where not exists (select 1 from attendant_availability where organization_id = :'org' and user_id = :'camila');

-- ===================================================================== Datas das reuniões
-- dia útil em São Paulo a k dias de hoje (para frente ou para trás), na hora pedida
create temporary table vend_data on commit drop as
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
select x.nome,
  ((select dd from hoje, generate_series(x.de, x.ate, x.passo) g(k), lateral (select hoje.d + g.k as dd) z
     where extract(isodow from dd) between 1 and 5 order by abs(g.k) limit 1) + x.hora) at time zone 'America/Sao_Paulo' as quando
from (values
  ('futura',      2,   7,  1, time '10:00'),
  ('futura_tarde',2,   7,  1, time '15:00'),
  ('futura_2',    3,   8,  1, time '09:30'),
  ('vasconcelos',-5, -10, -1, time '15:00'),
  ('farma',      -8, -13, -1, time '10:30'),
  ('faro',      -18, -23, -1, time '11:00')
) x(nome, de, ate, passo, hora);
-- a segunda opção da manhã fica no dia seguinte útil ao da primeira
update vend_data set quando = (
  select ((d.dd + time '09:30') at time zone 'America/Sao_Paulo') from (
    select ((select quando from vend_data where nome = 'futura') at time zone 'America/Sao_Paulo')::date + k as dd
    from generate_series(1, 4) k
    where extract(isodow from ((select quando from vend_data where nome = 'futura') at time zone 'America/Sao_Paulo')::date + k) between 1 and 5
    order by k limit 1) d)
 where nome = 'futura_2';

create temporary table vend_rotulo on commit drop as
select nome, quando,
  (array['segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado','domingo'])[extract(isodow from quando at time zone 'America/Sao_Paulo')::int]
  || ' (' || to_char(quando at time zone 'America/Sao_Paulo', 'DD/MM') || ') às '
  || to_char(quando at time zone 'America/Sao_Paulo', 'FMHH24') || 'h'
  || case when to_char(quando at time zone 'America/Sao_Paulo', 'MI') <> '00' then to_char(quando at time zone 'America/Sao_Paulo', 'MI') else '' end as rotulo
from vend_data;

-- ===================================================================== Contatos e roteiros
-- quem: i = cliente, a = agente (IA), h = pessoa da equipe, s = mensagem automática
create temporary table vend_conversa on commit drop as
select * from (values
 (1,'Larissa Mendonça','+5511999990401','larissa.mendonca@exemplo.com.br','pedidos','aguardando-pagamento','Tênis esportivo + Kit de meias',45800,'open','ia',array['site','corrida'],
   interval '2 hours 40 minutes', null::text, array[
  'i|0|Oi! Vim pelo botão do site, queria saber do tênis esportivo 🏃‍♀️',
  'a|1|Oi, Larissa! Que bom te ver por aqui 😊 Eu sou a Júlia, da Loja Aurora. Você vai usar mais pra corrida ou pra academia?',
  'i|3|Corrida, uns 5 km três vezes por semana',
  'a|4|Então ele é perfeito: tem amortecimento na entressola e pesa só 280 g. Sai por R$ 399,00, nas cores grafite, branco com coral e azul-marinho. Qual o seu número?',
  'i|6|37. Gostei do grafite!',
  'a|7|Tenho o 37 grafite disponível ✅ Pra corrida, muita gente leva junto o Kit 3 pares de meia esportiva (R$ 59,00), que tira a umidade e evita bolha. Quer incluir?',
  'i|9|Pode incluir sim',
  'a|10|Fechou! Fica R$ 458,00, e com isso o frete sai grátis 🎉 No Pix você ainda ganha 5% de desconto: R$ 435,10. Ou em até 6x de R$ 76,33 sem juros no cartão. Como prefere?',
  'i|12|Pix! Meu CEP é 04538-132',
  'a|13|Perfeito, Larissa. Tênis esportivo grafite nº 37 + Kit de meias, entrega em São Paulo em 2 a 3 dias úteis. Já vou te mandar o Pix por aqui em instantes 💜']),
 (2,'Rodrigo Teixeira','+5511999990402',null,'pedidos','__ganho','Perfume importado + Body splash',40800,'resolved','humano',array['presente'],
   interval '3 days 5 hours', null, array[
  'i|0|Boa tarde! Queria um presente pra minha namorada, faz 2 anos de namoro sábado. Uns 400 reais',
  'a|1|Que data especial, Rodrigo! 💜 Me conta um pouquinho dela: curte perfume, acessório ou algo pra casa?',
  'i|3|Ela ama perfume, mas nunca sei qual',
  'a|4|Então tenho uma dica certeira: o Perfume importado Maison Lune 100 ml (R$ 319,00), floral amadeirado com bergamota, jasmim e sândalo, que fixa de 8 a 10 horas. Junto com o Body splash da mesma linha (R$ 89,00) ela reaplica ao longo do dia.',
  'i|6|Os dois dá quanto?',
  'a|7|R$ 408,00 com frete grátis. No Pix fica R$ 387,60 — abaixo do que você tinha pensado 😉 E posso mandar embrulhado pra presente, sem custo.',
  'i|8|Fechado, embrulha sim! Pix',
  'a|9|Combinado! Já te passo os dados do Pix pra concluir.',
  'h|26|Pix recebido, Rodrigo! ✅ Pedido confirmado e embrulhado pra presente. Chega até sexta, antes do sábado 🎁',
  'i|30|Valeu demais!']),
 (3,'Patrícia Andrade','+5511999990403','patricia.andrade@construtorahorizonte.example.com','aurora-empresas','reuniao-agendada','Construtora Horizonte — 60 caixas fim de ano',1926480,'open','humano',array['corporativo','fim de ano'],
   interval '1 day 3 hours', 'futura', array[
  'i|0|Olá! Sou do RH da Construtora Horizonte. Vocês fazem presente de fim de ano pra empresa? Seriam uns 60 colaboradores',
  'a|1|Olá, Patrícia! Fazemos sim, pela Aurora Empresas 😊 Temos kits prontos e personalizamos com o logo da empresa. Pra eu te orientar: para quando vocês precisam receber e quanto pretendem investir por pessoa, mais ou menos?',
  'i|4|Precisamos até 15/12. Pensamos em uns 300 reais por pessoa, com o logo da empresa',
  'a|5|Ótimo! A Caixa Fim de Ano Premium cabe bem: vela aromática, difusor de aromas, caneca de cerâmica, chocolates artesanais e cartão com a mensagem de vocês, em caixa rígida com fita. Sai R$ 349,00 por unidade na tabela, e de 50 a 99 unidades entra 8% de desconto por volume — fica perto do valor que você pensou.',
  'a|6|Com o logo, o prazo é de 10 a 15 dias úteis depois da aprovação da arte, então fechando até 5 de dezembro chega antes do Natal ✅',
  'i|8|Perfeito. Como faço pra fechar?',
  'a|9|O próximo passo é uma conversa rápida de 30 minutos com a Camila, nossa consultora corporativa: ela monta a proposta certinha, com amostra da arte e condição de pagamento. Tenho estes horários: {futura}, {futura_tarde} ou {futura_2}. Algum fica bom?',
  'i|12|{futura} está ótimo',
  'a|13|Prontinho, Patrícia! Reunião marcada: {futura}, por chamada de vídeo aqui no WhatsApp, com a Camila Nunes. Se puder, já separa o logo em vetor (PDF ou SVG) que agiliza 😉',
  'i|15|Combinado, obrigada Júlia!',
  'h|40|Oi, Patrícia! Aqui é a Camila, da Aurora Empresas. Vi que nossa conversa está marcada para {futura}. Até lá! 🙂']),
 (4,'Marcelo Vasconcelos','+5511999990404','marcelo@vasconceloscontabil.example.com','aurora-empresas','proposta-enviada','Vasconcelos Contabilidade — 25 kits tech',1122500,'pending','humano',array['corporativo','clientes'],
   interval '9 days 2 hours', 'vasconcelos', array[
  'i|0|Bom dia. Tenho um escritório de contabilidade e queria presentear nossos 25 principais clientes no fim do ano. Algo mais tecnológico',
  'a|1|Bom dia, Marcelo! Que ideia boa. Pra clientes estratégicos o mais pedido é o Kit Tech Executivo: fone de ouvido sem fio, carregador portátil e garrafa térmica inox, com gravação do logo do escritório. Sai R$ 449,00 por kit na tabela.',
  'i|3|Interessante. Vocês emitem nota no CNPJ e faturam?',
  'a|4|Sim! Sempre com nota fiscal no CNPJ, e para CNPJ com cadastro aprovado dá para faturar em boleto de 28 dias. Quem fecha esses detalhes é a Camila, nossa consultora corporativa — posso marcar 30 minutos com ela? Tenho {vasconcelos} livre.',
  'i|6|Pode marcar',
  'a|7|Marcado: {vasconcelos}, chamada de vídeo por aqui com a Camila Nunes ✅',
  'h|7300|Marcelo, foi ótimo conversar! Como combinamos, segue a proposta: 25 Kits Tech Executivo com gravação do logo, R$ 11.225,00, faturado em 28 dias no CNPJ. Prazo de 12 dias úteis depois da aprovação da arte. A prova da arte vai em anexo.',
  'i|7360|Recebi, Camila. Vou apresentar aos sócios e te retorno até sexta.',
  'h|7365|Perfeito! Fico no aguardo 🙂']),
 (5,'Juliana Prado','+5511999990405','juliana@sorrisopleno.example.com','aurora-empresas','interesse','Clínica Sorriso Pleno — 15 kits bem-estar',238500,'open','ia',array['corporativo'],
   interval '5 hours', null, array[
  'i|0|Oi! A clínica faz 10 anos mês que vem e eu queria dar um presente pras 15 colaboradoras',
  'a|1|Oi, Juliana! Parabéns pelos 10 anos 🎉 Para equipe a gente tem a Aurora Empresas. O Kit Bem-Estar faz muito sucesso em clínicas: hidratante corporal, body splash, vela aromática e nécessaire, em embalagem de presente. Sai R$ 159,00 por kit.',
  'i|3|Que lindo! Dá pra colocar um cartão com o nome da clínica?',
  'a|4|Dá sim, cartão impresso com a mensagem de vocês está incluso. Quer que eu marque uma conversa de 30 minutos com a Camila, nossa consultora, para fechar os detalhes?',
  'i|6|Essa semana tá corrida. Me chama na segunda que eu vejo um horário?',
  'a|7|Combinado, Juliana! Na segunda eu te chamo com os horários da Camila. Qualquer coisa antes disso, é só mandar mensagem 💜']),
 (6,'Fernanda Lopes','+5511999990406',null,'pedidos','em-atendimento','Vestido midi floral',24900,'open','ia',array['instagram'],
   interval '35 minutes', null, array[
  'i|0|Oi, vi o vestido midi floral no Instagram. Qual tamanho vocês acham que serve? Visto 40',
  'a|1|Oi, Fernanda! Quem veste 40 costuma ficar no M, que é para busto de 90 a 94 cm. Você sabe sua medida de busto? Assim eu te digo com certeza 😊',
  'i|4|Acho que uns 92',
  'a|5|Então o M fica perfeito. O vestido é de viscose leve, decote em V e tem faixa na cintura, então dá para ajustar bem. Sai R$ 249,00. Quer que eu veja se tem o M disponível?']),
 (7,'Thiago Moreira','+5511999990407','thiago.moreira@exemplo.com.br','pedidos','produto-apresentado','Fone de ouvido sem fio',21900,'open','ia',array['site','carrinho abandonado'],
   interval '20 hours', null, array[
  's|0|Oi, Thiago! Você deixou o Fone de ouvido sem fio no carrinho do site. Quer ajuda para finalizar?',
  'i|50|Oi. Fiquei na dúvida se funciona com iPhone',
  'a|51|Oi, Thiago! Funciona sim, com iPhone e Android: é Bluetooth 5.3, tem cancelamento de ruído ativo e 30 horas de bateria com o estojo. Garantia de 12 meses 🎧',
  'i|53|E carrega com o cabo do iPhone?',
  'a|54|O carregamento é USB-C, igual aos iPhones mais novos. Se você viaja bastante, muita gente leva junto o Carregador portátil 10.000 mAh (R$ 129,00): os dois somam R$ 348,00 e o frete sai grátis.',
  'i|57|Vou ver com calma à noite e te falo']),
 (8,'Beatriz Rangel','+5511999990408',null,'pedidos','novo-contato','Vale-presente',null,'open','ia',array['site'],
   interval '6 minutes', null, array[
  'i|0|Oi, vim pelo site. Vocês têm vale-presente?',
  'a|1|Oi, Beatriz! Temos sim 😊 O vale-presente digital vai de R$ 100 a R$ 1.000 e chega no mesmo dia por WhatsApp ou e-mail, com uma mensagem sua. É para alguma ocasião especial?']),
 (9,'Gustavo Henrique Lima','+5511999990409',null,'pedidos','__perdido','Relógio inteligente Lumi Fit',49900,'resolved','ia',array['site'],
   interval '6 days 4 hours', null, array[
  'i|0|Quanto tá o relógio Lumi Fit?',
  'a|1|Oi, Gustavo! O Relógio inteligente Lumi Fit sai por R$ 499,00: mede batimentos, sono e oxigenação, tem 7 dias de bateria e pode ir pra natação ⌚',
  'i|3|Achei por 420 em outro site',
  'a|4|Entendo! Aqui ele vem com nota fiscal, garantia de 12 meses e troca grátis em até 30 dias. No Pix fica R$ 474,05, ou 6x de R$ 83,17 sem juros.',
  'i|6|Vou ficar com o outro mesmo, valeu',
  'a|7|Sem problema, Gustavo! Se precisar de qualquer coisa, estamos por aqui 😊']),
 (10,'Eduarda Campos','+5511999990410','eduarda@agenciafaro.example.com','aurora-empresas','__ganho','Agência Faro — 40 kits boas-vindas',756000,'resolved','humano',array['corporativo','onboarding'],
   interval '22 days', 'faro', array[
  'i|0|Oi! Vamos contratar 40 pessoas no próximo trimestre e queríamos um kit de boas-vindas com a nossa marca',
  'a|1|Oi, Eduarda! Temos o Kit Boas-vindas: caneca de cerâmica, garrafa térmica inox, caderno capa dura e caneta, com o logo da agência e um cartão de boas-vindas. Sai R$ 189,00 por kit. Posso marcar uma conversa com a Camila, nossa consultora corporativa? Tenho {faro}.',
  'i|3|Pode ser',
  'a|4|Marcado: {faro}, com a Camila Nunes, por chamada de vídeo aqui no WhatsApp ✅',
  'h|10000|Eduarda, proposta aprovada! 40 Kits Boas-vindas com o logo da Faro, R$ 7.560,00. Arte aprovada hoje; entrega em 12 dias úteis no escritório de vocês.',
  'i|10020|Maravilha, Camila! Obrigada pela agilidade 💛']),
 (11,'Ricardo Almeida','+5511999990411','ricardo.almeida@redefarmavida.example.com','aurora-empresas','negociacao','Rede Farma Vida — 150 kits bem-estar',2098800,'pending','humano',array['corporativo','fim de ano'],
   interval '12 days', 'farma', array[
  'i|0|Boa tarde. Sou do marketing da Rede Farma Vida, temos 150 colaboradores nas lojas. Queremos um presente de fim de ano',
  'a|1|Boa tarde, Ricardo! Para 150 pessoas entra a faixa de 12% de desconto por volume. O Kit Bem-Estar (R$ 159,00 na tabela) costuma agradar muito: hidratante, body splash, vela aromática e nécessaire. Posso marcar 30 minutos com a Camila, nossa consultora? Tenho {farma}.',
  'i|3|Pode marcar',
  'a|4|Marcado: {farma}, com a Camila Nunes ✅',
  'h|7200|Ricardo, segue a proposta: 150 Kits Bem-Estar com cartão personalizado, R$ 20.988,00 (já com 12% de desconto), entrega direto em cada loja.',
  'i|11500|Camila, a diretoria gostou. Conseguimos faturar em 2 vezes, 28 e 56 dias?',
  'h|11515|Vou levar ao financeiro e te respondo amanhã cedo, Ricardo.'])
) v(n, nome, fone, email, funil, etapa, titulo, valor, status_conv, quem_cuida, tags, ha, reuniao, linhas);

insert into contacts (organization_id, name, display_name, email, phone_number, tags, source, source_metadata, last_activity_at, created_at)
select :'org', c.nome, c.nome, c.email, c.fone, c.tags, 'whatsapp',
  jsonb_build_object('origem', case when 'site' = any(c.tags) then 'botao_do_site' when 'instagram' = any(c.tags) then 'instagram' else 'whatsapp' end),
  now() - c.ha, now() - c.ha
from vend_conversa c;

-- nasce aberta (o banco recusa mensagem em conversa encerrada) e recebe o estado final no fim
insert into conversations (organization_id, contact_id, channel_session_id, channel, status, assigned_to_user_id, assigned_at, assignee_kind,
  active_ai_agent_id, active_agent_set_at, last_message_at)
select :'org', ct.id, :'canal', 'whatsapp', 'open',
  case when c.quem_cuida = 'humano' then case when c.funil = 'aurora-empresas' then :'camila'::uuid else :'bruno'::uuid end end,
  now() - c.ha,
  case when c.quem_cuida = 'humano' then 'user' else 'ai' end,
  case when c.quem_cuida = 'ia' then :'agente'::uuid end,
  case when c.quem_cuida = 'ia' then now() - c.ha end,
  now() - c.ha
from vend_conversa c join contacts ct on ct.organization_id = :'org' and ct.phone_number = c.fone;

insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body, sent_via, sent_by_user_id, sent_at, metadata)
select :'org', cv.id, cv.channel_session_id, cv.contact_id, 'text',
  case when m.quem = 'i' then 'inbound' else 'outbound' end,
  case when m.quem = 'i' then 'received' when m.n = m.total then 'delivered' else 'read' end,
  m.texto_final,
  case m.quem when 'i' then 'crm' when 'a' then 'ai' when 's' then 'automation' else 'user' end,
  case when m.quem = 'h' then case when c.funil = 'aurora-empresas' then :'camila'::uuid else :'bruno'::uuid end end,
  least(now() - c.ha + make_interval(mins => m.minuto), now() - interval '1 minute'),
  case when m.quem = 'a' then jsonb_build_object('ai_actor_id', :'agente'::text) else '{}'::jsonb end
from vend_conversa c
join contacts ct on ct.organization_id = :'org' and ct.phone_number = c.fone
join conversations cv on cv.organization_id = :'org' and cv.contact_id = ct.id
cross join lateral (
  select split_part(t.l, '|', 1) as quem, split_part(t.l, '|', 2)::int as minuto,
         (select coalesce((select replace(replace(replace(replace(replace(replace(substr(t.l, length(split_part(t.l, '|', 1)) + length(split_part(t.l, '|', 2)) + 3),
            '{futura}', (select rotulo from vend_rotulo where nome = 'futura')),
            '{futura_tarde}', (select rotulo from vend_rotulo where nome = 'futura_tarde')),
            '{futura_2}', (select rotulo from vend_rotulo where nome = 'futura_2')),
            '{vasconcelos}', (select rotulo from vend_rotulo where nome = 'vasconcelos')),
            '{farma}', (select rotulo from vend_rotulo where nome = 'farma')),
            '{faro}', (select rotulo from vend_rotulo where nome = 'faro'))), '')) as texto_final,
         t.n, array_length(c.linhas, 1) as total
  from unnest(c.linhas) with ordinality as t(l, n)
) m;

update conversations cv set
  last_inbound_at = x.li, last_outbound_at = x.lo, last_message_at = x.lm, last_message_preview = x.prev,
  status = c.status_conv,
  unread_count_for_assignee = case when c.status_conv in ('open','pending') and x.ultimo_dir = 'inbound' then 1 else 0 end,
  awaiting_since = case when c.status_conv in ('open','pending') and x.ultimo_dir = 'inbound' then x.lm end
from vend_conversa c
join contacts ct on ct.organization_id = :'org' and ct.phone_number = c.fone
join (
  select m.conversation_id,
         max(m.sent_at) filter (where m.direction = 'inbound') as li,
         max(m.sent_at) filter (where m.direction = 'outbound') as lo,
         max(m.sent_at) as lm,
         (array_agg(left(m.body, 80) order by m.sent_at desc))[1] as prev,
         (array_agg(m.direction order by m.sent_at desc))[1] as ultimo_dir
  from messages m where m.organization_id = :'org' group by m.conversation_id
) x on true
where cv.organization_id = :'org' and cv.contact_id = ct.id and x.conversation_id = cv.id;

-- ===================================================================== Negócios
insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, description, value_cents, owner_user_id, owner_kind,
  status, position_in_stage, last_activity_at, closed_at, source, source_metadata, tags, lost_reason, lost_from_stage_id, won_reason, created_at, stage_changed_at)
select :'org', p.id,
  case c.etapa when '__ganho' then (select id from crm_stages where pipeline_id = p.id and is_won and not is_archived limit 1)
               when '__perdido' then (select id from crm_stages where pipeline_id = p.id and is_lost limit 1)
               else (select id from crm_stages where pipeline_id = p.id and slug = c.etapa) end,
  ct.id, c.titulo,
  case when c.funil = 'aurora-empresas' then 'Oportunidade aberta pela Júlia (agente de atendimento) no WhatsApp.' else 'Chegou pelo WhatsApp.' end,
  c.valor,
  case when c.funil = 'aurora-empresas' then :'camila'::uuid when c.quem_cuida = 'humano' then :'bruno'::uuid end,
  case when c.funil = 'aurora-empresas' or c.quem_cuida = 'humano' then 'user' end,
  case c.etapa when '__ganho' then 'won' when '__perdido' then 'lost' else 'open' end,
  1000 + c.n,
  (select max(m.sent_at) from messages m where m.organization_id = :'org' and m.contact_id = ct.id),
  case when c.etapa in ('__ganho','__perdido') then (select max(m.sent_at) from messages m where m.organization_id = :'org' and m.contact_id = ct.id) end,
  'whatsapp', jsonb_build_object('canal', 'whatsapp', 'aberto_por', 'agente'),
  c.tags,
  case when c.etapa = '__perdido' then 'price' end,
  case when c.etapa = '__perdido' then (select id from crm_stages where pipeline_id = p.id and slug = 'produto-apresentado') end,
  case when c.etapa = '__ganho' then case when c.funil = 'aurora-empresas' then 'Proposta aprovada' else 'Pagamento confirmado' end end,
  now() - c.ha, now() - c.ha + interval '15 minutes'
from vend_conversa c
join contacts ct on ct.organization_id = :'org' and ct.phone_number = c.fone
join crm_pipelines p on p.organization_id = :'org' and p.slug = c.funil;

-- mais oportunidades corporativas sem conversa no WhatsApp (vieram por e-mail ou indicação)
insert into contacts (organization_id, name, display_name, email, phone_number, tags, source, created_at, last_activity_at)
values
 (:'org','Sandra Okada','Sandra Okada','sandra.okada@escolaipe.example.com','+5511999990412',array['corporativo'],'manual', now() - interval '15 days', now() - interval '3 days'),
 (:'org','Paulo Henrique Duarte','Paulo Henrique Duarte','paulo@duarteadvogados.example.com','+5511999990413',array['corporativo'],'manual', now() - interval '30 days', now() - interval '26 days'),
 (:'org','Aline Barreto','Aline Barreto','aline.barreto@studiopilates.example.com','+5511999990414',array['corporativo'],'manual', now() - interval '4 days', now() - interval '4 days');
insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, value_cents, owner_user_id, owner_kind, status, position_in_stage,
  last_activity_at, closed_at, source, tags, lost_reason, lost_from_stage_id, created_at)
select :'org', :'corp', s.id, ct.id, x.titulo, x.valor, :'camila', 'user', x.status, 2000 + x.k,
  now() - x.ha, case when x.status <> 'open' then now() - x.ha end, 'manual', array['corporativo'],
  x.motivo, case when x.status = 'lost' then (select id from crm_stages where pipeline_id = :'corp' and slug = 'proposta-enviada') end,
  now() - x.ha - interval '10 days'
from (values
  (1,'+5511999990412','Escola Ipê — 120 kits fim de ano (professores)','proposta-enviada',3684960,'open',null::text, interval '3 days'),
  (2,'+5511999990413','Duarte Advogados — 30 kits tech para clientes','perdido',1347000,'lost','Escolheu um concorrente', interval '26 days'),
  (3,'+5511999990414','Studio Pilates Equilíbrio — 12 kits bem-estar','interesse',190800,'open',null, interval '4 days')
) x(k, fone, titulo, etapa, valor, status, motivo, ha)
join contacts ct on ct.organization_id = :'org' and ct.phone_number = x.fone
join crm_stages s on s.pipeline_id = :'corp' and s.slug = x.etapa;

-- ===================================================================== Reuniões marcadas pelo agente
insert into calendar_appointments (organization_id, event_type_id, title, description, starts_at, ends_at, time_zone, status,
  owner_user_id, contact_id, conversation_id, location_kind, location_details, notes, created_by_kind, created_by_agent_id, source, created_at)
select :'org', :'tipo_corp', 'Reunião — Aurora Empresas — ' || split_part(c.titulo, ' — ', 1),
  'Marcada pela Júlia (agente de atendimento) no WhatsApp. ' || c.titulo || '.',
  r.quando, r.quando + interval '30 minutes', 'America/Sao_Paulo',
  case when r.quando > now() then 'confirmed' else 'completed' end,
  :'camila', ct.id, cv.id, 'whatsapp', 'Chamada de vídeo pelo WhatsApp, neste mesmo número.',
  case c.n when 3 then 'Construtora Horizonte: 60 caixas Fim de Ano Premium com logo, entrega até 15/12, cerca de R$ 300 por pessoa.'
           when 4 then 'Vasconcelos Contabilidade: 25 Kits Tech Executivo para clientes, quer faturado no CNPJ.'
           when 10 then 'Agência Faro: 40 Kits Boas-vindas para contratações do trimestre.'
           when 11 then 'Rede Farma Vida: 150 Kits Bem-Estar, entrega em cada loja.' end,
  'ai', :'agente', 'mcp', now() - c.ha + interval '13 minutes'
from vend_conversa c
join vend_data r on r.nome = c.reuniao
join contacts ct on ct.organization_id = :'org' and ct.phone_number = c.fone
join conversations cv on cv.organization_id = :'org' and cv.contact_id = ct.id;

insert into crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind, metadata)
select :'org', l.id, 'appointment', a.id, 'scheduled', jsonb_build_object('origem', 'agente')
from calendar_appointments a
join crm_leads l on l.organization_id = :'org' and l.contact_id = a.contact_id and l.pipeline_id = :'corp'
where a.organization_id = :'org' and a.event_type_id = :'tipo_corp';

-- quem mudou de etapa aqui entrou nela quando a história diz, não "agora"
update crm_leads set stage_changed_at = coalesce(closed_at, last_activity_at, created_at)
 where organization_id = :'org' and stage_changed_at >= now() and coalesce(closed_at, last_activity_at, created_at) < now();

-- ===================================================================== Nenhum consumidor reage
update event_log set status = 'done', consumed_by = consumed_by || array['seed-demo-vendedor'], updated_at = now()
 where organization_id = :'org' and created_at >= now() and status = 'pending';

-- ===================================================================== O que mudou
select 'produtos ativos' as o_que, count(*)::text as quanto from catalog_products where organization_id = :'org' and ativo
union all select 'etapas de Vendas pelo WhatsApp', string_agg(s.name || ' (' || (select count(*) from crm_leads l where l.stage_id = s.id) || ')', ' > ' order by s.position)
  from crm_stages s where s.pipeline_id = :'funil' and not s.is_archived
union all select 'etapas de Aurora Empresas', string_agg(s.name || ' (' || (select count(*) from crm_leads l where l.stage_id = s.id) || ')', ' > ' order by s.position)
  from crm_stages s where s.pipeline_id = :'corp'
union all select 'reuniões corporativas', string_agg(r.rotulo || ' ' || a.status, ' | ') from calendar_appointments a join vend_rotulo r on r.quando = a.starts_at where a.organization_id = :'org' and a.event_type_id = :'tipo_corp'
union all select 'conversas novas', count(*)::text from conversations where organization_id = :'org' and created_at >= now()
union all select 'mensagens novas', count(*)::text from messages where organization_id = :'org' and created_at >= now()
union all select 'eventos marcados como consumidos', count(*)::text from event_log where organization_id = :'org' and created_at >= now() and 'seed-demo-vendedor' = any(consumed_by)
union all select 'eventos ainda pendentes desta transação', count(*)::text from event_log where organization_id = :'org' and created_at >= now() and status <> 'done'
union all select 'jobs criados nesta transação', coalesce(string_agg(kind, ', '), '0') from job_queue where organization_id = :'org' and created_at >= now();

:fim;

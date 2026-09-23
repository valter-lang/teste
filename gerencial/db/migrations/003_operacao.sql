-- =====================================================================
-- 003 — Dados de origem (eventos operacionais)
-- Indicadores NUNCA são digitados: são calculados a partir destas tabelas.
-- =====================================================================

-- Colunas de controle comuns (repetidas por clareza em cada tabela):
--   origem, origem_ref, criado_por, criado_em, atualizado_por, atualizado_em,
--   excluido_em, excluido_por, motivo_exclusao, versao

-- ---------------------------------------------------------------------
-- Manutenção interna (oficina)
-- ---------------------------------------------------------------------
create table manut_interna (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  unidade_id int references unidade(id),
  data_recebimento date,
  data_conclusao date,
  familia_id int not null references familia_equipamento(id),
  modelo_id int references modelo_equipamento(id),
  equipamento_id int references equipamento(id),
  identificador text,
  tipo_servico text not null check (tipo_servico in ('RECUPERACAO','HIGIENIZACAO','PREVENTIVA','DIAGNOSTICO')),
  resultado text not null check (resultado in ('RECUPERADO','SUCATEADO','HIGIENIZADO','PENDENTE')),
  retorno_aplicavel_higienizacao boolean,
  tecnico_id int references tecnico(id),
  motivo_sucateamento text,
  custo_mao_obra numeric(14,2) check (custo_mao_obra >= 0),
  observacao text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (data_conclusao is null or data_recebimento is null or data_conclusao >= data_recebimento),
  check (resultado <> 'SUCATEADO' or coalesce(trim(motivo_sucateamento),'') <> '')
);
create index manut_interna_comp_idx on manut_interna (competencia) where excluido_em is null;

-- Plano de manutenção preventiva (denominador de "preventiva realizada x plano")
create table manut_preventiva_plano (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  familia_id int references familia_equipamento(id),
  quantidade_planejada int not null check (quantidade_planejada >= 0),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  unique (competencia, familia_id)
);

-- ---------------------------------------------------------------------
-- Manutenção externa (chamados em campo)
-- ---------------------------------------------------------------------
create table chamado_externo (
  id serial primary key,
  numero text not null,
  competencia date not null check (competencia_valida(competencia)),
  aberto_em timestamptz not null,
  primeira_resposta_em timestamptz,
  atendido_em timestamptz,
  encerrado_em timestamptz,
  cliente_id int references cliente(id),
  unidade_id int references unidade(id),
  solicitante text,
  familia_id int references familia_equipamento(id),
  modelo_id int references modelo_equipamento(id),
  equipamento_id int references equipamento(id),
  identificador text,
  equipamento_do_cliente boolean not null default false,
  tecnico_id int references tecnico(id),
  causa text,
  solucao text,
  tipo_atendimento text not null default 'CORRETIVA'
    check (tipo_atendimento in ('CORRETIVA','PREVENTIVA','INSTALACAO','RETIRADA','VISTORIA','OUTRO')),
  status text not null default 'ABERTO' check (status in ('ABERTO','EM_ATENDIMENTO','ENCERRADO','CANCELADO')),
  necessario boolean,                        -- nulo = ainda não classificado
  motivo_desnecessario text check (motivo_desnecessario in
    ('ELETRICA_CLIENTE','SEM_DEFEITO','INFRAESTRUTURA_CLIENTE','DESLIGADO','OPERACAO_INCORRETA','OUTRO')),
  justificativa_desnecessario text,
  resolvido_primeira_visita boolean,
  chamado_anterior_id int references chamado_externo(id),   -- reincidência vinculada
  equipamento_parado boolean not null default false,
  criticidade text check (criticidade in ('P1','P2','P3')),
  reserva_disponibilizada boolean,
  elegivel_sla boolean not null default true,
  motivo_inelegivel_sla text,
  valor_cobrado numeric(14,2) check (valor_cobrado >= 0),
  observacao text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (primeira_resposta_em is null or primeira_resposta_em >= aberto_em),
  check (encerrado_em is null or encerrado_em >= coalesce(primeira_resposta_em, aberto_em)),
  check (atendido_em is null or atendido_em >= aberto_em),
  check (necessario is distinct from false or coalesce(trim(justificativa_desnecessario),'') <> ''),
  check (elegivel_sla or coalesce(trim(motivo_inelegivel_sla),'') <> ''),
  check (equipamento_parado = false or criticidade = 'P1'),
  check (chamado_anterior_id is null or chamado_anterior_id <> id)
);
create unique index chamado_externo_numero_uk on chamado_externo (numero) where excluido_em is null;
create index chamado_externo_comp_idx on chamado_externo (competencia) where excluido_em is null;
create index chamado_externo_cliente_idx on chamado_externo (cliente_id);

create table solicitacao_troca (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  chamado_externo_id int references chamado_externo(id),
  cliente_id int references cliente(id),
  cliente_texto text,
  data_solicitacao date not null,
  data_troca date,
  solicitado_por_tecnico_id int references tecnico(id),
  solicitado_por_texto text,
  familia_id int references familia_equipamento(id),
  equipamento_texto text,
  linha text check (linha in ('PADRAO','STAR')),
  causa text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','CONCLUIDA','CANCELADA')),
  observacao text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (data_troca is null or data_troca >= data_solicitacao),
  check (status <> 'CONCLUIDA' or data_troca is not null),
  check (cliente_id is not null or coalesce(trim(cliente_texto),'') <> '')
);

-- ---------------------------------------------------------------------
-- Estoque de peças: o saldo é CALCULADO (view), nunca digitado
-- ---------------------------------------------------------------------
create table movimento_estoque (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  data date not null,
  local_estoque_id int references local_estoque(id),
  local_destino_id int references local_estoque(id),
  familia_id int not null references familia_peca(id),
  item_peca_id int references item_peca(id),
  tipo text not null check (tipo in ('ENTRADA','SAIDA','AJUSTE','TRANSFERENCIA')),
  quantidade numeric(14,3) not null,
  valor_total numeric(14,2),
  motivo text,
  documento_origem text,
  responsavel_id uuid references usuario(id),
  manut_interna_id int references manut_interna(id),
  chamado_externo_id int references chamado_externo(id),
  aplicacao text check (aplicacao in ('INTERNA','EXTERNA')),
  justificativa_ajuste text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (date_trunc('month', data)::date = competencia),
  -- quantidade e custo não negativos, salvo ajuste justificado
  check (tipo = 'AJUSTE' or (quantidade > 0 and coalesce(valor_total,0) >= 0)),
  check (tipo <> 'AJUSTE' or coalesce(trim(justificativa_ajuste),'') <> ''),
  check (tipo <> 'TRANSFERENCIA' or local_destino_id is not null)
);
create index movimento_estoque_comp_idx on movimento_estoque (competencia) where excluido_em is null;

create view saldo_estoque_peca as
select familia_id, item_peca_id, local_estoque_id,
       sum(case tipo when 'ENTRADA' then quantidade when 'SAIDA' then -quantidade
                     when 'AJUSTE' then quantidade else 0 end) as saldo_quantidade,
       sum(case tipo when 'ENTRADA' then coalesce(valor_total,0) when 'SAIDA' then -coalesce(valor_total,0)
                     when 'AJUSTE' then coalesce(valor_total,0) else 0 end) as saldo_valor,
       max(data) as ultima_movimentacao
  from movimento_estoque
 where excluido_em is null
 group by familia_id, item_peca_id, local_estoque_id;

-- ---------------------------------------------------------------------
-- Comodato: entregas, trocas, retiradas
-- ---------------------------------------------------------------------
create table comodato_movimento (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  solicitacao_numero text,
  cliente_id int references cliente(id),
  cliente_texto text,
  familia_id int references familia_equipamento(id),
  equipamento_id int references equipamento(id),
  tipo text not null check (tipo in ('ENTREGA','TROCA','RETIRADA')),
  campanha_fim_ano boolean not null default false,
  data_solicitacao date not null,
  data_agendamento date,
  data_conclusao date,
  situacao text not null default 'SOLICITADO'
    check (situacao in ('SOLICITADO','AGENDADO','CONCLUIDO','SEM_EXITO','CANCELADO')),
  motivo_insucesso text,
  responsavel text,
  observacao text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (data_agendamento is null or data_agendamento >= data_solicitacao),
  check (data_conclusao is null or data_conclusao >= data_solicitacao),
  check (situacao <> 'CONCLUIDO' or data_conclusao is not null),
  check (situacao <> 'SEM_EXITO' or coalesce(trim(motivo_insucesso),'') <> ''),
  check (cliente_id is not null or coalesce(trim(cliente_texto),'') <> '')
);
create unique index comodato_mov_solic_uk on comodato_movimento (solicitacao_numero, tipo)
  where solicitacao_numero is not null and excluido_em is null;

create table comodato_tentativa (
  id serial primary key,
  movimento_id int not null references comodato_movimento(id) on delete cascade,
  competencia date not null check (competencia_valida(competencia)),
  numero int not null check (numero >= 1),
  data date not null,
  sucesso boolean not null,
  motivo_insucesso text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  unique (movimento_id, numero),
  check (sucesso or coalesce(trim(motivo_insucesso),'') <> '')
);

-- Posição mensal do estoque de comodato por produto/família
create table comodato_posicao (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  produto text not null,
  familia_id int references familia_equipamento(id),
  unidade_id int references unidade(id),
  posicao_anterior int not null check (posicao_anterior >= 0),
  entradas int not null default 0 check (entradas >= 0),
  saidas_novos int not null default 0 check (saidas_novos >= 0),
  saidas_usados int not null default 0 check (saidas_usados >= 0),
  novos int not null check (novos >= 0),
  usados int not null check (usados >= 0),
  manutencao_interna int check (manutencao_interna >= 0),
  sucata int check (sucata >= 0),
  custo_total_novos numeric(16,2) check (custo_total_novos >= 0),
  custo_total_usados numeric(16,2) check (custo_total_usados >= 0),
  ajuste int not null default 0,
  justificativa_ajuste text,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  -- Conciliação: anterior + entradas − saídas + ajuste = posição atual (novos + usados)
  check (posicao_anterior + entradas - saidas_novos - saidas_usados + ajuste = novos + usados),
  check (ajuste = 0 or coalesce(trim(justificativa_ajuste),'') <> '')
);
create unique index comodato_posicao_uk on comodato_posicao (competencia, upper(produto), coalesce(unidade_id,0))
  where excluido_em is null;

-- Fotografia mensal da base instalada ativa (integração Protheus/AA3 ou lançamento auditado)
create table comodato_base_ativa (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  equipamentos_ativos int not null check (equipamentos_ativos >= 0),
  clientes_ativos int check (clientes_ativos >= 0),
  instalacoes int check (instalacoes >= 0),
  retiradas int check (retiradas >= 0),
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  evidencia text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1
);
create unique index comodato_base_ativa_uk on comodato_base_ativa (competencia) where excluido_em is null;

-- Consumo (kg comprados) por cliente — alimentado por integração de vendas ou lançamento
create table comodato_consumo (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  cliente_id int references cliente(id),
  kg_comprados numeric(14,3) not null check (kg_comprados >= 0),
  consumo_minimo_kg numeric(14,3) check (consumo_minimo_kg >= 0),
  aplicavel_minimo boolean not null default true,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1
);
create unique index comodato_consumo_uk on comodato_consumo (competencia, coalesce(cliente_id,0)) where excluido_em is null;

-- ---------------------------------------------------------------------
-- TI
-- ---------------------------------------------------------------------
create table chamado_ti (
  id serial primary key,
  numero text not null,
  sistema_origem text not null default 'TI' check (sistema_origem in ('TI','LINEAR','OUTRO')),
  competencia date not null check (competencia_valida(competencia)),
  titulo text,
  status text not null,
  status_normalizado text not null check (status_normalizado in ('ABERTO','EM_ATENDIMENTO','AGUARDANDO','ESCALADO','RESOLVIDO','CANCELADO')),
  tipo text,
  prioridade text,
  origem_canal text,
  nivel_suporte text,
  categoria text,
  subcategoria text,
  equipe text,
  tecnico_responsavel text,
  solicitante text,
  departamento text,
  unidade_texto text,
  aberto_em timestamptz not null,
  sla_prazo timestamptz,
  sla_violado boolean,
  sla_violado_em timestamptz,
  sla_horas_pausadas numeric(10,2) check (sla_horas_pausadas >= 0),
  sla_desvio_h numeric(10,2),
  solucao text,
  causa_raiz text,
  motivo_cancelamento text,
  fechado_em timestamptz,
  tempo_resolucao_origem_h numeric(10,2),
  escalado_em timestamptz,
  csat_nota numeric(3,1) check (csat_nota between 0 and 5),
  csat_comentario text,
  csat_respondido_em timestamptz,
  tags text[],
  ultima_atualizacao_em timestamptz,
  resolvido_primeiro_contato boolean,
  chamado_anterior_id int references chamado_ti(id),
  elegivel_sla boolean not null default true,
  motivo_inelegivel_sla text,
  dado_teste boolean not null default false,
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  origem_ref jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references usuario(id),
  motivo_exclusao text,
  versao int not null default 1,
  check (fechado_em is null or fechado_em >= aberto_em),
  check (elegivel_sla or coalesce(trim(motivo_inelegivel_sla),'') <> '')
);
create unique index chamado_ti_numero_uk on chamado_ti (sistema_origem, numero) where excluido_em is null;
create index chamado_ti_comp_idx on chamado_ti (competencia) where excluido_em is null;

-- Dados de contato: acesso restrito, nunca exibidos em painéis nem exportações executivas
create table chamado_ti_restrito (
  chamado_id int primary key references chamado_ti(id) on delete cascade,
  email_tecnico text,
  email_solicitante text,
  ramal text,
  ip_abertura text,
  fechado_por_email text,
  escalado_por_email text
);

create table ti_sistema (
  id serial primary key,
  nome text not null unique,
  critico boolean not null default true,
  ativo boolean not null default true
);

create table ti_janela_programada (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  sistema_id int not null references ti_sistema(id),
  minutos_programados int not null check (minutos_programados > 0),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  unique (competencia, sistema_id)
);

create table ti_indisponibilidade (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  sistema_id int not null references ti_sistema(id),
  inicio timestamptz not null,
  fim timestamptz,
  planejada boolean not null default false,
  valida boolean not null default true,       -- conta para disponibilidade
  motivo_invalidacao text,
  causa text,
  chamado_ti_id int references chamado_ti(id),
  origem text not null default 'MANUAL' check (origem in ('MANUAL','IMPORTACAO','INTEGRACAO')),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1,
  check (fim is null or fim >= inicio),
  check (valida or coalesce(trim(motivo_invalidacao),'') <> '')
);

create table ti_backup_execucao (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  data date not null,
  rotina text not null,
  sistema_id int references ti_sistema(id),
  programado boolean not null default true,
  concluido boolean not null,
  observacao text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1,
  unique (data, rotina)
);

create table ti_teste_restauracao (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  data date not null,
  sistema_id int references ti_sistema(id),
  rotina text not null,
  sucesso boolean not null,
  tempo_restauracao_min int check (tempo_restauracao_min >= 0),
  evidencia text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1
);

create table ti_incidente_critico (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  numero text,
  sistema_id int references ti_sistema(id),
  aberto_em timestamptz not null,
  resolvido_em timestamptz,
  descricao text not null,
  causa_raiz text,
  acao_corretiva text,
  responsavel text,
  prazo_acao date,
  status text not null default 'ABERTO' check (status in ('ABERTO','RESOLVIDO','CAUSA_TRATADA')),
  seguranca boolean not null default false,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1,
  check (resolvido_em is null or resolvido_em >= aberto_em),
  check (status <> 'CAUSA_TRATADA' or (coalesce(trim(causa_raiz),'') <> '' and coalesce(trim(acao_corretiva),'') <> '' and coalesce(trim(responsavel),'') <> ''))
);

create table ti_projeto (
  id serial primary key,
  nome text not null,
  responsavel text,
  roadmap_aprovado boolean not null default false,
  status text not null default 'EM_ANDAMENTO' check (status in ('PLANEJADO','EM_ANDAMENTO','CONCLUIDO','SUSPENSO','CANCELADO')),
  inicio date,
  fim_previsto date,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1
);

create table ti_marco (
  id serial primary key,
  projeto_id int not null references ti_projeto(id),
  competencia date not null check (competencia_valida(competencia)),   -- competência planejada
  descricao text not null,
  data_planejada date not null,
  data_realizada date,
  percentual_concluido numeric(5,2) not null default 0 check (percentual_concluido between 0 and 100),
  observacao_desvio text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1,
  check (competencia = date_trunc('month', data_planejada)::date)
);

create table ti_patch_ciclo (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  patches_criticos_liberados int not null check (patches_criticos_liberados >= 0),
  aplicados_ate_30_dias int not null check (aplicados_ate_30_dias >= 0),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  unique (competencia),
  check (aplicados_ate_30_dias <= patches_criticos_liberados)
);

-- ---------------------------------------------------------------------
-- Bloqueio de período + auditoria nas tabelas de origem
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
      ('manut_interna','MANUT_INTERNA'), ('manut_preventiva_plano','MANUT_INTERNA'),
      ('chamado_externo','MANUT_EXTERNA'), ('solicitacao_troca','MANUT_EXTERNA'),
      ('movimento_estoque','ESTOQUE_PECAS'),
      ('comodato_movimento','COMODATO'), ('comodato_tentativa','COMODATO'), ('comodato_posicao','COMODATO'),
      ('comodato_base_ativa','COMODATO'), ('comodato_consumo','COMODATO'),
      ('chamado_ti','TI'), ('ti_janela_programada','TI'), ('ti_indisponibilidade','TI'),
      ('ti_backup_execucao','TI'), ('ti_teste_restauracao','TI'), ('ti_incidente_critico','TI'),
      ('ti_marco','TI'), ('ti_patch_ciclo','TI')
    ) as t(tabela, area) loop
    execute format('create trigger %I before insert or update or delete on %I for each row execute function trg_bloqueio_periodo(%L)',
                   r.tabela || '_bloqueio', r.tabela, r.area);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function trg_auditoria()',
                   r.tabela || '_aud', r.tabela);
  end loop;
end $$;

create trigger ti_projeto_aud after insert or update or delete on ti_projeto for each row execute function trg_auditoria();
create trigger ti_sistema_aud after insert or update or delete on ti_sistema for each row execute function trg_auditoria();
create trigger chamado_ti_restrito_aud after insert or update or delete on chamado_ti_restrito for each row execute function trg_auditoria();

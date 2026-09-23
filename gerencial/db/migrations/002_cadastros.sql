-- =====================================================================
-- 002 — Cadastros (clientes, equipamentos, técnicos, peças)
-- Desativar um cadastro preserva o histórico e impede apenas novas utilizações
-- (validado na aplicação via coluna ativo + valido_ate).
-- =====================================================================

create table rede (
  id serial primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index rede_nome_uk on rede (upper(nome));

create table cliente (
  id serial primary key,
  codigo_externo text,                 -- código do cliente no Protheus (A1_COD+A1_LOJA), quando houver
  fantasia text not null,
  razao_social text,
  rede_id int references rede(id),
  unidade_id int references unidade(id),
  cidade text,
  uf char(2),
  ativo boolean not null default true,
  valido_ate date,
  criado_em timestamptz not null default now()
);
create unique index cliente_codigo_uk on cliente (codigo_externo) where codigo_externo is not null;
create index cliente_fantasia_idx on cliente (upper(fantasia));

create table contrato_comodato (
  id serial primary key,
  cliente_id int not null references cliente(id),
  numero text,
  inicio date,
  fim date,
  consumo_minimo_kg_mes numeric(14,3) check (consumo_minimo_kg_mes >= 0),
  ativo boolean not null default true
);

create table familia_equipamento (
  id serial primary key,
  nome text not null,
  ativo boolean not null default true,
  ordem int not null default 0
);
create unique index familia_equipamento_uk on familia_equipamento (upper(nome));

-- Sinônimos usados na migração (ex.: "CLIMATICA" -> CLIMATIZADORA)
create table familia_equipamento_alias (
  alias text primary key,
  familia_id int not null references familia_equipamento(id)
);

create table modelo_equipamento (
  id serial primary key,
  familia_id int not null references familia_equipamento(id),
  nome text not null,
  ativo boolean not null default true,
  unique (familia_id, nome)
);

create table equipamento (
  id serial primary key,
  familia_id int not null references familia_equipamento(id),
  modelo_id int references modelo_equipamento(id),
  patrimonio text,
  serial text,
  linha text check (linha in ('PADRAO','STAR')),
  situacao text not null default 'ESTOQUE'
    check (situacao in ('EM_CLIENTE','ESTOQUE','MANUTENCAO','SUCATA','BAIXADO')),
  cliente_id int references cliente(id),
  ultima_movimentacao_em date,
  entrada_estoque_em date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index equipamento_patrimonio_uk on equipamento (patrimonio) where patrimonio is not null;

create table tecnico (
  id serial primary key,
  nome text not null,
  tipo text not null default 'EXTERNO' check (tipo in ('INTERNO','EXTERNO','TERCEIRO','APOIO')),
  ativo boolean not null default true,
  valido_ate date
);
create unique index tecnico_nome_uk on tecnico (upper(nome));

create table familia_peca (
  id serial primary key,
  nome text not null,
  classe_abc char(1) check (classe_abc in ('A','B','C')),
  ativo boolean not null default true
);
create unique index familia_peca_uk on familia_peca (upper(nome));

create table item_peca (
  id serial primary key,
  familia_id int not null references familia_peca(id),
  codigo text,
  descricao text not null,
  unidade_medida text not null default 'UN',
  critico boolean not null default false,
  estoque_minimo numeric(14,3),
  ativo boolean not null default true
);
create unique index item_peca_codigo_uk on item_peca (codigo) where codigo is not null;

create table local_estoque (
  id serial primary key,
  unidade_id int references unidade(id),
  nome text not null,
  ativo boolean not null default true
);

do $$
declare t text;
begin
  foreach t in array array['rede','cliente','contrato_comodato','familia_equipamento','familia_equipamento_alias',
    'modelo_equipamento','equipamento','tecnico','familia_peca','item_peca','local_estoque'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function trg_auditoria()', t || '_aud', t);
  end loop;
end $$;

-- =====================================================================
-- 001 — Fundação: organização, usuários, períodos, calendário, auditoria
-- =====================================================================
-- Convenções:
--   * competência = primeiro dia do mês (date), validada por CHECK.
--   * toda tabela de negócio tem origem (MANUAL/IMPORTACAO/INTEGRACAO),
--     exclusão lógica (excluido_em) e controle de versão (versao) para
--     concorrência otimista.
--   * o usuário da transação é informado via set_config('app.usuario_id').

create extension if not exists pgcrypto;

create or replace function app_usuario_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;

create or replace function competencia_valida(d date) returns boolean
language sql immutable as $$ select d = date_trunc('month', d)::date $$;

-- ---------------------------------------------------------------------
-- Organização
-- ---------------------------------------------------------------------
create table empresa (
  id serial primary key,
  nome text not null unique,
  ativo boolean not null default true
);

create table unidade (
  id serial primary key,
  empresa_id int not null references empresa(id),
  codigo text not null unique,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table area (
  codigo text primary key check (codigo ~ '^[A-Z_]+$'),
  nome text not null,
  obrigatoria_fechamento boolean not null default true,
  ordem int not null default 0
);

insert into area (codigo, nome, ordem) values
  ('MANUT_INTERNA', 'Manutenção interna', 1),
  ('MANUT_EXTERNA', 'Manutenção externa', 2),
  ('ESTOQUE_PECAS', 'Estoque de peças', 3),
  ('COMODATO', 'Comodato', 4),
  ('TI', 'Tecnologia da Informação', 5);

-- ---------------------------------------------------------------------
-- Usuários e perfis
-- ---------------------------------------------------------------------
create table usuario (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  deve_trocar_senha boolean not null default true,
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_login_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index usuario_email_uk on usuario (lower(email));

create table usuario_papel (
  id serial primary key,
  usuario_id uuid not null references usuario(id) on delete cascade,
  papel text not null check (papel in ('ADMIN','LANCADOR','GESTOR','DIRETORIA','AUDITOR')),
  area_codigo text references area(codigo),      -- nulo = todas as áreas
  unidade_id int references unidade(id),         -- nulo = todas as unidades
  criado_em timestamptz not null default now()
);
create unique index usuario_papel_uk on usuario_papel (usuario_id, papel, coalesce(area_codigo,'*'), coalesce(unidade_id,0));

-- ---------------------------------------------------------------------
-- Configuração geral (chave/valor versionada pela auditoria)
-- ---------------------------------------------------------------------
create table configuracao (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  homologado boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id)
);

-- ---------------------------------------------------------------------
-- Calendário oficial (dias úteis / feriados)
-- ---------------------------------------------------------------------
create table calendario_feriado (
  id serial primary key,
  data date not null,
  descricao text not null,
  abrangencia text not null default 'NACIONAL' check (abrangencia in ('NACIONAL','ESTADUAL','MUNICIPAL','EMPRESA')),
  unidade_id int references unidade(id),
  meio_periodo boolean not null default false
);
create unique index calendario_feriado_uk on calendario_feriado (data, coalesce(unidade_id,0));

-- ---------------------------------------------------------------------
-- Fechamento mensal por área
-- ---------------------------------------------------------------------
create table periodo_area (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  area_codigo text not null references area(codigo),
  status text not null default 'RASCUNHO'
    check (status in ('RASCUNHO','EM_PREENCHIMENTO','EM_VALIDACAO','APROVADO','FECHADO')),
  versao int not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  unique (competencia, area_codigo)
);

create table periodo_evento (
  id bigserial primary key,
  periodo_area_id int not null references periodo_area(id),
  de_status text,
  para_status text not null,
  acao text not null,
  justificativa text,
  usuario_id uuid references usuario(id),
  em timestamptz not null default now(),
  detalhes jsonb
);

-- Declarações do gestor para distinguir "zero confirmado" de "não informado"
create table declaracao_periodo (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  area_codigo text not null references area(codigo),
  chave text not null,
  valor boolean not null,
  observacao text,
  declarado_por uuid references usuario(id),
  declarado_em timestamptz not null default now(),
  unique (competencia, area_codigo, chave)
);

-- Garante que dados de uma competência/área só mudem com período aberto.
create or replace function assert_periodo_aberto(p_area text, p_comp date) returns void
language plpgsql as $$
declare v_status text;
begin
  if p_comp is null then return; end if;
  select status into v_status from periodo_area
   where area_codigo = p_area and competencia = date_trunc('month', p_comp)::date;
  if v_status in ('APROVADO','FECHADO') then
    raise exception 'Período % da área % está %: reabra o período com justificativa para alterar dados.',
      to_char(p_comp,'MM/YYYY'), p_area, v_status
      using errcode = 'P0001', hint = 'PERIODO_BLOQUEADO';
  end if;
end $$;

-- Trigger genérico: a área é passada como argumento; a competência vem da coluna "competencia".
create or replace function trg_bloqueio_periodo() returns trigger
language plpgsql as $$
declare v_area text := tg_argv[0];
begin
  if current_setting('app.ignorar_bloqueio', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE','DELETE') then
    perform assert_periodo_aberto(v_area, old.competencia);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform assert_periodo_aberto(v_area, new.competencia);
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Auditoria (append-only)
-- ---------------------------------------------------------------------
create table auditoria (
  id bigserial primary key,
  tabela text not null,
  registro_id text,
  operacao text not null,
  usuario_id uuid,
  em timestamptz not null default now(),
  antes jsonb,
  depois jsonb,
  contexto jsonb
);
create index auditoria_tabela_idx on auditoria (tabela, registro_id);
create index auditoria_em_idx on auditoria (em desc);

create or replace function trg_auditoria_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'A trilha de auditoria é somente inclusão.';
end $$;
create trigger auditoria_imutavel before update or delete on auditoria
  for each row execute function trg_auditoria_imutavel();

-- Colunas nunca gravadas na auditoria (segredos e binários)
create or replace function auditoria_limpar(j jsonb) returns jsonb
language sql immutable as $$
  select case when j is null then null
    else j - 'senha_hash' - 'conteudo' - 'email' - 'email_tecnico' - 'email_solicitante'
           - 'ip_abertura' - 'ramal' - 'fechado_por_email' - 'escalado_por_email' end
$$;

create or replace function trg_auditoria() returns trigger
language plpgsql as $$
declare v_id text;
begin
  v_id := coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'), (to_jsonb(new)->>'chave'), (to_jsonb(old)->>'chave'));
  insert into auditoria (tabela, registro_id, operacao, usuario_id, antes, depois, contexto)
  values (tg_table_name, v_id, tg_op, app_usuario_id(),
          case when tg_op in ('UPDATE','DELETE') then auditoria_limpar(to_jsonb(old)) end,
          case when tg_op in ('INSERT','UPDATE') then auditoria_limpar(to_jsonb(new)) end,
          nullif(current_setting('app.contexto', true), '')::jsonb);
  return coalesce(new, old);
end $$;

create trigger usuario_aud after insert or update or delete on usuario for each row execute function trg_auditoria();
create trigger usuario_papel_aud after insert or update or delete on usuario_papel for each row execute function trg_auditoria();
create trigger configuracao_aud after insert or update or delete on configuracao for each row execute function trg_auditoria();
create trigger calendario_aud after insert or update or delete on calendario_feriado for each row execute function trg_auditoria();
create trigger periodo_area_aud after insert or update or delete on periodo_area for each row execute function trg_auditoria();
create trigger declaracao_aud after insert or update or delete on declaracao_periodo for each row execute function trg_auditoria();
create trigger unidade_aud after insert or update or delete on unidade for each row execute function trg_auditoria();

-- ---------------------------------------------------------------------
-- Arquivos (anexos, logotipo, relatórios gerados, planilhas importadas)
-- ---------------------------------------------------------------------
create table arquivo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  mime text not null,
  tamanho int not null check (tamanho >= 0),
  sha256 text not null,
  conteudo bytea not null,
  categoria text not null check (categoria in ('ANEXO','LOGOTIPO','RELATORIO','IMPORTACAO')),
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now()
);

create table anexo (
  id serial primary key,
  entidade text not null,
  entidade_id text not null,
  arquivo_id uuid not null references arquivo(id),
  descricao text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz
);
create index anexo_entidade_idx on anexo (entidade, entidade_id);
create trigger anexo_aud after insert or update or delete on anexo for each row execute function trg_auditoria();

-- Registro de eventos de sistema auditáveis que não são linhas de tabela (exportações, logins, etc.)
create table evento_sistema (
  id bigserial primary key,
  tipo text not null,
  usuario_id uuid references usuario(id),
  em timestamptz not null default now(),
  detalhes jsonb
);
create trigger evento_sistema_imutavel before update or delete on evento_sistema
  for each row execute function trg_auditoria_imutavel();

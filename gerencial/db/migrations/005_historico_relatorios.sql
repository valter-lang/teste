-- =====================================================================
-- 005 — Migração histórica, reconciliação e central de relatórios
-- =====================================================================

create table importacao (
  id serial primary key,
  arquivo_id uuid references arquivo(id),
  arquivo_nome text not null,
  arquivo_sha256 text not null,
  status text not null default 'ANALISADA' check (status in ('ANALISADA','GRAVADA','HOMOLOGADA','DESCARTADA')),
  resumo jsonb,
  reconciliacao jsonb,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  gravado_por uuid references usuario(id),
  gravado_em timestamptz,
  homologado_por uuid references usuario(id),
  homologado_em timestamptz,
  observacao_homologacao text,
  check (status <> 'HOMOLOGADA' or homologado_por is not null)
);
create trigger importacao_aud after insert or update or delete on importacao for each row execute function trg_auditoria();

create table importacao_pendencia (
  id serial primary key,
  importacao_id int not null references importacao(id) on delete cascade,
  aba text not null,
  celula text,
  tipo text not null check (tipo in ('SEM_MAPEAMENTO','VALOR_INVALIDO','FORMULA_INVALIDA','DUPLICIDADE','TOTAL_INCOMPATIVEL','DADO_TESTE','CONCILIACAO','DIVERGENCIA_FONTE','INFORMATIVO')),
  descricao text not null,
  valor_bruto jsonb,
  resolvida boolean not null default false,
  resolucao text,
  resolvido_por uuid references usuario(id),
  resolvido_em timestamptz
);
create trigger importacao_pendencia_aud after insert or update or delete on importacao_pendencia for each row execute function trg_auditoria();

-- Séries mensais consolidadas vindas da planilha (a planilha só possui totais mensais
-- para a maioria das áreas). Usadas pelos calculadores para competências anteriores
-- à data de corte da migração (configuracao 'migracao.data_corte').
create table historico_agregado (
  id serial primary key,
  importacao_id int not null references importacao(id),
  area_codigo text not null references area(codigo),
  serie text not null,
  dimensao_tipo text,        -- FAMILIA_EQUIP, TECNICO, REDE, CLIENTE, FAMILIA_PECA, STATUS
  dimensao_valor text,
  dimensao_id int,
  competencia date not null check (competencia_valida(competencia)),
  valor numeric(18,4) not null,
  aba text not null,
  celula text not null,
  criado_em timestamptz not null default now()
);
create unique index historico_agregado_uk on historico_agregado (serie, coalesce(dimensao_valor,''), competencia);
create index historico_agregado_serie_idx on historico_agregado (serie, competencia);

-- Registros detalhados históricos sem chave de negócio completa (ex.: chamados desnecessários
-- listados por cliente sem número de chamado). Preservados para consulta e reconciliação.
create table historico_detalhe (
  id serial primary key,
  importacao_id int not null references importacao(id),
  area_codigo text not null references area(codigo),
  tipo text not null,
  competencia date not null check (competencia_valida(competencia)),
  dados jsonb not null,
  aba text not null,
  faixa text not null
);
create index historico_detalhe_idx on historico_detalhe (tipo, competencia);

-- ---------------------------------------------------------------------
-- Central de relatórios (fila assíncrona + versões)
-- ---------------------------------------------------------------------
create table relatorio_job (
  id serial primary key,
  formato text not null check (formato in ('XLSX','PDF_A4','PDF_APRESENTACAO','PPTX')),
  modo text not null check (modo in ('EXECUTIVO','COMPLETO')),
  escopo text not null check (escopo in ('CONSOLIDADO','COMODATO_MANUTENCAO','TI')),
  competencia date not null check (competencia_valida(competencia)),
  unidades int[],
  filtros jsonb not null default '{}'::jsonb,
  status text not null default 'NA_FILA' check (status in ('NA_FILA','PROCESSANDO','CONCLUIDO','ERRO')),
  progresso int not null default 0 check (progresso between 0 and 100),
  etapa text,
  mensagem_erro text,
  versao int,
  situacao_fechamento text check (situacao_fechamento in ('OFICIAL','PRELIMINAR')),
  arquivo_nome text,
  arquivo_id uuid references arquivo(id),
  hash_dados text,
  solicitado_por uuid not null references usuario(id),
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  tentativas int not null default 0
);
create index relatorio_job_status_idx on relatorio_job (status, solicitado_em);
create unique index relatorio_job_versao_uk on relatorio_job (formato, escopo, modo, competencia, versao) where versao is not null;
create trigger relatorio_job_aud after insert or update on relatorio_job for each row execute function trg_auditoria();

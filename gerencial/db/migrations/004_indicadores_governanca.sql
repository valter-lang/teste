-- =====================================================================
-- 004 — Indicadores, metas versionadas, resultados, análises e planos de ação
-- =====================================================================

create table indicador_definicao (
  id serial primary key,
  codigo text not null check (codigo ~ '^[A-Z0-9_]+$'),
  versao int not null default 1,
  nome text not null,
  area_codigo text not null references area(codigo),
  descricao text not null,
  unidade_medida text not null,              -- '%', 'qtd', 'h', 'R$', 'kg/equip', 'por 100 equip', 'meses', 'nota'
  formula text not null,
  origem_dados text not null,
  numerador text,
  denominador text,
  periodicidade text not null default 'MENSAL' check (periodicidade in ('MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  direcao text not null check (direcao in ('MAIOR_MELHOR','MENOR_MELHOR','FAIXA','INFORMATIVO')),
  consolidacao text not null check (consolidacao in ('FOTOGRAFIA','SOMA','MEDIA_SIMPLES','MEDIA_PONDERADA','ULTIMO_VALOR','TAXA_CONTAGEM')),
  responsavel text,
  fonte_regra text not null,                  -- documento que originou a regra
  classe text not null check (classe in ('ESSENCIAL','COMPLEMENTAR','CANDIDATO','OPERACIONAL')),
  ativo boolean not null default true,
  vigencia_inicio date not null,
  vigencia_fim date,
  casas_decimais int not null default 1 check (casas_decimais between 0 and 4),
  politica_denominador_zero text not null default 'NA' check (politica_denominador_zero in ('NA','ZERO')),
  calculador text not null,                   -- chave do calculador no motor (código versionado)
  homologado boolean not null default false,
  homologado_por uuid references usuario(id),
  homologado_em timestamptz,
  pendencias text,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  unique (codigo, versao),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create table meta (
  id serial primary key,
  indicador_codigo text not null,
  versao int not null,
  ciclo text not null check (ciclo in ('MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  tipo text not null check (tipo in ('ABSOLUTA','LINHA_BASE_MAIS','PERCENTUAL_SOBRE_LINHA_BASE','VARIACAO_PERIODO_ANTERIOR','TENDENCIA_QUEDA','CONTAGEM_MINIMA')),
  operador text not null check (operador in ('>=','<=','=','ENTRE')),
  valor numeric(16,4),                        -- nulo = pendente de homologação (sem meta)
  valor_max numeric(16,4),                    -- para faixa
  linha_base numeric(16,4),
  linha_base_competencia date,
  tolerancia_pct numeric(6,3) not null default 5,
  vigencia_inicio date not null,
  vigencia_fim date,
  status text not null default 'PROPOSTA' check (status in ('PROPOSTA','APROVADA','SUBSTITUIDA','REJEITADA')),
  fonte_documento text not null,
  motivo text not null,
  excecao_ciclo boolean not null default false,
  justificativa_excecao text,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  aprovado_por uuid references usuario(id),
  aprovado_em timestamptz,
  unique (indicador_codigo, ciclo, versao),
  check (operador <> 'ENTRE' or (valor is not null and valor_max is not null and valor_max >= valor)),
  check (status <> 'APROVADA' or aprovado_por is not null or fonte_documento like 'SEED:%'),
  check (not excecao_ciclo or coalesce(trim(justificativa_excecao),'') <> '')
);

-- Metas trimestrais/semestrais só mudam na virada do ciclo, salvo exceção aprovada e auditada.
create or replace function trg_meta_ciclo() returns trigger
language plpgsql as $$
declare
  v_inicio_ciclo date;
begin
  if new.status = 'APROVADA' and new.ciclo in ('TRIMESTRAL','SEMESTRAL') then
    if new.ciclo = 'TRIMESTRAL' then
      v_inicio_ciclo := date_trunc('quarter', new.vigencia_inicio)::date;
    else
      v_inicio_ciclo := make_date(extract(year from new.vigencia_inicio)::int,
                                  case when extract(month from new.vigencia_inicio) <= 6 then 1 else 7 end, 1);
    end if;
    if new.vigencia_inicio <> v_inicio_ciclo and not new.excecao_ciclo then
      raise exception 'Meta % só pode entrar em vigor na virada do ciclo (%). Registre exceção aprovada com justificativa.',
        new.ciclo, to_char(v_inicio_ciclo, 'DD/MM/YYYY') using hint = 'META_FORA_DO_CICLO';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'APROVADA' and new.status = 'APROVADA'
     and (old.valor is distinct from new.valor or old.valor_max is distinct from new.valor_max
          or old.operador is distinct from new.operador or old.vigencia_inicio is distinct from new.vigencia_inicio) then
    raise exception 'Meta aprovada não pode ser editada: crie nova versão.' using hint = 'META_IMUTAVEL';
  end if;
  return new;
end $$;
create trigger meta_ciclo before insert or update on meta for each row execute function trg_meta_ciclo();

-- Resultados calculados (cache seguro e reproduzível)
create table indicador_resultado (
  id bigserial primary key,
  indicador_codigo text not null,
  definicao_id int not null references indicador_definicao(id),
  escopo text not null check (escopo in ('MES','TRIMESTRE','SEMESTRE','ANO')),
  periodo_inicio date not null,
  periodo_fim date not null,
  unidade_id int references unidade(id),
  valor numeric(18,6),
  numerador numeric(18,6),
  denominador numeric(18,6),
  situacao_dado text not null check (situacao_dado in ('OK','NAO_INFORMADO','NAO_APLICAVEL')),
  motivo text,
  meta_id int references meta(id),
  meta_descricao text,
  status text not null check (status in ('VERDE','AMARELO','VERMELHO','SEM_META','NA')),
  valor_anterior numeric(18,6),
  variacao_abs numeric(18,6),
  variacao_pct numeric(18,6),
  fonte text not null check (fonte in ('EVENTOS','HISTORICO','MISTO','NENHUMA')),
  memoria jsonb not null,
  hash text not null,
  calculado_em timestamptz not null default now(),
  calculado_por uuid references usuario(id)
);
create unique index indicador_resultado_uk on indicador_resultado
  (indicador_codigo, escopo, periodo_inicio, coalesce(unidade_id, 0));

-- ---------------------------------------------------------------------
-- Análises executivas estruturadas
-- ---------------------------------------------------------------------
create table analise_item (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  area_codigo text not null references area(codigo),
  tipo text not null check (tipo in ('DESTAQUE','ATENCAO','RISCO','DEPENDENCIA','EXPLICACAO_DESVIO','DECISAO_SOLICITADA')),
  fato text not null,
  numero text,
  indicador_codigo text,
  ocorrencia text,
  responsavel text not null,
  area_dependente text references area(codigo),
  ordem int not null default 0,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  versao int not null default 1,
  check (tipo <> 'DESTAQUE' or coalesce(trim(numero),'') <> ''),
  check (tipo <> 'ATENCAO' or indicador_codigo is not null or coalesce(trim(ocorrencia),'') <> ''),
  check (tipo <> 'DEPENDENCIA' or area_dependente is not null)
);

create or replace function trg_analise_limite() returns trigger
language plpgsql as $$
declare n int;
begin
  if new.tipo in ('DESTAQUE','ATENCAO') and new.excluido_em is null then
    select count(*) into n from analise_item
     where competencia = new.competencia and area_codigo = new.area_codigo and tipo = new.tipo
       and excluido_em is null and id <> coalesce(new.id, -1);
    if n >= 3 then
      raise exception 'Limite de 3 itens do tipo % por área e competência.', new.tipo using hint = 'LIMITE_ANALISE';
    end if;
  end if;
  return new;
end $$;
create trigger analise_limite before insert or update on analise_item for each row execute function trg_analise_limite();

-- Bloqueio de período para tabelas cuja área é uma coluna (area_codigo)
create or replace function trg_bloqueio_periodo_area_coluna() returns trigger
language plpgsql as $$
begin
  if current_setting('app.ignorar_bloqueio', true) = 'on' then return coalesce(new, old); end if;
  if tg_op in ('UPDATE','DELETE') then perform assert_periodo_aberto(old.area_codigo, old.competencia); end if;
  if tg_op in ('INSERT','UPDATE') then perform assert_periodo_aberto(new.area_codigo, new.competencia); end if;
  return coalesce(new, old);
end $$;

create trigger analise_bloqueio before insert or update or delete on analise_item
  for each row execute function trg_bloqueio_periodo_area_coluna();
create trigger analise_aud after insert or update or delete on analise_item for each row execute function trg_auditoria();
create trigger declaracao_bloqueio before insert or update or delete on declaracao_periodo
  for each row execute function trg_bloqueio_periodo_area_coluna();

-- ---------------------------------------------------------------------
-- Planos de ação
-- ---------------------------------------------------------------------
create sequence plano_acao_seq;
create table plano_acao (
  id serial primary key,
  codigo text not null unique default ('PA-' || lpad(nextval('plano_acao_seq')::text, 5, '0')),
  area_codigo text not null references area(codigo),
  indicador_codigo text,
  competencia_origem date check (competencia_origem is null or competencia_valida(competencia_origem)),
  ocorrencia text,
  cliente_id int references cliente(id),
  causa_raiz text not null,
  acao text not null,
  entregavel text not null,
  responsavel_nome text not null,
  responsavel_id uuid references usuario(id),
  inicio date not null,
  prazo date not null,
  status text not null default 'ABERTA'
    check (status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA','ENCERRADA','CANCELADA')),
  criticidade text not null default 'MEDIA' check (criticidade in ('ALTA','MEDIA','BAIXA')),
  resultado_esperado text not null,
  evidencia text,
  avaliacao_eficacia text,
  eficacia text check (eficacia in ('EFICAZ','NAO_EFICAZ')),
  tipo_encerramento text check (tipo_encerramento in ('META_ATINGIDA','APROVACAO_DIRETORIA')),
  encerramento_aprovado_por uuid references usuario(id),
  encerrado_em timestamptz,
  gerado_automaticamente boolean not null default false,
  criado_por uuid references usuario(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references usuario(id),
  atualizado_em timestamptz not null default now(),
  versao int not null default 1,
  check (prazo >= inicio),
  check (indicador_codigo is not null or coalesce(trim(ocorrencia),'') <> ''),
  check (status <> 'ENCERRADA' or (coalesce(trim(evidencia),'') <> '' and tipo_encerramento is not null)),
  check (tipo_encerramento is distinct from 'APROVACAO_DIRETORIA' or encerramento_aprovado_por is not null)
);
create trigger plano_acao_aud after insert or update or delete on plano_acao for each row execute function trg_auditoria();

create table plano_acao_andamento (
  id serial primary key,
  plano_id int not null references plano_acao(id),
  texto text not null,
  status_novo text,
  usuario_id uuid references usuario(id),
  em timestamptz not null default now()
);
create trigger plano_acao_andamento_aud after insert or update or delete on plano_acao_andamento for each row execute function trg_auditoria();

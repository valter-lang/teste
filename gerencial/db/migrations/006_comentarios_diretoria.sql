-- =====================================================================
-- 006 — Comentários da Diretoria sobre indicadores/áreas de uma competência
-- (separados das análises estruturadas dos gestores)
-- =====================================================================
create table comentario_diretoria (
  id serial primary key,
  competencia date not null check (competencia_valida(competencia)),
  area_codigo text references area(codigo),
  indicador_codigo text,
  texto text not null check (length(trim(texto)) >= 3),
  usuario_id uuid not null references usuario(id),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz
);
create index comentario_diretoria_idx on comentario_diretoria (competencia, area_codigo);
create trigger comentario_diretoria_aud after insert or update or delete on comentario_diretoria for each row execute function trg_auditoria();

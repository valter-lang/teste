-- =====================================================================
-- 007 — Ajustes de integridade e rastreabilidade de exclusões
-- =====================================================================

-- Chave de negócio de backup não pode ser bloqueada por registro excluído
alter table ti_backup_execucao drop constraint if exists ti_backup_execucao_data_rotina_key;
create unique index ti_backup_execucao_uk on ti_backup_execucao (data, rotina) where excluido_em is null;

-- Unicidade que antes era só verificada na aplicação
create unique index equipamento_serial_uk on equipamento (upper(serial)) where serial is not null;
create unique index local_estoque_nome_uk on local_estoque (upper(nome), coalesce(unidade_id, 0));

-- Quem excluiu, por quê, e última alteração: padroniza as tabelas que não tinham essas colunas
do $$
declare t text;
begin
  foreach t in array array['comodato_base_ativa','comodato_consumo','ti_indisponibilidade','ti_backup_execucao',
    'ti_teste_restauracao','ti_incidente_critico','ti_projeto','ti_marco'] loop
    execute format('alter table %I add column if not exists excluido_por uuid references usuario(id), add column if not exists motivo_exclusao text,
                    add column if not exists atualizado_por uuid references usuario(id), add column if not exists atualizado_em timestamptz not null default now()', t);
  end loop;
  foreach t in array array['manut_preventiva_plano','ti_janela_programada','ti_patch_ciclo','comodato_tentativa'] loop
    execute format('alter table %I add column if not exists excluido_em timestamptz, add column if not exists excluido_por uuid references usuario(id),
                    add column if not exists motivo_exclusao text', t);
  end loop;
end $$;

-- Desativação sem perda de histórico também para feriados e sinônimos
alter table calendario_feriado add column if not exists ativo boolean not null default true;
alter table familia_equipamento_alias add column if not exists ativo boolean not null default true;

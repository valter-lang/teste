# Dicionário de dados

Gerado por `scripts/gerar-docs.ts` a partir do esquema aplicado pelas migrations em `db/migrations/`.

## analise_item

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('analise_item_id_seq'::regclass) |
| competencia | date | não |  |
| area_codigo | text | não |  |
| tipo | text | não |  |
| fato | text | não |  |
| numero | text | sim |  |
| indicador_codigo | text | sim |  |
| ocorrencia | text | sim |  |
| responsavel | text | não |  |
| area_dependente | text | sim |  |
| ordem | integer | não | 0 |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((tipo <> 'DEPENDENCIA'::text) OR (area_dependente IS NOT NULL)))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((tipo = ANY (ARRAY['DESTAQUE'::text, 'ATENCAO'::text, 'RISCO'::text, 'DEPENDENCIA'::text, 'EXPLICACAO_DESVIO'::text, 'DECISAO_SOLICITADA'::text])))`
- `CHECK (((tipo <> 'DESTAQUE'::text) OR (COALESCE(TRIM(BOTH FROM numero), ''::text) <> ''::text)))`
- `CHECK (((tipo <> 'ATENCAO'::text) OR (indicador_codigo IS NOT NULL) OR (COALESCE(TRIM(BOTH FROM ocorrencia), ''::text) <> ''::text)))`

**Triggers:** analise_aud, analise_bloqueio, analise_limite

## anexo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('anexo_id_seq'::regclass) |
| entidade | text | não |  |
| entidade_id | text | não |  |
| arquivo_id | uuid | não |  |
| descricao | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |

**Triggers:** anexo_aud

## area

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| codigo | text | não |  |
| nome | text | não |  |
| obrigatoria_fechamento | boolean | não | true |
| ordem | integer | não | 0 |

**Regras (CHECK):**

- `CHECK ((codigo ~ '^[A-Z_]+$'::text))`

## arquivo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não | gen_random_uuid() |
| nome | text | não |  |
| mime | text | não |  |
| tamanho | integer | não |  |
| sha256 | text | não |  |
| conteudo | bytea | não |  |
| categoria | text | não |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK ((categoria = ANY (ARRAY['ANEXO'::text, 'LOGOTIPO'::text, 'RELATORIO'::text, 'IMPORTACAO'::text])))`
- `CHECK ((tamanho >= 0))`

## auditoria

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | bigint | não | nextval('auditoria_id_seq'::regclass) |
| tabela | text | não |  |
| registro_id | text | sim |  |
| operacao | text | não |  |
| usuario_id | uuid | sim |  |
| em | timestamp with time zone | não | now() |
| antes | jsonb | sim |  |
| depois | jsonb | sim |  |
| contexto | jsonb | sim |  |

**Triggers:** auditoria_imutavel

## calendario_feriado

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('calendario_feriado_id_seq'::regclass) |
| data | date | não |  |
| descricao | text | não |  |
| abrangencia | text | não | 'NACIONAL'::text |
| unidade_id | integer | sim |  |
| meio_periodo | boolean | não | false |

**Regras (CHECK):**

- `CHECK ((abrangencia = ANY (ARRAY['NACIONAL'::text, 'ESTADUAL'::text, 'MUNICIPAL'::text, 'EMPRESA'::text])))`

**Triggers:** calendario_aud

## chamado_externo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('chamado_externo_id_seq'::regclass) |
| numero | text | não |  |
| competencia | date | não |  |
| aberto_em | timestamp with time zone | não |  |
| primeira_resposta_em | timestamp with time zone | sim |  |
| atendido_em | timestamp with time zone | sim |  |
| encerrado_em | timestamp with time zone | sim |  |
| cliente_id | integer | sim |  |
| unidade_id | integer | sim |  |
| solicitante | text | sim |  |
| familia_id | integer | sim |  |
| modelo_id | integer | sim |  |
| equipamento_id | integer | sim |  |
| identificador | text | sim |  |
| equipamento_do_cliente | boolean | não | false |
| tecnico_id | integer | sim |  |
| causa | text | sim |  |
| solucao | text | sim |  |
| tipo_atendimento | text | não | 'CORRETIVA'::text |
| status | text | não | 'ABERTO'::text |
| necessario | boolean | sim |  |
| motivo_desnecessario | text | sim |  |
| justificativa_desnecessario | text | sim |  |
| resolvido_primeira_visita | boolean | sim |  |
| chamado_anterior_id | integer | sim |  |
| equipamento_parado | boolean | não | false |
| criticidade | text | sim |  |
| reserva_disponibilizada | boolean | sim |  |
| elegivel_sla | boolean | não | true |
| motivo_inelegivel_sla | text | sim |  |
| valor_cobrado | numeric | sim |  |
| observacao | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((necessario IS DISTINCT FROM false) OR (COALESCE(TRIM(BOTH FROM justificativa_desnecessario), ''::text) <> ''::text)))`
- `CHECK ((tipo_atendimento = ANY (ARRAY['CORRETIVA'::text, 'PREVENTIVA'::text, 'INSTALACAO'::text, 'RETIRADA'::text, 'VISTORIA'::text, 'OUTRO'::text])))`
- `CHECK ((status = ANY (ARRAY['ABERTO'::text, 'EM_ATENDIMENTO'::text, 'ENCERRADO'::text, 'CANCELADO'::text])))`
- `CHECK ((motivo_desnecessario = ANY (ARRAY['ELETRICA_CLIENTE'::text, 'SEM_DEFEITO'::text, 'INFRAESTRUTURA_CLIENTE'::text, 'DESLIGADO'::text, 'OPERACAO_INCORRETA'::text, 'OUTRO'::text])))`
- `CHECK ((criticidade = ANY (ARRAY['P1'::text, 'P2'::text, 'P3'::text])))`
- `CHECK ((valor_cobrado >= (0)::numeric))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK (((primeira_resposta_em IS NULL) OR (primeira_resposta_em >= aberto_em)))`
- `CHECK (((encerrado_em IS NULL) OR (encerrado_em >= COALESCE(primeira_resposta_em, aberto_em))))`
- `CHECK (((atendido_em IS NULL) OR (atendido_em >= aberto_em)))`
- `CHECK ((elegivel_sla OR (COALESCE(TRIM(BOTH FROM motivo_inelegivel_sla), ''::text) <> ''::text)))`
- `CHECK (((chamado_anterior_id IS NULL) OR (chamado_anterior_id <> id)))`
- `CHECK (((equipamento_parado = false) OR (criticidade = 'P1'::text)))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** chamado_externo_aud, chamado_externo_bloqueio

## chamado_ti

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('chamado_ti_id_seq'::regclass) |
| numero | text | não |  |
| sistema_origem | text | não | 'TI'::text |
| competencia | date | não |  |
| titulo | text | sim |  |
| status | text | não |  |
| status_normalizado | text | não |  |
| tipo | text | sim |  |
| prioridade | text | sim |  |
| origem_canal | text | sim |  |
| nivel_suporte | text | sim |  |
| categoria | text | sim |  |
| subcategoria | text | sim |  |
| equipe | text | sim |  |
| tecnico_responsavel | text | sim |  |
| solicitante | text | sim |  |
| departamento | text | sim |  |
| unidade_texto | text | sim |  |
| aberto_em | timestamp with time zone | não |  |
| sla_prazo | timestamp with time zone | sim |  |
| sla_violado | boolean | sim |  |
| sla_violado_em | timestamp with time zone | sim |  |
| sla_horas_pausadas | numeric | sim |  |
| sla_desvio_h | numeric | sim |  |
| solucao | text | sim |  |
| causa_raiz | text | sim |  |
| motivo_cancelamento | text | sim |  |
| fechado_em | timestamp with time zone | sim |  |
| tempo_resolucao_origem_h | numeric | sim |  |
| escalado_em | timestamp with time zone | sim |  |
| csat_nota | numeric | sim |  |
| csat_comentario | text | sim |  |
| csat_respondido_em | timestamp with time zone | sim |  |
| tags | ARRAY | sim |  |
| ultima_atualizacao_em | timestamp with time zone | sim |  |
| resolvido_primeiro_contato | boolean | sim |  |
| chamado_anterior_id | integer | sim |  |
| elegivel_sla | boolean | não | true |
| motivo_inelegivel_sla | text | sim |  |
| dado_teste | boolean | não | false |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((csat_nota >= (0)::numeric) AND (csat_nota <= (5)::numeric)))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK (((fechado_em IS NULL) OR (fechado_em >= aberto_em)))`
- `CHECK ((elegivel_sla OR (COALESCE(TRIM(BOTH FROM motivo_inelegivel_sla), ''::text) <> ''::text)))`
- `CHECK ((sistema_origem = ANY (ARRAY['TI'::text, 'LINEAR'::text, 'OUTRO'::text])))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((sla_horas_pausadas >= (0)::numeric))`
- `CHECK ((status_normalizado = ANY (ARRAY['ABERTO'::text, 'EM_ATENDIMENTO'::text, 'AGUARDANDO'::text, 'ESCALADO'::text, 'RESOLVIDO'::text, 'CANCELADO'::text])))`

**Triggers:** chamado_ti_aud, chamado_ti_bloqueio

## chamado_ti_restrito

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| chamado_id | integer | não |  |
| email_tecnico | text | sim |  |
| email_solicitante | text | sim |  |
| ramal | text | sim |  |
| ip_abertura | text | sim |  |
| fechado_por_email | text | sim |  |
| escalado_por_email | text | sim |  |

**Triggers:** chamado_ti_restrito_aud

## cliente

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('cliente_id_seq'::regclass) |
| codigo_externo | text | sim |  |
| fantasia | text | não |  |
| razao_social | text | sim |  |
| rede_id | integer | sim |  |
| unidade_id | integer | sim |  |
| cidade | text | sim |  |
| uf | character | sim |  |
| ativo | boolean | não | true |
| valido_ate | date | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Triggers:** cliente_aud

## comentario_diretoria

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comentario_diretoria_id_seq'::regclass) |
| competencia | date | não |  |
| area_codigo | text | sim |  |
| indicador_codigo | text | sim |  |
| texto | text | não |  |
| usuario_id | uuid | não |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK ((length(TRIM(BOTH FROM texto)) >= 3))`

**Triggers:** comentario_diretoria_aud

## comodato_base_ativa

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comodato_base_ativa_id_seq'::regclass) |
| competencia | date | não |  |
| equipamentos_ativos | integer | não |  |
| clientes_ativos | integer | sim |  |
| instalacoes | integer | sim |  |
| retiradas | integer | sim |  |
| origem | text | não | 'MANUAL'::text |
| evidencia | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((equipamentos_ativos >= 0))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK ((retiradas >= 0))`
- `CHECK ((instalacoes >= 0))`
- `CHECK ((clientes_ativos >= 0))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** comodato_base_ativa_aud, comodato_base_ativa_bloqueio

## comodato_consumo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comodato_consumo_id_seq'::regclass) |
| competencia | date | não |  |
| cliente_id | integer | sim |  |
| kg_comprados | numeric | não |  |
| consumo_minimo_kg | numeric | sim |  |
| aplicavel_minimo | boolean | não | true |
| origem | text | não | 'MANUAL'::text |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK ((consumo_minimo_kg >= (0)::numeric))`
- `CHECK ((kg_comprados >= (0)::numeric))`

**Triggers:** comodato_consumo_aud, comodato_consumo_bloqueio

## comodato_movimento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comodato_movimento_id_seq'::regclass) |
| competencia | date | não |  |
| solicitacao_numero | text | sim |  |
| cliente_id | integer | sim |  |
| cliente_texto | text | sim |  |
| familia_id | integer | sim |  |
| equipamento_id | integer | sim |  |
| tipo | text | não |  |
| campanha_fim_ano | boolean | não | false |
| data_solicitacao | date | não |  |
| data_agendamento | date | sim |  |
| data_conclusao | date | sim |  |
| situacao | text | não | 'SOLICITADO'::text |
| motivo_insucesso | text | sim |  |
| responsavel | text | sim |  |
| observacao | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((data_conclusao IS NULL) OR (data_conclusao >= data_solicitacao)))`
- `CHECK (((situacao <> 'CONCLUIDO'::text) OR (data_conclusao IS NOT NULL)))`
- `CHECK (((cliente_id IS NOT NULL) OR (COALESCE(TRIM(BOTH FROM cliente_texto), ''::text) <> ''::text)))`
- `CHECK (((situacao <> 'SEM_EXITO'::text) OR (COALESCE(TRIM(BOTH FROM motivo_insucesso), ''::text) <> ''::text)))`
- `CHECK ((tipo = ANY (ARRAY['ENTREGA'::text, 'TROCA'::text, 'RETIRADA'::text])))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((situacao = ANY (ARRAY['SOLICITADO'::text, 'AGENDADO'::text, 'CONCLUIDO'::text, 'SEM_EXITO'::text, 'CANCELADO'::text])))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK (((data_agendamento IS NULL) OR (data_agendamento >= data_solicitacao)))`

**Triggers:** comodato_movimento_aud, comodato_movimento_bloqueio

## comodato_posicao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comodato_posicao_id_seq'::regclass) |
| competencia | date | não |  |
| produto | text | não |  |
| familia_id | integer | sim |  |
| unidade_id | integer | sim |  |
| posicao_anterior | integer | não |  |
| entradas | integer | não | 0 |
| saidas_novos | integer | não | 0 |
| saidas_usados | integer | não | 0 |
| novos | integer | não |  |
| usados | integer | não |  |
| manutencao_interna | integer | sim |  |
| sucata | integer | sim |  |
| custo_total_novos | numeric | sim |  |
| custo_total_usados | numeric | sim |  |
| ajuste | integer | não | 0 |
| justificativa_ajuste | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((usados >= 0))`
- `CHECK ((custo_total_novos >= (0)::numeric))`
- `CHECK ((custo_total_usados >= (0)::numeric))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK ((((((posicao_anterior + entradas) - saidas_novos) - saidas_usados) + ajuste) = (novos + usados)))`
- `CHECK (((ajuste = 0) OR (COALESCE(TRIM(BOTH FROM justificativa_ajuste), ''::text) <> ''::text)))`
- `CHECK ((sucata >= 0))`
- `CHECK ((entradas >= 0))`
- `CHECK ((saidas_novos >= 0))`
- `CHECK ((saidas_usados >= 0))`
- `CHECK ((novos >= 0))`
- `CHECK ((manutencao_interna >= 0))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((posicao_anterior >= 0))`

**Triggers:** comodato_posicao_aud, comodato_posicao_bloqueio

## comodato_tentativa

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('comodato_tentativa_id_seq'::regclass) |
| movimento_id | integer | não |  |
| competencia | date | não |  |
| numero | integer | não |  |
| data | date | não |  |
| sucesso | boolean | não |  |
| motivo_insucesso | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK ((numero >= 1))`
- `CHECK ((sucesso OR (COALESCE(TRIM(BOTH FROM motivo_insucesso), ''::text) <> ''::text)))`

**Triggers:** comodato_tentativa_aud, comodato_tentativa_bloqueio

## configuracao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| chave | text | não |  |
| valor | jsonb | não |  |
| descricao | text | sim |  |
| homologado | boolean | não | false |
| atualizado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |

**Triggers:** configuracao_aud

## contrato_comodato

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('contrato_comodato_id_seq'::regclass) |
| cliente_id | integer | não |  |
| numero | text | sim |  |
| inicio | date | sim |  |
| fim | date | sim |  |
| consumo_minimo_kg_mes | numeric | sim |  |
| ativo | boolean | não | true |

**Regras (CHECK):**

- `CHECK ((consumo_minimo_kg_mes >= (0)::numeric))`

**Triggers:** contrato_comodato_aud

## declaracao_periodo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('declaracao_periodo_id_seq'::regclass) |
| competencia | date | não |  |
| area_codigo | text | não |  |
| chave | text | não |  |
| valor | boolean | não |  |
| observacao | text | sim |  |
| declarado_por | uuid | sim |  |
| declarado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`

**Triggers:** declaracao_aud, declaracao_bloqueio

## empresa

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('empresa_id_seq'::regclass) |
| nome | text | não |  |
| ativo | boolean | não | true |

## equipamento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('equipamento_id_seq'::regclass) |
| familia_id | integer | não |  |
| modelo_id | integer | sim |  |
| patrimonio | text | sim |  |
| serial | text | sim |  |
| linha | text | sim |  |
| situacao | text | não | 'ESTOQUE'::text |
| cliente_id | integer | sim |  |
| ultima_movimentacao_em | date | sim |  |
| entrada_estoque_em | date | sim |  |
| ativo | boolean | não | true |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK ((linha = ANY (ARRAY['PADRAO'::text, 'STAR'::text])))`
- `CHECK ((situacao = ANY (ARRAY['EM_CLIENTE'::text, 'ESTOQUE'::text, 'MANUTENCAO'::text, 'SUCATA'::text, 'BAIXADO'::text])))`

**Triggers:** equipamento_aud

## evento_sistema

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | bigint | não | nextval('evento_sistema_id_seq'::regclass) |
| tipo | text | não |  |
| usuario_id | uuid | sim |  |
| em | timestamp with time zone | não | now() |
| detalhes | jsonb | sim |  |

**Triggers:** evento_sistema_imutavel

## familia_equipamento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('familia_equipamento_id_seq'::regclass) |
| nome | text | não |  |
| ativo | boolean | não | true |
| ordem | integer | não | 0 |

**Triggers:** familia_equipamento_aud

## familia_equipamento_alias

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| alias | text | não |  |
| familia_id | integer | não |  |

**Triggers:** familia_equipamento_alias_aud

## familia_peca

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('familia_peca_id_seq'::regclass) |
| nome | text | não |  |
| classe_abc | character | sim |  |
| ativo | boolean | não | true |

**Regras (CHECK):**

- `CHECK ((classe_abc = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar])))`

**Triggers:** familia_peca_aud

## historico_agregado

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('historico_agregado_id_seq'::regclass) |
| importacao_id | integer | não |  |
| area_codigo | text | não |  |
| serie | text | não |  |
| dimensao_tipo | text | sim |  |
| dimensao_valor | text | sim |  |
| dimensao_id | integer | sim |  |
| competencia | date | não |  |
| valor | numeric | não |  |
| aba | text | não |  |
| celula | text | não |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`

## historico_detalhe

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('historico_detalhe_id_seq'::regclass) |
| importacao_id | integer | não |  |
| area_codigo | text | não |  |
| tipo | text | não |  |
| competencia | date | não |  |
| dados | jsonb | não |  |
| aba | text | não |  |
| faixa | text | não |  |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`

## importacao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('importacao_id_seq'::regclass) |
| arquivo_id | uuid | sim |  |
| arquivo_nome | text | não |  |
| arquivo_sha256 | text | não |  |
| status | text | não | 'ANALISADA'::text |
| resumo | jsonb | sim |  |
| reconciliacao | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| gravado_por | uuid | sim |  |
| gravado_em | timestamp with time zone | sim |  |
| homologado_por | uuid | sim |  |
| homologado_em | timestamp with time zone | sim |  |
| observacao_homologacao | text | sim |  |

**Regras (CHECK):**

- `CHECK ((status = ANY (ARRAY['ANALISADA'::text, 'GRAVADA'::text, 'HOMOLOGADA'::text, 'DESCARTADA'::text])))`
- `CHECK (((status <> 'HOMOLOGADA'::text) OR (homologado_por IS NOT NULL)))`

**Triggers:** importacao_aud

## importacao_pendencia

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('importacao_pendencia_id_seq'::regclass) |
| importacao_id | integer | não |  |
| aba | text | não |  |
| celula | text | sim |  |
| tipo | text | não |  |
| descricao | text | não |  |
| valor_bruto | jsonb | sim |  |
| resolvida | boolean | não | false |
| resolucao | text | sim |  |
| resolvido_por | uuid | sim |  |
| resolvido_em | timestamp with time zone | sim |  |

**Regras (CHECK):**

- `CHECK ((tipo = ANY (ARRAY['SEM_MAPEAMENTO'::text, 'VALOR_INVALIDO'::text, 'FORMULA_INVALIDA'::text, 'DUPLICIDADE'::text, 'TOTAL_INCOMPATIVEL'::text, 'DADO_TESTE'::text, 'CONCILIACAO'::text, 'DIVERGENCIA_FONTE'::text, 'INFORMATIVO'::text])))`

**Triggers:** importacao_pendencia_aud

## indicador_definicao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('indicador_definicao_id_seq'::regclass) |
| codigo | text | não |  |
| versao | integer | não | 1 |
| nome | text | não |  |
| area_codigo | text | não |  |
| descricao | text | não |  |
| unidade_medida | text | não |  |
| formula | text | não |  |
| origem_dados | text | não |  |
| numerador | text | sim |  |
| denominador | text | sim |  |
| periodicidade | text | não | 'MENSAL'::text |
| direcao | text | não |  |
| consolidacao | text | não |  |
| responsavel | text | sim |  |
| fonte_regra | text | não |  |
| classe | text | não |  |
| ativo | boolean | não | true |
| vigencia_inicio | date | não |  |
| vigencia_fim | date | sim |  |
| casas_decimais | integer | não | 1 |
| politica_denominador_zero | text | não | 'NA'::text |
| calculador | text | não |  |
| homologado | boolean | não | false |
| homologado_por | uuid | sim |  |
| homologado_em | timestamp with time zone | sim |  |
| pendencias | text | sim |  |
| ordem | integer | não | 0 |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK (((casas_decimais >= 0) AND (casas_decimais <= 4)))`
- `CHECK ((codigo ~ '^[A-Z0-9_]+$'::text))`
- `CHECK ((periodicidade = ANY (ARRAY['MENSAL'::text, 'TRIMESTRAL'::text, 'SEMESTRAL'::text, 'ANUAL'::text])))`
- `CHECK ((direcao = ANY (ARRAY['MAIOR_MELHOR'::text, 'MENOR_MELHOR'::text, 'FAIXA'::text, 'INFORMATIVO'::text])))`
- `CHECK ((consolidacao = ANY (ARRAY['FOTOGRAFIA'::text, 'SOMA'::text, 'MEDIA_SIMPLES'::text, 'MEDIA_PONDERADA'::text, 'ULTIMO_VALOR'::text, 'TAXA_CONTAGEM'::text])))`
- `CHECK ((classe = ANY (ARRAY['ESSENCIAL'::text, 'COMPLEMENTAR'::text, 'CANDIDATO'::text, 'OPERACIONAL'::text])))`
- `CHECK ((politica_denominador_zero = ANY (ARRAY['NA'::text, 'ZERO'::text])))`
- `CHECK (((vigencia_fim IS NULL) OR (vigencia_fim >= vigencia_inicio)))`

## indicador_resultado

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | bigint | não | nextval('indicador_resultado_id_seq'::regclass) |
| indicador_codigo | text | não |  |
| definicao_id | integer | não |  |
| escopo | text | não |  |
| periodo_inicio | date | não |  |
| periodo_fim | date | não |  |
| unidade_id | integer | sim |  |
| valor | numeric | sim |  |
| numerador | numeric | sim |  |
| denominador | numeric | sim |  |
| situacao_dado | text | não |  |
| motivo | text | sim |  |
| meta_id | integer | sim |  |
| meta_descricao | text | sim |  |
| status | text | não |  |
| valor_anterior | numeric | sim |  |
| variacao_abs | numeric | sim |  |
| variacao_pct | numeric | sim |  |
| fonte | text | não |  |
| memoria | jsonb | não |  |
| hash | text | não |  |
| calculado_em | timestamp with time zone | não | now() |
| calculado_por | uuid | sim |  |

**Regras (CHECK):**

- `CHECK ((situacao_dado = ANY (ARRAY['OK'::text, 'NAO_INFORMADO'::text, 'NAO_APLICAVEL'::text])))`
- `CHECK ((status = ANY (ARRAY['VERDE'::text, 'AMARELO'::text, 'VERMELHO'::text, 'SEM_META'::text, 'NA'::text])))`
- `CHECK ((fonte = ANY (ARRAY['EVENTOS'::text, 'HISTORICO'::text, 'MISTO'::text, 'NENHUMA'::text])))`
- `CHECK ((escopo = ANY (ARRAY['MES'::text, 'TRIMESTRE'::text, 'SEMESTRE'::text, 'ANO'::text])))`

## item_peca

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('item_peca_id_seq'::regclass) |
| familia_id | integer | não |  |
| codigo | text | sim |  |
| descricao | text | não |  |
| unidade_medida | text | não | 'UN'::text |
| critico | boolean | não | false |
| estoque_minimo | numeric | sim |  |
| ativo | boolean | não | true |

**Triggers:** item_peca_aud

## local_estoque

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('local_estoque_id_seq'::regclass) |
| unidade_id | integer | sim |  |
| nome | text | não |  |
| ativo | boolean | não | true |

**Triggers:** local_estoque_aud

## manut_interna

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('manut_interna_id_seq'::regclass) |
| competencia | date | não |  |
| unidade_id | integer | sim |  |
| data_recebimento | date | sim |  |
| data_conclusao | date | sim |  |
| familia_id | integer | não |  |
| modelo_id | integer | sim |  |
| equipamento_id | integer | sim |  |
| identificador | text | sim |  |
| tipo_servico | text | não |  |
| resultado | text | não |  |
| retorno_aplicavel_higienizacao | boolean | sim |  |
| tecnico_id | integer | sim |  |
| motivo_sucateamento | text | sim |  |
| custo_mao_obra | numeric | sim |  |
| observacao | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((tipo_servico = ANY (ARRAY['RECUPERACAO'::text, 'HIGIENIZACAO'::text, 'PREVENTIVA'::text, 'DIAGNOSTICO'::text])))`
- `CHECK ((custo_mao_obra >= (0)::numeric))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((resultado = ANY (ARRAY['RECUPERADO'::text, 'SUCATEADO'::text, 'HIGIENIZADO'::text, 'PENDENTE'::text])))`
- `CHECK (((resultado <> 'SUCATEADO'::text) OR (COALESCE(TRIM(BOTH FROM motivo_sucateamento), ''::text) <> ''::text)))`
- `CHECK (((data_conclusao IS NULL) OR (data_recebimento IS NULL) OR (data_conclusao >= data_recebimento)))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`

**Triggers:** manut_interna_aud, manut_interna_bloqueio

## manut_preventiva_plano

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('manut_preventiva_plano_id_seq'::regclass) |
| competencia | date | não |  |
| familia_id | integer | sim |  |
| quantidade_planejada | integer | não |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK ((quantidade_planejada >= 0))`

**Triggers:** manut_preventiva_plano_aud, manut_preventiva_plano_bloqueio

## meta

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('meta_id_seq'::regclass) |
| indicador_codigo | text | não |  |
| versao | integer | não |  |
| ciclo | text | não |  |
| tipo | text | não |  |
| operador | text | não |  |
| valor | numeric | sim |  |
| valor_max | numeric | sim |  |
| linha_base | numeric | sim |  |
| linha_base_competencia | date | sim |  |
| tolerancia_pct | numeric | não | 5 |
| vigencia_inicio | date | não |  |
| vigencia_fim | date | sim |  |
| status | text | não | 'PROPOSTA'::text |
| fonte_documento | text | não |  |
| motivo | text | não |  |
| excecao_ciclo | boolean | não | false |
| justificativa_excecao | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| aprovado_por | uuid | sim |  |
| aprovado_em | timestamp with time zone | sim |  |

**Regras (CHECK):**

- `CHECK (((NOT excecao_ciclo) OR (COALESCE(TRIM(BOTH FROM justificativa_excecao), ''::text) <> ''::text)))`
- `CHECK (((operador <> 'ENTRE'::text) OR ((valor IS NOT NULL) AND (valor_max IS NOT NULL) AND (valor_max >= valor))))`
- `CHECK ((ciclo = ANY (ARRAY['MENSAL'::text, 'TRIMESTRAL'::text, 'SEMESTRAL'::text, 'ANUAL'::text])))`
- `CHECK ((status = ANY (ARRAY['PROPOSTA'::text, 'APROVADA'::text, 'SUBSTITUIDA'::text, 'REJEITADA'::text])))`
- `CHECK ((operador = ANY (ARRAY['>='::text, '<='::text, '='::text, 'ENTRE'::text])))`
- `CHECK ((tipo = ANY (ARRAY['ABSOLUTA'::text, 'LINHA_BASE_MAIS'::text, 'PERCENTUAL_SOBRE_LINHA_BASE'::text, 'VARIACAO_PERIODO_ANTERIOR'::text, 'TENDENCIA_QUEDA'::text, 'CONTAGEM_MINIMA'::text])))`
- `CHECK (((status <> 'APROVADA'::text) OR (aprovado_por IS NOT NULL) OR (fonte_documento ~~ 'SEED:%'::text)))`

**Triggers:** meta_ciclo

## modelo_equipamento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('modelo_equipamento_id_seq'::regclass) |
| familia_id | integer | não |  |
| nome | text | não |  |
| ativo | boolean | não | true |

**Triggers:** modelo_equipamento_aud

## movimento_estoque

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('movimento_estoque_id_seq'::regclass) |
| competencia | date | não |  |
| data | date | não |  |
| local_estoque_id | integer | sim |  |
| local_destino_id | integer | sim |  |
| familia_id | integer | não |  |
| item_peca_id | integer | sim |  |
| tipo | text | não |  |
| quantidade | numeric | não |  |
| valor_total | numeric | sim |  |
| motivo | text | sim |  |
| documento_origem | text | sim |  |
| responsavel_id | uuid | sim |  |
| manut_interna_id | integer | sim |  |
| chamado_externo_id | integer | sim |  |
| aplicacao | text | sim |  |
| justificativa_ajuste | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((tipo <> 'TRANSFERENCIA'::text) OR (local_destino_id IS NOT NULL)))`
- `CHECK (competencia_valida(competencia))`
- `CHECK (((tipo <> 'AJUSTE'::text) OR (COALESCE(TRIM(BOTH FROM justificativa_ajuste), ''::text) <> ''::text)))`
- `CHECK (((tipo = 'AJUSTE'::text) OR ((quantidade > (0)::numeric) AND (COALESCE(valor_total, (0)::numeric) >= (0)::numeric))))`
- `CHECK (((date_trunc('month'::text, (data)::timestamp with time zone))::date = competencia))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK ((aplicacao = ANY (ARRAY['INTERNA'::text, 'EXTERNA'::text])))`
- `CHECK ((tipo = ANY (ARRAY['ENTRADA'::text, 'SAIDA'::text, 'AJUSTE'::text, 'TRANSFERENCIA'::text])))`

**Triggers:** movimento_estoque_aud, movimento_estoque_bloqueio

## periodo_area

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('periodo_area_id_seq'::regclass) |
| competencia | date | não |  |
| area_codigo | text | não |  |
| status | text | não | 'RASCUNHO'::text |
| versao | integer | não | 1 |
| atualizado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |

**Regras (CHECK):**

- `CHECK ((status = ANY (ARRAY['RASCUNHO'::text, 'EM_PREENCHIMENTO'::text, 'EM_VALIDACAO'::text, 'APROVADO'::text, 'FECHADO'::text])))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** periodo_area_aud

## periodo_evento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | bigint | não | nextval('periodo_evento_id_seq'::regclass) |
| periodo_area_id | integer | não |  |
| de_status | text | sim |  |
| para_status | text | não |  |
| acao | text | não |  |
| justificativa | text | sim |  |
| usuario_id | uuid | sim |  |
| em | timestamp with time zone | não | now() |
| detalhes | jsonb | sim |  |

## plano_acao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('plano_acao_id_seq'::regclass) |
| codigo | text | não | ('PA-'::text \|\| lpad((nextval('plano_acao_seq'::regclass)):: |
| area_codigo | text | não |  |
| indicador_codigo | text | sim |  |
| competencia_origem | date | sim |  |
| ocorrencia | text | sim |  |
| cliente_id | integer | sim |  |
| causa_raiz | text | não |  |
| acao | text | não |  |
| entregavel | text | não |  |
| responsavel_nome | text | não |  |
| responsavel_id | uuid | sim |  |
| inicio | date | não |  |
| prazo | date | não |  |
| status | text | não | 'ABERTA'::text |
| criticidade | text | não | 'MEDIA'::text |
| resultado_esperado | text | não |  |
| evidencia | text | sim |  |
| avaliacao_eficacia | text | sim |  |
| eficacia | text | sim |  |
| tipo_encerramento | text | sim |  |
| encerramento_aprovado_por | uuid | sim |  |
| encerrado_em | timestamp with time zone | sim |  |
| gerado_automaticamente | boolean | não | false |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((status = ANY (ARRAY['ABERTA'::text, 'EM_ANDAMENTO'::text, 'AGUARDANDO_EFICACIA'::text, 'ENCERRADA'::text, 'CANCELADA'::text])))`
- `CHECK ((criticidade = ANY (ARRAY['ALTA'::text, 'MEDIA'::text, 'BAIXA'::text])))`
- `CHECK ((eficacia = ANY (ARRAY['EFICAZ'::text, 'NAO_EFICAZ'::text])))`
- `CHECK ((tipo_encerramento = ANY (ARRAY['META_ATINGIDA'::text, 'APROVACAO_DIRETORIA'::text])))`
- `CHECK (((status <> 'ENCERRADA'::text) OR ((COALESCE(TRIM(BOTH FROM evidencia), ''::text) <> ''::text) AND (tipo_encerramento IS NOT NULL))))`
- `CHECK (((indicador_codigo IS NOT NULL) OR (COALESCE(TRIM(BOTH FROM ocorrencia), ''::text) <> ''::text)))`
- `CHECK ((prazo >= inicio))`
- `CHECK (((competencia_origem IS NULL) OR competencia_valida(competencia_origem)))`
- `CHECK (((tipo_encerramento IS DISTINCT FROM 'APROVACAO_DIRETORIA'::text) OR (encerramento_aprovado_por IS NOT NULL)))`

**Triggers:** plano_acao_aud

## plano_acao_andamento

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('plano_acao_andamento_id_seq'::regclass) |
| plano_id | integer | não |  |
| texto | text | não |  |
| status_novo | text | sim |  |
| usuario_id | uuid | sim |  |
| em | timestamp with time zone | não | now() |

**Triggers:** plano_acao_andamento_aud

## rede

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('rede_id_seq'::regclass) |
| nome | text | não |  |
| ativo | boolean | não | true |
| criado_em | timestamp with time zone | não | now() |

**Triggers:** rede_aud

## relatorio_job

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('relatorio_job_id_seq'::regclass) |
| formato | text | não |  |
| modo | text | não |  |
| escopo | text | não |  |
| competencia | date | não |  |
| unidades | ARRAY | sim |  |
| filtros | jsonb | não | '{}'::jsonb |
| status | text | não | 'NA_FILA'::text |
| progresso | integer | não | 0 |
| etapa | text | sim |  |
| mensagem_erro | text | sim |  |
| versao | integer | sim |  |
| situacao_fechamento | text | sim |  |
| arquivo_nome | text | sim |  |
| arquivo_id | uuid | sim |  |
| hash_dados | text | sim |  |
| solicitado_por | uuid | não |  |
| solicitado_em | timestamp with time zone | não | now() |
| iniciado_em | timestamp with time zone | sim |  |
| concluido_em | timestamp with time zone | sim |  |
| tentativas | integer | não | 0 |

**Regras (CHECK):**

- `CHECK ((situacao_fechamento = ANY (ARRAY['OFICIAL'::text, 'PRELIMINAR'::text])))`
- `CHECK (((progresso >= 0) AND (progresso <= 100)))`
- `CHECK ((escopo = ANY (ARRAY['CONSOLIDADO'::text, 'COMODATO_MANUTENCAO'::text, 'TI'::text])))`
- `CHECK ((modo = ANY (ARRAY['EXECUTIVO'::text, 'COMPLETO'::text])))`
- `CHECK ((formato = ANY (ARRAY['XLSX'::text, 'PDF_A4'::text, 'PDF_APRESENTACAO'::text, 'PPTX'::text])))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((status = ANY (ARRAY['NA_FILA'::text, 'PROCESSANDO'::text, 'CONCLUIDO'::text, 'ERRO'::text])))`

**Triggers:** relatorio_job_aud

## saldo_estoque_peca

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| familia_id | integer | sim |  |
| item_peca_id | integer | sim |  |
| local_estoque_id | integer | sim |  |
| saldo_quantidade | numeric | sim |  |
| saldo_valor | numeric | sim |  |
| ultima_movimentacao | date | sim |  |

## solicitacao_troca

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('solicitacao_troca_id_seq'::regclass) |
| competencia | date | não |  |
| chamado_externo_id | integer | sim |  |
| cliente_id | integer | sim |  |
| cliente_texto | text | sim |  |
| data_solicitacao | date | não |  |
| data_troca | date | sim |  |
| solicitado_por_tecnico_id | integer | sim |  |
| solicitado_por_texto | text | sim |  |
| familia_id | integer | sim |  |
| equipamento_texto | text | sim |  |
| linha | text | sim |  |
| causa | text | sim |  |
| status | text | não | 'PENDENTE'::text |
| observacao | text | sim |  |
| origem | text | não | 'MANUAL'::text |
| origem_ref | jsonb | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_por | uuid | sim |  |
| atualizado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| excluido_por | uuid | sim |  |
| motivo_exclusao | text | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`
- `CHECK ((linha = ANY (ARRAY['PADRAO'::text, 'STAR'::text])))`
- `CHECK (competencia_valida(competencia))`
- `CHECK (((data_troca IS NULL) OR (data_troca >= data_solicitacao)))`
- `CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'CONCLUIDA'::text, 'CANCELADA'::text])))`
- `CHECK (((status <> 'CONCLUIDA'::text) OR (data_troca IS NOT NULL)))`
- `CHECK (((cliente_id IS NOT NULL) OR (COALESCE(TRIM(BOTH FROM cliente_texto), ''::text) <> ''::text)))`

**Triggers:** solicitacao_troca_aud, solicitacao_troca_bloqueio

## tecnico

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('tecnico_id_seq'::regclass) |
| nome | text | não |  |
| tipo | text | não | 'EXTERNO'::text |
| ativo | boolean | não | true |
| valido_ate | date | sim |  |

**Regras (CHECK):**

- `CHECK ((tipo = ANY (ARRAY['INTERNO'::text, 'EXTERNO'::text, 'TERCEIRO'::text, 'APOIO'::text])))`

**Triggers:** tecnico_aud

## ti_backup_execucao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_backup_execucao_id_seq'::regclass) |
| competencia | date | não |  |
| data | date | não |  |
| rotina | text | não |  |
| sistema_id | integer | sim |  |
| programado | boolean | não | true |
| concluido | boolean | não |  |
| observacao | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`

**Triggers:** ti_backup_execucao_aud, ti_backup_execucao_bloqueio

## ti_incidente_critico

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_incidente_critico_id_seq'::regclass) |
| competencia | date | não |  |
| numero | text | sim |  |
| sistema_id | integer | sim |  |
| aberto_em | timestamp with time zone | não |  |
| resolvido_em | timestamp with time zone | sim |  |
| descricao | text | não |  |
| causa_raiz | text | sim |  |
| acao_corretiva | text | sim |  |
| responsavel | text | sim |  |
| prazo_acao | date | sim |  |
| status | text | não | 'ABERTO'::text |
| seguranca | boolean | não | false |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((status = ANY (ARRAY['ABERTO'::text, 'RESOLVIDO'::text, 'CAUSA_TRATADA'::text])))`
- `CHECK (((status <> 'CAUSA_TRATADA'::text) OR ((COALESCE(TRIM(BOTH FROM causa_raiz), ''::text) <> ''::text) AND (COALESCE(TRIM(BOTH FROM acao_corretiva), ''::text) <> ''::text) AND (COALESCE(TRIM(BOTH FROM responsavel), ''::text) <> ''::text))))`
- `CHECK (((resolvido_em IS NULL) OR (resolvido_em >= aberto_em)))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** ti_incidente_critico_aud, ti_incidente_critico_bloqueio

## ti_indisponibilidade

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_indisponibilidade_id_seq'::regclass) |
| competencia | date | não |  |
| sistema_id | integer | não |  |
| inicio | timestamp with time zone | não |  |
| fim | timestamp with time zone | sim |  |
| planejada | boolean | não | false |
| valida | boolean | não | true |
| motivo_invalidacao | text | sim |  |
| causa | text | sim |  |
| chamado_ti_id | integer | sim |  |
| origem | text | não | 'MANUAL'::text |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (((fim IS NULL) OR (fim >= inicio)))`
- `CHECK ((valida OR (COALESCE(TRIM(BOTH FROM motivo_invalidacao), ''::text) <> ''::text)))`
- `CHECK (competencia_valida(competencia))`
- `CHECK ((origem = ANY (ARRAY['MANUAL'::text, 'IMPORTACAO'::text, 'INTEGRACAO'::text])))`

**Triggers:** ti_indisponibilidade_aud, ti_indisponibilidade_bloqueio

## ti_janela_programada

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_janela_programada_id_seq'::regclass) |
| competencia | date | não |  |
| sistema_id | integer | não |  |
| minutos_programados | integer | não |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK ((minutos_programados > 0))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** ti_janela_programada_aud, ti_janela_programada_bloqueio

## ti_marco

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_marco_id_seq'::regclass) |
| projeto_id | integer | não |  |
| competencia | date | não |  |
| descricao | text | não |  |
| data_planejada | date | não |  |
| data_realizada | date | sim |  |
| percentual_concluido | numeric | não | 0 |
| observacao_desvio | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK (((percentual_concluido >= (0)::numeric) AND (percentual_concluido <= (100)::numeric)))`
- `CHECK ((competencia = (date_trunc('month'::text, (data_planejada)::timestamp with time zone))::date))`

**Triggers:** ti_marco_aud, ti_marco_bloqueio

## ti_patch_ciclo

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_patch_ciclo_id_seq'::regclass) |
| competencia | date | não |  |
| patches_criticos_liberados | integer | não |  |
| aplicados_ate_30_dias | integer | não |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK ((patches_criticos_liberados >= 0))`
- `CHECK ((aplicados_ate_30_dias <= patches_criticos_liberados))`
- `CHECK ((aplicados_ate_30_dias >= 0))`
- `CHECK (competencia_valida(competencia))`

**Triggers:** ti_patch_ciclo_aud, ti_patch_ciclo_bloqueio

## ti_projeto

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_projeto_id_seq'::regclass) |
| nome | text | não |  |
| responsavel | text | sim |  |
| roadmap_aprovado | boolean | não | false |
| status | text | não | 'EM_ANDAMENTO'::text |
| inicio | date | sim |  |
| fim_previsto | date | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK ((status = ANY (ARRAY['PLANEJADO'::text, 'EM_ANDAMENTO'::text, 'CONCLUIDO'::text, 'SUSPENSO'::text, 'CANCELADO'::text])))`

**Triggers:** ti_projeto_aud

## ti_sistema

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_sistema_id_seq'::regclass) |
| nome | text | não |  |
| critico | boolean | não | true |
| ativo | boolean | não | true |

**Triggers:** ti_sistema_aud

## ti_teste_restauracao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('ti_teste_restauracao_id_seq'::regclass) |
| competencia | date | não |  |
| data | date | não |  |
| sistema_id | integer | sim |  |
| rotina | text | não |  |
| sucesso | boolean | não |  |
| tempo_restauracao_min | integer | sim |  |
| evidencia | text | sim |  |
| criado_por | uuid | sim |  |
| criado_em | timestamp with time zone | não | now() |
| excluido_em | timestamp with time zone | sim |  |
| versao | integer | não | 1 |

**Regras (CHECK):**

- `CHECK (competencia_valida(competencia))`
- `CHECK ((tempo_restauracao_min >= 0))`

**Triggers:** ti_teste_restauracao_aud, ti_teste_restauracao_bloqueio

## unidade

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('unidade_id_seq'::regclass) |
| empresa_id | integer | não |  |
| codigo | text | não |  |
| nome | text | não |  |
| ativo | boolean | não | true |
| criado_em | timestamp with time zone | não | now() |

**Triggers:** unidade_aud

## usuario

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não | gen_random_uuid() |
| nome | text | não |  |
| email | text | não |  |
| senha_hash | text | não |  |
| ativo | boolean | não | true |
| deve_trocar_senha | boolean | não | true |
| tentativas_falhas | integer | não | 0 |
| bloqueado_ate | timestamp with time zone | sim |  |
| ultimo_login_em | timestamp with time zone | sim |  |
| criado_em | timestamp with time zone | não | now() |
| atualizado_em | timestamp with time zone | não | now() |

**Triggers:** usuario_aud

## usuario_papel

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | nextval('usuario_papel_id_seq'::regclass) |
| usuario_id | uuid | não |  |
| papel | text | não |  |
| area_codigo | text | sim |  |
| unidade_id | integer | sim |  |
| criado_em | timestamp with time zone | não | now() |

**Regras (CHECK):**

- `CHECK ((papel = ANY (ARRAY['ADMIN'::text, 'LANCADOR'::text, 'GESTOR'::text, 'DIRETORIA'::text, 'AUDITOR'::text])))`

**Triggers:** usuario_papel_aud

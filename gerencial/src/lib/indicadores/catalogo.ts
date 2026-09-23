/**
 * Catálogo inicial de indicadores e metas (versão 1), carregado pelo seed.
 * Em produção a fonte da verdade é o banco (indicador_definicao / meta), versionado.
 *
 * Fontes das regras:
 *  - PADRAO_COMODATO / PADRAO_TI: regras transcritas no prompt de especificação a partir de
 *    Padrao-Gerencial-Comodato.pptx e Padrao-Gerencial-TI.pptx. Os arquivos originais NÃO foram
 *    entregues; as regras ficam como "pendente de conferência" até a homologação.
 *  - METAS_URGENTES: metas_marisa_urgente.pptx (propostas relativas jun→jul/26; não aprovadas).
 */
import type { AreaCodigo } from '@/lib/auth/permissoes'

export type Direcao = 'MAIOR_MELHOR' | 'MENOR_MELHOR' | 'FAIXA' | 'INFORMATIVO'
export type Consolidacao = 'FOTOGRAFIA' | 'SOMA' | 'MEDIA_SIMPLES' | 'MEDIA_PONDERADA' | 'ULTIMO_VALOR' | 'TAXA_CONTAGEM'
export type Classe = 'ESSENCIAL' | 'COMPLEMENTAR' | 'CANDIDATO' | 'OPERACIONAL'

export interface DefinicaoIndicador {
  codigo: string
  nome: string
  area: AreaCodigo
  descricao: string
  unidade: string
  formula: string
  origem: string
  numerador?: string
  denominador?: string
  direcao: Direcao
  consolidacao: Consolidacao
  classe: Classe
  fonte: string
  casas: number
  calculador: string
  responsavel?: string
  pendencias?: string
  /** "Bloco" do painel da Diretoria */
  bloco: 'COMODATO_MANUTENCAO' | 'TI'
}

export interface MetaInicial {
  indicador: string
  ciclo: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
  tipo: 'ABSOLUTA' | 'LINHA_BASE_MAIS' | 'PERCENTUAL_SOBRE_LINHA_BASE' | 'VARIACAO_PERIODO_ANTERIOR' | 'TENDENCIA_QUEDA' | 'CONTAGEM_MINIMA'
  operador: '>=' | '<=' | '=' | 'ENTRE'
  valor: number | null
  valorMax?: number
  status: 'APROVADA' | 'PROPOSTA'
  fonte: string
  motivo: string
}

const PC = 'Padrão Gerencial Comodato/Manutenção (transcrito na especificação; arquivo original pendente)'
const PT = 'Padrão Gerencial TI (transcrito na especificação; arquivo original pendente)'
const REC = 'Especificação §11 — indicador recomendado (candidato, desativado até homologação)'

export const INDICADORES: DefinicaoIndicador[] = [
  // ---------------- Comodato e manutenção — essenciais ----------------
  {
    codigo: 'CO_BASE_ATIVA', nome: 'Base instalada ativa', area: 'COMODATO', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Equipamentos em comodato ativos em clientes no fim do período.',
    unidade: 'qtd', formula: 'Equipamentos ativos no último dia do período (fotografia).',
    origem: 'comodato_base_ativa (integração Protheus AA3/bd_cl_inv ou lançamento auditado)',
    direcao: 'MAIOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'ESSENCIAL', fonte: PC, casas: 0, calculador: 'CO_BASE_ATIVA',
    pendencias: 'Linha de base e competência da linha de base a homologar; a planilha não contém a base ativa.',
  },
  {
    codigo: 'CO_MOV_LIQUIDO', nome: 'Movimento líquido do parque', area: 'COMODATO', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Instalações menos retiradas no período.',
    unidade: 'qtd', formula: 'Σ instalações − Σ retiradas', origem: 'comodato_movimento (ENTREGA concluída − RETIRADA concluída); histórico: aba "Entrega e retirada Comodato"',
    numerador: 'Instalações (entregas concluídas)', denominador: 'Retiradas concluídas (subtraídas)',
    direcao: 'MAIOR_MELHOR', consolidacao: 'SOMA', classe: 'ESSENCIAL', fonte: PC, casas: 0, calculador: 'CO_MOV_LIQUIDO',
    pendencias: 'Confirmar se "ENTREGAS" da planilha equivalem a instalações (novas bases) e se trocas são neutras.',
  },
  {
    codigo: 'MI_SUCATEADOS', nome: 'Equipamentos sucateados', area: 'MANUT_INTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Quantidade de equipamentos sucateados no período.',
    unidade: 'qtd', formula: 'Σ manutenções internas com resultado SUCATEADO', origem: 'manut_interna; histórico: aba "Equipe Interna" (Equipamentos mais sucateados)',
    direcao: 'MENOR_MELHOR', consolidacao: 'SOMA', classe: 'ESSENCIAL', fonte: PC, casas: 0, calculador: 'MI_SUCATEADOS',
  },
  {
    codigo: 'CO_VOLUME_POR_EQUIP', nome: 'Volume de compra por equipamento', area: 'COMODATO', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Quilos comprados pelos clientes com comodato divididos pela base ativa média.',
    unidade: 'kg/equip', formula: 'Σ kg comprados ÷ Σ base ativa (média ponderada)', origem: 'comodato_consumo + comodato_base_ativa',
    numerador: 'kg comprados', denominador: 'Base ativa do mês',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'CO_VOLUME_POR_EQUIP',
    pendencias: 'Fonte de vendas (kg) e linha de base a homologar.',
  },
  {
    codigo: 'CO_CLIENTES_ABAIXO_MIN', nome: 'Clientes abaixo do consumo mínimo', area: 'COMODATO', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Percentual de clientes com consumo abaixo do mínimo contratual.',
    unidade: '%', formula: 'clientes abaixo do mínimo ÷ clientes aplicáveis × 100 (fotografia do fim do período)', origem: 'comodato_consumo',
    numerador: 'Clientes abaixo do mínimo', denominador: 'Clientes aplicáveis',
    direcao: 'MENOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'CO_CLIENTES_ABAIXO_MIN',
    pendencias: 'Consumo mínimo por contrato a cadastrar.',
  },
  {
    codigo: 'ME_CHAMADOS_100EQ', nome: 'Chamados de manutenção por 100 equipamentos', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Chamados externos em relação ao tamanho do parque.',
    unidade: 'por 100 equip', formula: 'Σ chamados externos ÷ Σ base ativa × 100', origem: 'chamado_externo + comodato_base_ativa; histórico: "Manutenção externo por equipamento"',
    numerador: 'Chamados externos (não cancelados)', denominador: 'Base ativa do mês',
    direcao: 'MENOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'ME_CHAMADOS_100EQ',
  },
  {
    codigo: 'ME_SLA_PRIMEIRA_RESPOSTA', nome: 'SLA da primeira resposta (48 h úteis)', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Chamados com primeira resposta em até 48 horas úteis.',
    unidade: '%', formula: 'chamados elegíveis com 1ª resposta ≤ 48 h úteis ÷ chamados elegíveis × 100', origem: 'chamado_externo (aberto_em, primeira_resposta_em, calendário oficial)',
    numerador: 'Chamados no prazo', denominador: 'Chamados elegíveis',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'ME_SLA_PRIMEIRA_RESPOSTA',
    pendencias: 'Critério de elegibilidade e expediente oficial a homologar. Planilha não registra horário de 1ª resposta.',
  },
  {
    codigo: 'ME_REINCIDENCIA', nome: 'Reincidência de atendimento', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Atendimentos que retornaram dentro da janela homologada.',
    unidade: '%', formula: 'reincidências ÷ atendimentos externos elegíveis × 100', origem: 'chamado_externo (chamado_anterior_id); histórico: técnicos com mais reincidentes ÷ atendimentos por técnico',
    numerador: 'Reincidências', denominador: 'Atendimentos externos',
    direcao: 'MENOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'ME_REINCIDENCIA',
    pendencias: 'Janela de reincidência (dias) a homologar.',
  },
  {
    codigo: 'ME_DESNECESSARIOS', nome: 'Chamados desnecessários', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Chamados classificados como desnecessários sobre os chamados elegíveis.',
    unidade: '%', formula: 'desnecessários ÷ (necessários + desnecessários) × 100', origem: 'chamado_externo (necessario); histórico: "Quantos chamados desnecessários"',
    numerador: 'Desnecessários', denominador: 'Chamados classificados',
    direcao: 'MENOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PC, casas: 1, calculador: 'ME_DESNECESSARIOS',
  },
  // ---------------- Comodato e manutenção — complementares ----------------
  {
    codigo: 'MI_RECUPERACOES', nome: 'Recuperações em oficina', area: 'MANUT_INTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Equipamentos recuperados na manutenção interna.',
    unidade: 'qtd', formula: 'Σ manutenções internas com resultado RECUPERADO', origem: 'manut_interna; histórico: "Manutenção interna por equipamento"',
    direcao: 'MAIOR_MELHOR', consolidacao: 'SOMA', classe: 'COMPLEMENTAR', fonte: PC, casas: 0, calculador: 'MI_RECUPERACOES',
    pendencias: 'Confirmar que o bloco "Manutenção interna por equipamento" da planilha corresponde a recuperações.',
  },
  {
    codigo: 'MI_HIGIENIZACAO', nome: 'Lavagem/higienização dos retornos', area: 'MANUT_INTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Retornos aplicáveis que foram higienizados.',
    unidade: '%', formula: 'retornos higienizados ÷ retornos aplicáveis × 100', origem: 'manut_interna (retorno_aplicavel_higienizacao)',
    numerador: 'Higienizados', denominador: 'Retornos aplicáveis',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PC, casas: 1, calculador: 'MI_HIGIENIZACAO',
    pendencias: 'A planilha registra apenas a quantidade de lavagens, sem o total de retornos aplicáveis.',
  },
  {
    codigo: 'MI_PREVENTIVA_PLANO', nome: 'Preventiva realizada x plano', area: 'MANUT_INTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Manutenções preventivas realizadas sobre o planejado.',
    unidade: '%', formula: 'preventivas realizadas ÷ preventivas planejadas × 100', origem: 'manut_interna (PREVENTIVA) + manut_preventiva_plano',
    numerador: 'Realizadas', denominador: 'Planejadas',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PC, casas: 1, calculador: 'MI_PREVENTIVA_PLANO',
  },
  {
    codigo: 'EP_FALTA_PECA_CRITICA', nome: 'Falta de peça crítica', area: 'ESTOQUE_PECAS', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Itens críticos com saldo zerado ou negativo no fim do período.',
    unidade: 'qtd', formula: 'itens críticos com saldo ≤ 0 (fotografia)', origem: 'item_peca (crítico) + movimento_estoque',
    direcao: 'MENOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'COMPLEMENTAR', fonte: PC, casas: 0, calculador: 'EP_FALTA_PECA_CRITICA',
    pendencias: 'Cadastro de itens críticos e saldo inicial por item a carregar.',
  },
  {
    codigo: 'EP_COBERTURA_FAMILIA_A', nome: 'Cobertura das famílias A', area: 'ESTOQUE_PECAS', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Meses de consumo cobertos pelo saldo das famílias classe A.',
    unidade: 'meses', formula: 'saldo das famílias A ÷ consumo médio mensal (3 meses)', origem: 'movimento_estoque + familia_peca.classe_abc',
    numerador: 'Saldo (valor)', denominador: 'Consumo médio mensal (valor)',
    direcao: 'FAIXA', consolidacao: 'FOTOGRAFIA', classe: 'COMPLEMENTAR', fonte: PC, casas: 1, calculador: 'EP_COBERTURA_FAMILIA_A',
    pendencias: 'Classificação ABC das famílias e saldo inicial a homologar.',
  },
  {
    codigo: 'ME_CLIENTES_RECORRENTES_PLANO', nome: 'Clientes recorrentes com plano de ação', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Clientes com 3 ou mais chamados no mês que possuem plano de ação.',
    unidade: '%', formula: 'clientes com ≥3 chamados e plano ÷ clientes com ≥3 chamados × 100', origem: 'chamado_externo + plano_acao (cliente_id)',
    numerador: 'Clientes recorrentes com plano', denominador: 'Clientes recorrentes',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PC, casas: 1, calculador: 'ME_CLIENTES_RECORRENTES_PLANO',
  },
  {
    codigo: 'ME_PARADOS_48H', nome: 'Equipamentos parados solucionados em 48 h úteis', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Chamados P1 (equipamento parado) encerrados em até 48 horas úteis.',
    unidade: '%', formula: 'P1 encerrados ≤ 48 h úteis ÷ P1 encerrados × 100', origem: 'chamado_externo (equipamento_parado, criticidade P1)',
    numerador: 'P1 no prazo', denominador: 'P1 encerrados',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PC, casas: 1, calculador: 'ME_PARADOS_48H',
  },
  // ---------------- Operacionais (séries informativas dos painéis) ----------------
  {
    codigo: 'MI_LAVAGENS', nome: 'Lavagens/higienizações realizadas', area: 'MANUT_INTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Quantidade de lavagens por família.', unidade: 'qtd', formula: 'Σ manutenções internas HIGIENIZADO', origem: 'manut_interna; histórico: "Lavagens por equipamentos"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 0, calculador: 'MI_LAVAGENS',
  },
  {
    codigo: 'ME_ATENDIMENTOS', nome: 'Atendimentos externos realizados', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Atendimentos externos concluídos por técnicos.', unidade: 'qtd', formula: 'Σ chamados externos encerrados no mês', origem: 'chamado_externo; histórico: "Técnicos com mais atendimento externos"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 0, calculador: 'ME_ATENDIMENTOS',
  },
  {
    codigo: 'ME_TROCAS', nome: 'Trocas de equipamento solicitadas pela manutenção', area: 'MANUT_EXTERNA', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Solicitações de troca de equipamento geradas pela equipe de manutenção.', unidade: 'qtd', formula: 'Σ solicitações de troca no mês', origem: 'solicitacao_troca; histórico: "Trocas de equipamentos solicitadas"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 0, calculador: 'ME_TROCAS',
  },
  {
    codigo: 'EP_VALOR_ENTRADAS', nome: 'Entradas de estoque (R$)', area: 'ESTOQUE_PECAS', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Valor das entradas de peças.', unidade: 'R$', formula: 'Σ valor das entradas', origem: 'movimento_estoque; histórico: "Entrada de Estoque"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 2, calculador: 'EP_VALOR_ENTRADAS',
  },
  {
    codigo: 'EP_VALOR_SAIDAS', nome: 'Saídas de estoque (R$)', area: 'ESTOQUE_PECAS', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Valor das saídas de peças.', unidade: 'R$', formula: 'Σ valor das saídas', origem: 'movimento_estoque; histórico: "Saida de Estoque"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 2, calculador: 'EP_VALOR_SAIDAS',
  },
  {
    codigo: 'CO_ENTREGAS_SEM_EXITO', nome: 'Entregas/retiradas sem êxito', area: 'COMODATO', bloco: 'COMODATO_MANUTENCAO',
    descricao: 'Movimentações de comodato sem êxito.', unidade: 'qtd', formula: 'Σ tentativas/movimentos sem êxito', origem: 'comodato_movimento/comodato_tentativa; histórico: linha "SEM EXITO"',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo', casas: 0, calculador: 'CO_ENTREGAS_SEM_EXITO',
  },
  {
    codigo: 'TI_CHAMADOS_ABERTOS', nome: 'Chamados de TI abertos no mês', area: 'TI', bloco: 'TI',
    descricao: 'Chamados de TI e Linear abertos na competência.', unidade: 'qtd', formula: 'Σ chamados abertos no mês (exclui testes)', origem: 'chamado_ti',
    direcao: 'INFORMATIVO', consolidacao: 'SOMA', classe: 'OPERACIONAL', fonte: 'Planilha Dashboard Executivo (aba T.I)', casas: 0, calculador: 'TI_CHAMADOS_ABERTOS',
  },
  // ---------------- TI — essenciais ----------------
  {
    codigo: 'TI_DISPONIBILIDADE', nome: 'Disponibilidade de sistemas críticos', area: 'TI', bloco: 'TI',
    descricao: 'Tempo disponível dos sistemas críticos (Protheus, APP, integrações).',
    unidade: '%', formula: '(tempo programado − indisponibilidade válida) ÷ tempo programado × 100', origem: 'ti_janela_programada + ti_indisponibilidade',
    numerador: 'Minutos disponíveis', denominador: 'Minutos programados',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PT, casas: 2, calculador: 'TI_DISPONIBILIDADE',
  },
  {
    codigo: 'TI_SLA', nome: 'SLA de chamados de TI', area: 'TI', bloco: 'TI',
    descricao: 'Chamados resolvidos dentro do prazo do catálogo.',
    unidade: '%', formula: 'resolvidos no prazo ÷ resolvidos elegíveis × 100', origem: 'chamado_ti (sla_violado, status resolvido)',
    numerador: 'Resolvidos no prazo', denominador: 'Resolvidos elegíveis',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PT, casas: 1, calculador: 'TI_SLA',
    pendencias: 'Confirmar se chamados Linear/OPIVA (desenvolvimento) entram no SLA do catálogo.',
  },
  {
    codigo: 'TI_MTTR', nome: 'MTTR — tempo médio de resolução', area: 'TI', bloco: 'TI',
    descricao: 'Média de horas úteis da abertura à resolução, descontando pausas válidas.',
    unidade: 'h úteis', formula: 'Σ horas úteis (abertura→resolução − pausas válidas) ÷ chamados resolvidos', origem: 'chamado_ti + calendário oficial',
    numerador: 'Horas úteis', denominador: 'Chamados resolvidos',
    direcao: 'MENOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PT, casas: 1, calculador: 'TI_MTTR',
    pendencias: 'A exportação traz apenas o total de horas pausadas (sem intervalos); o desconto é aproximado pelo total informado.',
  },
  {
    codigo: 'TI_BACKLOG_7DU', nome: 'Backlog acima de 7 dias úteis', area: 'TI', bloco: 'TI',
    descricao: 'Chamados abertos há mais de 7 dias úteis sobre o backlog elegível no fim do período.',
    unidade: '%', formula: 'abertos > 7 dias úteis ÷ backlog elegível × 100 (fotografia)', origem: 'chamado_ti',
    numerador: 'Abertos > 7 dias úteis', denominador: 'Backlog aberto',
    direcao: 'MENOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'ESSENCIAL', fonte: PT, casas: 1, calculador: 'TI_BACKLOG_7DU',
  },
  {
    codigo: 'TI_BACKUP', nome: 'Backups concluídos', area: 'TI', bloco: 'TI',
    descricao: 'Backups programados concluídos com sucesso.',
    unidade: '%', formula: 'backups concluídos ÷ backups programados × 100', origem: 'ti_backup_execucao',
    numerador: 'Concluídos', denominador: 'Programados',
    direcao: 'MAIOR_MELHOR', consolidacao: 'TAXA_CONTAGEM', classe: 'ESSENCIAL', fonte: PT, casas: 1, calculador: 'TI_BACKUP',
  },
  {
    codigo: 'TI_TESTES_RESTAURACAO', nome: 'Testes de restauração realizados', area: 'TI', bloco: 'TI',
    descricao: 'Testes de restauração executados com sucesso no período.',
    unidade: 'qtd', formula: 'Σ testes de restauração bem-sucedidos', origem: 'ti_teste_restauracao',
    direcao: 'MAIOR_MELHOR', consolidacao: 'SOMA', classe: 'ESSENCIAL', fonte: PT, casas: 0, calculador: 'TI_TESTES_RESTAURACAO',
  },
  {
    codigo: 'TI_P1_SEM_CAUSA', nome: 'P1 sem causa raiz tratada', area: 'TI', bloco: 'TI',
    descricao: 'Incidentes críticos sem causa, ação e responsável definidos.',
    unidade: 'qtd', formula: 'incidentes críticos (não segurança) sem causa raiz + ação + responsável (fotografia)', origem: 'ti_incidente_critico + declaração do gestor',
    direcao: 'MENOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'ESSENCIAL', fonte: PT, casas: 0, calculador: 'TI_P1_SEM_CAUSA',
  },
  {
    codigo: 'TI_PROJETOS_CRONOGRAMA', nome: 'Projetos versus cronograma', area: 'TI', bloco: 'TI',
    descricao: 'Entregas planejadas para o período concluídas até a data planejada.',
    unidade: '%', formula: 'entregas planejadas concluídas ÷ entregas planejadas × 100', origem: 'ti_marco',
    numerador: 'Entregas concluídas no prazo', denominador: 'Entregas planejadas',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'ESSENCIAL', fonte: PT, casas: 1, calculador: 'TI_PROJETOS_CRONOGRAMA',
  },
  // ---------------- TI — complementares ----------------
  {
    codigo: 'TI_FCR', nome: 'Resolução no primeiro contato (FCR)', area: 'TI', bloco: 'TI',
    descricao: 'Chamados resolvidos no primeiro contato.', unidade: '%', formula: 'resolvidos no 1º contato ÷ resolvidos com marcação × 100', origem: 'chamado_ti (resolvido_primeiro_contato)',
    numerador: 'Resolvidos no 1º contato', denominador: 'Resolvidos com marcação',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PT, casas: 1, calculador: 'TI_FCR',
    pendencias: 'A exportação atual não traz marcação de primeiro contato.',
  },
  {
    codigo: 'TI_CSAT', nome: 'Satisfação (CSAT)', area: 'TI', bloco: 'TI',
    descricao: 'Nota média de satisfação (1 a 5).', unidade: 'nota', formula: 'Σ notas ÷ respostas', origem: 'chamado_ti (csat_nota)',
    numerador: 'Soma das notas', denominador: 'Respostas',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PT, casas: 2, calculador: 'TI_CSAT',
  },
  {
    codigo: 'TI_PATCHES_30D', nome: 'Patches críticos aplicados em até 30 dias', area: 'TI', bloco: 'TI',
    descricao: 'Patches críticos aplicados dentro de 30 dias.', unidade: '%', formula: 'aplicados ≤ 30 dias ÷ liberados × 100', origem: 'ti_patch_ciclo',
    numerador: 'Aplicados ≤ 30 dias', denominador: 'Patches críticos liberados',
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'COMPLEMENTAR', fonte: PT, casas: 1, calculador: 'TI_PATCHES_30D',
  },
  {
    codigo: 'TI_SEGURANCA_PENDENTES', nome: 'Incidentes de segurança não tratados', area: 'TI', bloco: 'TI',
    descricao: 'Incidentes de segurança confirmados ainda sem tratamento.', unidade: 'qtd', formula: 'incidentes de segurança com status ABERTO (fotografia)', origem: 'ti_incidente_critico (seguranca) + declaração do gestor',
    direcao: 'MENOR_MELHOR', consolidacao: 'FOTOGRAFIA', classe: 'COMPLEMENTAR', fonte: PT, casas: 0, calculador: 'TI_SEGURANCA_PENDENTES',
  },
  {
    codigo: 'TI_CUSTO_RECEITA', nome: 'Custo de TI sobre receita', area: 'TI', bloco: 'TI',
    descricao: 'Participação do custo de TI na receita.', unidade: '%', formula: 'custo de TI ÷ receita × 100', origem: 'A definir (financeiro)',
    direcao: 'MENOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', classe: 'CANDIDATO', fonte: PT, casas: 2, calculador: 'PENDENTE',
    pendencias: 'Linha de base, teto e fonte financeira a homologar.',
  },
  // ---------------- Candidatos (§11) — desativados até homologação ----------------
  ...(
    [
      ['MI_TAXA_RECUPERACAO', 'Taxa de recuperação', 'MANUT_INTERNA', '%', 'recuperados ÷ recebidos com desfecho × 100', 'MAIOR_MELHOR', 'MI_TAXA_RECUPERACAO'],
      ['MI_TEMPO_CICLO', 'Tempo de ciclo da oficina', 'MANUT_INTERNA', 'dias', 'média (conclusão − recebimento)', 'MENOR_MELHOR', 'MI_TEMPO_CICLO'],
      ['MI_CUSTO_RECUPERADO', 'Custo por equipamento recuperado', 'MANUT_INTERNA', 'R$', '(peças + mão de obra) ÷ recuperados', 'MENOR_MELHOR', 'PENDENTE'],
      ['ME_FCR', 'Resolução na primeira visita', 'MANUT_EXTERNA', '%', 'resolvidos na 1ª visita ÷ atendimentos com marcação × 100', 'MAIOR_MELHOR', 'ME_FCR'],
      ['ME_MTTR_FAMILIA', 'MTTR por família de equipamento', 'MANUT_EXTERNA', 'h úteis', 'média horas úteis abertura→encerramento por família', 'MENOR_MELHOR', 'PENDENTE'],
      ['ME_MTBF_FAMILIA', 'MTBF por família', 'MANUT_EXTERNA', 'dias', 'tempo médio entre falhas do mesmo ativo', 'MAIOR_MELHOR', 'PENDENTE'],
      ['ME_REINCIDENCIA_30D', 'Reincidência em 30 dias', 'MANUT_EXTERNA', '%', 'retornos ≤ 30 dias ÷ atendimentos × 100', 'MENOR_MELHOR', 'PENDENTE'],
      ['EP_COBERTURA_CRITICAS', 'Cobertura das peças críticas', 'ESTOQUE_PECAS', 'meses', 'saldo útil ÷ consumo médio', 'FAIXA', 'PENDENTE'],
      ['EP_GIRO_SEM_MOVIMENTO', 'Giro e estoque sem movimento', 'ESTOQUE_PECAS', 'R$', 'saldo de itens sem movimento > 90 dias', 'MENOR_MELHOR', 'PENDENTE'],
      ['EP_RUPTURA_CRITICO', 'Ruptura de item crítico', 'ESTOQUE_PECAS', 'dias', 'dias com saldo zero de itens críticos', 'MENOR_MELHOR', 'PENDENTE'],
      ['CO_UTILIZACAO_PARQUE', 'Taxa de utilização do parque', 'COMODATO', '%', 'ativos em cliente ÷ parque total × 100', 'MAIOR_MELHOR', 'PENDENTE'],
      ['CO_PARADO_30_60_90', 'Equipamento parado há 30/60/90 dias', 'COMODATO', 'qtd', 'ativos em estoque por faixa de idade da última movimentação', 'MENOR_MELHOR', 'PENDENTE'],
      ['CO_ENTREGA_1A_TENTATIVA', 'Sucesso da entrega na primeira tentativa', 'COMODATO', '%', 'movimentos concluídos na 1ª tentativa ÷ movimentos com tentativa × 100', 'MAIOR_MELHOR', 'CO_ENTREGA_1A_TENTATIVA'],
      ['CO_LEAD_TIME', 'Lead time de instalação/retirada', 'COMODATO', 'dias', 'média (conclusão − solicitação)', 'MENOR_MELHOR', 'CO_LEAD_TIME'],
      ['TI_REABERTURA', 'Reabertura/reincidência de chamados', 'TI', '%', 'chamados vinculados a anterior ÷ chamados resolvidos × 100', 'MENOR_MELHOR', 'PENDENTE'],
      ['TI_CHANGE_FAILURE', 'Change failure rate', 'TI', '%', 'mudanças com incidente ou rollback ÷ mudanças × 100', 'MENOR_MELHOR', 'PENDENTE'],
      ['TI_LEAD_TIME', 'Lead time de entrega de TI', 'TI', 'dias', 'média (produção − demanda)', 'MENOR_MELHOR', 'PENDENTE'],
      ['TI_BACKLOG_FAIXAS', 'Idade do backlog por faixas', 'TI', 'qtd', 'chamados abertos por faixa de idade (0–7, 8–15, 16–30, >30 dias úteis)', 'MENOR_MELHOR', 'PENDENTE'],
    ] as const
  ).map(([codigo, nome, area, unidade, formula, direcao, calculador]) => ({
    codigo, nome, area, unidade, formula, direcao, calculador,
    bloco: area === 'TI' ? ('TI' as const) : ('COMODATO_MANUTENCAO' as const),
    descricao: nome, origem: 'A homologar', consolidacao: (unidade === '%' ? 'MEDIA_PONDERADA' : unidade === 'qtd' ? 'FOTOGRAFIA' : 'MEDIA_PONDERADA') as Consolidacao,
    classe: 'CANDIDATO' as Classe, fonte: REC, casas: unidade === 'qtd' ? 0 : 1,
    pendencias: 'Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial.',
  })),
]

const SEED_PC = `SEED:${PC}`
const SEED_PT = `SEED:${PT}`
const URG = 'metas_marisa_urgente.pptx (Metas Comparativo de Resultados jun/26 × jul/26)'

export const METAS_INICIAIS: MetaInicial[] = [
  // Comodato / manutenção — mensal
  { indicador: 'CO_BASE_ATIVA', ciclo: 'MENSAL', tipo: 'LINHA_BASE_MAIS', operador: '>=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: 'Linha de base + 5/mês (linha de base pendente de homologação).' },
  { indicador: 'CO_MOV_LIQUIDO', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≥ +5/mês.' },
  { indicador: 'MI_SUCATEADOS', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 20, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≤ 20/mês.' },
  { indicador: 'CO_VOLUME_POR_EQUIP', ciclo: 'MENSAL', tipo: 'PERCENTUAL_SOBRE_LINHA_BASE', operador: '>=', valor: 0, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≥ linha de base (pendente).' },
  { indicador: 'CO_CLIENTES_ABAIXO_MIN', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 10, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≤ 10%.' },
  { indicador: 'ME_CHAMADOS_100EQ', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 8, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≤ 8 por 100 equipamentos.' },
  { indicador: 'ME_SLA_PRIMEIRA_RESPOSTA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 95, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≥ 95%.' },
  { indicador: 'ME_REINCIDENCIA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≤ 5%.' },
  { indicador: 'ME_DESNECESSARIOS', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≤ 5%.' },
  { indicador: 'MI_RECUPERACOES', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 120, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≥ 120/mês.' },
  { indicador: 'MI_HIGIENIZACAO', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 100, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: 100% dos retornos aplicáveis.' },
  { indicador: 'MI_PREVENTIVA_PLANO', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 90, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: ≥ 90%.' },
  { indicador: 'EP_FALTA_PECA_CRITICA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 0, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: 0.' },
  { indicador: 'EP_COBERTURA_FAMILIA_A', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: 'ENTRE', valor: 1, valorMax: 2, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: entre 1 e 2 meses.' },
  { indicador: 'ME_CLIENTES_RECORRENTES_PLANO', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 100, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: 100% com plano de ação.' },
  { indicador: 'ME_PARADOS_48H', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 100, status: 'APROVADA', fonte: SEED_PC, motivo: 'Padrão: equipamento parado resolvido em até 48 h úteis.' },
  // Comodato / manutenção — trimestral e semestral
  { indicador: 'CO_BASE_ATIVA', ciclo: 'TRIMESTRAL', tipo: 'LINHA_BASE_MAIS', operador: '>=', valor: 15, status: 'APROVADA', fonte: SEED_PC, motivo: '+15 no trimestre.' },
  { indicador: 'CO_BASE_ATIVA', ciclo: 'SEMESTRAL', tipo: 'LINHA_BASE_MAIS', operador: '>=', valor: 30, status: 'APROVADA', fonte: SEED_PC, motivo: '+30 no semestre.' },
  { indicador: 'CO_MOV_LIQUIDO', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '>=', valor: 15, status: 'APROVADA', fonte: SEED_PC, motivo: '≥ +15 no trimestre.' },
  { indicador: 'CO_MOV_LIQUIDO', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '>=', valor: 30, status: 'APROVADA', fonte: SEED_PC, motivo: '≥ +30 no semestre.' },
  { indicador: 'MI_SUCATEADOS', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 60, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 60 no trimestre.' },
  { indicador: 'MI_SUCATEADOS', ciclo: 'SEMESTRAL', tipo: 'TENDENCIA_QUEDA', operador: '<=', valor: 0, status: 'APROVADA', fonte: SEED_PC, motivo: 'Tendência de queda no semestre.' },
  { indicador: 'CO_VOLUME_POR_EQUIP', ciclo: 'TRIMESTRAL', tipo: 'PERCENTUAL_SOBRE_LINHA_BASE', operador: '>=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: '+5% vs linha de base.' },
  { indicador: 'CO_VOLUME_POR_EQUIP', ciclo: 'SEMESTRAL', tipo: 'PERCENTUAL_SOBRE_LINHA_BASE', operador: '>=', valor: 10, status: 'APROVADA', fonte: SEED_PC, motivo: '+10% vs linha de base.' },
  { indicador: 'CO_CLIENTES_ABAIXO_MIN', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 8, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 8% no trimestre.' },
  { indicador: 'CO_CLIENTES_ABAIXO_MIN', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 5% no semestre.' },
  { indicador: 'ME_CHAMADOS_100EQ', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 8, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 8 no trimestre.' },
  { indicador: 'ME_CHAMADOS_100EQ', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 7, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 7 no semestre.' },
  { indicador: 'ME_SLA_PRIMEIRA_RESPOSTA', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '>=', valor: 95, status: 'APROVADA', fonte: SEED_PC, motivo: '≥ 95%.' },
  { indicador: 'ME_SLA_PRIMEIRA_RESPOSTA', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '>=', valor: 95, status: 'APROVADA', fonte: SEED_PC, motivo: '≥ 95%.' },
  { indicador: 'ME_REINCIDENCIA', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 5% no trimestre.' },
  { indicador: 'ME_REINCIDENCIA', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 4, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 4% no semestre.' },
  { indicador: 'ME_DESNECESSARIOS', ciclo: 'TRIMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 5% no trimestre.' },
  { indicador: 'ME_DESNECESSARIOS', ciclo: 'SEMESTRAL', tipo: 'ABSOLUTA', operador: '<=', valor: 4, status: 'APROVADA', fonte: SEED_PC, motivo: '≤ 4% no semestre.' },
  // TI — mensal
  { indicador: 'TI_DISPONIBILIDADE', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 99.5, status: 'APROVADA', fonte: SEED_PT, motivo: '≥ 99,5%.' },
  { indicador: 'TI_SLA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 95, status: 'APROVADA', fonte: SEED_PT, motivo: '≥ 95%.' },
  { indicador: 'TI_MTTR', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 8, status: 'APROVADA', fonte: SEED_PT, motivo: '≤ 8 horas úteis.' },
  { indicador: 'TI_BACKLOG_7DU', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 5, status: 'APROVADA', fonte: SEED_PT, motivo: '≤ 5%.' },
  { indicador: 'TI_BACKUP', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 100, status: 'APROVADA', fonte: SEED_PT, motivo: '100% dos backups.' },
  { indicador: 'TI_TESTES_RESTAURACAO', ciclo: 'MENSAL', tipo: 'CONTAGEM_MINIMA', operador: '>=', valor: 1, status: 'APROVADA', fonte: SEED_PT, motivo: '1 teste/mês.' },
  { indicador: 'TI_TESTES_RESTAURACAO', ciclo: 'TRIMESTRAL', tipo: 'CONTAGEM_MINIMA', operador: '>=', valor: 3, status: 'APROVADA', fonte: SEED_PT, motivo: '3 testes no trimestre.' },
  { indicador: 'TI_TESTES_RESTAURACAO', ciclo: 'SEMESTRAL', tipo: 'CONTAGEM_MINIMA', operador: '>=', valor: 6, status: 'APROVADA', fonte: SEED_PT, motivo: '6 testes no semestre.' },
  { indicador: 'TI_P1_SEM_CAUSA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 0, status: 'APROVADA', fonte: SEED_PT, motivo: '0.' },
  { indicador: 'TI_PROJETOS_CRONOGRAMA', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 90, status: 'APROVADA', fonte: SEED_PT, motivo: '≥ 90%.' },
  { indicador: 'TI_FCR', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 70, status: 'APROVADA', fonte: SEED_PT, motivo: '≥ 70%.' },
  { indicador: 'TI_CSAT', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 4.5, status: 'APROVADA', fonte: SEED_PT, motivo: '≥ 4,5/5.' },
  { indicador: 'TI_PATCHES_30D', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 100, status: 'APROVADA', fonte: SEED_PT, motivo: '100%.' },
  { indicador: 'TI_SEGURANCA_PENDENTES', ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '<=', valor: 0, status: 'APROVADA', fonte: SEED_PT, motivo: '0.' },
  // Propostas do arquivo de metas urgentes (NÃO aprovadas; aguardam homologação)
  { indicador: 'MI_RECUPERACOES', ciclo: 'MENSAL', tipo: 'VARIACAO_PERIODO_ANTERIOR', operador: '>=', valor: 15, status: 'PROPOSTA', fonte: URG, motivo: 'Manutenção interna: aumentar a produtividade em 15% vs mês anterior.' },
  { indicador: 'ME_REINCIDENCIA', ciclo: 'MENSAL', tipo: 'VARIACAO_PERIODO_ANTERIOR', operador: '<=', valor: -25, status: 'PROPOSTA', fonte: URG, motivo: 'Manutenção externa: reduzir reincidência em 25% vs mês anterior (sobre a quantidade).' },
]

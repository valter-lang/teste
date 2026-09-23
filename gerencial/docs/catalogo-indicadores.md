# Catálogo de indicadores

Gerado por `scripts/gerar-docs.ts` a partir de `src/lib/indicadores/catalogo.ts` (versão 1). Em produção, a fonte da verdade são as tabelas `indicador_definicao` e `meta`, versionadas.

## Essenciais (painel da Diretoria)

| Código | Indicador | Área | Unidade | Fórmula | Consolidação | Direção | Metas iniciais | Pendências |
|---|---|---|---|---|---|---|---|---|
| `CO_BASE_ATIVA` | Base instalada ativa | Comodato | qtd | Equipamentos ativos no último dia do período (fotografia). | FOTOGRAFIA | MAIOR_MELHOR | mensal: >= 5 (linha base mais)<br>trimestral: >= 15 (linha base mais)<br>semestral: >= 30 (linha base mais) | Linha de base e competência da linha de base a homologar; a planilha não contém a base ativa. |
| `CO_MOV_LIQUIDO` | Movimento líquido do parque | Comodato | qtd | Σ instalações − Σ retiradas | SOMA | MAIOR_MELHOR | mensal: >= 5<br>trimestral: >= 15<br>semestral: >= 30 | Confirmar se "ENTREGAS" da planilha equivalem a instalações (novas bases) e se trocas são neutras. |
| `MI_SUCATEADOS` | Equipamentos sucateados | Manutenção interna | qtd | Σ manutenções internas com resultado SUCATEADO | SOMA | MENOR_MELHOR | mensal: <= 20<br>trimestral: <= 60<br>semestral: tendência de queda | — |
| `CO_VOLUME_POR_EQUIP` | Volume de compra por equipamento | Comodato | kg/equip | Σ kg comprados ÷ Σ base ativa (média ponderada) | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 0 (percentual sobre linha base)<br>trimestral: >= 5 (percentual sobre linha base)<br>semestral: >= 10 (percentual sobre linha base) | Fonte de vendas (kg) e linha de base a homologar. |
| `CO_CLIENTES_ABAIXO_MIN` | Clientes abaixo do consumo mínimo | Comodato | % | clientes abaixo do mínimo ÷ clientes aplicáveis × 100 (fotografia do fim do período) | FOTOGRAFIA | MENOR_MELHOR | mensal: <= 10<br>trimestral: <= 8<br>semestral: <= 5 | Consumo mínimo por contrato a cadastrar. |
| `ME_CHAMADOS_100EQ` | Chamados de manutenção por 100 equipamentos | Manutenção externa | por 100 equip | Σ chamados externos ÷ Σ base ativa × 100 | MEDIA_PONDERADA | MENOR_MELHOR | mensal: <= 8<br>trimestral: <= 8<br>semestral: <= 7 | — |
| `ME_SLA_PRIMEIRA_RESPOSTA` | SLA da primeira resposta (48 h úteis) | Manutenção externa | % | chamados elegíveis com 1ª resposta ≤ 48 h úteis ÷ chamados elegíveis × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 95<br>trimestral: >= 95<br>semestral: >= 95 | Critério de elegibilidade e expediente oficial a homologar. Planilha não registra horário de 1ª resposta. |
| `ME_REINCIDENCIA` | Reincidência de atendimento | Manutenção externa | % | reincidências ÷ atendimentos externos elegíveis × 100 | MEDIA_PONDERADA | MENOR_MELHOR | mensal: <= 5<br>trimestral: <= 5<br>semestral: <= 4<br>mensal: <= -25 (variacao periodo anterior) **[proposta]** | Janela de reincidência (dias) a homologar. |
| `ME_DESNECESSARIOS` | Chamados desnecessários | Manutenção externa | % | desnecessários ÷ (necessários + desnecessários) × 100 | MEDIA_PONDERADA | MENOR_MELHOR | mensal: <= 5<br>trimestral: <= 5<br>semestral: <= 4 | — |
| `TI_DISPONIBILIDADE` | Disponibilidade de sistemas críticos | TI | % | (tempo programado − indisponibilidade válida) ÷ tempo programado × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 99.5 | — |
| `TI_SLA` | SLA de chamados de TI | TI | % | resolvidos no prazo ÷ resolvidos elegíveis × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 95 | Confirmar se chamados Linear/OPIVA (desenvolvimento) entram no SLA do catálogo. |
| `TI_MTTR` | MTTR — tempo médio de resolução | TI | h úteis | Σ horas úteis (abertura→resolução − pausas válidas) ÷ chamados resolvidos | MEDIA_PONDERADA | MENOR_MELHOR | mensal: <= 8 | A exportação traz apenas o total de horas pausadas (sem intervalos); o desconto é aproximado pelo total informado. |
| `TI_BACKLOG_7DU` | Backlog acima de 7 dias úteis | TI | % | abertos > 7 dias úteis ÷ backlog elegível × 100 (fotografia) | FOTOGRAFIA | MENOR_MELHOR | mensal: <= 5 | — |
| `TI_BACKUP` | Backups concluídos | TI | % | backups concluídos ÷ backups programados × 100 | TAXA_CONTAGEM | MAIOR_MELHOR | mensal: >= 100 | — |
| `TI_TESTES_RESTAURACAO` | Testes de restauração realizados | TI | qtd | Σ testes de restauração bem-sucedidos | SOMA | MAIOR_MELHOR | mensal: >= 1<br>trimestral: >= 3<br>semestral: >= 6 | — |
| `TI_P1_SEM_CAUSA` | P1 sem causa raiz tratada | TI | qtd | incidentes críticos (não segurança) sem causa raiz + ação + responsável (fotografia) | FOTOGRAFIA | MENOR_MELHOR | mensal: <= 0 | — |
| `TI_PROJETOS_CRONOGRAMA` | Projetos versus cronograma | TI | % | entregas planejadas concluídas ÷ entregas planejadas × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 90 | — |

## Complementares

| Código | Indicador | Área | Unidade | Fórmula | Consolidação | Direção | Metas iniciais | Pendências |
|---|---|---|---|---|---|---|---|---|
| `MI_RECUPERACOES` | Recuperações em oficina | Manutenção interna | qtd | Σ manutenções internas com resultado RECUPERADO | SOMA | MAIOR_MELHOR | mensal: >= 120<br>mensal: >= 15 (variacao periodo anterior) **[proposta]** | Confirmar que o bloco "Manutenção interna por equipamento" da planilha corresponde a recuperações. |
| `MI_HIGIENIZACAO` | Lavagem/higienização dos retornos | Manutenção interna | % | retornos higienizados ÷ retornos aplicáveis × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 100 | A planilha registra apenas a quantidade de lavagens, sem o total de retornos aplicáveis. |
| `MI_PREVENTIVA_PLANO` | Preventiva realizada x plano | Manutenção interna | % | preventivas realizadas ÷ preventivas planejadas × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 90 | — |
| `EP_FALTA_PECA_CRITICA` | Falta de peça crítica | Estoque de peças | qtd | itens críticos com saldo ≤ 0 (fotografia) | FOTOGRAFIA | MENOR_MELHOR | mensal: <= 0 | Cadastro de itens críticos e saldo inicial por item a carregar. |
| `EP_COBERTURA_FAMILIA_A` | Cobertura das famílias A | Estoque de peças | meses | saldo das famílias A ÷ consumo médio mensal (3 meses) | FOTOGRAFIA | FAIXA | mensal: ENTRE 1–2 | Classificação ABC das famílias e saldo inicial a homologar. |
| `ME_CLIENTES_RECORRENTES_PLANO` | Clientes recorrentes com plano de ação | Manutenção externa | % | clientes com ≥3 chamados e plano ÷ clientes com ≥3 chamados × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 100 | — |
| `ME_PARADOS_48H` | Equipamentos parados solucionados em 48 h úteis | Manutenção externa | % | P1 encerrados ≤ 48 h úteis ÷ P1 encerrados × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 100 | — |
| `TI_FCR` | Resolução no primeiro contato (FCR) | TI | % | resolvidos no 1º contato ÷ resolvidos com marcação × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 70 | A exportação atual não traz marcação de primeiro contato. |
| `TI_CSAT` | Satisfação (CSAT) | TI | nota | Σ notas ÷ respostas | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 4.5 | — |
| `TI_PATCHES_30D` | Patches críticos aplicados em até 30 dias | TI | % | aplicados ≤ 30 dias ÷ liberados × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | mensal: >= 100 | — |
| `TI_SEGURANCA_PENDENTES` | Incidentes de segurança não tratados | TI | qtd | incidentes de segurança com status ABERTO (fotografia) | FOTOGRAFIA | MENOR_MELHOR | mensal: <= 0 | — |

## Operacionais (séries dos painéis)

| Código | Indicador | Área | Unidade | Fórmula | Consolidação | Direção | Metas iniciais | Pendências |
|---|---|---|---|---|---|---|---|---|
| `MI_LAVAGENS` | Lavagens/higienizações realizadas | Manutenção interna | qtd | Σ manutenções internas HIGIENIZADO | SOMA | INFORMATIVO | — | — |
| `ME_ATENDIMENTOS` | Atendimentos externos realizados | Manutenção externa | qtd | Σ chamados externos encerrados no mês | SOMA | INFORMATIVO | — | — |
| `ME_TROCAS` | Trocas de equipamento solicitadas pela manutenção | Manutenção externa | qtd | Σ solicitações de troca no mês | SOMA | INFORMATIVO | — | — |
| `EP_VALOR_ENTRADAS` | Entradas de estoque (R$) | Estoque de peças | R$ | Σ valor das entradas | SOMA | INFORMATIVO | — | — |
| `EP_VALOR_SAIDAS` | Saídas de estoque (R$) | Estoque de peças | R$ | Σ valor das saídas | SOMA | INFORMATIVO | — | — |
| `CO_ENTREGAS_SEM_EXITO` | Entregas/retiradas sem êxito | Comodato | qtd | Σ tentativas/movimentos sem êxito | SOMA | INFORMATIVO | — | — |
| `TI_CHAMADOS_ABERTOS` | Chamados de TI abertos no mês | TI | qtd | Σ chamados abertos no mês (exclui testes) | SOMA | INFORMATIVO | — | — |

## Candidatos — desativados até homologação

| Código | Indicador | Área | Unidade | Fórmula | Consolidação | Direção | Metas iniciais | Pendências |
|---|---|---|---|---|---|---|---|---|
| `TI_CUSTO_RECEITA` | Custo de TI sobre receita | TI | % | custo de TI ÷ receita × 100 | MEDIA_PONDERADA | MENOR_MELHOR | — | Linha de base, teto e fonte financeira a homologar. |
| `MI_TAXA_RECUPERACAO` | Taxa de recuperação | Manutenção interna | % | recuperados ÷ recebidos com desfecho × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `MI_TEMPO_CICLO` | Tempo de ciclo da oficina | Manutenção interna | dias | média (conclusão − recebimento) | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `MI_CUSTO_RECUPERADO` | Custo por equipamento recuperado | Manutenção interna | R$ | (peças + mão de obra) ÷ recuperados | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `ME_FCR` | Resolução na primeira visita | Manutenção externa | % | resolvidos na 1ª visita ÷ atendimentos com marcação × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `ME_MTTR_FAMILIA` | MTTR por família de equipamento | Manutenção externa | h úteis | média horas úteis abertura→encerramento por família | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `ME_MTBF_FAMILIA` | MTBF por família | Manutenção externa | dias | tempo médio entre falhas do mesmo ativo | MEDIA_PONDERADA | MAIOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `ME_REINCIDENCIA_30D` | Reincidência em 30 dias | Manutenção externa | % | retornos ≤ 30 dias ÷ atendimentos × 100 | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `EP_COBERTURA_CRITICAS` | Cobertura das peças críticas | Estoque de peças | meses | saldo útil ÷ consumo médio | MEDIA_PONDERADA | FAIXA | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `EP_GIRO_SEM_MOVIMENTO` | Giro e estoque sem movimento | Estoque de peças | R$ | saldo de itens sem movimento > 90 dias | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `EP_RUPTURA_CRITICO` | Ruptura de item crítico | Estoque de peças | dias | dias com saldo zero de itens críticos | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `CO_UTILIZACAO_PARQUE` | Taxa de utilização do parque | Comodato | % | ativos em cliente ÷ parque total × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `CO_PARADO_30_60_90` | Equipamento parado há 30/60/90 dias | Comodato | qtd | ativos em estoque por faixa de idade da última movimentação | FOTOGRAFIA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `CO_ENTREGA_1A_TENTATIVA` | Sucesso da entrega na primeira tentativa | Comodato | % | movimentos concluídos na 1ª tentativa ÷ movimentos com tentativa × 100 | MEDIA_PONDERADA | MAIOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `CO_LEAD_TIME` | Lead time de instalação/retirada | Comodato | dias | média (conclusão − solicitação) | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `TI_REABERTURA` | Reabertura/reincidência de chamados | TI | % | chamados vinculados a anterior ÷ chamados resolvidos × 100 | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `TI_CHANGE_FAILURE` | Change failure rate | TI | % | mudanças com incidente ou rollback ÷ mudanças × 100 | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `TI_LEAD_TIME` | Lead time de entrega de TI | TI | dias | média (produção − demanda) | MEDIA_PONDERADA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |
| `TI_BACKLOG_FAIXAS` | Idade do backlog por faixas | TI | qtd | chamados abertos por faixa de idade (0–7, 8–15, 16–30, >30 dias úteis) | FOTOGRAFIA | MENOR_MELHOR | — | Fonte, fórmula, dono, meta e qualidade dos dados a aprovar antes de entrar no painel oficial. |

## Semáforo

- Verde: atingiu a meta.
- Amarelo: fora da meta dentro da tolerância (padrão 5%, relativa à meta e na direção do indicador). Ex.: meta ≥ 95% → amarelo de 90,25% a 94,99%; meta ≤ 5% → amarelo acima de 5% até 5,25%.
- Vermelho: além da tolerância — exige plano de ação.
- N/A: sem dado ou denominador zero (nunca verde). Sem meta homologada: status neutro.

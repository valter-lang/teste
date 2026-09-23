# Migração da planilha histórica

Importador do arquivo "Dashboard Executivo Manutenção, Comodato e T.I." (6 abas, meses de
jan a dez/2026 nas colunas B..M, dados até agosto/2026).

| Peça | Arquivo |
|---|---|
| Analisador (puro, sem banco) | `src/lib/importacao/planilha.ts` (`analisarPlanilha`) |
| Mapeamento de famílias | `src/lib/importacao/familias.ts` |
| Gravação / descarte / homologação | `src/lib/importacao/gravar.ts` |
| Reconciliação planilha x sistema | `src/lib/importacao/reconciliacao.ts` |
| Tela | `/importacao` e `/importacao/[id]` |
| Linha de comando | `npx tsx scripts/importar-planilha.ts <arquivo.xlsx> --usuario <email> [--gravar]` |

## Ciclo de vida

1. **ANALISADA**: o arquivo vai para `arquivo` (categoria `IMPORTACAO`), o resumo (sem dados
   pessoais) para `importacao.resumo` e as pendências para `importacao_pendencia`. Nada é gravado
   nas tabelas de dados.
2. **GRAVADA**: o arquivo guardado é reanalisado com o catálogo atual, as propostas aceitas são
   aplicadas e tudo é gravado numa única transação (`app.usuario_id`, `app.ignorar_bloqueio = on`,
   `app.contexto = {importacao_id}`). A reconciliação é calculada e salva em `importacao.reconciliacao`.
3. **HOMOLOGADA**: exige status GRAVADA, observação e que toda pendência `TOTAL_INCOMPATIVEL` ou
   `CONCILIACAO` tenha resolução escrita.
4. **DESCARTADA**: apaga `historico_agregado`/`historico_detalhe` da importação e as linhas de
   `solicitacao_troca`, `comodato_posicao` e `chamado_ti` (e `chamado_ti_restrito`, por cascata)
   cujo `origem_ref.importacao_id` é a importação. Motivo obrigatório quando já gravada.

Idempotência: o mesmo arquivo (sha256) não pode ser registrado nem gravado enquanto outra
importação dele estiver GRAVADA/HOMOLOGADA. Como `historico_agregado` tem chave única
(série, dimensão, competência), só uma importação pode ocupar o histórico por vez: para gravar
uma nova versão, descarte a anterior.

## Regras gerais

- Célula vazia = não informado: nenhuma linha é criada. Zero explícito é importado como 0.
- Fórmulas nunca viram dado. Todo Total/Média (e linhas TOTAL) é recalculado a partir das células
  (vazias ignoradas, como no Excel) e comparado ao valor em cache; diferença gera
  `TOTAL_INCOMPATIVEL`. Fórmula com forma errada gera `FORMULA_INVALIDA` (uma por bloco).
  O exceljs descarta zeros em cache de fórmulas compartilhadas; cache ausente é tratado como 0.
- Os blocos são localizados pelo título (coluna A ou qualquer coluna da linha) e pelo cabeçalho de
  datas; as linhas terminam na primeira linha vazia ou TOTAL. Nada depende de número de linha fixo.
- Toda célula não vazia que nenhum bloco consumiu vira `SEM_MAPEAMENTO` (agrupada por região, com
  os valores em `valor_bruto`). Anotações ("Formula não digitar", "... Faz", "... Digita") são ignoradas.
- Origem: `historico_agregado.aba/celula`, `historico_detalhe.aba/faixa` e, nas tabelas operacionais,
  `origem = 'IMPORTACAO'` e `origem_ref = {arquivo, sha256, importacao_id, aba, linha}`.

## Mapeamento por bloco

| Aba | Bloco | Destino |
|---|---|---|
| Equipe Interna | Manutenção interna por equipamento | `MI_RECUPERADOS` (FAMILIA_EQUIP) |
| | Equipamentos mais sucateados | `MI_SUCATEADOS` (FAMILIA_EQUIP; ARMARIO e ESQUELETO ficam separados) |
| | Lavagens por equipamentos | `MI_LAVAGENS` (FAMILIA_EQUIP) |
| | Peças utilizadas internamente | `MI_PECAS_QTD` (FAMILIA_PECA) |
| | Quadros laterais "Valor Unitario / Valor Final" | não importados: `DIVERGENCIA_FONTE` (estimativa sem fórmula homologada) |
| Equipe Externa | Técnicos com mais atendimento | `ME_ATENDIMENTOS` (TECNICO); linha TOTAL (só jun–ago) conferida |
| | Técnicos com mais reincidentes | `ME_REINCIDENCIAS` (TECNICO) |
| | Manutenção externa por equipamento | `ME_CHAMADOS` (FAMILIA_EQUIP) |
| | Manutenção externa por rede | `ME_CHAMADOS_REDE` (REDE); média `AVERAGE(B+C+…)` = `FORMULA_INVALIDA` |
| | Clientes com mais chamados (blocos "Mês") | `ME_CHAMADOS_CLIENTE` (CLIENTE, texto sem espaços nas pontas); contagem conferida com o resumo "Ano 2026" |
| | Quantos chamados desnecessários | "Não" → `ME_NECESSARIOS`, "SIM" → `ME_DESNECESSARIOS` |
| | Chamados desnecessários por cliente | `historico_detalhe` tipo `DESNECESSARIO` (`dados.fantasia/solicitante/motivo/solucao`) |
| | Manutenção em equipamento do cliente | `historico_detalhe` tipo `EQUIP_CLIENTE` (`dados.valor` numérico) |
| | Resumo de manutenção em equipamento do cliente | `ME_EQUIP_CLIENTE_QTD`; conferido com a lista |
| | Trocas de equipamentos solicitadas | `solicitacao_troca` (competência = mês da solicitação; CONCLUIDA se há data da troca, senão PENDENTE) |
| | Resumo de trocas | `ME_TROCAS_QTD`; conferido com a contagem de trocas por mês |
| | Peças utilizadas externamente | `ME_PECAS_QTD` (FAMILIA_PECA) |
| Estoque | Entrada / Saída de estoque (R$) | `EP_ENTRADA_RS` / `EP_SAIDA_RS` (FAMILIA_PECA); TOTAL GERAL conferido |
| | Esboço de tabela dinâmica | ignorado: `INFORMATIVO` |
| Entrega e retirada Comodato | Resumo | `CO_ENTREGAS`, `CO_TROCAS`, `CO_RETIRADAS`, `CO_SEM_EXITO`, `CO_FIM_ANO`; TOTAL conferido |
| Estoque Comodato | Blocos "Final mês …" | `comodato_posicao` (produto = texto original) |
| T.I | Lista de chamados (cabeçalho "Número") | `chamado_ti` + `chamado_ti_restrito` |
| | Quadro-resumo (linhas 2–12) | somente conferência |

### Cadastros

- Família de equipamento: igualdade com nome ou sinônimo (maiúsculas, sem acentos, espaços
  colapsados). Sem igualdade, a heurística por prefixo (ex.: "FREEZER HORIZONTAL", "6 ARMARIO 58X70")
  gera **proposta** + pendência `SEM_MAPEAMENTO`; nada é fundido em silêncio. Textos com duas
  famílias ("FORNO E FREEZER") exigem decisão manual e ficam sem família. Propostas aceitas de
  rótulos de série/produto viram sinônimos; nas trocas (texto descritivo) só aplicam a família.
  Rótulos sem família reconhecível viram proposta de nova família. `dimensao_valor` guarda sempre
  o texto original e `dimensao_id` a família mapeada.
- Famílias de peça, técnicos e redes são criados se não existirem ("TERCEIRO" → tipo TERCEIRO,
  "APOIO" → APOIO, demais EXTERNO). Clientes (fantasia) não viram cadastro.

### Estoque de comodato

Para cada produto: se `Ant + Ent − Saída novo − Saída usado ≠ Novos + Usados`, grava `ajuste` com a
diferença, `justificativa_ajuste = 'Diferença histórica da planilha (importação) — revisar'` e cria
`CONCILIACAO`. Também geram `CONCILIACAO`: `Atual ≠ Novos + Usados` e `Ant ≠ Atual do mês anterior`
(pareado pela família, então "MINI CAMARA SEM GRADES 1980" e "MINI CAMARA" são o mesmo produto).
A linha de totais (custo usados/novos) é conferida com a soma.

### T.I

- Origem: número `TI-…` (Origem "portal") → `TI`; número `SRL-…` ou Origem "Linear" → `LINEAR`
  (são os chamados Linear/OPIVA; sem tipo, nível, SLA nem contatos); outros → `OUTRO` + pendência.
- Datas em texto "dd/mm/aaaa, hh:mm:ss" (America/Sao_Paulo) → timestamptz com `-03:00`.
  Horas "16.1h", "-4h", "+5.2h" → número. Tags separadas por vírgula.
- Status: Encerrado / Resolvido, Done → RESOLVIDO; Cancelado, Canceled, Duplicate → CANCELADO;
  Aberto, Reaberto, Backlog, Todo → ABERTO; Em Atendimento, In Progress, In Review → EM_ATENDIMENTO;
  Aguardando* → AGUARDANDO; Escalado* → ESCALADO. Outro valor → ABERTO + `SEM_MAPEAMENTO`.
- E-mail do técnico/solicitante, ramal, IP, "Fechado Por" e "Escalado Por" vão somente para
  `chamado_ti_restrito` (a auditoria já remove essas colunas).
- Título "teste" ou "teste" + caracteres aleatórios sem espaço → `dado_teste = true` + `DADO_TESTE`.
  Número repetido → `DUPLICIDADE` (mantida a primeira linha). Fechamento anterior à abertura é descartado.
- O tempo médio do quadro-resumo é a média do "Tempo de Resolução" dos chamados **TI resolvidos**
  (132 chamados = 28,75 h ≈ 28,8 h; com os 135 chamados que têm tempo daria 28,3 h).

## Reconciliação

`relatorioReconciliacao(importacaoId)` compara, por aba/série/competência, as referências extraídas
da planilha com o banco:

- soma das células de cada série × soma de `historico_agregado` da importação;
- linhas TOTAL/TOTAL GERAL da planilha × soma das séries do bloco;
- resumos de contagem × linhas gravadas (clientes listados, trocas por mês de solicitação,
  registros de manutenção em equipamento do cliente);
- totais de custo (usados/novos) e posição (novos + usados) do estoque de comodato;
- quadro-resumo de TI × `chamado_ti` (TI, Linear, total, abertos, resolvidos, cancelados, SLA violado,
  tempo médio com tolerância de 0,05 h).

## Resultado na planilha real (importação gravada em `gerencial_imp`)

Linhas gravadas: 1.755 em `historico_agregado` (21 séries), 143 `DESNECESSARIO` + 34 `EQUIP_CLIENTE`
em `historico_detalhe`, 77 trocas, 48 posições de comodato, 396 chamados (146 TI, 250 Linear, 1 de teste).
669 totais/médias recalculados; reconciliação: 249 de 250 verificações conferem.

Divergências e pendências encontradas:

| Tipo | Local | Situação |
|---|---|---|
| TOTAL_INCOMPATIVEL | Equipe Externa H228 | Resumo de agosto informa 5 manutenções em equipamento do cliente; a lista tem 4 |
| FORMULA_INVALIDA | Equipe Externa O39:O111 | Média por rede usa `AVERAGE(B+C+…+M)` (devolve a soma); só agosto tem dados, por isso os valores coincidem |
| FORMULA_INVALIDA | Equipe Externa M145 | Total do resumo "Clientes com mais chamados" soma A:K (exclui dezembro) |
| DIVERGENCIA_FONTE | Equipe Interna Q3:S10 | Estimativa de economia (total R$ 3.784.550,31) não importada |
| DIVERGENCIA_FONTE | Equipe Interna Q15:S23 | Estimativa de perda por sucata (total R$ 339.168,32) não importada |
| DIVERGENCIA_FONTE | Equipe Externa linha 156 | Desnecessários (resumo × lista por cliente): jan 11 × 12, fev 24 × 19, mar 21 × 19, jun 18 × 17 |
| DADO_TESTE | T.I | 1 chamado TI com título de teste |
| SEM_MAPEAMENTO | Famílias | 13 propostas (ARMARIO, ESQUELETO e 10 textos de trocas mapeáveis; "FORNO E FREEZER" manual) |
| SEM_MAPEAMENTO | T.I F2:G6 | Quadro "Entregas de TI em APP" sem destino no modelo |
| INFORMATIVO | Estoque A99:B106 | Esboço de tabela dinâmica sem dados |

Sem divergências: todos os totais por família/mês, TOTAL GERAL de estoque, TOTAL de entregas/retiradas,
estoque de comodato (todas as posições fecham e encadeiam mês a mês) e o quadro-resumo de TI.

## Testes

```
DATABASE_URL=postgres://…/gerencial_imp npx vitest run tests/unit/importacao-planilha.test.ts tests/integration/importacao.test.ts
PLANILHA_REAL=/caminho/planilha.xlsx npx vitest run tests/integration/importacao-real.test.ts
```

Os testes usam a planilha sintética de `tests/fixtures/gerarPlanilhaSintetica.ts` (mesmo layout,
dados fictícios). O teste de integração exige um banco sem importação GRAVADA/HOMOLOGADA (descarte
a importação real antes) e remove tudo o que cria. A planilha real contém dados pessoais e nunca
deve ser copiada para o repositório.

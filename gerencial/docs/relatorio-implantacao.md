# Relatório de implantação — fontes, divergências, decisões e pendências

Data da análise: 23/09/2026. Este documento atende às seções 2, 18 e 20 da especificação. Nenhuma divergência foi resolvida em silêncio: cada uma tem a decisão tomada no sistema e o item de homologação correspondente, que também aparece na tela **Pendências de homologação** (`/homologacao`).

## 1. Inventário das fontes recebidas

| Fonte citada na especificação | Recebida? | Uso no sistema |
|---|---|---|
| `Padrao-Gerencial-Comodato.pptx` | **Não** | As regras e metas transcritas na especificação (seção 10.2) foram carregadas como versão 1, marcadas “conferir com o documento original”. |
| `Padrao-Gerencial-TI.pptx` | **Não** | Idem, seção 10.3. |
| `Dashboard Executivo (Manutencao, Comodato e T.T.).xlsx` | Sim | Campos, cadastros, dados históricos de jan–ago/2026 e fórmulas atuais. Importador assistido em `/importacao`. |
| `apresentacao mes 07-26.pdf` | Sim (66 páginas, somente imagem) | Referência visual e de conteúdo das análises mensais, acumulados, rankings e tabelas. |
| `apresentacao-06-26.pptx` e `mes 06_26 apresentacao.-1.pdf` | Sim | Referência histórica de conteúdo e comparabilidade. |
| Arquivo de “metas urgentes” | **Sim, ao contrário do que a especificação informa** (`metas_marisa_urgente.pptx`) | Carregado como **proposta** de metas (status `PROPOSTA`), sem aprovação. Veja D-02. |
| `www.costalavos.com.br` | Inacessível a partir do ambiente de desenvolvimento (bloqueio de rede) | Foram usados os tokens de cor e tipografia da especificação. O logotipo oficial deve ser enviado em Configurações → Identidade visual. |

## 2. Arquitetura encontrada

O repositório continha apenas o painel estático “Equipamentos em Campo” (`index.html`, `equipamentos.html`, `fornecedores.html`, `movimentacoes.html`, `app.js`, `supabase-client.js`). Ele lê a tabela `bd_cl_inv` do Supabase com a chave anônima, não tem autenticação e guarda parte dos cadastros no `localStorage` do navegador. **Não existe um “Painel Diretoria/Costa Lavos App”** com autenticação, banco ou design system reutilizável.

Decisão: o sistema gerencial foi criado como módulo novo em `gerencial/` (Next.js + TypeScript + PostgreSQL), sem alterar nenhum arquivo do painel existente. O `.vercelignore` na raiz impede que `gerencial/` seja publicado pelo deploy estático atual; o módulo tem deploy próprio (veja `docs/operacao.md`). A tabela `bd_cl_inv` (base instalada do Protheus/AA3) é lida **somente para leitura** por uma integração opcional (Configurações → Integrações), para registrar a fotografia mensal da base ativa. Como não havia cadastro de usuários, não há duplicidade: o módulo passa a ser o cadastro único de usuários.

## 3. Divergências encontradas

| # | Divergência | Evidência | Decisão no sistema | Homologação |
|---|---|---|---|---|
| D-01 | Padrões gerenciais não entregues | Arquivos ausentes | Regras da especificação carregadas como v1; `fonte_documento` indica a transcrição | Conferir cada meta e fórmula com os originais |
| D-02 | Metas urgentes existem e divergem do padrão | Manutenção interna: “+15% de produtividade” (jun→jul); Manutenção externa: “−25% de reincidência”; Comodato: “−15% de solicitações pendentes”; TI: “metas do TI” sem número | As metas de manutenção interna e externa foram carregadas como `PROPOSTA` (não entram no semáforo). A de Comodato não tem série de origem na planilha (“solicitações pendentes”) e a de TI não tem valor numérico: ficaram só como pendência. Prevalece o padrão até a aprovação | Diretoria aprova ou rejeita em `/metas` |
| D-03 | Reincidência medida de duas formas | O arquivo de metas compara **quantidade** (10 → 17 = +70%); o padrão mede **taxa** (17 ÷ 360 = 4,7%, 10 ÷ 389 = 2,6% → +84%) | O indicador oficial é a taxa; a proposta de −25% ficou registrada sobre a taxa com o motivo explícito | Definir a base da meta relativa |
| D-04 | Três volumes diferentes de manutenção externa em jul/26 | 360 atendimentos por técnico; 417 chamados por equipamento; 372 chamados classificados (29 + 343) | Séries separadas: `ME_ATENDIMENTOS` (denominador da reincidência), `ME_CHAMADOS` (chamados por 100 equipamentos), `ME_NECESSARIOS`/`ME_DESNECESSARIOS` (taxa de desnecessários) | Homologar a definição de cada volume |
| D-05 | Estimativas de economia e de perda sem fórmula homologada | Planilha (colunas “Valor Unitário/Valor Final”) e deck de julho (“Economia gerada no 1º semestre R$ 3.273.239,08”; “Perda com sucateamento R$ 326.361,16”) | Não importadas como dado e não exibidas (regra 3 da especificação) | Aprovar fórmula e fonte de custo, se desejado |
| D-06 | Fórmula quebrada | Aba Equipe Externa, bloco por rede: coluna Média = `AVERAGE(B+C+…)`, que é igual à soma | Fórmula não importada; o sistema recalcula a partir dos valores | Nenhuma (informativo) |
| D-07 | Posição do estoque de comodato | O deck de julho mostra o custo total, mas não a conciliação | O sistema exige `anterior + entradas − saídas + ajuste = novos + usados`; diferenças históricas viram ajuste justificado e pendência | Revisar ajustes gerados pela importação |
| D-08 | Mascote e imagem ilustrativa no deck de julho | Páginas 1, 64 e 65 | Não reproduzidos (regra de identidade visual) | Aprovar uso, se desejado, com arquivo oficial |
| D-09 | Tempo médio de resolução de TI | A planilha informa 28,8 h (horas corridas); o padrão pede MTTR em horas úteis descontando pausas | O MTTR oficial usa o calendário oficial; o valor da planilha fica só na reconciliação | Homologar o expediente e a política de pausas |
| D-10 | Chamados Linear/OPIVA | 250 dos 396 chamados exportados vêm do Linear (numeração `SRL-…`, sem tipo, SLA nem contatos); os 229 chamados de julho são todos Linear, e os 146 de suporte de TI são de agosto | Entram na contagem e nos painéis, identificados pela origem, mas ficam **fora** de SLA, MTTR, backlog, FCR e CSAT até a decisão (parâmetro `ti.incluir_linear_nos_indicadores`). Por isso julho aparece como “Não informado” nos indicadores de serviço de TI | Decidir se desenvolvimento entra no SLA do catálogo |
| D-11 | Chamado de teste na base de TI | Título sem sentido aberto e encerrado em 2 minutos | Marcado `dado_teste` e excluído dos indicadores; aparece no checklist | Confirmar exclusão |
| D-12 | Nomes de famílias inconsistentes | “CLIMATICA” × “CLIMATIZADORA”, “ARMARIO” e “ESQUELETO” separados no sucateamento × “ARMARIO/ESQUELETO” na recuperação, “FONRO”, “MINI CAMERA” | Sinônimos cadastrados; a importação propõe o mapeamento e registra pendência em vez de juntar em silêncio | Confirmar sinônimos |
| D-13 | Deck de junho com saídas de abril negativas | Slide 21: “-R$ 17.039,65” em abril | O sistema exibe valores de saída sempre positivos | Nenhuma (informativo) |
| D-15 | SLA de TI de agosto | A planilha informa 22 chamados “com atendimento excedido”; entre os 130 chamados de suporte resolvidos em agosto, 15 têm SLA violado (88,5% no prazo). A planilha conta pela abertura; o sistema conta pela data de resolução | Base oficial: chamados resolvidos no mês | Homologar a base do SLA |
| D-16 | Resumos × listas na aba Equipe Externa | Manutenção em equipamento do cliente, agosto: resumo 5 × lista 4 (H228). Desnecessários, resumo × lista por cliente: jan 11×12, fev 24×19, mar 21×19, jun 18×17. O total M145 soma só A:K (sem dezembro) | O indicador usa o resumo mensal; as listas ficam como detalhe histórico; a diferença aparece na reconciliação | Confirmar qual fonte vale |
| D-14 | “Trocas solicitadas”: resumo × detalhe | A linha-resumo mensal e a lista de trocas podem diferir (datas de solicitação × troca) | A importação compara as duas e registra pendência quando diferem | Revisar na reconciliação |

## 4. Decisões de modelagem (registradas no código)

1. **Ausência ≠ zero.** Uma competência sem nenhum lançamento na área, e ainda não validada pelo gestor, aparece como “Não informado”. Onde a ausência de registro pode significar “não houve” (P1, incidente de segurança, teste de restauração), o gestor precisa fazer uma declaração explícita no fechamento.
2. **Histórico × lançamentos.** Antes da data de corte (`migracao.data_corte`, padrão 01/09/2026), os indicadores usam as séries migradas da planilha. A partir dela, usam os lançamentos do sistema. A fonte aparece em cada cartão e na memória de cálculo.
3. **Consolidação.** Taxas são sempre recalculadas por Σ numeradores ÷ Σ denominadores; fotografias usam a última competência; somas não preenchem mês ausente.
4. **Metas de taxa em trimestre/semestre/ano.** Quando não há meta específica do ciclo, a meta mensal absoluta vale para indicadores de taxa ou fotografia (é invariante à escala). Para somas, sem meta do ciclo, o status fica “Sem meta homologada”.
5. **Backup e restauração** viraram dois indicadores essenciais ligados (`TI_BACKUP` = taxa; `TI_TESTES_RESTAURACAO` = contagem, 1/mês, 3/trimestre, 6/semestre).
6. **Base ativa +5/mês** foi interpretada como linha de base fixa + 5 × meses. Sem linha de base homologada, o status é “Sem meta”.
7. **Reincidência por técnico** é atribuída ao técnico do atendimento anterior (o que gerou o retorno).
8. **Indicador vermelho exige plano de ação**: o envio do período para aprovação é bloqueado enquanto houver indicador vermelho sem plano ativo e sem explicação do desvio.
9. **Cache de indicadores**: os resultados são reaproveitados até haver alteração nas tabelas de origem (detectada pela trilha de auditoria) e ficam congelados em período FECHADO.

## 5. Pendências de homologação (resumo)

1. Conferir as regras e metas com `Padrao-Gerencial-Comodato.pptx` e `Padrao-Gerencial-TI.pptx`.
2. Aprovar ou rejeitar as propostas do arquivo de metas urgentes (D-02, D-03).
3. Enviar o logotipo oficial aprovado.
4. Homologar o expediente oficial (horário e sábado), os feriados municipais e as unidades além de Caieiras.
5. Definir a janela de reincidência (dias) e os critérios de elegibilidade do SLA de primeira resposta.
6. Definir as linhas de base: base ativa, volume por equipamento e consumo mínimo por cliente.
7. Definir a fonte de vendas (kg) e a integração da base ativa (status AA3 considerados ativos).
8. Definir se os chamados Linear/OPIVA entram no SLA e no MTTR de TI.
9. Confirmar os sinônimos de famílias e revisar os ajustes de conciliação do estoque de comodato.
10. Homologar a migração: reconciliar pelo menos um período completo contra a planilha e a apresentação (critério de entrada em produção).
11. Aprovar os indicadores candidatos da seção 11 antes de ativá-los.

## 6. Dados que a planilha não contém

Base instalada ativa; kg comprados por cliente; horários de abertura e primeira resposta dos chamados externos; disponibilidade de sistemas; execução de backup e testes de restauração; incidentes P1; marcos de projetos de TI; patches. Os indicadores que dependem desses dados aparecem como “Não informado” até que sejam lançados no sistema. Nenhum valor é estimado.

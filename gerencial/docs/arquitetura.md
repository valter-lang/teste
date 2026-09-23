# Arquitetura

## 1. Mapa atual × proposto

```
Repositório valter-lang/teste
├── index.html, equipamentos.html, ...   Painel estático "Equipamentos em Campo" (inalterado)
│      └── lê Supabase bd_cl_inv com chave anônima (sem login)
└── gerencial/                           Sistema Gerencial Executivo (novo módulo)
       ├── Next.js 16 (App Router)  ── páginas server-side + server actions (autorização no servidor)
       ├── PostgreSQL               ── esquema normalizado, auditoria e bloqueio de período por trigger
       ├── worker de relatórios     ── fila relatorio_job → Excel / PDF / PowerPoint
       └── integração opcional      ── leitura de bd_cl_inv (base instalada) → comodato_base_ativa
```

Não havia autenticação, banco próprio nem design system a reutilizar. O módulo novo passa a ser o cadastro único de usuários. Se o Painel Diretoria vier a existir em outro repositório, o caminho é incorporar `gerencial/` como rota/módulo dele e trocar `src/lib/auth/sessao.ts` pelo provedor de identidade daquele app (a matriz de permissões em `src/lib/auth/permissoes.ts` continua igual).

## 2. Camadas e separação exigida pela especificação

| Camada | Onde fica | Observação |
|---|---|---|
| Dados de origem | `manut_interna`, `chamado_externo`, `solicitacao_troca`, `movimento_estoque`, `comodato_*`, `chamado_ti`, `ti_*`, `historico_agregado` | Eventos reais; indicadores nunca são digitados |
| Indicadores calculados | `indicador_resultado` + `src/lib/indicadores/` | Calculados no servidor, com memória reproduzível e hash |
| Metas | `meta` | Versionadas, com vigência, aprovador, motivo e regra de ciclo em trigger |
| Análises e comentários | `analise_item`, `comentario_diretoria` | Estruturados (fato, número, responsável) |
| Planos de ação | `plano_acao`, `plano_acao_andamento` | Histórico completo e encerramento com evidência |
| Relatórios gerados | `relatorio_job`, `arquivo` | Versão, selo, hash dos dados, usuário e data |

## 3. Fluxo de cálculo (mesmo número em todos os canais)

```
lançamentos / histórico migrado
        │
        ▼
src/lib/indicadores/series.ts      séries mensais (fonte por competência: histórico antes do corte, eventos depois)
        │
        ▼
calculadores.ts                    numerador/denominador por competência + motivo quando não informado
        │
        ▼
motor.ts                           consolidação (fotografia | soma | Σnum/Σden), meta vigente, semáforo,
        │                          comparação, memória, persistência em indicador_resultado
        ├──► dashboards e painéis (páginas server-side)
        ├──► "Ver cálculo" (memória + links para os registros de origem)
        └──► relatórios (src/lib/relatorios/dados.ts monta UM snapshot usado por Excel, PDF e PowerPoint)
```

Cache: o resultado mensal é reutilizado enquanto nenhuma tabela de origem registrar alteração na trilha de auditoria depois do cálculo; em período FECHADO fica congelado. Aprovação, fechamento e reabertura forçam o recálculo.

## 4. Segurança

- Sessão em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, assinado (HS256) com expiração de 10 h; bloqueio após 5 tentativas; política de senha; troca obrigatória no primeiro acesso.
- Autorização sempre no servidor (`exigirPermissao` em páginas e server actions; `pode()` nos route handlers). Esconder botões é só conveniência.
- CSRF: server actions verificam Origin × Host (Next.js); route handlers que alteram estado usam `origemValida()`.
- SQL somente parametrizado; React escapa a saída; o HTML dos PDFs escapa todo texto; CSP restritiva.
- Uploads: limite de tamanho, lista de extensões permitidas e verificação de *magic bytes*; SVG com script é recusado.
- Banco: auditoria somente-inclusão; bloqueio de período por trigger (não depende da interface); CHECKs para as regras de negócio (datas coerentes, justificativas obrigatórias, conciliação do estoque de comodato).
- Minimização: contatos de TI em tabela restrita; exportações executivas sem e-mail, IP, ramal nem nome de solicitante; anonimização opcional de nomes para a Diretoria.

## 5. Perfis

| Perfil | Principais permissões |
|---|---|
| Administrador | usuários, cadastros, calendário, parâmetros, integrações, importação, reabertura de período, auditoria |
| Lançador (por área) | inclui e corrige dados da própria área com o período aberto |
| Gestor (por área) | valida, escreve análises, cria planos, propõe metas, envia o período para aprovação, declara ausência de ocorrências |
| Diretoria | consulta tudo, comenta, aprova ou devolve o fechamento, aprova metas e encerramentos de planos |
| Auditor | leitura de dados e trilhas, sem alteração |

## 6. Fases e critérios de aceite

| Fase | Entregas | Critério de aceite |
|---|---|---|
| 0 Descoberta | inventário, divergências, arquitetura | `docs/relatorio-implantacao.md` aprovado |
| 1 Fundação e migração | autenticação, perfis, esquema, cadastros, importador e reconciliação | reconciliação sem diferença não explicada em jan–ago/2026 |
| 2 Operação | formulários, grade, colagem, validações, fechamento e auditoria | lançamentos de setembro sem uso da planilha |
| 3 Indicadores | motor, metas, semáforo, painéis, drill-down | testes de fórmulas e semáforo verdes; Diretoria abre o detalhamento de cada KPI |
| 4 Relatórios | Excel, PDF e PowerPoint editável de um clique, histórico e versões | valores idênticos entre painel e exportações (teste automatizado) |
| 5 Homologação | reconciliar um período completo, testar perfis e exportações | período de julho/2026 conferido com a planilha e o deck de julho; pendências de `/homologacao` resolvidas |

Não avançar para produção sem homologar os números de pelo menos um período completo contra a planilha e a apresentação correspondente.

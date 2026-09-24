# Sistema Gerencial Executivo — Costa Lavos

Sistema web que substitui a planilha “Dashboard Executivo (Manutenção, Comodato e TI)” como base operacional. Cada informação é registrada uma única vez; indicadores, painéis, Excel, PDF e PowerPoint leem a mesma base e mostram os mesmos valores.

Áreas: manutenção interna, manutenção externa, estoque de peças, comodato (entregas, trocas, retiradas e estoque) e TI. Inclui metas versionadas, fechamento mensal com aprovação, análises executivas, planos de ação, trilha de auditoria e migração assistida da planilha histórica.

> O painel estático “Equipamentos em Campo” na raiz do repositório continua como está. Este módulo fica em `gerencial/` e tem deploy próprio.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/relatorio-implantacao.md](docs/relatorio-implantacao.md) | Inventário das fontes, divergências, decisões e pendências de homologação |
| [docs/arquitetura.md](docs/arquitetura.md) | Mapa da arquitetura, fluxo de dados, segurança e plano por fases |
| [docs/catalogo-indicadores.md](docs/catalogo-indicadores.md) | Catálogo de indicadores e metas iniciais (gerado a partir do código) |
| [docs/dicionario-dados.md](docs/dicionario-dados.md) | Tabelas e regras do banco |
| [docs/importacao.md](docs/importacao.md) | Migração da planilha histórica e reconciliação |
| [docs/operacao.md](docs/operacao.md) | Instalação, variáveis, backup, atualização, recuperação e retenção |
| [docs/manual.md](docs/manual.md) | Manual curto para lançador, gestor e Diretoria |

## Teste local rápido

Passo a passo para Windows/Mac em [docs/teste-local.md](docs/teste-local.md): `docker compose up -d`, `npm run preparar:local`, `npm run dev` e acesse http://localhost:3000.

## Início rápido (desenvolvimento)

Requisitos: Node.js 20+ e PostgreSQL 14+ (ou um projeto Supabase).

```bash
cd gerencial
npm ci
cp .env.example .env           # preencha DATABASE_URL e SESSION_SECRET
npm run db:migrate             # cria/atualiza o esquema
ADMIN_EMAIL=voce@costalavos.com.br ADMIN_SENHA='SenhaTemporaria123' npm run db:seed
npm run dev                    # http://localhost:3000
```

Usuários de demonstração (um por perfil, senha `Demo12345678`) só podem ser criados com `APP_ENV=development`:

```bash
APP_ENV=development npm run db:seed-demo
```

Migração da planilha histórica (também disponível na tela **Migração da planilha**):

```bash
npm run importar -- caminho/da/planilha.xlsx --usuario voce@costalavos.com.br          # só analisa
npm run importar -- caminho/da/planilha.xlsx --usuario voce@costalavos.com.br --gravar # grava
```

Fila de relatórios em produção (processa Excel, PDF e PowerPoint fora da requisição web):

```bash
npm run worker
```

## Testes e verificações

```bash
npm run lint
npm run typecheck
npm run test:unit
DATABASE_URL=postgres://.../banco_de_teste npm run test:integration   # banco descartável, migrado e com seed
CHROMIUM_PATH=/caminho/chrome npm run test:e2e                         # sobe o app em modo dev na porta 3300
npm run build
```

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · PostgreSQL (`pg`, migrations SQL versionadas) · Tailwind CSS 4 com tokens da identidade Costa Lavos · Recharts · ExcelJS · PptxGenJS (PowerPoint editável com gráficos nativos) · Chromium via playwright-core (PDF) · Vitest · Playwright.

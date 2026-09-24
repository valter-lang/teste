# Teste local (no seu computador)

## 1. Instale uma vez

- **Node.js 20 ou mais novo** (versão LTS): https://nodejs.org
- **Git**: https://git-scm.com
- **PostgreSQL**, de uma das duas formas:
  - **Docker Desktop** (mais simples): https://www.docker.com/products/docker-desktop
  - ou PostgreSQL instalado direto: https://www.postgresql.org/download. Nesse caso, crie o usuário `gerencial` (senha `gerencial`) e o banco `gerencial`.

## 2. Baixe o projeto

```bash
git clone https://github.com/valter-lang/teste.git
cd teste
git checkout claude/costa-lavos-management-system-56tn9z
cd gerencial
npm ci
```

## 3. Suba o banco (com Docker)

```bash
docker compose up -d
```

## 3b. Sem Docker: PostgreSQL instalado no Windows

1. Baixe e instale o PostgreSQL 16 em https://www.postgresql.org/download/windows/ (instalador da EDB). Anote a senha do usuário `postgres` e mantenha a porta 5432.
2. Abra o **SQL Shell (psql)** pelo menu Iniciar, tecle Enter nas perguntas até pedir a senha e informe a senha do `postgres`.
3. Cole estes dois comandos:

```sql
create role gerencial login password 'gerencial';
create database gerencial owner gerencial;
```

## 4. Crie o arquivo `.env`

Copie `.env.example` para `.env` (no Windows: `copy .env.example .env`; no Mac/Linux: `cp .env.example .env`) e deixe estas linhas assim:

```
DATABASE_URL=postgres://gerencial:gerencial@localhost:5432/gerencial
SESSION_SECRET=teste-local-troque-em-producao-0123456789abcdef
APP_ENV=development
```

## 5. Prepare o banco e os usuários de teste

```bash
npm run preparar:local
```

Esse comando cria as tabelas, os dados mínimos e um usuário de demonstração por perfil. A senha de todos é `Demo12345678`.

| E-mail | Perfil |
|---|---|
| admin@demo.local | Administrador |
| diretoria@demo.local | Diretoria |
| gestor.manutencao@demo.local | Gestor (Manutenção, Estoque, Comodato) |
| gestor.ti@demo.local | Gestor (TI) |
| lancador.oficina@demo.local | Lançador (Manutenção interna) |
| auditor@demo.local | Auditor |

## 6. Importe a planilha histórica (opcional, recomendado)

Entre como **admin@demo.local** e use **Migração da planilha** no menu. Ou rode no terminal:

```bash
npm run importar -- "C:\caminho\Dashboard Executivo (Manutencao, Comodato e T.T.).xlsx" --usuario admin@demo.local --gravar
```

## 7. Abra o sistema

```bash
npm run dev
```

Acesse **http://localhost:3000**. Escolha **Julho/2026** no seletor de competência para conferir os números com a apresentação de julho.

### Geração de PDF

Excel e PowerPoint funcionam sem configuração extra. Para PDF, informe no `.env` o caminho do Chrome ou do Edge instalado:

- Windows: `CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`
- Mac: `CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

## Problemas comuns

| Sintoma | Solução |
|---|---|
| PowerShell: `npm.ps1 não pode ser carregado ... execução de scripts foi desabilitada` | Rode uma vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` e responda S, ou use `npm.cmd` no lugar de `npm` |
| `O termo 'docker' não é reconhecido` | O Docker Desktop não está instalado (ou o terminal foi aberto antes da instalação). Instale, reinicie o computador, abra o Docker Desktop e abra um novo terminal. Ou use a opção sem Docker (seção 3b) |
| `ECONNREFUSED ...5432` | O banco não está rodando: `docker compose up -d` (confira se o Docker Desktop está aberto) |
| `SESSION_SECRET ausente ou curto` | Preencha `SESSION_SECRET` no `.env` com 32 caracteres ou mais |
| Porta 3000 ocupada | `npm run dev -- -p 3001` e acesse http://localhost:3001 |
| Quer começar do zero | `docker compose down -v`, depois `docker compose up -d` e `npm run preparar:local` |

Os usuários `@demo.local` são só para teste. Nunca rode `preparar:local` em produção.

# Operação: instalação, variáveis, backup, atualização e recuperação

## 1. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão PostgreSQL. Em produção, use um usuário de aplicação (sem superusuário) e `sslmode=require`. |
| `SESSION_SECRET` | Sim | Segredo da sessão, com 32 caracteres ou mais (`openssl rand -base64 48`). Trocar o segredo encerra todas as sessões. |
| `APP_ENV` | Sim | `development`, `homologacao` ou `production`. Dados de demonstração só são aceitos em `development`. |
| `CHROMIUM_PATH` | Para PDF | Caminho do Chromium usado na geração de PDF. |
| `DB_POOL_MAX` | Não | Tamanho do pool de conexões (padrão 10). |
| `BASE_INSTALADA_SUPABASE_URL` / `BASE_INSTALADA_SUPABASE_KEY` | Não | Integração **somente leitura** com a tabela `bd_cl_inv` (base instalada). Use uma chave com permissão apenas de leitura. |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | Só no seed | Primeiro administrador. A troca de senha é exigida no primeiro acesso. |

Segredos ficam somente em variáveis seguras do provedor (nunca no repositório). O arquivo `.env` está no `.gitignore`.

## 2. Implantação

O módulo é um app Next.js independente do painel estático da raiz.

**Opção A — Vercel + Supabase/PostgreSQL gerenciado**
1. Crie um projeto na Vercel com *Root Directory* = `gerencial`.
2. Configure as variáveis acima.
3. Rode `npm run db:migrate` e `npm run db:seed` contra o banco (pipeline ou máquina de administração).
4. PDF: funções serverless não trazem Chromium. Rode o `npm run worker` em um contêiner (Docker/Fly/Render) com Chromium instalado e `CHROMIUM_PATH` configurado. Excel e PowerPoint também podem ser processados por esse worker.

**Opção B — contêiner próprio (recomendado para PDF)**
`npm ci && npm run build`, depois dois processos: `npm start` (web) e `npm run worker` (fila de relatórios), com Chromium instalado na imagem.

Cabeçalhos de segurança (CSP, `X-Frame-Options`, `nosniff`) são definidos em `next.config.ts`. Sirva apenas por HTTPS; o cookie de sessão é `Secure` em produção.

## 3. Atualização

1. Faça backup (seção 4).
2. Publique a nova versão.
3. `npm run db:migrate`. As migrations são aplicadas em ordem, cada uma em transação; o executor recusa migrations já aplicadas que tenham sido alteradas (hash).
4. Verifique `/api/saude` (`{"status":"ok"}`).

Nunca edite uma migration já aplicada: crie `NNN_descricao.sql` nova.

## 4. Backup

- **Banco:** backup diário completo (`pg_dump -Fc`) com retenção mínima de 35 dias, mais PITR/WAL quando o provedor oferecer (o Supabase oferece nos planos pagos). Arquivos anexados, logotipo, planilhas importadas e relatórios gerados ficam na tabela `arquivo` e entram no mesmo backup.
- **Teste de restauração:** mensal, em banco separado; registre o teste no próprio sistema (TI → Backup e restauração) para alimentar o indicador.

```bash
pg_dump -Fc "$DATABASE_URL" -f gerencial_$(date +%F).dump
```

## 5. Recuperação

```bash
createdb gerencial_restaurado
pg_restore -d gerencial_restaurado --no-owner gerencial_AAAA-MM-DD.dump
DATABASE_URL=postgres://.../gerencial_restaurado npm run db:migrate   # garante o esquema atual
```

Aponte `DATABASE_URL` para o banco restaurado e verifique `/api/saude`, o dashboard e a trilha de auditoria. Os resultados de indicadores (`indicador_resultado`) são um cache: podem ser apagados com segurança e são recalculados. Os de períodos fechados são recriados a partir dos dados de origem, que também estão congelados.

## 6. Retenção e privacidade (LGPD)

- Trilha de auditoria (`auditoria`, `evento_sistema`): somente inclusão, retenção mínima de 5 anos. Os triggers removem das cópias auditadas as colunas de e-mail, IP, ramal, senha e conteúdo binário.
- Contatos de chamados de TI (e-mail, ramal, IP) ficam em `chamado_ti_restrito`, visível só para administrador e gestor de TI, e nunca entram em painéis nem exportações executivas. Sugestão de retenção: 24 meses após o encerramento do chamado.
- Relatórios gerados: manter as versões oficiais (selo “Oficial”) por 5 anos e as preliminares por 12 meses.
- Planilhas importadas: manter até a homologação da migração mais 12 meses.
- Logs técnicos da aplicação não registram e-mails, IPs nem conteúdo de formulários.

## 7. Monitoramento

- `GET /api/saude` para verificação de disponibilidade (banco incluído).
- Erros de servidor aparecem no log do processo. Recomenda-se ligar o Sentry ou equivalente via `instrumentation.ts` (não incluído, para não enviar dados a terceiros sem aprovação).
- Fila de relatórios: jobs em `ERRO` aparecem na Central de relatórios com a mensagem segura. Consulta: `select status, count(*) from relatorio_job group by 1`.

## 8. Controle de concorrência

Lançamentos, planos de ação e fechamento usam versão otimista (`versao`). Quando duas pessoas editam o mesmo registro ou o mesmo fechamento, a segunda recebe o aviso “alterado por outra pessoa; recarregue”. Nada é sobrescrito em silêncio.

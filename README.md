# Delícias da Vann — Backend

API REST da confeitaria, construída com **NestJS 10**. Cuida de catálogo, pedidos, pagamento PIX, produção/capacidade, estoque, cupons, assinaturas, programa de indicação, clientes PJ, relatórios e notificações.

## Stack

- **NestJS 10** + TypeScript
- **Prisma 5** sobre **PostgreSQL** (schema em PT-BR)
- **Redis** + **BullMQ** para filas (notificações, jobs de funil/pedido)
- **JWT** (access + refresh) com **RBAC** por papel, e **Google OAuth** opcional (passport)
- **S3/MinIO** (`@aws-sdk/client-s3` + `sharp`) para upload e processamento de imagens
- Integrações: **AbacatePay** (PIX), **Twilio** (SMS), **Nodemailer** (e-mail), **OpenWeather** (clima), **Focus NF-e** (fiscal)
- Testes com **Jest**

A API sobe sob o prefixo global **`/api/v1`** na porta **`3000`**.

## Rodando

### Via Docker (a partir da raiz do monorepo)

Já está incluso no `docker compose up` da raiz — veja o [README principal](../README.md). Migrations e seed:

```bash
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose run --rm --no-deps backend npx prisma db seed
```

### Nativo

Precisa de um PostgreSQL e um Redis acessíveis. A forma mais fácil é subir só esses dois via Docker:

```bash
docker compose up -d db redis        # a partir da raiz
```

Depois, dentro de `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate dev      # cria/atualiza o schema no banco
npm run seed                # dados de demonstração
npm run start:dev           # http://localhost:3000/api/v1 (watch mode)
```

> **Atenção:** o `backend/.env` aponta o banco para `localhost:5432`. Como o container do Postgres é mapeado em `5433` (e no Windows há um Postgres nativo ocupando o `5432`), ao rodar nativo contra o container ajuste o `DATABASE_URL` para a porta `5433`.

## Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run start:dev` | Sobe em watch mode |
| `npm run start:prod` | Roda o build de produção (`dist/main`) |
| `npm run build` | Compila com o Nest CLI |
| `npm test` | Roda a suíte de testes (Jest) |
| `npm run test:watch` | Testes em watch |
| `npm run test:cov` | Testes com cobertura |
| `npm run prisma:studio` | Abre o Prisma Studio |
| `npm run seed` | Popula o banco (idempotente) |

## Banco de dados (Prisma)

- Schema: [`prisma/schema.prisma`](./prisma/schema.prisma) — nomenclatura de domínio em PT-BR (`Pedido`, `Produto`, `Cupom`, `Assinatura`, `Avaliacao`, `Empresa`, ...)
- Migrations versionadas em [`prisma/migrations/`](./prisma/migrations)
- Seed em [`prisma/seed.ts`](./prisma/seed.ts) — idempotente; cria produtos com fotos, opções de montagem de bolo (por kg), posts de bastidor, inspirações, slots de produção, sazonais e kits PJ

Reset completo do banco em dev:

```bash
docker compose run --rm --no-deps backend npx prisma migrate reset
```

## Módulos

Cada pasta em `src/modules/` é um módulo NestJS:

| Módulo | Responsabilidade |
|--------|------------------|
| `auth` | Login, registro, JWT (access/refresh), RBAC, Google OAuth |
| `user` | Usuários e perfis |
| `catalog` | Produtos, categorias, fotos, montagem de bolo por kg, vitrine admin |
| `order` | Pedidos, precificação (inclui preço por kg), rascunho via WhatsApp, processor de jobs |
| `payment` | PIX via AbacatePay, webhook, simulação de pagamento (dev) |
| `capacity` | Slots de produção e reserva de capacidade |
| `inventory` | Estoque e insumos |
| `cupom` | Cupons de desconto (com vínculo opcional a cliente) |
| `credito` | Crédito de cliente |
| `assinatura` | Assinaturas recorrentes |
| `avaliacao` | Avaliações/NPS e fotos da festa |
| `indicacao` | Programa de indicação |
| `empresa` | Clientes PJ (solicitação, aprovação, catálogo PJ) |
| `entrega` | Modalidades e configuração de entrega |
| `regras` | Regras de combinação, lead time, clima (OpenWeather) |
| `sazonal` | Janelas sazonais (ex.: Dia das Mães) |
| `ocasiao` | Ocasiões do cliente |
| `inspiracao` | Galeria de inspirações de bolo |
| `bastidor` | Posts de bastidores |
| `notification` | Notificações WhatsApp → SMS → e-mail (fallback em cascata) |
| `storage` | Upload e CDN via S3/MinIO (processamento com sharp) |
| `fiscal` | Emissão de NF-e (desligada por padrão) |
| `report` | Relatórios e KPIs (vendas diárias em America/Sao_Paulo) |
| `audit` | Log de auditoria das ações administrativas |
| `telemetria` | Eventos de funil/telemetria |

## Configuração

As variáveis de ambiente são lidas via `@nestjs/config`. No Docker, vêm do `.env` da raiz; nativo, de `backend/.env`. Veja [`.env.example`](./.env.example) para a lista completa e comentada. Principais grupos:

- **Infra:** `DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `APP_BASE_URL`, `FRONTEND_URL`
- **JWT:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- **Google OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (o login some se as credenciais estiverem vazias)
- **Integrações:** `ABACATE_PAY_*`, `WHATSAPP_*`, `TWILIO_*`, `MAIL_*`, `S3_*` / `CDN_BASE_URL`, `OPENWEATHER_*`, `FISCAL_ENABLED` / `NFE_*`

## Autenticação

- `POST /api/v1/auth/register` e `POST /api/v1/auth/login` retornam access token + setam um cookie httpOnly de refresh em `/api/v1/auth/refresh`
- `GET /api/v1/auth/google` inicia o fluxo OAuth → callback → redireciona o frontend com token
- Papéis (RBAC): `CLIENTE`, `CLIENTE_EMPRESA`, `OPERADOR`, `GERENTE`, `ADMINISTRADOR`

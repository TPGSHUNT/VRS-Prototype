# DG VRS — Vendor Rebate System (Prototype)

Prototype for Dollar General's replacement Vendor Rebate System. Demonstrates the full vision while producing code that ports to production unchanged.

See `/docs` for the build plan and schema specification.

## Stack

- **Web:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui
- **Worker:** Node.js + BullMQ for async report generation
- **Data:** PostgreSQL 16 + Prisma 6
- **Queue:** Redis 7 (BullMQ backend)
- **Reports:** exceljs (XLSX) · Puppeteer (PDF)
- **AI:** Anthropic Claude API (Vera)
- **Hosting:** Azure Container Apps · Azure Database for PostgreSQL · Azure Cache for Redis · Azure Blob Storage

## Repo layout

```
/web              Next.js app (UI + API route handlers)
/worker           BullMQ report worker (separate Container App)
/packages/db      Shared Prisma client used by web + worker
/prisma           schema.prisma + seed.ts
/docs             Build plan and schema specification
/infra            Bicep / az CLI scripts for Azure provisioning
```

## Local development

Prerequisites: Node 20.9+, Docker Desktop, npm 10+.

```powershell
# 1. Install dependencies (workspace install hoists everything)
npm install

# 2. Copy env file and edit ANTHROPIC_API_KEY
cp .env.example .env.local

# 3. Start local Postgres and Redis
npm run db:up

# 4. Run initial migration and seed
npm run db:migrate
npm run db:seed

# 5. Start the web app and worker (two terminals)
npm run dev          # Next.js on http://localhost:3000
npm run dev:worker   # BullMQ worker
```

## Common scripts

| Command              | What it does                                |
|----------------------|---------------------------------------------|
| `npm run dev`        | Next.js dev server                          |
| `npm run dev:worker` | BullMQ worker with hot reload               |
| `npm run db:up`      | Start Postgres + Redis containers           |
| `npm run db:migrate` | Run Prisma migrations against local DB      |
| `npm run db:seed`    | Seed mock data                              |
| `npm run db:reset`   | Drop, migrate, and reseed                   |
| `npm run db:studio`  | Open Prisma Studio                          |
| `npm run lint`       | Lint all workspaces                         |

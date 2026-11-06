# Northstar People — HR Operations Platform

Internal service requests and employee onboarding for a distributed, four-country company. The application uses one employee directory, authentication layer, and role scope across both workflows.

## Current delivery status

This repository is an implementation in progress. Architecture, database schema, seed data, login/session handling, service request workflows, dashboard, onboarding APIs, and the HR-only Smart Query Assistant are present. Production database and public hosting configuration have not been completed. See [COMPLIANCE_CHECKLIST.md](./COMPLIANCE_CHECKLIST.md) for evidence and remaining work.

## Stack

- Next.js App Router, React, TypeScript strict mode, Tailwind CSS, Lucide, Recharts
- TanStack Query; Zod validation
- Prisma ORM with SQLite for local development; PostgreSQL schema/migrations are planned separately
- Argon2id password hashing; database-backed opaque sessions in HTTP-only cookies
- Groq API integration for HR Smart Query answers, with live database results and a fallback
- Vitest and Playwright dependencies for unit and browser coverage

## Local setup

Requirements: Node.js 20.9 or later and npm.

```powershell
npm install
$env:DATABASE_URL = "file:./dev.db"
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. Prisma resolves the SQLite URL relative to `prisma/schema.prisma`, so the local database file is `prisma/dev.db`. The seed is deterministic and resets the demo records when run.

### Demo credentials

All demo users use password `Welcome2026!`.

| Role | Email |
|---|---|
| HR Admin | `hr.admin@northstar.example` |
| Manager | `manager1@northstar.example` |
| Employee | `employee010@northstar.example` |

Change these credentials before exposing any non-demo environment. Never use the demo password for a real deployment.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Local SQLite URL (`file:./dev.db`) or PostgreSQL connection URL |
| `GROQ_API_KEY` | For live LLM output | Groq API key; leave empty to use database-calculated fallback answers |
| `GROQ_MODEL` | No | Groq model name, defaults to `openai/gpt-oss-20b` |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL |

The database assistant only supports allowlisted intents; it never executes model-generated SQL. Questions are scoped to the signed-in HR Admin role. Current supported questions cover unresolved service request counts, overdue onboarding tasks, and active headcount by country.

## Database and deployment

Local development uses Prisma with SQLite. Production must use durable PostgreSQL; do not deploy SQLite as a Vercel persistence layer. `prisma/postgres/schema.prisma` and `prisma/postgres/migrations/` keep PostgreSQL migrations separate. Before deployment, set `DATABASE_URL` to the Supabase PostgreSQL URL and run `npm run db:setup:postgres`; Vercel's configured build command generates the PostgreSQL client before building. The generated client provider must match the configured production database. GitHub Actions and Docker configuration are included for reproducibility; a public deployment URL has not been configured yet.

## Security notes

- Passwords are hashed with Argon2id and never returned from employee APIs.
- Sessions use random opaque tokens stored only as SHA-256 hashes in the database; browser cookies are HTTP-only, SameSite=Lax, and Secure in production.
- Route handlers validate inputs and check role, ownership, or direct-report scope on the server.
- Request status changes are constrained and written to an audit history.
- Demo accounts and public deployment are assessment-only and need credential rotation and provider configuration.

## Documentation

- [Architecture, ERD, API catalogue, RBAC, state machines, trade-offs](./ARCHITECTURE.md)
- [Implementation and evidence checklist](./COMPLIANCE_CHECKLIST.md)
- [Debug log](./DEBUG_LOG.md) — records reproduced issues only

# Next Ventures

## Overview

Next Ventures is an HR operations platform for employee service requests and structured onboarding. It provides role-based workflows for Employees, Managers, and HR Admins through one account directory and authentication layer.

## Contents

- [Technology stack](#technology-stack)
- [Project file structure](#project-file-structure)
- [Assessment submission status](#assessment-submission-status)
- [Run locally](#run-locally)
- [Demo accounts](#demo-accounts)
- [Included assessment data](#included-assessment-data)
- [Workflows and access](#workflows-and-access)
- [Environment variables](#environment-variables)
- [Supabase and Vercel deployment](#supabase-and-vercel-deployment)
- [Further documentation](#further-documentation)

## Technology stack

| Area | Technology |
|---|---|
| Frontend and server | Next.js App Router, React, TypeScript |
| UI and data | Tailwind CSS, TanStack Query, React Hook Form, Recharts |
| API and validation | Next.js Route Handlers, Zod |
| Authentication | Argon2id password hashing and HTTP-only sessions |
| Database | Prisma; SQLite locally and Supabase PostgreSQL in production |
| AI | Groq API for Smart Query |
| Hosting | Render (primary), Vercel (fallback) |
| Quality tools | Vitest, Playwright, ESLint, TypeScript |

## Project file structure

```text
├── src/
│   ├── app/                    Pages, layout, providers, and API routes
│   ├── components/             Workspace, login, and shared UI
│   └── lib/
│       ├── ai/                 Smart Query
│       ├── auth/               Sessions and permissions
│       ├── db/                 Prisma client
│       ├── domains/            Workflow rules and unit tests
│       ├── security/           Rate limiting
│       └── validation/         Zod schemas
├── prisma/                     SQLite/PostgreSQL schemas, migrations, seed
├── scripts/                    Database setup and seed verification
├── e2e/                        Playwright end-to-end tests
└── .github/workflows/          CI workflow
```

## Assessment submission status

- **Source repository:** [GitHub](https://github.com/Md-Emon-Hasan/hris-systems-developer-assessment)
- **Primary live platform:** [https://hris-systems-developer-assessment.onrender.com](https://hris-systems-developer-assessment.onrender.com)
- **Backup live platform:** [https://hris-systems-developer-assessment.vercel.app](https://hris-systems-developer-assessment.vercel.app) (try this if the Render URL is unavailable)
- **Hosting and database:** Render is the current primary host, with Vercel retained as a fallback; both use Supabase PostgreSQL. The PostgreSQL migration and assessment seed have been applied and verified.
- **Seed verification:** 109 accounts (100 Employees, 8 Managers, 1 HR Admin), 36 requests, and 7 onboarding plans; `npm run verify:seed:postgres` passes against the hosted database.

> **Deployment note:** The original Vercel deployment went live on November 8 and worked through November 9. After a temporary free-tier hosting availability issue was noticed on November 11, the app was redeployed to Render. Please try Render first; the Vercel deployment remains available as a fallback.

> **Live demo note:** The app uses free-tier hosting and database services, so database writes may take a few seconds. After clicking an action, please wait briefly for it to finish.

> **Smart Query note:** The assessment demo uses a Groq-hosted model, which may return inaccurate answers. For production, we plan to evaluate OpenAI or Anthropic Claude models, which may improve answer quality; results should be checked against representative HR queries before making an accuracy claim.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. `db:setup` generates the Prisma client, applies the SQLite migration, and runs the assessment seed. Prisma resolves `DATABASE_URL="file:./dev.db"` relative to `prisma/schema.prisma`, so the database is `prisma/dev.db`.

The seed runs only against an empty database, skips an already-complete assessment database, and refuses a different populated database without deleting its records. For a clean local copy, set `DATABASE_URL` to a new disposable SQLite file before running setup. Do not point the seed command at shared or production data.

## Demo accounts

All seeded accounts use `Welcome2026!`.

| Role | Email |
|---|---|
| HR Admin | `mira.chowdhury@nextventures.example` |
| Manager | `aisha.rahman@nextventures.example` |
| Employee | `nur.aisyah@nextventures.example` |

These are intentionally shared demo credentials for assessment review. The database contains synthetic assessment data only; do not use these accounts or this instance for real employee records.

## Included assessment data

The seed creates 109 user accounts: 100 Employee-role users, 8 Managers, and 1 HR Admin. The users are distributed across Bangladesh, Malaysia, Sri Lanka, and Cyprus and four departments. It also creates 36 service requests across five categories, all five request states and four priorities, five three-comment threads, one 10-task onboarding template, and seven onboarding plans with mixed task states, overdue tasks, and dependency-blocked tasks. Run `npm run verify:seed` for the local SQLite database or `npm run verify:seed:postgres` for the PostgreSQL database; the PostgreSQL command generates the matching client before checking the data.

## Workflows and access

- **Employee:** submit and track own or assigned service requests; view own onboarding and act on tasks they own.
- **Manager:** handle in-scope team requests; monitor direct reports; act only on tasks assigned to them.
- **HR Admin:** manage people, requests, checklist templates, and onboarding assignments; see organization-wide dashboards; ask Smart Query questions.

Request and task transitions are validated by the server and recorded in history. HR Admins can use Smart Query to ask questions about live platform data. See [ARCHITECTURE.md](./ARCHITECTURE.md) for its design, access controls, and limitations. Payroll, attendance, leave balances, and recruitment data are not part of this platform.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Local SQLite URL; the deployed app uses the Supabase PostgreSQL transaction-pooler URL. |
| `DIRECT_URL` | Supabase direct/session-pooler URL used by Prisma migrations. |
| `GROQ_API_KEY` | Required server-side key for translating questions into live SQL queries and formatting answers. The Playwright E2E server intentionally omits it and uses a deterministic live-record test provider. |
| `GROQ_MODEL` | Optional Groq model ID; defaults to `openai/gpt-oss-20b`. |
| `NEXT_PUBLIC_APP_URL` | Optional app origin; local default is `http://localhost:3000`. |

Keep real database credentials and AI keys in local or host-managed environment settings. Never commit active secrets or expose them through a `NEXT_PUBLIC_` variable.

## Supabase and hosting deployment

The primary app is hosted at [hris-systems-developer-assessment.onrender.com](https://hris-systems-developer-assessment.onrender.com). If it is unavailable, use the [Vercel fallback](https://hris-systems-developer-assessment.vercel.app). The Vercel deployment was the original host; after a temporary free-tier availability issue was noticed on November 11, the app was redeployed to Render. Both deployments connect to the hosted Supabase PostgreSQL database. The database seed is verified with `npm run verify:seed:postgres`.

Local SQLite and hosted PostgreSQL are separate databases. Apply PostgreSQL schema changes with `npm run db:migrate:postgres` before deploying dependent code; do not run the setup seed against live data. Configure `DATABASE_URL` with the Supabase transaction-pooler URL, `DIRECT_URL` with a direct or session-pooler URL, and `GROQ_API_KEY` server-side. Keep a separate Supabase project for any preview deployment that must be isolated from assessment data.

## Further documentation

- [System design, schema, API, access control, state machines, and trade-offs](./ARCHITECTURE.md)
- [Debugging log and prevention notes](./DEBUG_LOG.md)

# Next Ventures

## Overview

Next Ventures is an HR operations platform for employee service requests and structured onboarding. It provides role-based workflows for Employees, Managers, and HR Admins through one account directory and authentication layer.

## Contents

- [Assessment submission status](#assessment-submission-status)
- [Run locally](#run-locally)
- [Demo accounts](#demo-accounts)
- [Included assessment data](#included-assessment-data)
- [Workflows and access](#workflows-and-access)
- [Environment variables](#environment-variables)
- [Further documentation](#further-documentation)

## Assessment submission status

- **Source repository:** [GitHub](https://github.com/Md-Emon-Hasan/hris-systems-developer-assessment)
- **Live platform URL:** [https://hris-systems-developer-assessment.vercel.app](https://hris-systems-developer-assessment.vercel.app)
- **Hosting and database:** Vercel with Supabase PostgreSQL. The PostgreSQL migration and assessment seed have been applied and verified.
- **Seed verification:** 109 accounts (100 Employees, 8 Managers, 1 HR Admin), 36 requests, and 7 onboarding plans; `npm run verify:seed:postgres` passes against the hosted database.

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

Request and task transitions are validated by the server and recorded in history. Smart Query is an HR Admin-only natural-language-to-SQL feature: Groq turns each question into a read-only SQL query, the server validates the query against an allowlisted HR schema, and Prisma executes it against the live database. Groq then formats an answer using only those returned rows; the UI also shows the verified result rows and their source. Query output is capped at 100 rows, while SQL aggregates can calculate over all matching records. There is no saved-answer cache or offline answer path: if Groq is unavailable, the API returns an error. Payroll, attendance, leave balances, and recruitment data are not part of this database.

*The configured default model is `openai/gpt-oss-20b` (about 21B total parameters); `GROQ_MODEL` can override it in a deployment. Parameter count alone does not establish answer quality, and this repository has no benchmark proving 97% correctness for this model or a future OpenAI model. Treat 97% as a target that needs a representative HR query evaluation set before it can be claimed. [Model details](https://developers.openai.com/api/docs/models/gpt-oss-20b).*

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Local SQLite URL; the deployed Vercel app uses the Supabase PostgreSQL transaction-pooler URL. |
| `DIRECT_URL` | Supabase direct/session-pooler URL used by Prisma migrations. |
| `GROQ_API_KEY` | Required server-side key for translating questions into live SQL queries and formatting answers. |
| `GROQ_MODEL` | Optional Groq model ID; defaults to `openai/gpt-oss-20b`. |
| `NEXT_PUBLIC_APP_URL` | Optional app origin; local default is `http://localhost:3000`. |

Keep real database credentials and AI keys in local or host-managed environment settings. Never commit active secrets or expose them through a `NEXT_PUBLIC_` variable.

## Supabase and Vercel deployment

The assessment platform is deployed at [https://hris-systems-developer-assessment.vercel.app](https://hris-systems-developer-assessment.vercel.app). Vercel builds the Next.js app with `npm run build:postgres`; its server-side Prisma Client uses the PostgreSQL schema in `prisma/postgres/`. Supabase PostgreSQL is seeded with the assessment data described above. The successful `npm run verify:seed:postgres` output confirms the hosted dataset, including all 100 Employee-role accounts, five request-comment threads, and seven onboarding plans with 10 tasks each.

The GitHub repository is connected to Vercel. Pushes to Vercel's configured production branch trigger a new production deployment; other branches create Preview deployments. For future database schema changes, apply committed migrations with `npm run db:migrate:postgres` before deploying code that depends on those changes. Do not re-run the setup seed against live data: it is intended for an empty assessment database and refuses unrelated partial data. Local SQLite setup and PostgreSQL deployment use separate databases; local records are not automatically copied to Supabase.

For a new environment, copy the Supabase transaction-pooler URL to `DATABASE_URL` (port `6543`, with Prisma's `pgbouncer=true` parameter), and use a direct or session-pooler URL for `DIRECT_URL`. Keep both values server-side and set `GROQ_API_KEY` so Smart Query can translate each new question into a live database query. A separate Supabase project is recommended for Preview if Preview testing must not modify the assessment dataset.

## Further documentation

- [System design, schema, API, access control, state machines, and trade-offs](./ARCHITECTURE.md)
- [Debugging log and prevention notes](./DEBUG_LOG.md)

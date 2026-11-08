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
- **Live platform URL:** Not deployed. The assessment requires a publicly accessible URL; local setup below is not a substitute.
- **Database:** Seeded local SQLite for assessment development. Supabase/PostgreSQL has not been connected or migrated.

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

These credentials are for local assessment only. Change them before any public deployment.

## Included assessment data

The seed creates 109 user accounts: 100 Employee-role users, 8 Managers, and 1 HR Admin. The users are distributed across Bangladesh, Malaysia, Sri Lanka, and Cyprus and four departments. It also creates 36 service requests across five categories, all five request states and four priorities, five three-comment threads, one 10-task onboarding template, and seven onboarding plans with mixed task states, overdue tasks, and dependency-blocked tasks. Run `npm run verify:seed` for the local SQLite database or `npm run verify:seed:postgres` for the PostgreSQL database; the PostgreSQL command generates the matching client before checking the data.

## Workflows and access

- **Employee:** submit and track own or assigned service requests; view own onboarding and act on tasks they own.
- **Manager:** handle in-scope team requests; monitor direct reports; act only on tasks assigned to them.
- **HR Admin:** manage people, requests, checklist templates, and onboarding assignments; see organization-wide dashboards; ask Smart Query questions.

Request and task transitions are validated by the server and recorded in history. Smart Query answers supported questions from live database records. Employee and manager names are matched without requiring exact capitalization, and punctuation such as a question mark is optional. With `GROQ_API_KEY` configured, Groq maps plain-English questions to a validated plan and may phrase the verified result. Without it, supported built-in patterns return deterministic database answers. The model does not generate or execute SQL. Payroll, attendance, leave balances, and recruitment data are not part of this database.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Local SQLite URL; PostgreSQL is not configured. |
| `DIRECT_URL` | PostgreSQL direct/session-pooler URL for Prisma migrations. Set only for the PostgreSQL setup described below. |
| `GROQ_API_KEY` | Optional server-side Groq key for Smart Query planning and answer phrasing. Leave unset for built-in patterns. |
| `GROQ_MODEL` | Optional Groq model ID; defaults to `openai/gpt-oss-20b`. |
| `NEXT_PUBLIC_APP_URL` | Optional app origin; local default is `http://localhost:3000`. |

Keep real database credentials and AI keys in local or host-managed environment settings. Never commit active secrets or expose them through a `NEXT_PUBLIC_` variable.

## Supabase and Vercel deployment

Deployment is not complete yet. The PostgreSQL schema and initial migration are in `prisma/postgres/`; the deployed app must use Supabase PostgreSQL because Vercel's serverless instances do not share a persistent local SQLite file.

1. Create a Supabase PostgreSQL project. In its **Connect** panel, copy a direct connection URL (or the session-pooler URL if your migration machine cannot reach the direct IPv6 endpoint) for `DIRECT_URL`, and the transaction-pooler URL for `DATABASE_URL`.
2. Update the local, ignored `.env` with those two values. Use the dashboard-provided URLs; percent-encode any reserved characters in the password. For the shared transaction pooler, use port `6543` and add Prisma's `pgbouncer=true` parameter. The PostgreSQL schema routes Prisma CLI migrations through `DIRECT_URL` and app queries through `DATABASE_URL`.
3. On a new, empty Supabase database, apply the migration and seed, then verify the data and production build:

   ```powershell
   npm run db:setup:postgres
   npm run verify:seed:postgres
   npm run build:postgres
   ```

   `db:setup:postgres` generates the PostgreSQL Prisma client, applies committed migrations, and runs the demo seed. The seed refuses an unrelated populated database. These commands create a new seeded PostgreSQL database; they do not copy records from `prisma/dev.db`. If the SQLite records must be preserved, an explicit export/import process is required first.
4. Import this GitHub repository into Vercel. Keep the Next.js framework preset and use the repository's configured Build Command, `npm run build:postgres`.
5. Add `DATABASE_URL` and `DIRECT_URL` to the Vercel project as server-side environment variables. Add `GROQ_API_KEY` only if Smart Query should use Groq; `GROQ_MODEL` is optional. Use a separate Supabase project for Preview instead of pointing Preview deployments at production data. Deploy to a Preview URL first.
6. On Preview, sign in with each demo role and check request creation/assignment/comments/transitions, template and onboarding assignment, task ownership/dependencies, dashboard data, Smart Query, and persistence after a new request. Check Vercel function logs and Supabase database logs for errors.
7. After the Preview check, promote/deploy Production and add the public URL to the assessment submission and this README. Replace or reset demo passwords before using the application for real employee data.

Supabase's transaction pooler is intended for serverless clients; Prisma requires `pgbouncer=true` with the shared transaction pooler. Migrations use a direct connection; if direct IPv6 is unavailable from your machine, use Supabase's session pooler for migrations.

## Further documentation

- [System design, schema, API, access control, state machines, and trade-offs](./ARCHITECTURE.md)
- [Debugging log and prevention notes](./DEBUG_LOG.md)

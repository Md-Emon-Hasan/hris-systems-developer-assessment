# Assessment Compliance Checklist

Status reflects implementation and verification completed in this workspace on 2026-11-06. “Verified” identifies a command or journey actually run; it does not imply production deployment.

| Requirement | Status | Evidence / remaining gap |
|---|---|---|
| Architecture, ERD, API catalogue, RBAC, states, trade-offs | Implemented | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 100 employees across four countries and departments | Verified | Seed run and `npm run verify:seed`; 100 users and four countries/departments |
| 30+ varied service requests and threaded comments | Verified | Seed verification reports 36 requests, 15 comments, and five threaded requests |
| Authentication and three roles | Implemented and browser-verified | Argon2id, hashed opaque sessions, server-side resource scopes; employee and manager journeys passed |
| Request create, filter, comment, assign, transition | Implemented and browser-verified | Employee creation and manager assignment/START/RESOLVE/CLOSE journey passed |
| Onboarding templates, assignment, owners, dependencies | Implemented and browser-verified | Dependency blocking, completion, automatic unblock, and task start journey passed |
| Dashboard metrics and cross-module insight | Implemented | Prisma aggregation and responsive dashboard; included in browser journeys |
| HR-only live-data Smart Query with Groq | Implemented and verified | HR role restriction and same-session live count journey passed; targeted run confirmed Groq provider |
| SQLite migration and seed | Verified | Fresh SQLite file setup, migration, seed, and seed verification passed |
| PostgreSQL / Supabase persistence | Prepared, not live-verified | Separate schema/migration and PostgreSQL build are present; actual Supabase connection and migration remain unverified |
| Automated checks | Verified | TypeScript, ESLint, 5 unit tests, 5 Playwright journeys, SQLite build, PostgreSQL build/schema validation, and `npm audit` (0 vulnerabilities) passed |
| Docker and GitHub Actions | Implemented, not runtime-verified | Files are present; Docker daemon was unavailable in this environment |
| README and demo credentials | Implemented | [README.md](./README.md) |
| Three reproduced bugs with fixes | Documented | [DEBUG_LOG.md](./DEBUG_LOG.md) |
| Public GitHub repository | Published | https://github.com/Md-Emon-Hasan/hris-systems-developer-assessment |
| Public Vercel deployment | Pending | Requires configured Vercel access and a live PostgreSQL/Supabase database; no deployment URL is available |

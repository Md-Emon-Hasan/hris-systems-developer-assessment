# Reproduced Debug Log

Issues below were reproduced during setup and browser verification. Secrets and credential values are intentionally excluded.

## 1. Fresh SQLite setup failed before the database file existed

- **Reproduction:** Set `DATABASE_URL=file:./fresh-check.db` and run the original migration command against a fresh workspace.
- **Observed:** Prisma's schema engine returned an opaque error when the target SQLite file did not yet exist.
- **Root cause:** The migration engine expected the SQLite database file to be present before it initialized migrations.
- **Fix:** Added `scripts/prepare-db.ts` to create the parent directory and database file before migration. `npm run db:setup` then succeeded against a fresh `fresh-check.db`.
- **Prevention:** Keep database preparation in the documented setup command and retain fresh-file setup coverage.

## 2. Configured Groq model was unavailable to the supplied key

- **Reproduction:** Call Groq chat completions with the initial default `llama-3.3-70b-versatile` using the existing configured key.
- **Observed:** Groq returned HTTP 404 for that model. The key's model list was checked without displaying the key.
- **Root cause:** The default model was not enabled for this key.
- **Fix:** Changed the default to `openai/gpt-oss-20b` and updated the request to use `max_completion_tokens`. A live completion and the targeted Smart Query browser journey both returned successfully; the browser journey reported the `groq` provider.
- **Prevention:** Make the model configurable and verify model availability with the deployment key before release.

## 3. Browser test matched two controls named “Category”

- **Reproduction:** The request creation journey used `getByLabel("Category")` while both the request filter and dialog control were present.
- **Observed:** Playwright reported a strict locator collision because two controls had that accessible name.
- **Root cause:** The form and filter labels were not unique in the page's accessible control names.
- **Fix:** Added distinct accessible names (`Filter by category` and `Request category`, likewise for priority) and used the specific request-form name in the journey. The end-to-end suite passed afterward.
- **Prevention:** Give repeated controls context-specific accessible names and keep browser tests anchored to user-facing labels.

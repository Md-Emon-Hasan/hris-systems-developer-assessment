import { defineConfig, devices } from "@playwright/test";

const e2eDatabaseUrl = `file:./e2e-${process.pid}.db`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  expect: { timeout: 25_000 },
  use: { baseURL: "http://127.0.0.1:3001", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:prepare && npx prisma migrate deploy && npm run db:seed && npm run dev -- --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: e2eDatabaseUrl, GROQ_API_KEY: "", HRIS_NEXT_DIST_DIR: ".next-e2e" },
  },
});

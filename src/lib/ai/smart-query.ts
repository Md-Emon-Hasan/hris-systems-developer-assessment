import "server-only";
import { prisma } from "@/lib/db/prisma";

export type QueryResult = { summary: string; data: unknown; provenance: string };

const sqlTables = ["User", "ServiceRequest", "Onboarding", "OnboardingTask", "OnboardingTemplate", "TemplateTask", "RequestComment", "RequestStatusHistory", "OnboardingTaskHistory"];
const safeSqlSchema = `Available live HR tables and columns (Prisma names):
User(id, fullName, email, employeeNumber, country, department, role, employmentStatus, joiningDate, managerId, createdAt, updatedAt)
ServiceRequest(id, requestNumber, title, description, category, priority, status, requesterId, assigneeId, resolvedAt, closedAt, createdAt, updatedAt)
Onboarding(id, employeeId, templateId, createdById, startDate, status, createdAt, updatedAt)
OnboardingTask(id, onboardingId, templateTaskId, ownerId, title, description, department, dueOffsetDays, dueDate, status, dependsOnId, completedAt, createdAt, updatedAt)
OnboardingTemplate(id, name, description, version, active, createdById, createdAt, updatedAt)
TemplateTask(id, templateId, title, description, department, ownerRole, dueOffsetDays, sortOrder, dependsOnId)
RequestComment(id, requestId, authorId, body, createdAt)
RequestStatusHistory(id, requestId, actorId, fromStatus, toStatus, note, createdAt)
OnboardingTaskHistory(id, taskId, actorId, fromStatus, toStatus, note, createdAt)
Relations: User.managerId -> User.id; ServiceRequest.requesterId/assigneeId -> User.id; Onboarding.employeeId -> User.id; OnboardingTask.onboardingId -> Onboarding.id and ownerId -> User.id; Onboarding.templateId -> OnboardingTemplate.id. AuthSession and all authentication credentials are forbidden.`;

const cleanGeneratedSql = (sql: string) => sql
  .trim()
  .replace(/^```sql\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim()
  .replace(/;\s*$/, "")
  .trim();

/** Have Groq translate each question into SQL; SQL is validated and always executed read-only. */
export async function planSqlQuery(question: string, repairReason?: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is required for natural-language SQL queries.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", temperature: 0, max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Translate the user's HR question into one safe read-only SQL query for the current database. Return JSON only: {"sql":"..."}. Use only the tables and columns below; always quote table and column identifiers with double quotes (works in SQLite and PostgreSQL). Never query authentication data or password/token hashes. Never write data, use multiple statements, comments, system tables, or unsafe functions. SELECT and WITH queries, joins, aggregates, CASE, and date comparisons are allowed. Return at most 100 rows and always include LIMIT 100 or a smaller positive LIMIT. Do not make up column names. Schema: ${safeSqlSchema}${repairReason ? ` The previous query failed validation: ${repairReason}. Return a corrected query.` : ""}` },
        { role: "user", content: question },
      ],
    }), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Groq SQL planning failed (${response.status}).`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const candidate = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(candidate) as { sql?: unknown };
    return typeof parsed.sql === "string" ? cleanGeneratedSql(parsed.sql) : null;
  } catch { return null; }
}

function validateReadOnlyHrSql(sql: string) {
  if (sql.length > 4000 || !/^(?:SELECT|WITH)\b/i.test(sql) || /[;]|--|\/\*|\*\/|\b(INSERT|UPDATE|DELETE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|COPY|CALL|EXECUTE|GRANT|REVOKE|TRUNCATE|INTO|FOR\s+(UPDATE|SHARE))\b/i.test(sql) || /\b(passwordHash|tokenHash|AuthSession|sqlite_|pg_|information_schema|current_setting|set_config|lo_import|lo_export|dblink|readfile|writefile)\b/i.test(sql)) {
    throw new Error("The generated SQL did not pass the read-only query checks.");
  }
  const refs = [...sql.matchAll(/\b(?:FROM|JOIN)\s+["`\[]?([A-Za-z_][A-Za-z0-9_]*)/gi)].map((match) => match[1].toLowerCase());
  const allowed = new Set(sqlTables.map((table) => table.toLowerCase()));
  const ctes = new Set([...sql.matchAll(/\bWITH\s+([A-Za-z_][A-Za-z0-9_]*)\s+AS\b|\b,\s*([A-Za-z_][A-Za-z0-9_]*)\s+AS\b/gi)].map((match) => (match[1] ?? match[2]).toLowerCase()));
  if (!refs.length || refs.some((table) => !allowed.has(table) && !ctes.has(table))) throw new Error("The generated SQL references a table outside the HR schema.");
  // Block function calls entirely apart from ordinary SQL aggregate and scalar helpers.
  const calls = [...sql.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((match) => match[1].toLowerCase());
  const safeFunctions = new Set(["count", "sum", "avg", "min", "max", "lower", "upper", "coalesce", "nullif", "round", "date", "strftime", "cast"]);
  if (calls.some((name) => !safeFunctions.has(name) && name !== "select")) throw new Error("The generated SQL uses a function outside the safe query set.");
  const limit = sql.match(/\bLIMIT\s+(\d+)\b/i)?.[1];
  if (!limit || Number(limit) > 100 || Number(limit) < 1) throw new Error("The generated SQL must limit results to at most 100 rows.");
}

export async function executeSqlQuery(sql: string): Promise<QueryResult> {
  const safeSql = cleanGeneratedSql(sql);
  validateReadOnlyHrSql(safeSql);
  const isPostgres = /^postgres(?:ql)?:/i.test(process.env.DATABASE_URL ?? "");
  const data = await prisma.$transaction(async (tx) => {
    if (isPostgres) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRawUnsafe<Record<string, unknown>[]>(safeSql);
  }, { maxWait: 5000, timeout: 15000 });
  const rows = data.slice(0, 100).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : typeof value === "bigint" ? value.toString() : value])));
  return { summary: `${rows.length} live database record${rows.length === 1 ? "" : "s"} returned for this question.`, data: rows, provenance: `Generated read-only SQL query against live HR tables; ${rows.length} result row${rows.length === 1 ? "" : "s"}.` };
}

export async function generateAnswer(question: string, result: QueryResult): Promise<{ answer: string; provider: string }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is required to generate Smart Query answers.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", temperature: 0.1, max_completion_tokens: 1200,
      messages: [
        { role: "system", content: "Answer in the same language as the HR Admin's question. Use only the supplied live database result. Keep all names, counts, dates and percentages exact. Do not guess or invent facts. Format the answer for a polished dashboard: start with a short direct answer, then use a clear heading and 2-5 concise bullet points when useful. Keep it scannable and do not repeat the raw database table; the complete verified rows are shown separately in the app." },
        { role: "user", content: JSON.stringify({ question, result: { summary: result.summary, data: result.data } }) },
      ],
    }), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const answer = body.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Groq returned an empty response.");
  return { answer, provider: "groq" };
}

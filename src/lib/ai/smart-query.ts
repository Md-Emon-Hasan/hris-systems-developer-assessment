import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeSearchText } from "./query-normalization";

export type QueryResult = { summary: string; data: unknown; provenance: string };

const openStatuses = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"];
const countries = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"] as const;

const countryFromQuestion = (question: string) => {
  const normalized = normalizeSearchText(question);
  return countries.find((country) => normalized.includes(normalizeSearchText(country)));
};

const categoryFromQuestion = (question: string) => {
  const normalized = normalizeSearchText(question);
  if (/it equipment|laptop|equipment|\bit\b/.test(normalized)) return "IT_EQUIPMENT" as const;
  if (/software|access/.test(normalized)) return "SOFTWARE_ACCESS" as const;
  if (/hr query|leave|hr request/.test(normalized)) return "HR_QUERY" as const;
  if (/facilit/.test(normalized)) return "FACILITIES" as const;
  return undefined;
};

/** Deterministic live-record queries used by the keyless Playwright environment. */
export async function executeDeterministicQuery(question: string): Promise<QueryResult | null> {
  const normalized = normalizeSearchText(question);
  const country = countryFromQuestion(question);

  if (/onboard/.test(normalized) && /overdue|past due|late/.test(normalized)) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tasks = await prisma.onboardingTask.findMany({
      where: { status: { not: "COMPLETED" }, dueDate: { lt: today }, onboarding: { status: "IN_PROGRESS", ...(country ? { employee: { country } } : {}) } },
      select: { onboarding: { select: { employee: { select: { fullName: true, country: true } } } } },
    });
    const grouped = new Map<string, { newHire: string; country: string; overdueTasks: number }>();
    for (const task of tasks) {
      const employee = task.onboarding.employee;
      const current = grouped.get(employee.fullName) ?? { newHire: employee.fullName, country: employee.country, overdueTasks: 0 };
      current.overdueTasks += 1;
      grouped.set(employee.fullName, current);
    }
    const data = [...grouped.values()].sort((a, b) => a.newHire.localeCompare(b.newHire));
    const details = data.map((hire) => `${hire.newHire}: ${hire.overdueTasks} overdue`).join("; ");
    return {
      summary: `${data.length} new hire${data.length === 1 ? " has" : "s have"} ${tasks.length} overdue onboarding task${tasks.length === 1 ? "" : "s"}${country ? ` in ${country}` : ""}.${details ? ` Per hire: ${details}.` : ""}`,
      data,
      provenance: `Live onboardingTask aggregation, grouped by onboarding; ${data.length} hires and ${tasks.length} tasks.`,
    };
  }

  if (/onboard/.test(normalized) && /completion|completed|highest|rate|country/.test(normalized)) {
    const plans = await prisma.onboarding.findMany({
      where: { status: "IN_PROGRESS", ...(country ? { employee: { country } } : {}) },
      select: { employee: { select: { country: true } }, tasks: { select: { status: true } } },
    });
    const rates = countries.map((name) => {
      const tasks = plans.filter((plan) => plan.employee.country === name).flatMap((plan) => plan.tasks);
      const completed = tasks.filter((task) => task.status === "COMPLETED").length;
      return { country: name, totalTasks: tasks.length, completedTasks: completed, completionRate: tasks.length ? Number((completed * 100 / tasks.length).toFixed(1)) : null };
    }).filter((rate) => rate.totalTasks > 0);
    if (!rates.length) return { summary: "There are no eligible onboarding tasks to calculate a completion rate.", data: [], provenance: "Live onboardingTask counts for IN_PROGRESS onboarding plans." };
    const highest = Math.max(...rates.map((rate) => rate.completionRate ?? 0));
    const leaders = rates.filter((rate) => rate.completionRate === highest).map((rate) => rate.country);
    return {
      summary: `${leaders.join(" and ")} ${leaders.length === 1 ? "has" : "are tied at"} the highest onboarding completion rate at ${highest}%. By country: ${rates.map((rate) => `${rate.country}: ${rate.completedTasks}/${rate.totalTasks} tasks (${rate.completionRate}%)`).join("; ")}.`,
      data: rates,
      provenance: "Live onboardingTask counts for IN_PROGRESS onboarding plans; rate = completed tasks / all tasks × 100.",
    };
  }

  if (/request|ticket/.test(normalized) && /how many|count|unresolved|open|pending|assigned/.test(normalized)) {
    const category = categoryFromQuestion(question);
    const priority = /urgent|urgency/.test(normalized) ? "URGENT" : undefined;
    const status = /assigned/.test(normalized) && !/unresolved|open|pending/.test(normalized) ? "ASSIGNED" : undefined;
    const where: Prisma.ServiceRequestWhereInput = {
      ...(category ? { category } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : /unresolved|open|pending/.test(normalized) ? { status: { in: openStatuses } } : {}),
      ...(country ? { requester: { country } } : {}),
    };
    const [count, grouped] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);
    const qualifier = [category?.replaceAll("_", " ").toLowerCase(), priority?.toLowerCase(), status ?? (/unresolved|open|pending/.test(normalized) ? "open" : undefined)].filter(Boolean).join(" ");
    return {
      summary: `${count} ${qualifier ? `${qualifier} ` : ""}service request${count === 1 ? "" : "s"}${country ? ` in ${country}` : ""}.`,
      data: grouped.map((row) => ({ status: row.status, count: row._count._all })),
      provenance: `Live ServiceRequest count and status aggregation; open means Submitted, Assigned, or In Progress; ${count} matching records.`,
    };
  }

  return null;
}

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
  if (!key) return { answer: result.summary, provider: "database-summary" };
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

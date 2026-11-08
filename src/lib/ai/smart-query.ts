import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { normalizeSearchText } from "./query-normalization";

export type QueryResult = { summary: string; data: unknown; provenance: string };

const countries = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"] as const;
const OPEN_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"];
const requestCategories = ["IT_EQUIPMENT", "SOFTWARE_ACCESS", "HR_QUERY", "FACILITIES", "OTHER"] as const;
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const roles = ["EMPLOYEE", "MANAGER", "HR_ADMIN"] as const;
const employmentStatuses = ["ACTIVE", "ON_PROBATION", "ON_NOTICE", "INACTIVE"] as const;

const queryPlanSchema = z.object({
  intent: z.enum(["request_count", "request_list", "employee_count", "employee_list", "onboarding_overdue", "onboarding_completion", "onboarding_summary", "task_owner_workload", "unsupported"]),
  country: z.enum(countries).nullable().default(null),
  category: z.enum(requestCategories).nullable().default(null),
  priority: z.enum(priorities).nullable().default(null),
  requestStatus: z.enum(["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "OPEN"]).nullable().default(null),
  department: z.string().max(80).nullable().default(null),
  role: z.enum(roles).nullable().default(null),
  employmentStatus: z.enum([...employmentStatuses, "ACTIVE_OR_PROBATION", "ALL"] as const).nullable().default(null),
  personName: z.string().max(100).nullable().default(null),
  managerName: z.string().max(100).nullable().default(null),
  groupBy: z.enum(["none", "country", "department", "role", "employment_status", "status", "category", "priority", "employee"]).default("none"),
}).strict();
type QueryPlan = z.infer<typeof queryPlanSchema>;

/** Ask Groq to classify a question into a small, validated query vocabulary. It never returns SQL. */
export async function planSmartQuery(question: string): Promise<QueryPlan | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      max_completion_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Turn the HR Admin's question into a safe query plan for this HR platform. Return one JSON object with exactly these keys: intent, country, category, priority, requestStatus, department, role, employmentStatus, personName, managerName, groupBy. Use null when a filter is not explicit. Never invent filters or data. Supported intents: request_count, request_list, employee_count, employee_list, onboarding_overdue, onboarding_completion, onboarding_summary, task_owner_workload, unsupported. Categories: ${requestCategories.join(", ")}. Priorities: ${priorities.join(", ")}. Request statuses: SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED; use OPEN only when the user asks for open, pending, unresolved, or not closed requests. Countries: ${countries.join(", ")}. Roles: EMPLOYEE, MANAGER, HR_ADMIN. Employment statuses: ${employmentStatuses.join(", ")}, ACTIVE_OR_PROBATION, ALL. Grouping: none, country, department, role, employment_status, status, category, priority, employee. Map questions about request/ticket counts or lists to request intents; staff/headcount/directory questions to employee intents; overdue/on-time/onboarding progress/completion questions to onboarding intents; task assignment or owner workload to task_owner_workload. When the user asks who reports to a Manager, set managerName to that Manager's name. Use unsupported for questions outside available HR records or when a required filter is ambiguous. For all employees include inactive only when asked, otherwise leave employmentStatus null. Output JSON only.` },
        { role: "user", content: question },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Groq query planning failed (${response.status})`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as unknown;
    const parsed = queryPlanSchema.safeParse(candidate);
    return parsed.success ? normalizePlan(parsed.data) : null;
  } catch {
    return null;
  }
}

const searchTokens = (value: string) => normalizeSearchText(value).split(" ").filter(Boolean);

const anyUserField = (field: "fullName" | "department", value: string): Prisma.UserWhereInput => ({
  AND: searchTokens(value).map((token) => ({ [field]: { contains: token } })),
});

const normalizePlanName = (value: string | null) => value ? normalizeSearchText(value) : null;

const normalizePlan = (plan: QueryPlan): QueryPlan => ({
  ...plan,
  personName: normalizePlanName(plan.personName),
  managerName: normalizePlanName(plan.managerName),
});

const findMentionedPerson = async (question: string) => {
  const normalizedQuestion = normalizeSearchText(question);
  if (!normalizedQuestion) return null;
  const ignoredTokens = new Set(["about", "active", "all", "count", "employee", "employees", "many", "open", "people", "request", "requests", "show", "staff", "the", "what", "which", "who"]);
  const questionTokens = searchTokens(normalizedQuestion).filter((token) => token.length > 2 && !ignoredTokens.has(token));
  const people = await prisma.user.findMany({ select: { fullName: true } });
  const candidates = people.map(({ fullName }) => {
    const normalized = normalizeSearchText(fullName);
    const nameTokens = new Set(searchTokens(normalized));
    const score = questionTokens.filter((token) => nameTokens.has(token)).length;
    return { fullName, normalized, score };
  }).filter((person) => person.normalized && (normalizedQuestion.includes(person.normalized) || person.score > 0));
  const exact = candidates.filter((person) => normalizedQuestion.includes(person.normalized)).sort((a, b) => b.normalized.length - a.normalized.length);
  if (exact.length) return exact[0].fullName;
  const bestScore = Math.max(...candidates.map((person) => person.score), 0);
  const matches = candidates.filter((person) => person.score === bestScore && bestScore > 0);
  return matches.length === 1 ? matches[0].fullName : null;
};

const planEmployeeFilters = (plan: QueryPlan): Prisma.UserWhereInput => {
  const filters: Prisma.UserWhereInput[] = [];
  if (plan.country) filters.push({ country: plan.country });
  if (plan.department) filters.push(anyUserField("department", plan.department));
  if (plan.role) filters.push({ role: plan.role });
  if (plan.personName) filters.push(anyUserField("fullName", plan.personName));
  if (plan.managerName) filters.push({ manager: anyUserField("fullName", plan.managerName) });
  return filters.length === 1 ? filters[0] : { AND: filters };
};

const userWhereFromPlan = (plan: QueryPlan): Prisma.UserWhereInput => ({
  ...planEmployeeFilters(plan),
  ...(plan.employmentStatus === "ACTIVE_OR_PROBATION" ? { employmentStatus: { in: ["ACTIVE", "ON_PROBATION"] } } : plan.employmentStatus && plan.employmentStatus !== "ALL" ? { employmentStatus: plan.employmentStatus } : !plan.employmentStatus ? { employmentStatus: { not: "INACTIVE" } } : {}),
});

const requestWhereFromPlan = (plan: QueryPlan): Prisma.ServiceRequestWhereInput => {
  const filters: Prisma.ServiceRequestWhereInput[] = [];
  if (plan.country || plan.department || plan.managerName) {
    filters.push({ requester: planEmployeeFilters({ ...plan, personName: null }) });
  }
  if (plan.category) filters.push({ category: plan.category });
  if (plan.priority) filters.push({ priority: plan.priority });
  if (plan.requestStatus === "OPEN") filters.push({ status: { in: OPEN_STATUSES } });
  else if (plan.requestStatus) filters.push({ status: plan.requestStatus });
  if (plan.personName) {
    filters.push({ OR: [{ requester: anyUserField("fullName", plan.personName) }, { assignee: anyUserField("fullName", plan.personName) }] });
  }
  return filters.length === 1 ? filters[0] : { AND: filters };
};

const groupUsers = async (where: Prisma.UserWhereInput, groupBy: QueryPlan["groupBy"]) => {
  if (groupBy === "country") return prisma.user.groupBy({ by: ["country"], where, _count: { _all: true }, orderBy: { country: "asc" } });
  if (groupBy === "department") return prisma.user.groupBy({ by: ["department"], where, _count: { _all: true }, orderBy: { department: "asc" } });
  if (groupBy === "role") return prisma.user.groupBy({ by: ["role"], where, _count: { _all: true }, orderBy: { role: "asc" } });
  if (groupBy === "employment_status") return prisma.user.groupBy({ by: ["employmentStatus"], where, _count: { _all: true }, orderBy: { employmentStatus: "asc" } });
  return null;
};

const groupRequests = async (where: Prisma.ServiceRequestWhereInput, groupBy: QueryPlan["groupBy"]) => {
  if (groupBy === "status") return prisma.serviceRequest.groupBy({ by: ["status"], where, _count: { _all: true }, orderBy: { status: "asc" } });
  if (groupBy === "category") return prisma.serviceRequest.groupBy({ by: ["category"], where, _count: { _all: true }, orderBy: { category: "asc" } });
  if (groupBy === "priority") return prisma.serviceRequest.groupBy({ by: ["priority"], where, _count: { _all: true }, orderBy: { priority: "asc" } });
  if (groupBy === "country" || groupBy === "department") {
    const rows = await prisma.serviceRequest.findMany({ where, select: { requester: { select: { country: true, department: true } } } });
    const counts = new Map<string, number>();
    for (const row of rows) { const key = groupBy === "country" ? row.requester.country : row.requester.department; counts.set(key, (counts.get(key) ?? 0) + 1); }
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([group, count]) => ({ [groupBy]: group, _count: { _all: count } }));
  }
  return null;
};

/** Run only typed Prisma reads, with every filter checked against the schema above. */
export async function executePlannedQuery(plan: QueryPlan): Promise<QueryResult | null> {
  plan = normalizePlan(plan);
  if (plan.intent === "unsupported") return null;

  if (plan.intent === "request_count" || plan.intent === "request_list") {
    const where = requestWhereFromPlan(plan);
    if (plan.intent === "request_list") {
      const records = await prisma.serviceRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, select: { requestNumber: true, title: true, category: true, priority: true, status: true, createdAt: true, requester: { select: { fullName: true, country: true } }, assignee: { select: { fullName: true } } } });
      return { summary: `${records.length} matching requests${records.length === 100 ? " (showing the 100 most recent)" : ""}.`, data: records, provenance: `Live ServiceRequest rows with current requester, assignee, status, priority and category; ${records.length} returned.` };
    }
    const [count, grouped] = await Promise.all([prisma.serviceRequest.count({ where }), groupRequests(where, plan.groupBy)]);
    return { summary: `${count} matching service request${count === 1 ? "" : "s"}.`, data: grouped ?? { count }, provenance: `Live ServiceRequest count${plan.groupBy !== "none" ? ` grouped by ${plan.groupBy}` : ""}; current database records.` };
  }

  if (plan.intent === "employee_count" || plan.intent === "employee_list") {
    const where = userWhereFromPlan(plan);
    if (plan.intent === "employee_list") {
      const records = await prisma.user.findMany({ where, orderBy: { fullName: "asc" }, take: 100, select: { fullName: true, country: true, department: true, role: true, employmentStatus: true, joiningDate: true, manager: { select: { fullName: true } } } });
      return { summary: `${records.length} matching employee${records.length === 1 ? "" : "s"}${records.length === 100 ? " (showing the first 100 alphabetically)" : ""}.`, data: records, provenance: `Live User directory fields; sensitive authentication data is excluded; ${records.length} returned.` };
    }
    const [count, grouped] = await Promise.all([prisma.user.count({ where }), groupUsers(where, plan.groupBy)]);
    return { summary: `${count} matching employee${count === 1 ? "" : "s"}.`, data: grouped ?? { count }, provenance: `Live User count${plan.groupBy !== "none" ? ` grouped by ${plan.groupBy}` : ""}; inactive employees are excluded unless requested.` };
  }

  if (plan.intent === "onboarding_overdue") {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const where: Prisma.OnboardingTaskWhereInput = { status: { not: "COMPLETED" }, dueDate: { lt: today }, onboarding: { status: "IN_PROGRESS", ...(plan.country || plan.department || plan.role || plan.personName || plan.managerName ? { employee: planEmployeeFilters(plan) } : {}) } };
    const tasks = await prisma.onboardingTask.findMany({ where, orderBy: [{ onboarding: { employee: { fullName: "asc" } } }, { dueDate: "asc" }], select: { title: true, status: true, dueDate: true, onboarding: { select: { employee: { select: { fullName: true, country: true } } } } } });
    const hires = new Map<string, { newHire: string; country: string; overdueTasks: number; tasks: { title: string; status: string; dueDate: string }[] }>();
    for (const task of tasks) {
      const { fullName, country } = task.onboarding.employee;
      const hire = hires.get(fullName) ?? { newHire: fullName, country, overdueTasks: 0, tasks: [] };
      hire.overdueTasks += 1; hire.tasks.push({ title: task.title, status: task.status, dueDate: task.dueDate.toISOString().slice(0, 10) }); hires.set(fullName, hire);
    }
    const data = [...hires.values()];
    return { summary: `${data.length} new hire${data.length === 1 ? " has" : "s have"} ${tasks.length} overdue task${tasks.length === 1 ? "" : "s"}${plan.country ? ` in ${plan.country}` : ""}.`, data, provenance: `Live overdue OnboardingTask records grouped by hire; all ${tasks.length} matching tasks are included.` };
  }

  if (plan.intent === "onboarding_completion") {
    const plans = await prisma.onboarding.findMany({ where: { status: "IN_PROGRESS", ...(plan.country || plan.department || plan.role || plan.personName || plan.managerName ? { employee: planEmployeeFilters(plan) } : {}) }, select: { employee: { select: { fullName: true, country: true } }, tasks: { select: { status: true } } }, orderBy: { employee: { fullName: "asc" } } });
    const countryRates = new Map<string, { country: string; totalTasks: number; completedTasks: number }>();
    const hireRates = plans.map((planRow) => ({ newHire: planRow.employee.fullName, country: planRow.employee.country, totalTasks: planRow.tasks.length, completedTasks: planRow.tasks.filter((task) => task.status === "COMPLETED").length }));
    for (const hire of hireRates) { const current = countryRates.get(hire.country) ?? { country: hire.country, totalTasks: 0, completedTasks: 0 }; current.totalTasks += hire.totalTasks; current.completedTasks += hire.completedTasks; countryRates.set(hire.country, current); }
    const rates = plan.groupBy === "employee" || plan.personName
      ? hireRates.map((row) => ({ label: row.newHire, ...row, completionRate: row.totalTasks ? Number((row.completedTasks * 100 / row.totalTasks).toFixed(1)) : null }))
      : [...countryRates.values()].map((row) => ({ label: row.country, ...row, completionRate: row.totalTasks ? Number((row.completedTasks * 100 / row.totalTasks).toFixed(1)) : null }));
    return { summary: rates.length ? `Onboarding completion is calculated from completed tasks divided by all tasks in active plans. ${rates.map((row) => `${row.label}: ${row.completedTasks}/${row.totalTasks} (${row.completionRate ?? 0}%)`).join("; ")}` : "There are no active onboarding tasks matching that question.", data: rates.map((row) => { const { label, ...values } = row; void label; return values; }), provenance: `Live tasks from active onboarding plans; completion rate = completed tasks / all plan tasks × 100.` };
  }

  if (plan.intent === "onboarding_summary") {
    const plans = await prisma.onboarding.findMany({ where: { ...(plan.country || plan.department || plan.role || plan.personName || plan.managerName ? { employee: planEmployeeFilters(plan) } : {}) }, select: { status: true, employee: { select: { fullName: true, country: true } }, tasks: { select: { status: true, dueDate: true } } } });
    const planCounts: Record<string, number> = {}; const taskCountsByStatus: Record<string, number> = {}; let overdue = 0;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    for (const row of plans) { planCounts[row.status] = (planCounts[row.status] ?? 0) + 1; for (const task of row.tasks) { taskCountsByStatus[task.status] = (taskCountsByStatus[task.status] ?? 0) + 1; if (task.status !== "COMPLETED" && task.dueDate < today && row.status === "IN_PROGRESS") overdue += 1; } }
    return { summary: `${plans.length} onboarding plan${plans.length === 1 ? "" : "s"}; ${overdue} overdue task${overdue === 1 ? "" : "s"}.`, data: { plansByStatus: planCounts, tasksByStatus: taskCountsByStatus, overdueTasks: overdue }, provenance: "Live Onboarding and OnboardingTask counts; overdue tasks use the current UTC date." };
  }

  if (plan.intent === "task_owner_workload") {
    const tasks = await prisma.onboardingTask.findMany({ where: { status: { not: "COMPLETED" }, ...(plan.personName ? { owner: anyUserField("fullName", plan.personName) } : {}), ...(plan.department ? { OR: searchTokens(plan.department).map((token) => ({ department: { contains: token } })) } : {}), onboarding: { status: "IN_PROGRESS", ...(plan.country || plan.role || plan.managerName ? { employee: { country: plan.country ?? undefined, role: plan.role ?? undefined, ...(plan.managerName ? { manager: anyUserField("fullName", plan.managerName) } : {}) } } : {}) } }, orderBy: [{ owner: { fullName: "asc" } }, { dueDate: "asc" }], select: { title: true, status: true, dueDate: true, department: true, owner: { select: { fullName: true } }, onboarding: { select: { employee: { select: { fullName: true, country: true } } } } } });
    return { summary: `${tasks.length} unfinished onboarding task${tasks.length === 1 ? "" : "s"}${plan.personName ? ` for ${plan.personName}` : " across active plans"}.`, data: tasks.map((task) => ({ task: task.title, owner: task.owner?.fullName ?? "Unassigned", newHire: task.onboarding.employee.fullName, country: task.onboarding.employee.country, department: task.department, status: task.status, dueDate: task.dueDate.toISOString().slice(0, 10) })), provenance: `Live unfinished tasks in active onboarding plans; all ${tasks.length} matching tasks are included.` };
  }

  return null;
}

export async function executeSmartQuery(question: string): Promise<QueryResult | null> {
  const q = normalizeSearchText(question);
  const country = countries.find((c) => q.includes(c.toLowerCase()));
  const isOverdue = /overdue|past due|late/.test(q);
  const mentionedPerson = await findMentionedPerson(question);

  if (isOverdue && /onboard|task|new hire/.test(q)) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const where = {
      status: { not: "COMPLETED" }, dueDate: { lt: today },
      onboarding: { status: "IN_PROGRESS", ...(country ? { employee: { country } } : {}) },
    };
    const grouped = await prisma.onboardingTask.groupBy({ by: ["onboardingId"], where, _count: { _all: true } });
    const ids = grouped.map((row) => row.onboardingId);
    const plans = ids.length ? await prisma.onboarding.findMany({
      where: { id: { in: ids } }, select: { id: true, employee: { select: { fullName: true, country: true } } },
    }) : [];
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const hires = grouped.map((row) => {
      const plan = planById.get(row.onboardingId)!;
      return { newHire: plan.employee.fullName, country: plan.employee.country, overdueTasks: row._count._all };
    }).sort((a, b) => a.newHire.localeCompare(b.newHire));
    const taskCount = hires.reduce((sum, hire) => sum + hire.overdueTasks, 0);
    const hireDetails = hires.map((hire) => `${hire.newHire}: ${hire.overdueTasks} overdue`).join("; ");
    return {
      summary: `${hires.length} new hire${hires.length === 1 ? " has" : "s have"} ${taskCount} overdue onboarding task${taskCount === 1 ? "" : "s"}${country ? ` in ${country}` : ""}.${hireDetails ? ` Per hire: ${hireDetails}.` : ""}`,
      data: hires,
      provenance: `Live onboardingTask aggregation, grouped by onboarding; ${hires.length} hires and ${taskCount} tasks.`,
    };
  }

  if (/onboard/.test(q) && /(completion|completed|highest|rate|country)/.test(q)) {
    const eligible = { onboarding: { status: "IN_PROGRESS", ...(country ? { employee: { country } } : {}) } };
    const rates = await Promise.all((country ? [country] : countries).map(async (name) => {
      const where = { ...eligible, onboarding: { ...eligible.onboarding, employee: { country: name } } };
      const [totalTasks, completedTasks] = await Promise.all([
        prisma.onboardingTask.count({ where }),
        prisma.onboardingTask.count({ where: { ...where, status: "COMPLETED" } }),
      ]);
      return { country: name, totalTasks, completedTasks, completionRate: totalTasks ? Number((completedTasks * 100 / totalTasks).toFixed(1)) : null };
    }));
    const eligibleRates = rates.filter((rate) => rate.totalTasks > 0);
    if (!eligibleRates.length) return { summary: `There are no eligible tasks${country ? ` in ${country}` : ""} to calculate an onboarding completion rate.`, data: [], provenance: "Live onboardingTask counts for IN_PROGRESS onboarding plans." };
    const highest = Math.max(...eligibleRates.map((rate) => rate.completionRate!));
    const leaders = eligibleRates.filter((rate) => rate.completionRate === highest).map((rate) => rate.country);
    const countryDetails = eligibleRates.map((rate) => `${rate.country}: ${rate.completedTasks}/${rate.totalTasks} tasks (${rate.completionRate}%)`).join("; ");
    return {
      summary: `${leaders.join(" and ")} ${leaders.length === 1 ? "has" : "are tied at"} the highest onboarding completion rate at ${highest}%. By country: ${countryDetails}.`,
      data: eligibleRates,
      provenance: "Live onboardingTask counts for IN_PROGRESS onboarding plans; rate = completed tasks / all tasks × 100.",
    };
  }

  if (/request|ticket/.test(q) && /(how many|count|unresolved|open|pending|assigned)/.test(q)) {
    const category = /it equipment|\bit\b|laptop|equipment/.test(q) ? "IT_EQUIPMENT" : /software|access/.test(q) ? "SOFTWARE_ACCESS" : /hr query|leave|hr request/.test(q) ? "HR_QUERY" : /facilit/.test(q) ? "FACILITIES" : undefined;
    const priority = /urgent|urgency/.test(q) ? "URGENT" : /high priority/.test(q) ? "HIGH" : /medium priority/.test(q) ? "MEDIUM" : /low priority/.test(q) ? "LOW" : undefined;
    const status = /unresolved|open|pending/.test(q) ? { in: OPEN_STATUSES } : /assigned/.test(q) ? "ASSIGNED" : undefined;
    const filters = [
      ...(category ? [{ category }] : []),
      ...(priority ? [{ priority }] : []),
      ...(status ? [{ status }] : []),
      ...(country ? [{ requester: { country } }] : []),
      ...(mentionedPerson ? [{ OR: [{ requester: { fullName: { contains: normalizeSearchText(mentionedPerson) } } }, { assignee: { fullName: { contains: normalizeSearchText(mentionedPerson) } } }] }] : []),
    ];
    const where = filters.length === 1 ? filters[0] : { AND: filters };
    const [count, breakdown] = await Promise.all([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);
    const qualifiers = [category?.replaceAll("_", " ").toLowerCase(), priority?.toLowerCase(), status ? (typeof status === "string" ? "assigned" : "open") : undefined].filter(Boolean).join(" ");
    const noun = `service request${count === 1 ? "" : "s"}`;
    return {
      summary: `${count} ${[qualifiers, noun, country ? `in ${country}` : ""].filter(Boolean).join(" ")}.`,
      data: breakdown.map((row) => ({ status: row.status, count: row._count._all })),
      provenance: `Live ServiceRequest count and status aggregation; open means Submitted, Assigned, or In Progress; ${count} matching records.`,
    };
  }

  if (/headcount|how many (employees|people|staff)|number of employees/.test(q)) {
    const count = await prisma.user.count({
      where: {
        employmentStatus: { not: "INACTIVE" },
        ...(country ? { country } : {}),
        ...(mentionedPerson ? { fullName: { contains: normalizeSearchText(mentionedPerson) } } : {}),
      },
    });
    return { summary: `${count} active employee${count === 1 ? "" : "s"}${mentionedPerson ? ` matching ${mentionedPerson}` : ""}${country ? ` in ${country}` : " across all countries"}.`, data: { count, country: country ?? "all countries", person: mentionedPerson ?? "all employees" }, provenance: "Live User count; inactive records excluded and matching names are resolved from the User directory." };
  }
  return null;
}

export async function generateAnswer(question: string, result: QueryResult): Promise<{ answer: string; provider: string }> {
  const key = process.env.GROQ_API_KEY;
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

import "server-only";
import { prisma } from "@/lib/db/prisma";

export type QueryResult = { summary: string; data: unknown; provenance: string };

export async function executeSmartQuery(question: string): Promise<QueryResult | null> {
  const q = question.toLowerCase();
  const country = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"].find((c) => q.includes(c.toLowerCase()));
  const isOverdue = /overdue|past due|late/.test(q);
  if (isOverdue && /onboard|task|new hire/.test(q)) {
    const where = { status: { not: "COMPLETED" }, dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) }, onboarding: { status: "IN_PROGRESS", ...(country ? { employee: { country } } : {}) } };
    const [count, tasks] = await Promise.all([
      prisma.onboardingTask.count({ where }),
      prisma.onboardingTask.findMany({ where, select: { title: true, dueDate: true, onboarding: { select: { employee: { select: { fullName: true, country: true } } } }, owner: { select: { fullName: true } } }, orderBy: { dueDate: "asc" }, take: 20 }),
    ]);
    return { summary: `${count} onboarding task${count === 1 ? " is" : "s are"} overdue${country ? ` in ${country}` : ""}.`, data: tasks.map((t) => ({ task: t.title, newHire: t.onboarding.employee.fullName, country: t.onboarding.employee.country, owner: t.owner?.fullName ?? "Unassigned", dueDate: t.dueDate.toISOString().slice(0, 10) })), provenance: `Live onboardingTask query; ${count} matching records. Showing up to ${tasks.length}.` };
  }
  if (/request|ticket/.test(q) && /(how many|count|unresolved|open|pending)/.test(q)) {
    const category = /it equipment|\bit\b|laptop|equipment/.test(q) ? "IT_EQUIPMENT" : /software|access/.test(q) ? "SOFTWARE_ACCESS" : /hr query|leave|payroll|hr request/.test(q) ? "HR_QUERY" : /facilit/.test(q) ? "FACILITIES" : undefined;
    const status = /unresolved|open|pending/.test(q) ? { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] } : undefined;
    const where = { ...(category ? { category } : {}), ...(status ? { status } : {}), ...(country ? { requester: { country } } : {}) };
    const [count, breakdown] = await Promise.all([prisma.serviceRequest.count({ where }), prisma.serviceRequest.groupBy({ by: ["status"], where, _count: { _all: true } })]);
    const summary = `${count} ${category ? category.replaceAll("_", " ").toLowerCase() + " " : ""}${status ? "unresolved " : ""}service request${count === 1 ? "" : "s"}${country ? ` in ${country}` : ""}.`;
    return { summary, data: breakdown.map((r) => ({ status: r.status, count: r._count._all })), provenance: `Live ServiceRequest query; ${count} matching records, grouped by status.` };
  }
  if (/headcount|how many (employees|people|staff)|number of employees/.test(q)) {
    const count = await prisma.user.count({ where: { employmentStatus: { not: "INACTIVE" }, ...(country ? { country } : {}) } });
    return { summary: `${count} active employees${country ? ` in ${country}` : " across all countries"}.`, data: { count, country: country ?? "all countries" }, provenance: "Live User count; inactive records excluded." };
  }
  return null;
}

export async function generateAnswer(question: string, result: QueryResult): Promise<{ answer: string; provider: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { answer: result.summary, provider: "database-summary" };
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", temperature: 0.1, max_completion_tokens: 350,
      messages: [
        { role: "system", content: "Answer the HR admin question using only the supplied database result. Do not invent facts. If the result is insufficient, say what is missing. Keep the reply concise." },
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

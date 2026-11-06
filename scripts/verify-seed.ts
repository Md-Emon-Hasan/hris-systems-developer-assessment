import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, countries, departments, requests, comments, threads, onboardings, overdue, blocked, crossModule] = await Promise.all([
    prisma.user.count(), prisma.user.findMany({ distinct: ["country"], select: { country: true } }), prisma.user.findMany({ distinct: ["department"], select: { department: true } }),
    prisma.serviceRequest.findMany({ include: { _count: { select: { comments: true } } } }), prisma.requestComment.count(), prisma.serviceRequest.count({ where: { comments: { some: {} } } }),
    prisma.onboarding.findMany({ include: { tasks: { include: { dependsOn: true } }, employee: true } }),
    prisma.onboardingTask.count({ where: { dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: "COMPLETED" }, onboarding: { status: "IN_PROGRESS" } } }),
    prisma.onboardingTask.findMany({ where: { status: "BLOCKED" }, include: { dependsOn: true } }),
    prisma.serviceRequest.count({ where: { category: "IT_EQUIPMENT", status: { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] }, requester: { onboardings: { some: { status: "IN_PROGRESS" } } } } }),
  ]);
  const categories = new Set(requests.map((r) => r.category)); const priorities = new Set(requests.map((r) => r.priority)); const statuses = new Set(requests.map((r) => r.status));
  const countAssertions = [users === 100, countries.length >= 4, departments.length >= 4, requests.length >= 30, categories.size === 5, priorities.size === 4, statuses.size === 5, threads >= 5, comments >= 10, onboardings.length >= 5, onboardings.every((o) => o.tasks.length >= 8 && o.tasks.length <= 12), overdue >= 2, blocked.some((t) => t.dependsOn?.status !== "COMPLETED"), crossModule >= 1];
  if (countAssertions.some((ok) => !ok)) throw new Error(`Seed validation failed: ${JSON.stringify({ users, countries: countries.length, departments: departments.length, requests: requests.length, categories: categories.size, priorities: priorities.size, statuses: statuses.size, threads, comments, onboardings: onboardings.length, taskCounts: onboardings.map((o) => o.tasks.length), overdue, blocked: blocked.length, crossModule })}`);
  console.info(JSON.stringify({ users, countries: countries.length, departments: departments.length, requests: requests.length, categories: categories.size, priorities: priorities.size, statuses: statuses.size, threadedRequests: threads, comments, onboardings: onboardings.length, tasks: onboardings.reduce((sum, o) => sum + o.tasks.length, 0), overdueTasks: overdue, dependencyBlockedTasks: blocked.length, crossModule }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());

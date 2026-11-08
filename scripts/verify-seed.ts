import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const utcToday = new Date();
  utcToday.setUTCHours(0, 0, 0, 0);
  const [users, employees, managers, admins, countries, departments, requests, comments, onboardings, overdue, blocked, crossModule] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { role: "EMPLOYEE" } }), prisma.user.count({ where: { role: "MANAGER" } }), prisma.user.count({ where: { role: "HR_ADMIN" } }),
    prisma.user.findMany({ distinct: ["country"], select: { country: true } }), prisma.user.findMany({ distinct: ["department"], select: { department: true } }),
    prisma.serviceRequest.findMany({ include: { _count: { select: { comments: true } } } }), prisma.requestComment.count(),
    prisma.onboarding.findMany({ include: { tasks: { include: { dependsOn: true } }, employee: true } }),
    prisma.onboardingTask.count({ where: { dueDate: { lt: utcToday }, status: { not: "COMPLETED" }, onboarding: { status: "IN_PROGRESS" } } }),
    prisma.onboardingTask.findMany({ where: { status: "BLOCKED" }, include: { dependsOn: true } }),
    prisma.serviceRequest.count({ where: { category: "IT_EQUIPMENT", status: { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] }, requester: { onboardings: { some: { status: "IN_PROGRESS" } } } } }),
  ]);
  const commentThreads = requests.map((request) => request._count.comments).filter((count) => count > 0);
  const qualifyingThreads = commentThreads.filter((count) => count >= 2 && count <= 4).length;
  const dependencyViolations = onboardings.flatMap((onboarding) => onboarding.tasks).filter((task) => task.dependsOn && task.dependsOn.status !== "COMPLETED" && ["IN_PROGRESS", "COMPLETED"].includes(task.status)).length;
  const hireAges = onboardings.map((onboarding) => {
    const joiningDay = new Date(onboarding.employee.joiningDate);
    joiningDay.setUTCHours(0, 0, 0, 0);
    return Math.floor((utcToday.getTime() - joiningDay.getTime()) / 86_400_000);
  });
  const categories = new Set(requests.map((r) => r.category)); const priorities = new Set(requests.map((r) => r.priority)); const statuses = new Set(requests.map((r) => r.status));
  const countAssertions = [users === 109, employees === 100, managers === 8, admins === 1, countries.length >= 4, departments.length >= 4, requests.length >= 30, categories.size === 5, priorities.size === 4, statuses.size === 5, qualifyingThreads >= 5, onboardings.length >= 5 && onboardings.length <= 10, hireAges.every((age) => age >= 30 && age <= 60), onboardings.every((o) => o.tasks.length >= 8 && o.tasks.length <= 12), overdue >= 2, blocked.some((t) => t.dependsOn?.status !== "COMPLETED"), dependencyViolations === 0, crossModule >= 1];
  if (countAssertions.some((ok) => !ok)) throw new Error(`Seed validation failed: ${JSON.stringify({ users, employees, managers, admins, countries: countries.length, departments: departments.length, requests: requests.length, categories: categories.size, priorities: priorities.size, statuses: statuses.size, qualifyingThreads, commentThreads, comments, onboardings: onboardings.length, hireAges, taskCounts: onboardings.map((o) => o.tasks.length), overdue, blocked: blocked.length, dependencyViolations, crossModule })}`);
  console.info(JSON.stringify({ users, employees, managers, admins, countries: countries.length, departments: departments.length, requests: requests.length, categories: categories.size, priorities: priorities.size, statuses: statuses.size, qualifyingThreads, comments, onboardings: onboardings.length, hireAges, tasks: onboardings.reduce((sum, o) => sum + o.tasks.length, 0), overdueTasks: overdue, dependencyBlockedTasks: blocked.length, dependencyViolations, crossModule }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());

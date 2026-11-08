import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/auth/permissions";

const COUNTRIES = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"];
const OPEN = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"];

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const managerWhere = user.role === "MANAGER" ? { managerId: user.id } : {};
    const requestScope = user.role === "EMPLOYEE" ? { requesterId: user.id } : user.role === "MANAGER" ? { requester: { managerId: user.id } } : {};
    const openRequestScope = { ...requestScope, status: { in: OPEN } };
    const utcToday = new Date();
    utcToday.setUTCHours(0, 0, 0, 0);
    const [headcountByCountry, statusGroups, categoryGroups, onboardings, overdue, crossModule, requestCount] = await Promise.all([
      user.role === "EMPLOYEE" ? Promise.resolve([{ country: user.country, count: 1 }]) : Promise.all(COUNTRIES.map(async (country) => ({ country, count: await prisma.user.count({ where: { country, employmentStatus: { not: "INACTIVE" }, ...managerWhere } }) }))),
      prisma.serviceRequest.groupBy({ by: ["status"], where: openRequestScope, _count: { _all: true } }),
      prisma.serviceRequest.groupBy({ by: ["category"], where: openRequestScope, _count: { _all: true } }),
      prisma.onboarding.findMany({ where: { ...(user.role === "EMPLOYEE" ? { employeeId: user.id } : user.role === "MANAGER" ? { employee: { managerId: user.id } } : {}), status: "IN_PROGRESS" }, include: { employee: { select: { id: true, fullName: true, country: true } }, tasks: { select: { id: true, status: true, dueDate: true, dependsOnId: true } } } }),
      prisma.onboardingTask.count({ where: { dueDate: { lt: utcToday }, status: { not: "COMPLETED" }, onboarding: { ...(user.role === "EMPLOYEE" ? { employeeId: user.id } : user.role === "MANAGER" ? { employee: { managerId: user.id } } : {}), status: "IN_PROGRESS" } } }),
      user.role === "HR_ADMIN" ? prisma.serviceRequest.findMany({ where: { status: { in: OPEN }, category: "IT_EQUIPMENT", requester: { onboardings: { some: { status: "IN_PROGRESS" } } } }, include: { requester: { select: { id: true, fullName: true, country: true } } }, take: 8, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
      prisma.serviceRequest.count({ where: requestScope }),
    ]);
    return NextResponse.json({ data: {
      headcountByCountry,
      requests: { total: requestCount, byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count._all })), byCategory: categoryGroups.map((g) => ({ category: g.category, count: g._count._all })) },
      onboarding: { inProgress: onboardings.length, overdueTasks: overdue, hires: onboardings.map((o) => {
        const completed = o.tasks.filter((t) => t.status === "COMPLETED").length;
        const blocked = o.tasks.filter((t) => t.status === "BLOCKED").length;
        const overdueForHire = o.tasks.filter((t) => t.dueDate < utcToday && t.status !== "COMPLETED").length;
        return { id: o.employee.id, name: o.employee.fullName, country: o.employee.country, total: o.tasks.length, completed, pending: o.tasks.length - completed - blocked, overdue: overdueForHire, blocked };
      }) },
      crossModule: crossModule.map((r) => ({ requestNumber: r.requestNumber, title: r.title, requester: r.requester.fullName, country: r.requester.country, status: r.status })),
    } });
  } catch (error) { return apiError(error); }
}

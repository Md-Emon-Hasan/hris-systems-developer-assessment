import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const assignSchema = z.object({ employeeId: z.string(), templateId: z.string(), startDate: z.iso.date() });

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const onlyMyTasks = new URL(request.url).searchParams.get("myTasks") === "true";
    const scope = user.role === "HR_ADMIN" ? {} : user.role === "MANAGER" ? { OR: [{ employee: { managerId: user.id } }, { tasks: { some: { ownerId: user.id } } }] } : { OR: [{ employeeId: user.id }, { tasks: { some: { ownerId: user.id } } }] };
    const records = await prisma.onboarding.findMany({
      where: { ...scope, ...(onlyMyTasks && user.role !== "HR_ADMIN" ? { tasks: { some: { ownerId: user.id } } } : {}) },
      include: { employee: { select: { id: true, fullName: true, country: true, department: true, joiningDate: true, managerId: true } }, template: { select: { id: true, name: true } }, tasks: { include: { owner: { select: { id: true, fullName: true } }, sourceTask: { select: { ownerRole: true } }, dependsOn: { select: { id: true, title: true, status: true } } }, orderBy: { dueDate: "asc" } } }, orderBy: { startDate: "desc" },
    });
    const data = records.map((r) => {
      const isOwnChecklist = r.employeeId === user.id;
      const ownOnly = onlyMyTasks || (user.role === "EMPLOYEE" && !isOwnChecklist) || (user.role === "MANAGER" && r.employee.managerId !== user.id);
      const tasks = ownOnly ? r.tasks.filter((t) => t.ownerId === user.id) : r.tasks;
      return { ...r, tasks: tasks.map((task) => ({ ...task, ownerRole: task.sourceTask.ownerRole })) };
    });
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const parsed = assignSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Choose an employee, template, and valid start date." } }, { status: 400 });
    const { employeeId, templateId, startDate } = parsed.data;
    const [employee, template, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: employeeId }, select: { id: true, role: true, employmentStatus: true, country: true, managerId: true } }),
      prisma.onboardingTemplate.findUnique({ where: { id: templateId }, include: { tasks: { orderBy: { sortOrder: "asc" } } } }),
      prisma.onboarding.findFirst({ where: { employeeId, status: "IN_PROGRESS" } }),
    ]);
    if (!employee || employee.role === "HR_ADMIN" || employee.employmentStatus === "INACTIVE" || !template?.active) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Active employee or template not found." } }, { status: 404 });
    if (existing) return NextResponse.json({ error: { code: "ALREADY_ASSIGNED", message: "This employee already has an active onboarding." } }, { status: 409 });
    const candidates = await prisma.user.findMany({ where: { employmentStatus: "ACTIVE" }, select: { id: true, role: true, department: true, country: true } });
    const manager = employee.managerId ? candidates.find((person) => person.id === employee.managerId) : undefined;
    const resolveOwner = (task: typeof template.tasks[number]) => {
      if (task.ownerRole === "MANAGER" && manager?.department === task.department) return manager.id;
      const matching = candidates.filter((person) => person.role === task.ownerRole && person.department === task.department && (task.ownerRole === "HR_ADMIN" || person.country === employee.country));
      return matching.length === 1 ? matching[0]!.id : null;
    };
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const instance = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: employeeId }, data: { joiningDate: start } });
      const created = await tx.onboarding.create({ data: { employeeId, templateId, createdById: user.id, startDate: start, tasks: { create: template.tasks.map((task) => ({
        templateTaskId: task.id, title: task.title, description: task.description, department: task.department, dueOffsetDays: task.dueOffsetDays,
        dueDate: new Date(start.getTime() + task.dueOffsetDays * 86400000), ownerId: resolveOwner(task), status: task.dependsOnId ? "BLOCKED" : "NOT_STARTED",
      })) } }, include: { tasks: true } });
      const taskBySource = new Map(created.tasks.map((t) => [t.templateTaskId, t.id]));
      for (const task of template.tasks) if (task.dependsOnId) {
        const dependsOnId = taskBySource.get(task.dependsOnId);
        if (dependsOnId) await tx.onboardingTask.update({ where: { id: taskBySource.get(task.id)! }, data: { dependsOnId } });
      }
      return tx.onboarding.findUnique({ where: { id: created.id }, include: { tasks: true } });
    }, { timeout: 8_000 });
    const unassignedTasks = instance?.tasks.filter((task) => task.ownerId === null).length ?? 0;
    return NextResponse.json({ data: instance, meta: { unassignedTasks } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return NextResponse.json({ error: { code: "ALREADY_ASSIGNED", message: "This employee already has an active onboarding plan. Refresh the page and choose another employee." } }, { status: 409 });
      if (error.code === "P2003") return NextResponse.json({ error: { code: "STALE_ASSIGNMENT", message: "The employee, template, or one of its tasks changed. Refresh the page and try again." } }, { status: 409 });
      if (error.code === "P2025") return NextResponse.json({ error: { code: "STALE_ASSIGNMENT", message: "The selected employee or template is no longer available. Refresh the page and try again." } }, { status: 409 });
      if (error.code === "P2028") return NextResponse.json({ error: { code: "ASSIGNMENT_TIMEOUT", message: "Creating this checklist took too long. Please retry; no partial onboarding plan was saved." } }, { status: 503 });
    }
    return apiError(error);
  }
}

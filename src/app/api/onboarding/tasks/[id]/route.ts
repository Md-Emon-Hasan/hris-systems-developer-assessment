import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { canTransitionTask, canUpdateTaskStatus } from "@/lib/domains/request-state";

const schema = z.object({ status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]).optional(), ownerId: z.string().nullable().optional(), note: z.string().trim().max(500).optional() }).refine((v) => v.status !== undefined || v.ownerId !== undefined);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Invalid task update." } }, { status: 400 });
    const task = await prisma.onboardingTask.findUnique({ where: { id }, include: { onboarding: { include: { employee: { select: { id: true, managerId: true } } } }, sourceTask: { select: { ownerRole: true } }, dependsOn: { select: { status: true } } } });
    if (!task) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Task not found." } }, { status: 404 });
    const { status, ownerId, note } = parsed.data;
    const nextStatus = status ?? task.status;
    if (status !== undefined && !canUpdateTaskStatus(user, task, status, note)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the task owner can execute this task. HR may reopen a completed task with a note." } }, { status: 403 });
    if (status && !canTransitionTask(task.status, status, user.role, task.dependsOn?.status ?? null, note)) return NextResponse.json({ error: { code: "INVALID_TRANSITION", message: "That task status change is not allowed. Complete its prerequisite first or ask HR for help." } }, { status: 409 });
    if (ownerId !== undefined) {
      if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only HR Admin can change task ownership." } }, { status: 403 });
      if (ownerId !== null) {
      const newOwner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, employmentStatus: true, managerId: true, role: true, department: true } });
      if (!newOwner || newOwner.employmentStatus === "INACTIVE" || newOwner.role !== task.sourceTask.ownerRole || newOwner.department !== task.department) return NextResponse.json({ error: { code: "INVALID_OWNER", message: "Choose an active employee with the task's configured owner role and department." } }, { status: 400 });
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.onboardingTask.update({ where: { id }, data: { status: nextStatus, ...(ownerId !== undefined ? { ownerId } : {}), ...(status !== undefined ? { completedAt: status === "COMPLETED" ? new Date() : null } : {}) } });
      if (status !== undefined && status !== task.status) await tx.onboardingTaskHistory.create({ data: { taskId: id, actorId: user.id, fromStatus: task.status, toStatus: status, note } });
      if (status === "COMPLETED") await tx.onboardingTask.updateMany({ where: { dependsOnId: id, status: "BLOCKED" }, data: { status: "NOT_STARTED" } });
      const remaining = await tx.onboardingTask.count({ where: { onboardingId: task.onboardingId, status: { not: "COMPLETED" } } });
      await tx.onboarding.update({ where: { id: task.onboardingId }, data: { status: remaining === 0 ? "COMPLETED" : "IN_PROGRESS" } });
      return row;
    });
    return NextResponse.json({ data: updated });
  } catch (error) { return apiError(error); }
}

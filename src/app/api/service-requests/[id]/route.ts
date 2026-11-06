import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError, isScopedTo } from "@/lib/auth/permissions";
import { transitionSchema } from "@/lib/validation/schemas";
import { transitionRequest } from "@/lib/domains/request-state";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const { id } = await context.params;
    const item = await prisma.serviceRequest.findUnique({ where: { id }, include: { requester: { select: { id: true, fullName: true, country: true, department: true, managerId: true } }, assignee: { select: { id: true, fullName: true } }, comments: { include: { author: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" } }, history: { orderBy: { createdAt: "asc" } } } });
    if (!item || !isScopedTo(user, item.requester)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Request not found." } }, { status: 404 });
    return NextResponse.json({ data: item });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const { id } = await context.params;
    const parsed = transitionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Invalid transition." } }, { status: 400 });
    const current = await prisma.serviceRequest.findUnique({ where: { id }, include: { requester: true } });
    if (!current || !isScopedTo(user, current.requester)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Request not found." } }, { status: 404 });
    const { action, assigneeId, note } = parsed.data;
    let targetAssignee: string | undefined;
    if (action === "ASSIGN") {
      if (!(["MANAGER", "HR_ADMIN"] as string[]).includes(user.role) || !assigneeId) return NextResponse.json({ error: { code: "FORBIDDEN", message: "An authorized manager must select an assignee." } }, { status: 403 });
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, employmentStatus: true } });
      if (!assignee || assignee.employmentStatus !== "ACTIVE") return NextResponse.json({ error: { code: "INVALID_ASSIGNEE", message: "Choose an active employee." } }, { status: 400 });
      targetAssignee = assigneeId;
    }
    const decision = transitionRequest(current, user, action, targetAssignee, note);
    if (!decision.ok) return NextResponse.json({ error: { code: "INVALID_TRANSITION", message: decision.message } }, { status: decision.statusCode });
    const nextStatus = decision.status;
    const nextAssignee = decision.assigneeId;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.update({ where: { id }, data: { status: nextStatus, assigneeId: nextAssignee,
        ...(action === "RESOLVE" ? { resolvedAt: new Date() } : {}), ...(action === "CLOSE" ? { closedAt: new Date() } : {}), ...(action === "REOPEN" ? { resolvedAt: null } : {}) } });
      await tx.requestStatusHistory.create({ data: { requestId: id, actorId: user.id, fromStatus: current.status, toStatus: nextStatus, note } });
      return row;
    });
    return NextResponse.json({ data: updated });
  } catch (error) { return apiError(error); }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const updateSchema = z.object({ fullName: z.string().trim().min(2).max(100).optional(), country: z.enum(["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"]).optional(), department: z.string().trim().min(2).max(80).optional(), role: z.enum(["EMPLOYEE", "MANAGER", "HR_ADMIN"]).optional(), employmentStatus: z.enum(["ACTIVE", "ON_PROBATION", "ON_NOTICE", "INACTIVE"]).optional(), managerId: z.string().nullable().optional() }).refine((value) => Object.keys(value).length > 0);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const { id } = await context.params;
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, email: true, employeeNumber: true, country: true, department: true, role: true, employmentStatus: true, joiningDate: true, managerId: true } });
    if (!target || (actor.role !== "HR_ADMIN" && target.id !== actor.id && !(actor.role === "MANAGER" && target.managerId === actor.id))) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Employee not found." } }, { status: 404 });
    return NextResponse.json({ data: target });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (actor.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide valid employee fields." } }, { status: 400 });
    if (parsed.data.managerId) {
      if (parsed.data.managerId === id) return NextResponse.json({ error: { code: "INVALID_MANAGER", message: "An employee cannot manage themselves." } }, { status: 400 });
      const manager = await prisma.user.findUnique({ where: { id: parsed.data.managerId }, select: { role: true, employmentStatus: true } });
      if (!manager || manager.role !== "MANAGER" || manager.employmentStatus === "INACTIVE") return NextResponse.json({ error: { code: "INVALID_MANAGER", message: "Choose an active manager." } }, { status: 400 });
    }
    const updated = await prisma.user.update({ where: { id }, data: parsed.data, select: { id: true, fullName: true, email: true, employeeNumber: true, country: true, department: true, role: true, employmentStatus: true, joiningDate: true, managerId: true } });
    if (updated.employmentStatus === "INACTIVE") await prisma.authSession.deleteMany({ where: { userId: id } });
    return NextResponse.json({ data: updated });
  } catch (error) { return apiError(error); }
}

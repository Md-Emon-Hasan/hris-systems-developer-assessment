import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const taskSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(1000), department: z.string().trim().min(2).max(80), ownerRole: z.enum(["EMPLOYEE", "MANAGER", "HR_ADMIN"]), dueOffsetDays: z.number().int().min(0).max(365), dependsOnIndex: z.number().int().min(0).nullable().optional() });
const templateSchema = z.object({ name: z.string().trim().min(3).max(120), description: z.string().trim().max(500), tasks: z.array(taskSchema).min(8).max(12) });

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const rows = await prisma.onboardingTemplate.findMany({ where: user.role === "HR_ADMIN" ? {} : { active: true }, include: { tasks: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ data: rows });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const parsed = templateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Check the template details and tasks." } }, { status: 400 });
    for (const [index, task] of parsed.data.tasks.entries()) if (task.dependsOnIndex !== undefined && task.dependsOnIndex !== null && task.dependsOnIndex >= index) return NextResponse.json({ error: { code: "INVALID_DEPENDENCY", message: "Each task can depend only on an earlier task." } }, { status: 400 });
    const template = await prisma.onboardingTemplate.create({
      data: {
        name: parsed.data.name, description: parsed.data.description, createdById: user.id,
        tasks: { create: parsed.data.tasks.map((task, index) => ({
          title: task.title, description: task.description, department: task.department,
          ownerRole: task.ownerRole, dueOffsetDays: task.dueOffsetDays, sortOrder: index + 1,
        })) },
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });
    for (const [index, task] of parsed.data.tasks.entries()) if (task.dependsOnIndex !== undefined && task.dependsOnIndex !== null) await prisma.templateTask.update({ where: { id: template.tasks[index]!.id }, data: { dependsOnId: template.tasks[task.dependsOnIndex]!.id } });
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) { return apiError(error); }
}

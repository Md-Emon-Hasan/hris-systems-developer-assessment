import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const taskSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(1000), department: z.string().trim().min(2).max(80), ownerRole: z.enum(["EMPLOYEE", "MANAGER", "HR_ADMIN"]), dueOffsetDays: z.number().int().min(0).max(365), dependsOnIndex: z.number().int().min(0).nullable().optional() });
const schema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
  tasks: z.array(taskSchema).min(8).max(12).optional(),
}).refine((data) => Object.keys(data).length > 0);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide valid template fields and 8–12 valid tasks." } }, { status: 400 });
    const { id } = await context.params;
    if (parsed.data.tasks) {
      for (const [index, task] of parsed.data.tasks.entries()) if (task.dependsOnIndex !== undefined && task.dependsOnIndex !== null && task.dependsOnIndex >= index) return NextResponse.json({ error: { code: "INVALID_DEPENDENCY", message: "Each task can depend only on an earlier task." } }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.onboardingTemplate.findUnique({ where: { id }, include: { tasks: { orderBy: { sortOrder: "asc" } } } });
      if (!current) throw new Response("Template not found", { status: 404 });
      const { tasks, ...fields } = parsed.data;
      if (tasks) {
        const assignedPlans = await tx.onboarding.count({ where: { templateId: id } });
        if (assignedPlans > 0 && tasks.length !== current.tasks.length) throw new Response("Task count cannot change after this template has been assigned; edit the existing task details instead.", { status: 409 });
        let taskIds: string[];
        if (tasks.length !== current.tasks.length) {
          await tx.templateTask.deleteMany({ where: { templateId: id } });
          const createdTasks = await Promise.all(tasks.map((task, index) => tx.templateTask.create({ data: { title: task.title, description: task.description, department: task.department, ownerRole: task.ownerRole, dueOffsetDays: task.dueOffsetDays, templateId: id, dependsOnId: null, sortOrder: index + 1 } })));
          taskIds = createdTasks.map((task) => task.id);
        } else {
          taskIds = current.tasks.map((task) => task.id);
          await Promise.all(current.tasks.map((task) => tx.templateTask.update({ where: { id: task.id }, data: { dependsOnId: null } })));
          await Promise.all(tasks.map((task, index) => tx.templateTask.update({ where: { id: taskIds[index]! }, data: { title: task.title, description: task.description, department: task.department, ownerRole: task.ownerRole, dueOffsetDays: task.dueOffsetDays, sortOrder: index + 1 } })));
        }
        await Promise.all(tasks.map((task, index) => tx.templateTask.update({ where: { id: taskIds[index]! }, data: { dependsOnId: task.dependsOnIndex == null ? null : taskIds[task.dependsOnIndex]! } })));
      }
      return tx.onboardingTemplate.update({ where: { id }, data: { ...fields, version: { increment: 1 } }, include: { tasks: { orderBy: { sortOrder: "asc" } } } });
    });
    return NextResponse.json({ data: updated });
  } catch (error) { return apiError(error); }
}

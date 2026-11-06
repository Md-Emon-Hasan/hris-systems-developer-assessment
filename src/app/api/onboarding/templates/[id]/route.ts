import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({ name: z.string().trim().min(3).max(120).optional(), description: z.string().trim().max(500).optional(), active: z.boolean().optional() }).refine((data) => Object.keys(data).length > 0);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Provide valid template fields." } }, { status: 400 });
    const { id } = await context.params;
    const template = await prisma.onboardingTemplate.update({ where: { id }, data: { ...parsed.data, version: { increment: 1 } } });
    return NextResponse.json({ data: template });
  } catch (error) { return apiError(error); }
}

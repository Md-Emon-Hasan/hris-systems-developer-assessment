import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { requestSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const priority = url.searchParams.get("priority");
    const country = url.searchParams.get("country");
    const where = {
      ...(user.role === "EMPLOYEE" ? { requesterId: user.id } : user.role === "MANAGER" ? { requester: { managerId: user.id } } : {}),
      ...(status ? { status } : {}), ...(category ? { category } : {}), ...(priority ? { priority } : {}),
      ...(country && user.role === "HR_ADMIN" ? { requester: { country } } : {}),
    };
    const items = await prisma.serviceRequest.findMany({
      where, orderBy: { createdAt: "desc" }, take: 100,
      include: { requester: { select: { id: true, fullName: true, country: true, department: true, managerId: true } }, assignee: { select: { id: true, fullName: true } }, _count: { select: { comments: true } } },
    });
    return NextResponse.json({ data: items });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid request." } }, { status: 400 });
    const requestNumber = `SR-${Date.now().toString().slice(-8)}`;
    const created = await prisma.serviceRequest.create({
      data: { ...parsed.data, requestNumber, requesterId: user.id,
        history: { create: { actorId: user.id, fromStatus: null, toStatus: "SUBMITTED" } } },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError, canAccessRequest } from "@/lib/auth/permissions";
import { commentSchema } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const { id } = await context.params;
    const parsed = commentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Comment is required." } }, { status: 400 });
    const item = await prisma.serviceRequest.findUnique({ where: { id }, include: { requester: true } });
    if (!item || !canAccessRequest(user, item)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Request not found." } }, { status: 404 });
    const comment = await prisma.requestComment.create({ data: { requestId: id, authorId: user.id, body: parsed.data.body }, include: { author: { select: { fullName: true } } } });
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (error) { return apiError(error); }
}

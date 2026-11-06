import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = checkRateLimit(`login:${ip}`, 8, 15 * 60_000);
    if (!limit.allowed) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again in a few minutes." } }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Enter a valid email and password." } }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || user.employmentStatus === "INACTIVE" || !(await argon2.verify(user.passwordHash, parsed.data.password))) {
      return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ data: { user: { id: user.id, fullName: user.fullName, role: user.role } } });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unable to sign in." } }, { status: 500 });
  }
}

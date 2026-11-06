import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({ fullName: z.string().trim().min(2).max(100), email: z.email(), employeeNumber: z.string().trim().min(3).max(30), country: z.enum(["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"]), department: z.string().trim().min(2).max(80), role: z.enum(["EMPLOYEE", "MANAGER", "HR_ADMIN"]), employmentStatus: z.enum(["ACTIVE", "ON_PROBATION", "ON_NOTICE"]), joiningDate: z.iso.date(), managerId: z.string().nullable().optional(), password: z.string().min(12).max(100) });

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    const q = new URL(request.url).searchParams;
    const search = q.get("search")?.trim();
    const where = user.role === "HR_ADMIN" ? {} : user.role === "MANAGER" ? { managerId: user.id } : { id: user.id };
    const rows = await prisma.user.findMany({ where: { ...where, ...(q.get("country") ? { country: q.get("country")! } : {}), ...(q.get("department") ? { department: q.get("department")! } : {}), ...(q.get("role") ? { role: q.get("role")! } : {}), ...(q.get("status") ? { employmentStatus: q.get("status")! } : {}), ...(search ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }, { employeeNumber: { contains: search } }] } : {}) }, select: { id: true, fullName: true, email: true, employeeNumber: true, country: true, department: true, role: true, employmentStatus: true, joiningDate: true, managerId: true }, orderBy: { fullName: "asc" }, take: 100 });
    return NextResponse.json({ data: rows });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    if (user.role !== "HR_ADMIN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "HR Admin access required." } }, { status: 403 });
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid employee." } }, { status: 400 });
    const { password, joiningDate, ...fields } = parsed.data;
    if (fields.managerId) {
      const manager = await prisma.user.findUnique({ where: { id: fields.managerId }, select: { role: true, employmentStatus: true } });
      if (!manager || manager.role !== "MANAGER" || manager.employmentStatus === "INACTIVE") return NextResponse.json({ error: { code: "INVALID_MANAGER", message: "Choose an active manager." } }, { status: 400 });
    }
    const employee = await prisma.user.create({ data: { ...fields, email: fields.email.trim().toLowerCase(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }), joiningDate: new Date(`${joiningDate}T00:00:00.000Z`) }, select: { id: true, fullName: true, email: true, employeeNumber: true, role: true, country: true, department: true } });
    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return NextResponse.json({ error: { code: "DUPLICATE_EMPLOYEE", message: "That email or employee ID is already in use." } }, { status: 409 });
    return apiError(error);
  }
}

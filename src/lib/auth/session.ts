import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

const COOKIE_NAME = "hris_session";
const SESSION_DAYS = 7;
const sha256 = (input: string) => createHash("sha256").update(input).digest("hex");

export type UserRole = "EMPLOYEE" | "MANAGER" | "HR_ADMIN";
export type CurrentUser = {
  id: string; fullName: string; email: string; employeeNumber: string;
  role: UserRole; country: string; department: string; managerId: string | null;
};

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.authSession.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.user.employmentStatus === "INACTIVE" || session.expiresAt <= new Date()) {
    if (session) await prisma.authSession.delete({ where: { id: session.id } });
    return null;
  }
  const u = session.user;
  return {
    id: u.id, fullName: u.fullName, email: u.email, employeeNumber: u.employeeNumber,
    role: u.role as UserRole, country: u.country, department: u.department, managerId: u.managerId,
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE_NAME);
}

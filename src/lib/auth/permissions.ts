import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser, type UserRole } from "./session";
import { canAccessRequest } from "@/lib/domains/request-access";

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Response("Authentication required", { status: 401 });
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export function isScopedTo(user: CurrentUser, owner: { id: string; managerId: string | null }): boolean {
  return user.role === "HR_ADMIN" || owner.id === user.id ||
    (user.role === "MANAGER" && owner.managerId === user.id);
}

export { canAccessRequest };

export function apiError(error: unknown): NextResponse {
  if (error instanceof Response) {
    return NextResponse.json({ error: { code: error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: error.statusText || (error.status === 401 ? "Authentication required" : "Forbidden") } }, { status: error.status });
  }
  console.error("API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
}

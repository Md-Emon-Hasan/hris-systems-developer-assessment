export type RequestPrincipal = { id: string; role: string };
export type RequestScope = { requester: { id: string; managerId: string | null }; assigneeId: string | null };

export function canAccessRequest(principal: RequestPrincipal, request: RequestScope): boolean {
  return principal.role === "HR_ADMIN" || request.requester.id === principal.id || request.assigneeId === principal.id ||
    (principal.role === "MANAGER" && request.requester.managerId === principal.id);
}

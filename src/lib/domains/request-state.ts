export type RequestAction = "ASSIGN" | "START" | "RESOLVE" | "CLOSE" | "REOPEN";
export type RequestActor = { id: string; role: string };
export type RequestState = { status: string; requesterId: string; assigneeId: string | null };
export type TransitionResult = { ok: true; status: string; assigneeId: string | null } | { ok: false; statusCode: number; message: string };

export function transitionRequest(current: RequestState, actor: RequestActor, action: RequestAction, targetAssigneeId?: string, note?: string): TransitionResult {
  const admin = actor.role === "HR_ADMIN";
  if (action === "ASSIGN") {
    if ((!admin && actor.role !== "MANAGER") || !targetAssigneeId) return { ok: false, statusCode: 403, message: "An authorized manager must select an assignee." };
    if (current.status !== "SUBMITTED") return { ok: false, statusCode: 409, message: "Only submitted requests can be assigned." };
    return { ok: true, status: "ASSIGNED", assigneeId: targetAssigneeId };
  }
  if (action === "START") {
    if (current.status !== "ASSIGNED" || (!admin && actor.id !== current.assigneeId)) return { ok: false, statusCode: 409, message: "Only the assignee can start an assigned request." };
    return { ok: true, status: "IN_PROGRESS", assigneeId: current.assigneeId };
  }
  if (action === "RESOLVE") {
    if (current.status !== "IN_PROGRESS" || (!admin && actor.id !== current.assigneeId)) return { ok: false, statusCode: 409, message: "Only the assignee can resolve an in-progress request." };
    return { ok: true, status: "RESOLVED", assigneeId: current.assigneeId };
  }
  if (action === "CLOSE") {
    if (current.status !== "RESOLVED" || (!admin && actor.id !== current.requesterId)) return { ok: false, statusCode: 409, message: "The requester can close a resolved request." };
    return { ok: true, status: "CLOSED", assigneeId: current.assigneeId };
  }
  if (current.status !== "RESOLVED" || (!admin && actor.id !== current.assigneeId) || !note?.trim()) return { ok: false, statusCode: 409, message: "The assignee must provide a note to reopen a resolved request." };
  return { ok: true, status: "IN_PROGRESS", assigneeId: current.assigneeId };
}

export function dependencyBlocksTask(nextStatus: string, dependencyStatus: string | null): boolean {
  return ["IN_PROGRESS", "COMPLETED"].includes(nextStatus) && dependencyStatus !== null && dependencyStatus !== "COMPLETED";
}

export function canTransitionTask(from: string, to: string, role: string, dependencyStatus: string | null, note?: string): boolean {
  if (from === to) return true;
  const prerequisiteIncomplete = dependencyStatus !== null && dependencyStatus !== "COMPLETED";
  if (from === "NOT_STARTED" && to === "IN_PROGRESS") return !prerequisiteIncomplete;
  if (from === "IN_PROGRESS" && to === "COMPLETED") return !prerequisiteIncomplete;
  if (["NOT_STARTED", "IN_PROGRESS"].includes(from) && to === "BLOCKED") return prerequisiteIncomplete;
  if (from === "BLOCKED" && to === "NOT_STARTED") return !prerequisiteIncomplete;
  return from === "COMPLETED" && to === "IN_PROGRESS" && role === "HR_ADMIN" && Boolean(note?.trim());
}

export function canUpdateTaskStatus(actor: { id: string; role: string }, task: { ownerId: string | null; status: string }, nextStatus: string, note?: string): boolean {
  if (task.ownerId === actor.id) return true;
  return actor.role === "HR_ADMIN" && task.status === "COMPLETED" && nextStatus === "IN_PROGRESS" && Boolean(note?.trim());
}

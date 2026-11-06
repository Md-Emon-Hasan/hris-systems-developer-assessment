import { describe, expect, it } from "vitest";
import { canTransitionTask, dependencyBlocksTask, transitionRequest } from "./request-state";

describe("service request transitions", () => {
  const request = { status: "ASSIGNED", requesterId: "employee-1", assigneeId: "manager-1" };

  it("lets only the assigned owner start work", () => {
    expect(transitionRequest(request, { id: "manager-1", role: "MANAGER" }, "START")).toEqual({ ok: true, status: "IN_PROGRESS", assigneeId: "manager-1" });
    expect(transitionRequest(request, { id: "employee-2", role: "EMPLOYEE" }, "START").ok).toBe(false);
  });

  it("requires resolution before the requester can close", () => {
    expect(transitionRequest(request, { id: "employee-1", role: "EMPLOYEE" }, "CLOSE").ok).toBe(false);
    expect(transitionRequest({ ...request, status: "RESOLVED" }, { id: "employee-1", role: "EMPLOYEE" }, "CLOSE")).toMatchObject({ ok: true, status: "CLOSED" });
  });

  it("requires a note when an assignee reopens a resolved request", () => {
    const resolved = { ...request, status: "RESOLVED" };
    expect(transitionRequest(resolved, { id: "manager-1", role: "MANAGER" }, "REOPEN").ok).toBe(false);
    expect(transitionRequest(resolved, { id: "manager-1", role: "MANAGER" }, "REOPEN", undefined, "More work needed")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });
});

describe("onboarding dependencies", () => {
  it("prevents starting or completing a task while its dependency is incomplete", () => {
    expect(dependencyBlocksTask("IN_PROGRESS", "NOT_STARTED")).toBe(true);
    expect(dependencyBlocksTask("COMPLETED", "IN_PROGRESS")).toBe(true);
    expect(dependencyBlocksTask("IN_PROGRESS", "COMPLETED")).toBe(false);
    expect(dependencyBlocksTask("NOT_STARTED", "NOT_STARTED")).toBe(false);
  });

  it("enforces the onboarding task lifecycle and permits audited HR reopening", () => {
    expect(canTransitionTask("NOT_STARTED", "COMPLETED", "HR_ADMIN", null)).toBe(false);
    expect(canTransitionTask("NOT_STARTED", "IN_PROGRESS", "EMPLOYEE", null)).toBe(true);
    expect(canTransitionTask("IN_PROGRESS", "COMPLETED", "MANAGER", null)).toBe(true);
    expect(canTransitionTask("COMPLETED", "IN_PROGRESS", "MANAGER", null, "reopen")).toBe(false);
    expect(canTransitionTask("COMPLETED", "IN_PROGRESS", "HR_ADMIN", null, "Work needs correction")).toBe(true);
  });
});

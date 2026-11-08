import { describe, expect, it } from "vitest";
import { canAccessRequest } from "./request-access";

const request = { requester: { id: "employee-a", managerId: "manager-a" }, assigneeId: "employee-b" };

describe("service request record scope", () => {
  it("allows requester, assignee, their manager, and HR Admin", () => {
    expect(canAccessRequest({ id: "employee-a", role: "EMPLOYEE" }, request)).toBe(true);
    expect(canAccessRequest({ id: "employee-b", role: "EMPLOYEE" }, request)).toBe(true);
    expect(canAccessRequest({ id: "manager-a", role: "MANAGER" }, request)).toBe(true);
    expect(canAccessRequest({ id: "hr", role: "HR_ADMIN" }, request)).toBe(true);
  });

  it("does not expose unrelated requests", () => {
    expect(canAccessRequest({ id: "employee-c", role: "EMPLOYEE" }, request)).toBe(false);
    expect(canAccessRequest({ id: "manager-b", role: "MANAGER" }, request)).toBe(false);
  });
});

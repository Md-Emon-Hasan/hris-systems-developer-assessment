import { describe, expect, it } from "vitest";
import { seedAction } from "./seed-safety";

describe("assessment seed safety", () => {
  it("allows an empty database to receive the demo seed", () => {
    expect(seedAction({ users: 0, requests: 0, onboardings: 0, templates: 0, hasAssessmentAdmin: false })).toBe("seed");
  });

  it("leaves a complete existing assessment seed unchanged", () => {
    expect(seedAction({ users: 109, requests: 36, onboardings: 7, templates: 1, hasAssessmentAdmin: true })).toBe("skip");
  });

  it("refuses to mutate any other populated database", () => {
    expect(() => seedAction({ users: 4, requests: 0, onboardings: 0, templates: 0, hasAssessmentAdmin: false })).toThrow(/Refusing to seed a populated database/);
    expect(() => seedAction({ users: 109, requests: 12, onboardings: 7, templates: 1, hasAssessmentAdmin: true })).toThrow(/Refusing to seed a populated database/);
  });
});

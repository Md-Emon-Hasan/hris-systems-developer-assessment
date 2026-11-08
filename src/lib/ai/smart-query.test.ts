import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./query-normalization";

describe("Smart Query input normalization", () => {
  it("ignores question punctuation and preserves name tokens", () => {
    expect(normalizeSearchText("  AIsHa Rahman??? ")).toBe("aisha rahman");
  });

  it("normalizes punctuation between words", () => {
    expect(normalizeSearchText("How many requests, in Bangladesh?")).toBe("how many requests in bangladesh");
  });
});

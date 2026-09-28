import { describe, expect, it } from "vitest";
import { ilikeContains, normalizeSearchTerm } from "./search";

describe("ilikeContains", () => {
  it("wraps the term in % wildcards", () => {
    expect(ilikeContains("visa")).toBe("%visa%");
  });

  it("escapes LIKE metacharacters so they match literally", () => {
    expect(ilikeContains("50%")).toBe("%50\\%%");
    expect(ilikeContains("first_name")).toBe("%first\\_name%");
    expect(ilikeContains("a\\b")).toBe("%a\\\\b%");
  });

  it("leaves PostgREST filter syntax characters alone (never used in .or)", () => {
    expect(ilikeContains("a,b(c)")).toBe("%a,b(c)%");
  });
});

describe("normalizeSearchTerm", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearchTerm("  work   permit ")).toBe("work permit");
    expect(normalizeSearchTerm("   ")).toBe("");
  });
});

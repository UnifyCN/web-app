import { describe, expect, it } from "vitest";
import { isAdminPermission } from "./access";

describe("isAdminPermission", () => {
  it("accepts the raw column value 'admin'", () => {
    expect(isAdminPermission("admin")).toBe(true);
  });

  it("accepts getCurrentUser()'s array form", () => {
    expect(isAdminPermission(["admin"])).toBe(true);
  });

  it("rejects the other permission values", () => {
    for (const value of ["user", "partner", ["user"], ["partner"], []]) {
      expect(isAdminPermission(value)).toBe(false);
    }
  });

  it("rejects a missing value", () => {
    expect(isAdminPermission(null)).toBe(false);
    expect(isAdminPermission(undefined)).toBe(false);
  });

  it("is an exact match, not a case-insensitive or prefix one", () => {
    expect(isAdminPermission("Admin")).toBe(false);
    expect(isAdminPermission("admin ")).toBe(false);
    expect(isAdminPermission(["administrator"])).toBe(false);
  });
});

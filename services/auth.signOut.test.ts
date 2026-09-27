import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supabaseSignOut: vi.fn(async () => ({ error: null })),
  clearAllAuthEmails: vi.fn(),
  clearRecoveryPending: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mocks.supabaseSignOut } }),
}));
vi.mock("@/lib/supabase/ensureUserRow", () => ({ ensureUserRow: vi.fn() }));
vi.mock("@/lib/authEmailHandoff", () => ({
  clearAllAuthEmails: mocks.clearAllAuthEmails,
}));
vi.mock("@/lib/recoveryPending", () => ({
  clearRecoveryPending: mocks.clearRecoveryPending,
}));

import { signOut } from "./auth";

afterEach(() => vi.clearAllMocks());

describe("signOut", () => {
  it("forgets handed-over emails and a pending recovery, then signs out", async () => {
    const { error } = await signOut();
    expect(error).toBeNull();
    expect(mocks.clearAllAuthEmails).toHaveBeenCalledTimes(1);
    expect(mocks.clearRecoveryPending).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseSignOut).toHaveBeenCalledTimes(1);
  });
});

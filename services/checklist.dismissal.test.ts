import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
  getAuthUserId: vi.fn(),
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/sanity", () => ({
  mergeI18nOverlay: vi.fn(),
  sanityClient: { fetch: vi.fn() },
}));

import { setSuggestedTaskDismissed } from "./checklist";

describe("setSuggestedTaskDismissed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
  });

  it("stores a removal on the shared per-user task row", async () => {
    await setSuggestedTaskDismissed("sanity-1", true);

    expect(mocks.from).toHaveBeenCalledWith("user_tasks");
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        sanity_checklist_id: "sanity-1",
        dismissed_at: expect.any(String),
      },
      { onConflict: "user_id,sanity_checklist_id" },
    );
  });

  it("restores a task by clearing the shared dismissal timestamp", async () => {
    await setSuggestedTaskDismissed("sanity-1", false);

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        sanity_checklist_id: "sanity-1",
        dismissed_at: null,
      },
      { onConflict: "user_id,sanity_checklist_id" },
    );
  });

  it("does not write checklist state without a signed-in user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      setSuggestedTaskDismissed("sanity-1", true),
    ).rejects.toThrow("setSuggestedTaskDismissed: no auth session");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

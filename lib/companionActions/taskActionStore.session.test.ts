import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskActionClient } from "./client";
import { clearTaskActionStores, taskActionStoreFor } from "./taskActionStore";

const client = {} as TaskActionClient;
const deps = (sessionEpoch: number) => ({
  sessionEpoch,
  client,
  newOperationId: () => "unused-operation",
  onChanged: vi.fn(),
});

afterEach(() => clearTaskActionStores());

describe("private task work belongs to an account session", () => {
  it("a new session for the same account drops reminder and waiting drafts and removal requests", () => {
    const old = taskActionStoreFor("a", deps(7));
    old.setDraft("reminder-draft:custom:1", "Private reminder time");
    old.setDraft("custom:1", "Private waiting reason");
    old.requestRemoval("custom:1", "private-review");
    const current = taskActionStoreFor("a", deps(9));
    expect(current.draft("reminder-draft:custom:1")).toBeUndefined();
    expect(current.draft("custom:1")).toBeUndefined();
    expect(current.hasRemovalRequest("custom:1")).toBe(false);
    old.setDraft("reminder-draft:custom:1", "Late old text");
    expect(current.draft("reminder-draft:custom:1")).toBeUndefined();
  });

  it("the same session shares drafts between surfaces and keeps them through a token refresh", () => {
    const first = taskActionStoreFor("a", deps(7));
    first.setDraft("reminder-draft:custom:1", "Reminder time kept");
    const refreshed = taskActionStoreFor("a", deps(7));
    expect(refreshed.draft("reminder-draft:custom:1")).toBe("Reminder time kept");
    refreshed.setDraft("custom:1", "Waiting reason kept");
    expect(first.draft("custom:1")).toBe("Waiting reason kept");
  });
});

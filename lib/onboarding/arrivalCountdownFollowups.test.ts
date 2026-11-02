process.env.TZ = "America/Vancouver";

import { afterEach, describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/types";
import {
  isDialogOpenFor,
  stageChangedOvernight,
} from "./arrivalCountdown";
import {
  arrivalDateMutationOptions,
  type ArrivalDateVars,
} from "./arrivalDateMutation";

const USER_KEY = ["current-user"];
const TASKS = ["tasks"];

function profile(id: string, arrivalDate: string | null, stage: 0 | 1 | null) {
  return {
    id,
    username: id,
    onboarding: { arrivalDate, stage },
  } as unknown as UserProfile;
}

describe("1. midnight stage change refreshes the checklist", () => {
  it("is true the night the user arrives (stage 0 -> 1)", () => {
    expect(stageChangedOvernight("2026-11-02", "2026-11-01", "2026-11-02")).toBe(true);
  });
  it("is true when 3 months pass (stage 1 -> 2)", () => {
    expect(stageChangedOvernight("2026-08-02", "2026-11-01", "2026-11-02")).toBe(true);
  });
  it("is false on an ordinary night and without a date", () => {
    expect(stageChangedOvernight("2026-12-15", "2026-11-01", "2026-11-02")).toBe(false);
    expect(stageChangedOvernight(null, "2026-11-01", "2026-11-02")).toBe(false);
  });
});

describe("2. the 'date changed' event fires even when the caller unmounts", () => {
  it("calls onSaved from the mutation itself, after the observer is gone", async () => {
    const queryClient = new QueryClient();
    let resolveSave: (() => void) | undefined;
    const onSaved = vi.fn();
    const observer = new MutationObserver(
      queryClient,
      arrivalDateMutationOptions({
        queryClient,
        mutationFn: () => new Promise<void>((r) => (resolveSave = r)),
        currentUserKey: USER_KEY,
        invalidateKeys: [TASKS],
        onSaved,
      }),
    );
    const done = observer.mutate({ arrivalDate: "2026-09-01", expectedUserId: "a" });
    // The dialog (and card) unmount while the save is in flight.
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf("function"));
    observer.reset();
    resolveSave!();
    await done.catch(() => {});
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ arrivalDate: "2026-09-01" }),
    );
  });

  it("a failing tracker never breaks the save", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(USER_KEY, profile("a", null, 0));
    const opts = arrivalDateMutationOptions({
      queryClient,
      mutationFn: async () => {},
      currentUserKey: USER_KEY,
      invalidateKeys: [],
      onSaved: () => {
        throw new Error("posthog down");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      opts.onSuccess(undefined, { arrivalDate: "2026-09-01", expectedUserId: "a" }),
    ).not.toThrow();
    expect(queryClient.getQueryData<UserProfile>(USER_KEY)?.onboarding?.arrivalDate).toBe(
      "2026-09-01",
    );
    warn.mockRestore();
  });
});

describe("3. the dialog closes if another account signs in", () => {
  it("is open only for the account it was opened for", () => {
    expect(isDialogOpenFor("a", "a")).toBe(true);
    expect(isDialogOpenFor("a", "b")).toBe(false);
    expect(isDialogOpenFor("a", null)).toBe(false);
    expect(isDialogOpenFor(null, "a")).toBe(false);
  });
});

describe("4. the profile cache is patched only for the account that saved", () => {
  const run = (cached: UserProfile, vars: ArrivalDateVars) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(USER_KEY, cached);
    arrivalDateMutationOptions({
      queryClient,
      mutationFn: async () => {},
      currentUserKey: USER_KEY,
      invalidateKeys: [TASKS],
    }).onSuccess(undefined, vars);
    return queryClient.getQueryData<UserProfile>(USER_KEY)!;
  };

  it("patches date and stage for the same account", () => {
    const after = run(profile("a", null, 0), {
      arrivalDate: "2020-01-01",
      expectedUserId: "a",
    });
    expect(after.onboarding?.arrivalDate).toBe("2020-01-01");
    expect(after.onboarding?.stage).toBe(4);
  });

  it("leaves another account's cached profile untouched", () => {
    const after = run(profile("b", "2026-12-15", 0), {
      arrivalDate: "2020-01-01",
      expectedUserId: "a",
    });
    expect(after.onboarding?.arrivalDate).toBe("2026-12-15");
    expect(after.onboarding?.stage).toBe(0);
  });
});

describe("5. 'countdown shown' is claimed once across tabs", () => {
  const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
  afterEach(() => {
    delete g.window;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("two tabs at once send it once, inside a per-user Web Lock", async () => {
    // Shared storage, like two tabs of one origin.
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
    // A fake Locks API that runs one holder at a time per name.
    const names: string[] = [];
    let chain = Promise.resolve<unknown>(undefined);
    vi.stubGlobal("navigator", {
      locks: {
        request: (name: string, cb: () => unknown) => {
          names.push(name);
          const next = chain.then(cb);
          chain = next.catch(() => {});
          return next;
        },
      },
    });
    // Two module instances = two tabs (separate in-memory state).
    const tab1 = await import("./arrivalCountdown");
    vi.resetModules();
    const tab2 = await import("./arrivalCountdown");
    expect(tab1).not.toBe(tab2);

    const results = await Promise.all([
      tab1.claimCountdownShownAcrossTabs("u1", "2026-11-02"),
      tab2.claimCountdownShownAcrossTabs("u1", "2026-11-02"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(names).toEqual(["arrival_countdown_shown:u1", "arrival_countdown_shown:u1"]);
    // Next day it can be claimed again.
    expect(await tab2.claimCountdownShownAcrossTabs("u1", "2026-11-03")).toBe(true);
  });

  it("falls back to the per-tab claim without the Locks API", async () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
    vi.stubGlobal("navigator", {});
    const mod = await import("./arrivalCountdown");
    expect(await mod.claimCountdownShownAcrossTabs("u2", "2026-11-02")).toBe(true);
    expect(await mod.claimCountdownShownAcrossTabs("u2", "2026-11-02")).toBe(false);
  });
});

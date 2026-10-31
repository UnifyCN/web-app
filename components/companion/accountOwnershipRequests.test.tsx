// @vitest-environment jsdom
//
// Account ownership at the request boundary of the web Companion services and
// hooks (mobile-app#361, Spec r4). The actual services/companion.ts runs against
// a scripted Supabase client; the actual useSendMessage and
// useDeleteConversation hooks run with the actual query cache. The actual session
// helper (lib/accountSession.ts) names the signed-in account. Each test holds a
// reply between two requests, changes the account and releases it. This proves
// which requests the client starts; it is not evidence of SDK event order, RLS
// or a hosted project.
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newQueryClient } from "@/components/companion/tasks/taskActionsTestHarness";
import { noteAccount, ownAccountWork } from "@/lib/accountSession";
import type { Conversation } from "@/types";

// ---------------------------------------------------------------- scripted SDK
let current: string | null = null;
type Reply = { data?: unknown; error?: unknown };
const sdk = {
  calls: [] as { op: string; as: string | null }[],
  held: new Map<string, Array<(reply?: Reply) => void>>(),
  holdNext: new Set<string>(),
  defaults: {} as Record<string, () => Reply>,
  call(op: string): Promise<Reply> {
    sdk.calls.push({ op, as: current });
    const reply = sdk.defaults[op]?.() ?? { data: null, error: null };
    if (!sdk.holdNext.delete(op)) return Promise.resolve(reply);
    return new Promise((resolve) => {
      const list = sdk.held.get(op) ?? [];
      list.push((r) => resolve(r ?? reply));
      sdk.held.set(op, list);
    });
  },
  /** The next `op` waits; the returned function answers it. */
  hold(op: string) {
    sdk.holdNext.add(op);
    return (reply?: Reply) => sdk.held.get(op)?.shift()?.(reply);
  },
  ops: () => sdk.calls.map((c) => c.op),
};
let authReply: (() => Promise<string | null>) | null = null;
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getAuthUserId: () => (authReply ? authReply() : Promise.resolve(current)),
  createClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      let kind = "select";
      const end = () => sdk.call(`${table}.${kind}`);
      Object.assign(chain, {
        select: () => chain,
        insert: () => ((kind = "insert"), chain),
        delete: () => ((kind = "delete"), chain),
        eq: () => chain,
        order: () => end(),
        single: () => end(),
        maybeSingle: () => end(),
        then: (ok: (r: Reply) => unknown, bad: (e: unknown) => unknown) =>
          end().then(ok, bad),
      });
      return chain;
    },
  }),
}));
vi.mock("@/hooks/useAuthUser", () => ({
  AUTH_USER_KEY: ["auth-user"],
  useAuthUser: () => ({
    data: current ? { id: current } : null,
    isPending: false,
  }),
}));
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => false,
  posthog: { capture: () => {} },
}));

import * as companion from "@/services/companion";
import { useDeleteConversation, useSendMessage } from "@/hooks/useCompanion";
import { conversationsKey } from "@/lib/companion/conversationKeys";
import { useTaskActionStore } from "@/hooks/useTaskActions";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";

function signIn(id: string | null) {
  current = id;
  noteAccount(id);
}
/** The next user read waits until the returned function answers it. */
function holdUserRead() {
  let answer: (id: string | null) => void = () => {};
  authReply = () =>
    new Promise((r) => {
      authReply = null;
      answer = r;
    });
  return (id: string | null) => answer(id);
}
const owner = () => ownAccountWork();
let n = 0;
const at = "2026-10-25T17:30:00Z";

beforeEach(() => {
  n += 1;
  sdk.calls.splice(0);
  sdk.held.clear();
  sdk.holdNext.clear();
  authReply = null;
  sdk.defaults = {
    "conversations.select": () => ({ data: { id: 7 }, error: null }),
    "conversations.insert": () => ({
      data: { conversation_identifier: "c-new", title: "t", updated_at: at },
      error: null,
    }),
    "conversations.delete": () => ({
      data: [{ conversation_identifier: "c-a" }],
      error: null,
    }),
    "messages.insert": () => ({
      data: {
        id: 1,
        role: "user",
        content: "x",
        sources: null,
        created_at: at,
      },
      error: null,
    }),
    "messages.select": () => ({ data: [], error: null }),
  };
  signIn(`svc-a-${n}`);
});

describe("web service requests belong to the account that started them", () => {
  it("a save whose conversation lookup answers after B signed in inserts nothing", async () => {
    const a = owner();
    const release = sdk.hold("conversations.select");
    const saving = companion.saveMessage({
      conversationIdentifier: "c-a",
      role: "user",
      content: "Private A message",
      owner: a,
    });
    await waitFor(() => expect(sdk.ops()).toEqual(["conversations.select"]));

    signIn(`svc-b-${n}`);
    release();

    await expect(saving).rejects.toMatchObject({ name: "AccountChangedError" });
    expect(sdk.ops()).toEqual(["conversations.select"]);
  });

  it("a save whose user read ends after B signed in makes no request", async () => {
    const a = owner();
    const answer = holdUserRead();
    const saving = companion.saveMessage({
      conversationIdentifier: "c-a",
      role: "user",
      content: "Private A message",
      owner: a,
    });

    signIn(`svc-b-${n}`);
    answer(`svc-b-${n}`);

    await expect(saving).rejects.toMatchObject({ name: "AccountChangedError" });
    expect(sdk.ops()).toEqual([]);
  });

  it("a creation whose tagged insert fails after B signed in does not retry as B", async () => {
    const a = owner();
    const release = sdk.hold("conversations.insert");
    const creating = companion.createConversation(
      "Private A first",
      { source: "in-lesson", lessonId: "l1" },
      a,
    );
    await waitFor(() => expect(sdk.ops()).toEqual(["conversations.insert"]));

    signIn(`svc-b-${n}`);
    release({ data: null, error: { code: "42703", message: "column" } });

    await expect(creating).rejects.toMatchObject({
      name: "AccountChangedError",
    });
    expect(sdk.ops()).toEqual(["conversations.insert"]);
  });

  it.each([
    ["list", () => companion.getConversations(owner())],
    ["thread", () => companion.getMessages("c-a", owner())],
    ["delete", () => companion.deleteConversation("c-a", owner())],
  ])(
    "a %s request whose user read ends after B signed in is not made as B",
    async (_n, run) => {
      sdk.defaults["conversations.select"] = () => ({ data: [], error: null });
      const answer = holdUserRead();
      const pending = (run as () => Promise<unknown>)();

      signIn(`svc-b-${n}`);
      answer(`svc-b-${n}`);

      await expect(pending).rejects.toMatchObject({
        name: "AccountChangedError",
      });
      expect(sdk.ops()).toEqual([]);
    },
  );

  it("a reply request is not sent once another account signed in", async () => {
    const a = owner();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answer: "A answer" }),
    }));
    vi.stubGlobal("fetch", fetch);
    signIn(`svc-b-${n}`);

    await expect(
      companion.generateReply({
        conversationIdentifier: "c-a",
        prompt: "Private A prompt",
        history: [],
        owner: a,
      }),
    ).rejects.toMatchObject({ name: "AccountChangedError" });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("positive control: a token refresh of A keeps every save request", async () => {
    const a = owner();
    const release = sdk.hold("conversations.select");
    const saving = companion.saveMessage({
      conversationIdentifier: "c-a",
      role: "user",
      content: "A message",
      owner: a,
    });
    await waitFor(() => expect(sdk.ops()).toEqual(["conversations.select"]));

    signIn(current); // TOKEN_REFRESHED names the same account
    release();

    await expect(saving).resolves.toMatchObject({ content: "x" });
    expect(sdk.ops()).toEqual(["conversations.select", "messages.insert"]);
  });
});

describe("web hooks keep one owner for every request and cache write", () => {
  function wrapper(client: ReturnType<typeof newQueryClient>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    };
  }

  it("a send whose account changes while its cache is prepared saves nothing as B", async () => {
    const client = newQueryClient();
    const a = owner();
    // A's thread is being read when the send starts; the send cancels that
    // read, and B signs in exactly then.
    const key = ["conversation-messages", a.accountId, "c-a"];
    void client.prefetchQuery({
      queryKey: key,
      queryFn: () => new Promise(() => {}),
    });
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(key) &&
        event.query.state.fetchStatus === "idle"
      )
        signIn(`hook-b-${n}`);
    });
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          conversationIdentifier: "c-a",
          text: "Private A held send",
          inputSource: "typed",
          isNewConversation: false,
          owner: a,
        })
        .catch(() => {});
    });
    unsubscribe();

    expect(current).toBe(`hook-b-${n}`);
    expect(sdk.calls.filter((c) => c.as === `hook-b-${n}`)).toEqual([]);
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("a delete that fails after B signed in does not restore A's list", async () => {
    const client = newQueryClient();
    const a = owner();
    const listA = conversationsKey(a.accountId);
    client.setQueryData<Conversation[]>(listA, [
      { id: "c-a", title: "Private A title", updatedAt: at },
    ]);
    const release = sdk.hold("conversations.delete");
    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: wrapper(client),
    });
    let deleting!: Promise<unknown>;
    act(() => {
      deleting = result.current
        .mutateAsync({ conversationIdentifier: "c-a", owner: a })
        .catch(() => {});
    });
    await waitFor(() => expect(sdk.ops()).toEqual(["conversations.delete"]));

    signIn(`del-b-${n}`);
    client.removeQueries({ queryKey: listA });
    await act(async () => {
      release({ data: null, error: { message: "refused" } });
      await deleting;
    });

    expect(client.getQueryData(listA)).toBeUndefined();
  });
});

describe("web task action requests belong to the account of their store", () => {
  /** The apply request waits; dropping it is a network error (unknown outcome). */
  function actionServer() {
    let drop: () => void = () => {};
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { action: string };
      if (body.action === "apply")
        return new Promise<never>((_r, reject) => {
          drop = () => reject(new TypeError("offline"));
        });
      return { status: 200, json: async () => ({ status: "pending" }) };
    });
    return {
      fetch,
      drop: () => drop(),
      actions: () =>
        fetch.mock.calls.map(
          (c) => (JSON.parse(c[1].body) as { action: string }).action,
        ),
    };
  }
  const op = {
    type: "task.set_state",
    task_ref: "sanity:sin",
    state: "waiting",
    waiting_reason: "Private A reason",
    expected_revision: 1,
  } as const;

  it("an unknown outcome after B signed in is not looked up as B", async () => {
    const server = actionServer();
    vi.stubGlobal("fetch", server.fetch);
    const client = newQueryClient();
    const { result } = renderHook(() => useTaskActionStore("companion"), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const store = result.current!;
    let saving!: Promise<unknown>;
    act(() => {
      saving = store.setState(op);
    });
    await waitFor(() => expect(server.actions()).toEqual(["apply"]));

    signIn(`task-b-${n}`);
    clearTaskActionStores(`task-b-${n}`);
    await act(async () => {
      server.drop();
      await saving;
    });

    expect(server.actions()).toEqual(["apply"]);
    vi.unstubAllGlobals();
  });

  it("positive control: a token refresh of A keeps the lookup", async () => {
    const server = actionServer();
    vi.stubGlobal("fetch", server.fetch);
    const client = newQueryClient();
    const { result } = renderHook(() => useTaskActionStore("companion"), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const store = result.current!;
    let saving!: Promise<unknown>;
    act(() => {
      saving = store.setState(op);
    });
    await waitFor(() => expect(server.actions()).toEqual(["apply"]));

    signIn(current);
    await act(async () => {
      server.drop();
      await saving;
    });

    expect(server.actions()).toEqual(["apply", "status"]);
    vi.unstubAllGlobals();
  });
});

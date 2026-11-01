// @vitest-environment jsdom
//
// Account ownership of the in-lesson AI chat on web (mobile-app#361, Spec r4).
// The actual HelpDrawer, its HelpChooser and InLessonChat and the actual
// useCompanion hooks run with the actual query cache and session helper. Only the
// Supabase-backed services, auth and discussion stats are scripted; nothing
// leaves the process. This proves what the mounted chat shows and which service
// calls it starts; it is not evidence of SDK event order, RLS or a hosted project.
import { useSyncExternalStore } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Providers,
  newQueryClient,
} from "@/components/companion/tasks/taskActionsTestHarness";
import type { Conversation, LessonContext } from "@/types";

// ---------------------------------------------------------------- stand-ins
const auth = {
  id: "lesson-a" as string | null,
  // A token refresh gives a new user object for the same account.
  user: { id: "lesson-a" } as { id: string } | null,
  listeners: new Set<() => void>(),
  set(id: string | null) {
    this.id = id;
    this.user = id ? { id } : null;
    for (const l of this.listeners) l();
  },
  refresh() {
    this.user = this.id ? { id: this.id } : null;
    for (const l of this.listeners) l();
  },
};
vi.mock("@/hooks/useAuthUser", () => ({
  AUTH_USER_KEY: ["auth-user"],
  useAuthUser: () => {
    const user = useSyncExternalStore(
      (l) => {
        auth.listeners.add(l);
        return () => auth.listeners.delete(l);
      },
      () => auth.user,
    );
    return { data: user, isPending: false };
  },
}));
vi.mock("@/hooks/useDiscussions", () => ({
  useModuleDiscussionStats: () => ({ data: { discussionCount: 0 } }),
}));
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => false,
  posthog: { capture: () => {} },
}));
// Each call records the account signed in when the service was called.
const calls: { op: string; as: string | null; text?: string }[] = [];
const svc = {
  getMessages: vi.fn(),
  createConversation: vi.fn(),
  saveMessage: vi.fn(),
  generateReply: vi.fn(),
};
vi.mock("@/services/companion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/companion")>()),
  getConversations: async () => [],
  getMessages: (...a: unknown[]) => svc.getMessages(...a),
  createConversation: (firstMessage: string, ...rest: unknown[]) => {
    calls.push({ op: "create", as: auth.id, text: firstMessage });
    return svc.createConversation(firstMessage, ...rest);
  },
  saveMessage: (input: { conversationIdentifier: string; content: string }) => {
    calls.push({
      op: `save:${input.conversationIdentifier}`,
      as: auth.id,
      text: input.content,
    });
    return svc.saveMessage(input);
  },
  generateReply: (input: { prompt: string }) => {
    calls.push({ op: "reply", as: auth.id, text: input.prompt });
    return svc.generateReply(input);
  },
  getChatbotUsage: async () => ({ messageCount: 0, isPremium: false }),
}));

import { HelpDrawer } from "@/components/learn/help/HelpDrawer";

// ---------------------------------------------------------------- helpers
const lesson: LessonContext = {
  moduleId: "m1",
  submoduleId: "s1",
  lessonId: "l1",
  pageId: null,
  moduleTitle: "Module",
  submoduleTitle: "Section",
  lessonTitle: "Lesson",
};
const at = "2026-10-25T17:30:00Z";
const conversation = (id: string): Conversation => ({
  id,
  title: id,
  updatedAt: at,
});
let client: ReturnType<typeof newQueryClient>;
async function openLessonChat() {
  client = newQueryClient();
  render(
    <Providers queryClient={client}>
      <HelpDrawer open lessonContext={lesson} onClose={() => {}} />
    </Providers>,
  );
  fireEvent.click(screen.getByRole("button", { name: /AI Companion/ }));
  await screen.findByLabelText("Message Companion");
}
const composer = () =>
  screen.getByLabelText("Message Companion") as HTMLTextAreaElement;
function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}
function send(text: string) {
  type(text);
  fireEvent.keyDown(composer(), { key: "Enter" });
}
async function signIn(id: string | null) {
  await act(async () => auth.set(id));
}
const held = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
};
const callsCarrying = (text: string) =>
  calls.filter((c) => c.text === text).map(({ op, as }) => ({ op, as }));
const keysOf = (accountId: string) =>
  client
    .getQueryCache()
    .getAll()
    .filter((q) => JSON.stringify(q.queryKey).includes(accountId))
    .map((q) => q.queryKey);

beforeEach(() => {
  // jsdom has no scrolling; the chat scrolls to the newest message.
  Element.prototype.scrollIntoView = () => {};
  auth.id = "lesson-a";
  auth.user = { id: "lesson-a" };
  calls.splice(0);
  for (const f of Object.values(svc)) f.mockReset();
  svc.getMessages.mockResolvedValue([]);
  svc.createConversation.mockImplementation(async () =>
    conversation(`c-${auth.id}`),
  );
  svc.saveMessage.mockResolvedValue({});
  svc.generateReply.mockResolvedValue({ answer: "ok", sources: [] });
});
afterEach(() => cleanup());

describe("the mounted in-lesson chat belongs to the signed-in account", () => {
  it("another account gets an empty lesson composer, not A's unsent text", async () => {
    await openLessonChat();
    type("Private A lesson draft");

    await signIn("lesson-b");

    expect(composer().value).toBe("");
  });

  it("sign-out and signing in again as A do not bring the draft back", async () => {
    await openLessonChat();
    type("Private A before sign-out");

    await signIn(null);
    await signIn("lesson-a");

    expect(screen.queryByDisplayValue("Private A before sign-out")).toBeNull();
  });

  it("positive control: a token refresh of A keeps the lesson draft", async () => {
    await openLessonChat();
    type("A draft through refresh");

    await act(async () => auth.refresh());

    expect(composer().value).toBe("A draft through refresh");
  });

  it("B can send while A's creation is held; A's late reply adds nothing", async () => {
    const created = held<Conversation>();
    svc.createConversation.mockImplementationOnce(() => created.promise);
    await openLessonChat();
    send("Private A held lesson question");
    await waitFor(() =>
      expect(svc.createConversation).toHaveBeenCalledTimes(1),
    );

    await signIn("lesson-b");
    send("Normal B lesson question");
    await waitFor(() =>
      expect(callsCarrying("Normal B lesson question")).toEqual([
        { op: "create", as: "lesson-b" },
        { op: "save:c-lesson-b", as: "lesson-b" },
        { op: "reply", as: "lesson-b" },
      ]),
    );
    await act(async () => created.resolve(conversation("c-lesson-a")));

    expect(callsCarrying("Private A held lesson question")).toEqual([
      { op: "create", as: "lesson-a" },
    ]);
    expect(composer().value).toBe("");
    expect(keysOf("lesson-a")).toEqual([]);
  });

  it("B's first question starts B's own conversation, not A's open one", async () => {
    await openLessonChat();
    send("A lesson question");
    await waitFor(() =>
      expect(callsCarrying("A lesson question")).toContainEqual({
        op: "reply",
        as: "lesson-a",
      }),
    );

    await signIn("lesson-b");
    send("B lesson question");

    await waitFor(() =>
      expect(callsCarrying("B lesson question")).toEqual([
        { op: "create", as: "lesson-b" },
        { op: "save:c-lesson-b", as: "lesson-b" },
        { op: "reply", as: "lesson-b" },
      ]),
    );
    expect(
      calls.filter((c) => c.op === "save:c-lesson-a" && c.as !== "lesson-a"),
    ).toEqual([]);
  });

  it("the lesson page drops A's cached thread once B signs in", async () => {
    await openLessonChat();
    send("A cached lesson question");
    await waitFor(() => expect(keysOf("lesson-a").length).toBeGreaterThan(0));

    await signIn("lesson-b");

    await waitFor(() => expect(keysOf("lesson-a")).toEqual([]));
  });
});

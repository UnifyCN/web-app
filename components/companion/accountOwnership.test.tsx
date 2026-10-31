// @vitest-environment jsdom
//
// Account ownership of Companion history and pending sends on web (#361 Spec r3).
// The actual Companion page, sidebar, chat panel and useCompanion hooks run with
// the actual query cache. Only the Supabase-backed services, auth and the task
// action endpoint are scripted; nothing leaves the process.
import { useSyncExternalStore } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Providers,
  newQueryClient,
  scriptedServer,
} from "./tasks/taskActionsTestHarness";

// ---------------------------------------------------------------- stand-ins
const auth = {
  id: "web-a" as string | null,
  // A token refresh gives a new user object for the same account.
  user: { id: "web-a" } as { id: string } | null,
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
vi.mock("@/hooks/useProfile", () => ({
  CURRENT_USER_KEY: ["current-user"],
  useCurrentUser: () => {
    const user = useSyncExternalStore(
      (l) => {
        auth.listeners.add(l);
        return () => auth.listeners.delete(l);
      },
      () => auth.user,
    );
    return { data: user ? { id: user.id, onboarding: null } : null };
  },
}));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "en" }),
}));
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => false,
  posthog: { capture: () => {} },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/companion",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/services/checklist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/checklist")>()),
  getTasks: vi.fn(async () => []),
}));
const svc = {
  getConversations: vi.fn(),
  getMessages: vi.fn(),
  createConversation: vi.fn(),
  saveMessage: vi.fn(),
  generateReply: vi.fn(),
};
vi.mock("@/services/companion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/companion")>()),
  getConversations: (...a: unknown[]) => svc.getConversations(...a),
  getMessages: (...a: unknown[]) => svc.getMessages(...a),
  createConversation: (...a: unknown[]) => svc.createConversation(...a),
  saveMessage: (...a: unknown[]) => svc.saveMessage(...a),
  generateReply: (...a: unknown[]) => svc.generateReply(...a),
  getChatbotUsage: async () => ({ messageCount: 0, isPremium: false }),
  deleteConversation: async () => {},
}));

import CompanionPage from "@/app/(main)/companion/page";

// ---------------------------------------------------------------- helpers
const realFetch = globalThis.fetch;
const at = "2026-10-25T17:30:00Z";
const conversation = (id: string, title: string) => ({ id, title, updatedAt: at });
/** Each list read answers for the account signed in when it was made. */
function titles(map: Record<string, string>) {
  svc.getConversations.mockImplementation(async () => {
    const who = auth.id;
    return who && map[who] ? [conversation(`c-${who}`, map[who])] : [];
  });
}
function mount() {
  return render(
    <Providers queryClient={newQueryClient()}>
      <CompanionPage />
    </Providers>,
  );
}
const composer = () =>
  screen.getByLabelText("Message Companion") as HTMLTextAreaElement;
function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: "Enter" });
}
const held = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  // jsdom has no scrolling; the chat panel scrolls to the newest message.
  Element.prototype.scrollIntoView = () => {};
  auth.id = "web-a";
  auth.user = { id: "web-a" };
  onlineManager.setOnline(true);
  for (const f of Object.values(svc)) f.mockReset();
  svc.getConversations.mockResolvedValue([]);
  svc.getMessages.mockResolvedValue([]);
  svc.saveMessage.mockResolvedValue({});
  svc.generateReply.mockResolvedValue({ answer: "ok", sources: [] });
  globalThis.fetch = scriptedServer().fetch as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------- tests
describe("account ownership of history and pending sends (web)", () => {
  it("the mounted sidebar shows only the signed-in account; a token refresh keeps it", async () => {
    titles({ "web-a": "Private A conversation", "web-b": "Normal B conversation" });
    mount();
    await screen.findByText("Private A conversation");
    act(() => auth.refresh());
    expect(screen.getByText("Private A conversation")).toBeTruthy();

    act(() => auth.set("web-b"));
    await screen.findByText("Normal B conversation");
    expect(screen.queryByText("Private A conversation")).toBeNull();
  });

  it("a held A list read that ends after B signed in never shows A's title", async () => {
    const a = held<unknown[]>();
    svc.getConversations.mockImplementation(async () =>
      auth.id === "web-a" ? a.promise : [conversation("c-b", "Normal B held")],
    );
    mount();
    await waitFor(() => expect(svc.getConversations).toHaveBeenCalled());
    act(() => auth.set("web-b"));
    await screen.findByText("Normal B held");
    await act(async () => a.resolve([conversation("c-a", "Private A held")]));
    expect(screen.queryByText("Private A held")).toBeNull();
  });

  it("a send whose new conversation arrives after B signed in sends nothing more and shows nothing in B", async () => {
    const created = held<unknown>();
    svc.createConversation.mockImplementation(() => created.promise);
    mount();
    await screen.findByLabelText("Message Companion");
    send("Private A pending question");
    await waitFor(() => expect(svc.createConversation).toHaveBeenCalled());

    act(() => auth.set("web-b"));
    await act(async () => created.resolve(conversation("c-private-a", "Private A title")));
    await act(async () => {});
    expect(svc.saveMessage).not.toHaveBeenCalled();
    expect(svc.generateReply).not.toHaveBeenCalled();
    expect(screen.queryByText("Private A pending question")).toBeNull();
    expect(screen.queryByText("Private A title")).toBeNull();
    expect(composer().value).toBe("");
  });

  it("a send that fails after B signed in shows B no error", async () => {
    const created = held<unknown>();
    svc.createConversation.mockImplementation(() => created.promise);
    mount();
    await screen.findByLabelText("Message Companion");
    send("Private A failing question");
    await waitFor(() => expect(svc.createConversation).toHaveBeenCalled());
    act(() => auth.set("web-b"));
    await act(async () => created.reject(new Error("refused")));
    await act(async () => {});
    expect(screen.queryByText("Couldn't send your message. Please try again.")).toBeNull();
    expect(composer().value).toBe("");
  });

  it("a reply that arrives after B signed in is not saved under B's session", async () => {
    const reply = held<unknown>();
    svc.createConversation.mockResolvedValue(conversation("c-a", "A title"));
    svc.generateReply.mockImplementation(() => reply.promise);
    mount();
    await screen.findByLabelText("Message Companion");
    send("Private A question");
    await waitFor(() => expect(svc.generateReply).toHaveBeenCalled());
    expect(svc.saveMessage).toHaveBeenCalledTimes(1);
    act(() => auth.set("web-b"));
    await act(async () => reply.resolve({ answer: "Private A answer", sources: [] }));
    await act(async () => {});
    expect(svc.saveMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Message Companion")).toBeTruthy();
    expect(screen.queryByText("Private A answer")).toBeNull();
    expect(screen.queryByText("Private A question")).toBeNull();
  });

  it("signing out and back in as the same account still stops the earlier send", async () => {
    const created = held<unknown>();
    svc.createConversation.mockImplementation(() => created.promise);
    mount();
    await screen.findByLabelText("Message Companion");
    send("Question before sign-out");
    await waitFor(() => expect(svc.createConversation).toHaveBeenCalled());
    act(() => auth.set(null));
    act(() => auth.set("web-a"));
    await act(async () => created.resolve(conversation("c-a", "A title")));
    await act(async () => {});
    expect(svc.saveMessage).not.toHaveBeenCalled();
  });

  it("a token refresh of the same account lets the send finish", async () => {
    const created = held<unknown>();
    svc.createConversation.mockImplementation(() => created.promise);
    mount();
    await screen.findByLabelText("Message Companion");
    send("Same account question");
    await waitFor(() => expect(svc.createConversation).toHaveBeenCalled());
    act(() => auth.refresh());
    await act(async () => created.resolve(conversation("c-a", "A title")));
    await waitFor(() => expect(svc.generateReply).toHaveBeenCalled());
    await waitFor(() => expect(svc.saveMessage).toHaveBeenCalledTimes(2));
  });
});

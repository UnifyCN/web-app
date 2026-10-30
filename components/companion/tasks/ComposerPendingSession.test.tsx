// @vitest-environment jsdom
// Fresh real-hook and real-editor proof with scripted Auth callbacks.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_USER_KEY } from "@/hooks/useAuthUser";
import { ownAccountWork, noteAccount } from "@/lib/accountSession";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import {
  testI18n,
  scriptedServer,
} from "@/components/companion/tasks/taskActionsTestHarness";
import en from "@/lib/i18n/locales/en/translation.json";
import {
  clearComposerDrafts,
  setComposerDraft,
} from "@/lib/companion/composerDrafts";
import { ChatPanel } from "@/components/companion/ChatPanel";
import { InLessonChat } from "@/components/learn/help/InLessonChat";
import type { ReactNode } from "react";
const scrollDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const auth = vi.hoisted(() => ({
  user: { id: "real-auth-a" },
  listeners: new Set<(event: string, session: unknown) => void>(),
  reads: 0,
  profile: null as Promise<{
    id: string;
    onboarding: null;
    isPremium: boolean;
  }> | null,
  reply: null as
    | (() => Promise<{ data: { session: { user: { id: string } } } }>)
    | null,
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    auth: {
      getSession: async () => {
        auth.reads++;
        if (auth.reply) return auth.reply();
        return { data: { session: { user: { ...auth.user } } } };
      },
      onAuthStateChange: (f: (event: string, session: unknown) => void) => {
        auth.listeners.add(f);
        return {
          data: {
            subscription: { unsubscribe: () => auth.listeners.delete(f) },
          },
        };
      },
    },
  }),
}));
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => false,
  posthog: { capture: () => {} },
}));
vi.mock("@/services/checklist", async (original) => ({
  ...(await original<typeof import("@/services/checklist")>()),
  getTasks: async () =>
    auth.user.id === "real-auth-a"
      ? [
          {
            id: "1",
            title: "Private drawer task",
            description: "",
            priority: "Do now",
            isCustom: true,
            completed: false,
            dismissedAt: null,
            completedAt: null,
          },
        ]
      : [],
}));
vi.mock("@/services/profile", async (original) => ({
  ...(await original<typeof import("@/services/profile")>()),
  getCurrentUser: async () =>
    auth.profile ?? { id: auth.user.id, onboarding: null, isPremium: false },
}));
vi.mock("@/services/companion", async (original) => ({
  ...(await original<typeof import("@/services/companion")>()),
  getConversations: async () => [],
  getMessages: async () => [],
  getChatbotUsage: async () => ({ messageCount: 0, isPremium: false }),
}));
import CompanionPage from "@/app/(main)/companion/page";
import ChecklistPage from "@/app/(main)/checklist/page";
let query: QueryClient;
beforeEach(() => {
  const server = scriptedServer({ "custom:1": { revision: 1 } });
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init: RequestInit) => {
    const response = await server.fetch(url, init);
    if (JSON.parse(String(init.body)).action === "read") {
      const body = await response.json();
      body.reminders = {
        scheduler: "ready",
        items: [
          {
            reminder_id: "r1",
            task_ref: "custom:1",
            title: "Private drawer task",
            remind_at: "2027-11-07T05:30:00Z",
            time_zone: "America/New_York",
            wall_time: "2027-11-07T01:30:00",
            revision: 1,
            status: "pending",
            due: true,
            due_at: "2027-11-07T05:30:01Z",
            cancelled_reason: null,
            history: [],
          },
        ],
      };
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    }
    return response;
  });
  clearTaskActionStores();
  clearComposerDrafts();
  auth.reads = 0;
  auth.profile = null;
  auth.reply = null;
  auth.user = { id: "real-auth-a" };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => {
  cleanup();
  query.clear();
  clearTaskActionStores();
  auth.listeners.clear();
  vi.unstubAllGlobals();
  if (scrollDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

const lesson = {
  moduleId: "m",
  submoduleId: "s",
  lessonId: "l",
  pageId: null,
  moduleTitle: "Settlement",
  submoduleTitle: "First week",
  lessonTitle: "Tasks",
};
function ui(node: ReactNode) {
  return (
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>{node}</I18nextProvider>
    </QueryClientProvider>
  );
}
function holdSession() {
  let resolve!: (value: {
    data: { session: { user: { id: string } } };
  }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ data: { session: { user: { id: string } } } }>(
    (a, b) => {
      resolve = a;
      reject = b;
    },
  );
  auth.reply = () => promise;
  return {
    resolve: (id = "real-auth-a") => {
      auth.user = { id };
      resolve({ data: { session: { user: { id } } } });
    },
    reject,
  };
}
function knownAccount() {
  noteAccount("previous-account");
  noteAccount("real-auth-a");
}
function emit(event: string, id: string | null) {
  for (const f of [...auth.listeners]) f(event, id ? { user: { id } } : null);
}
const composer = () =>
  screen.getByLabelText(en.companion.messageInputAria) as HTMLTextAreaElement;
async function settled(id = "real-auth-a") {
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(id),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
}
function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

it("keeps newly typed text when INITIAL_SESSION confirms the first account", async () => {
  expect(ownAccountWork()).toEqual({ accountId: null, epoch: 0 });
  const session = holdSession();
  render(ui(<CompanionPage />));
  type("First pending message");
  expect(composer().value).toBe("First pending message");
  await act(async () => {
    emit("INITIAL_SESSION", "real-auth-a");
    session.resolve();
  });
  await settled();
  expect(ownAccountWork()).toEqual({ accountId: "real-auth-a", epoch: 0 });
  expect(composer().value).toBe("First pending message");
});

it.each(["companion", "lesson"])(
  "keeps %s input editable but cannot send until Auth resolves",
  async (surface) => {
    knownAccount();
    const session = holdSession();
    render(
      ui(
        surface === "companion" ? (
          <CompanionPage />
        ) : (
          <InLessonChat
            conversationId={null}
            onConversationCreated={() => {}}
            lessonContext={lesson}
          />
        ),
      ),
    );
    type("Keep while pending");
    const input = composer();
    input.focus();
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("Keep while pending");
    expect(
      (
        screen.getByRole("button", {
          name: en.companion.sendMessageAria,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("Keep while pending");
    await act(async () => session.resolve());
    await settled();
    expect(composer()).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Keep while pending");
    expect(
      (
        screen.getByRole("button", {
          name: en.companion.sendMessageAria,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  },
);

it("keeps new text when a pending session read fails and later recovers", async () => {
  knownAccount();
  const session = holdSession();
  render(ui(<CompanionPage />));
  type("Keep after a session error");
  const input = composer();
  input.focus();
  const owner = ownAccountWork();
  await act(async () => session.reject(new Error("session unavailable")));
  await waitFor(() =>
    expect(query.getQueryState(AUTH_USER_KEY)?.status).toBe("error"),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  expect(query.getQueryData(["tasks", "en", null])).toBeUndefined();
  expect(ownAccountWork()).toEqual(owner);
  expect(composer()).toBe(input);
  expect(input.value).toBe("Keep after a session error");
  expect(document.activeElement).toBe(input);
  auth.reply = null;
  await act(async () => {
    await query.refetchQueries({ queryKey: AUTH_USER_KEY });
  });
  await settled();
  expect(input.value).toBe("Keep after a session error");
  expect(ownAccountWork()).toEqual(owner);
});

it("keeps a pending draft through Checklist navigation and the same-account reply", async () => {
  knownAccount();
  const session = holdSession();
  const view = render(ui(<CompanionPage />));
  type("Pending navigation message");
  expect(composer().value).toBe("Pending navigation message");
  view.rerender(ui(<ChecklistPage />));
  expect(screen.queryByLabelText(en.companion.messageInputAria)).toBeNull();
  view.rerender(ui(<CompanionPage />));
  expect(composer().value).toBe("Pending navigation message");
  await act(async () => session.resolve());
  await settled();
  expect(composer().value).toBe("Pending navigation message");
});

it.each(["replacement reply", "sign-out/sign-in", "A/B/A", "token refresh"])(
  "applies the account policy to pending text on %s",
  async (mode) => {
    knownAccount();
    const session = holdSession();
    render(ui(<CompanionPage />));
    type("Private pending text");
    const input = composer();
    input.focus();
    const before = ownAccountWork();
    await act(async () => {
      if (mode === "replacement reply") {
        vi.stubGlobal("fetch", scriptedServer({}).fetch);
        session.resolve("real-auth-b");
      } else {
        if (mode === "sign-out/sign-in") {
          emit("SIGNED_OUT", null);
          emit("SIGNED_IN", "real-auth-a");
        } else if (mode === "A/B/A") {
          emit("SIGNED_IN", "real-auth-b");
          emit("SIGNED_IN", "real-auth-a");
        } else emit("TOKEN_REFRESHED", "real-auth-a");
        session.resolve();
      }
    });
    await settled(mode === "replacement reply" ? "real-auth-b" : "real-auth-a");
    if (mode === "token refresh") {
      expect(ownAccountWork()).toEqual(before);
      expect(composer()).toBe(input);
      expect(input.value).toBe("Private pending text");
      expect(document.activeElement).toBe(input);
    } else {
      expect(ownAccountWork().epoch).toBe(
        before.epoch + (mode === "replacement reply" ? 1 : 2),
      );
      expect(composer().value).toBe("");
    }
  },
);

it("hides an earlier account draft while pending and keeps an explicit clear after resolution", async () => {
  knownAccount();
  setComposerDraft(
    "real-auth-a",
    "Earlier stored private text",
    ownAccountWork().epoch,
  );
  const session = holdSession();
  const view = render(ui(<CompanionPage />));
  expect(composer().value).toBe("");
  type("New pending text");
  expect(composer().value).toBe("New pending text");
  await act(async () => session.resolve());
  await settled();
  expect(composer().value).toBe("New pending text");
  type("");
  view.rerender(ui(<ChecklistPage />));
  view.rerender(ui(<CompanionPage />));
  expect(composer().value).toBe("");
});

it("ignores pending starter sends and sends once after the account is known", async () => {
  knownAccount();
  const session = holdSession();
  const onSend = vi.fn();
  render(
    ui(
      <ChatPanel
        conversation={null}
        messages={[]}
        isTyping={false}
        freeTierRemaining={6}
        onSend={onSend}
        onboarding={null}
        mobileActive
        onOpenList={() => {}}
      />,
    ),
  );
  type("Pending starter control");
  const starter = screen.getByRole("button", {
    name: (name) => name.includes(en.companion.webStarters.settlementQ),
  }) as HTMLButtonElement;
  expect(starter.disabled).toBe(true);
  fireEvent.click(starter);
  expect(onSend).not.toHaveBeenCalled();
  expect(composer().value).toBe("Pending starter control");
  await act(async () => session.resolve());
  await settled();
  fireEvent.click(
    screen.getByRole("button", { name: en.companion.sendMessageAria }),
  );
  expect(onSend).toHaveBeenCalledExactlyOnceWith(
    "Pending starter control",
    "typed",
  );
  expect(composer().value).toBe("");
});

it("does not clear a pending lesson draft when its starter control is pressed", async () => {
  knownAccount();
  const session = holdSession();
  render(
    ui(
      <InLessonChat
        conversationId={null}
        onConversationCreated={() => {}}
        lessonContext={lesson}
      />,
    ),
  );
  type("Pending lesson starter control");
  try {
    const starter = screen.getByRole("button", {
      name: en.learnWeb.help.chat.starterExplain.replace(
        "{{lessonTitle}}",
        "Tasks",
      ),
    }) as HTMLButtonElement;
    expect(starter.disabled).toBe(true);
    fireEvent.click(starter);
    expect(composer().value).toBe("Pending lesson starter control");
  } finally {
    await act(async () => session.resolve());
  }
});

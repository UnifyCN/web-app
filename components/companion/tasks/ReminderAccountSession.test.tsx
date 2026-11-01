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
import { AUTH_USER_KEY, useAuthUser } from "@/hooks/useAuthUser";
import { ownAccountWork, noteAccount } from "@/lib/accountSession";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { TaskActionsDrawer } from "@/components/companion/tasks/TaskActionsDrawer";
import {
  testI18n,
  scriptedServer,
} from "@/components/companion/tasks/taskActionsTestHarness";
import en from "@/lib/i18n/locales/en/translation.json";
import { ChatPanel } from "@/components/companion/ChatPanel";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import { useAccountGeneration } from "@/hooks/useAccountId";
import {
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
  CONVERSATION_ACTIONS_ROOT,
  PLANS_ROOT,
  PLAN_PROPOSAL_ROOT,
  CONVERSATION_PLANS_ROOT,
  STEP_PROPOSAL_ROOT,
  DETAIL_PROPOSAL_ROOT,
} from "@/lib/companionActions/queryKeys";
import {
  CONVERSATIONS_ROOT,
  MESSAGES_ROOT,
} from "@/lib/companion/conversationKeys";
const scrollDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const auth = vi.hoisted(() => ({
  user: { id: "real-auth-a" },
  listeners: new Set<(event: string, session: unknown) => void>(),
  reads: 0,
  reply: null as
    (() => Promise<{ data: { session: { user: { id: string } } } }>) | null,
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
vi.mock("@/hooks/useChecklist", () => ({
  TASKS_KEY: ["tasks"],
  useTasks: () => ({
    data: [
      {
        id: "1",
        title: "Private drawer task",
        isCustom: true,
        completed: false,
        dismissedAt: null,
      },
    ],
    isLoading: false,
  }),
}));
let query: QueryClient;
function Caller() {
  return <TaskActionsDrawer open onClose={() => {}} surface="companion" />;
}
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
  auth.reply = null;
  auth.user = { id: "real-auth-a" };
  noteAccount(auth.user.id);
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
async function mount() {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <Caller />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: en.reminders.openTask }),
  );
  await screen.findByLabelText(en.reminders.instant);
  await waitFor(() => expect(query.isFetching()).toBe(0));
  fireEvent.change(screen.getByLabelText(en.reminders.instant), {
    target: { value: "2027-11-07T01:30-04:00" },
  });
  expect(
    (screen.getByLabelText(en.reminders.instant) as HTMLInputElement).value,
  ).toBe("2027-11-07T01:30-04:00");
}
function emit(event: string, id: string | null) {
  for (const f of [...auth.listeners])
    f(event, id ? { user: { id }, access_token: `jwt-${id}` } : null);
}
it.each(["sign-out/sign-in", "A/B/A"])(
  "actual drawer with real Auth subscription clears the visible private reminder after batched %s",
  async (transition) => {
    await mount();
    const before = ownAccountWork().epoch;
    const reads = auth.reads;
    await act(async () => {
      emit(
        transition === "A/B/A" ? "SIGNED_IN" : "SIGNED_OUT",
        transition === "A/B/A" ? "real-auth-b" : null,
      );
      emit("SIGNED_IN", auth.user.id);
      await query.refetchQueries({ queryKey: AUTH_USER_KEY });
    });
    await waitFor(() => expect(query.isFetching()).toBe(0));
    expect(auth.reads).toBeGreaterThan(reads);
    expect(ownAccountWork().epoch).toBe(before + 2);
    // Binding assertion: current UI clears when Auth processing finishes.
    await waitFor(
      () =>
        expect(
          (
            screen.queryByLabelText(
              en.reminders.instant,
            ) as HTMLInputElement | null
          )?.value ?? "",
        ).toBe(""),
      { timeout: 1000 },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: en.reminders.openTask }),
    );
    expect(
      ((await screen.findByLabelText(en.reminders.instant)) as HTMLInputElement)
        .value,
    ).toBe("");
  },
);
it("actual drawer retains its draft on same-account token refresh", async () => {
  await mount();
  const before = ownAccountWork().epoch;
  await act(async () => {
    emit("TOKEN_REFRESHED", auth.user.id);
    await query.refetchQueries({ queryKey: AUTH_USER_KEY });
  });
  expect(ownAccountWork().epoch).toBe(before);
  expect(
    (screen.getByLabelText(en.reminders.instant) as HTMLInputElement).value,
  ).toBe("2027-11-07T01:30-04:00");
});

it.each(["sign-out/sign-in", "A/B/A"])(
  "the real composer clears cached text after batched %s",
  async (transition) => {
    render(
      <QueryClientProvider client={query}>
        <I18nextProvider i18n={testI18n()}>
          <ChatPanel
            conversation={null}
            messages={[]}
            isTyping={false}
            freeTierRemaining={6}
            onSend={() => {}}
            onboarding={null}
            mobileActive
            onOpenList={() => {}}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(query.isFetching()).toBe(0));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Private composer text before reset" },
    });
    await act(async () => {
      emit(
        transition === "A/B/A" ? "SIGNED_IN" : "SIGNED_OUT",
        transition === "A/B/A" ? "real-auth-b" : null,
      );
      emit("SIGNED_IN", auth.user.id);
      await query.refetchQueries({ queryKey: AUTH_USER_KEY });
    });
    await waitFor(() =>
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "",
      ),
    );
  },
);
it("the real composer keeps cached text through token refresh", async () => {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <ChatPanel
          conversation={null}
          messages={[]}
          isTyping={false}
          freeTierRemaining={6}
          onSend={() => {}}
          onboarding={null}
          mobileActive
          onOpenList={() => {}}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Composer refresh control" },
  });
  await act(async () => {
    emit("TOKEN_REFRESHED", auth.user.id);
    await query.refetchQueries({ queryKey: AUTH_USER_KEY });
  });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Composer refresh control",
  );
});

function GenerationProbe() {
  return (
    <output data-testid="account-generation">{useAccountGeneration()}</output>
  );
}
function AccountComposer() {
  const { data: user } = useAuthUser();
  return (
    <section
      data-testid="composer-account"
      data-account={user?.id ?? "unknown"}
    >
      <ChatPanel
        conversation={null}
        messages={[]}
        isTyping={false}
        freeTierRemaining={6}
        onSend={() => {}}
        onboarding={null}
        mobileActive
        onOpenList={() => {}}
      />
    </section>
  );
}
async function mountGeneration() {
  render(
    <QueryClientProvider client={query}>
      <GenerationProbe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
}
it("account-owned UI observes both transitions even when the final Auth data is equal", async () => {
  await mountGeneration();
  const before = ownAccountWork().epoch;
  await act(async () => {
    emit("SIGNED_OUT", null);
    emit("SIGNED_IN", auth.user.id);
    await query.refetchQueries({ queryKey: AUTH_USER_KEY });
  });
  expect(Number(screen.getByTestId("account-generation").textContent)).toBe(
    before + 2,
  );
});
it("a late pre-event stored session cannot replace the current account or its new composer text", async () => {
  let oldReply: (value: {
    data: { session: { user: { id: string } } };
  }) => void = () => {};
  auth.reply = () =>
    new Promise((resolve) => {
      oldReply = resolve;
    });
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <AccountComposer />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(auth.reads).toBe(1));
  auth.reply = null;
  auth.user = { id: "real-auth-b" };
  await act(async () => {
    emit("SIGNED_IN", auth.user.id);
  });
  expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
    "real-auth-b",
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("composer-account").getAttribute("data-account"),
    ).toBe("real-auth-b"),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Current B composer text" },
  });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Current B composer text",
  );
  await act(async () => {
    oldReply({ data: { session: { user: { id: "real-auth-a" } } } });
  });
  expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
    "real-auth-b",
  );
  expect(ownAccountWork().accountId).toBe("real-auth-b");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "Current B composer text",
  );
});
it.each(["reset", "token refresh"])(
  "the actual Auth callback applies private-cache policy on %s",
  async (transition) => {
    await mountGeneration();
    const a = auth.user.id;
    const keys = [
      ["tasks", "en", a],
      [TASK_PROGRESS_ROOT, a],
      [CONVERSATIONS_ROOT, a],
      [MESSAGES_ROOT, a],
      [TASK_PROPOSAL_ROOT, a, "p"],
      [CONVERSATION_ACTIONS_ROOT, a, "c"],
      [PLANS_ROOT, a],
      [PLAN_PROPOSAL_ROOT, a, "p"],
      [CONVERSATION_PLANS_ROOT, a, "c"],
      [STEP_PROPOSAL_ROOT, a, "p"],
      [DETAIL_PROPOSAL_ROOT, a, "p"],
    ];
    for (const key of keys) query.setQueryData(key, "Private cached record");
    query.setQueryData(["public-content"], "Public content kept");
    await act(async () => {
      if (transition === "reset") {
        emit("SIGNED_OUT", null);
        emit("SIGNED_IN", a);
      } else emit("TOKEN_REFRESHED", a);
      await query.refetchQueries({ queryKey: AUTH_USER_KEY });
    });
    for (const key of keys)
      expect(query.getQueryData(key)).toBe(
        transition === "reset" ? undefined : "Private cached record",
      );
    expect(query.getQueryData(["public-content"])).toBe("Public content kept");
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(a);
  },
);

it("publishes the new event owner while the replacement session read is held", async () => {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <AccountComposer />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("composer-account").getAttribute("data-account"),
    ).toBe("real-auth-a"),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Private A composer" },
  });
  const releases: ((value: {
    data: { session: { user: { id: string } } };
  }) => void)[] = [];
  auth.reply = () =>
    new Promise((resolve) => {
      releases.push(resolve);
    });
  auth.user = { id: "real-auth-b" };
  await act(async () => {
    emit("SIGNED_IN", auth.user.id);
  });
  expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
    "real-auth-b",
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("composer-account").getAttribute("data-account"),
    ).toBe("real-auth-b"),
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  expect(ownAccountWork().accountId).toBe("real-auth-b");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "B text before the read finishes" },
  });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "B text before the read finishes",
  );
  await act(async () => {
    for (const release of releases)
      release({ data: { session: { user: { id: "real-auth-b" } } } });
  });
  await waitFor(() => expect(query.isFetching()).toBe(0));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "B text before the read finishes",
  );
});

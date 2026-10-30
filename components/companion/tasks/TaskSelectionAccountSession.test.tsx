// @vitest-environment jsdom
// Fresh real-hook and real-editor proof with scripted Auth callbacks.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAccountGeneration } from "@/hooks/useAccountId";
import { useCurrentUser } from "@/hooks/useProfile";
import { AUTH_USER_KEY } from "@/hooks/useAuthUser";
import { ownAccountWork, noteAccount } from "@/lib/accountSession";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { TaskActionsDrawer } from "@/components/companion/tasks/TaskActionsDrawer";
import {
  testI18n,
  scriptedServer,
} from "@/components/companion/tasks/taskActionsTestHarness";
import en from "@/lib/i18n/locales/en/translation.json";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import { TASK_PROGRESS_ROOT } from "@/lib/companionActions/queryKeys";
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
  auth.profile = null;
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
it.each(["account change", "token refresh"])(
  "the actual page applies selected task ownership on %s",
  async (transition) => {
    render(
      <QueryClientProvider client={query}>
        <I18nextProvider i18n={testI18n()}>
          <CompanionPage />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
        "real-auth-a",
      ),
    );
    await waitFor(() => expect(query.isFetching()).toBe(0));
    fireEvent.click(
      await screen.findByRole("button", { name: en.taskActions.open }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Private drawer task/ }),
    );
    await screen.findByRole("heading", { name: "Private drawer task" });
    fireEvent.change(await screen.findByLabelText(en.reminders.instant), {
      target: { value: "2027-11-07T01:30-04:00" },
    });
    const before = ownAccountWork().epoch;
    if (transition === "account change") {
      auth.user = { id: "real-auth-b" };
      const bServer = scriptedServer({});
      vi.stubGlobal("fetch", bServer.fetch);
    }
    await act(async () => {
      for (const f of [...auth.listeners])
        f(transition === "account change" ? "SIGNED_IN" : "TOKEN_REFRESHED", {
          user: { id: auth.user.id },
        });
      await query.refetchQueries({ queryKey: AUTH_USER_KEY });
    });
    await waitFor(() => expect(query.isFetching()).toBe(0));
    expect(ownAccountWork().accountId).toBe(auth.user.id);
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      auth.user.id,
    );
    if (transition === "account change") {
      expect(ownAccountWork().epoch).toBe(before + 1);
      expect(query.getQueryData(["tasks", "en", "real-auth-b"])).toEqual([]);
      expect(
        query.getQueryData<{ tasks: unknown[] }>([
          TASK_PROGRESS_ROOT,
          "real-auth-b",
        ])?.tasks,
      ).toEqual([]);
      expect(
        query.getQueryData(["tasks", "en", "real-auth-a"]),
      ).toBeUndefined();
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", { name: "Private drawer task" }),
        ).toBeNull(),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    } else {
      expect(ownAccountWork().epoch).toBe(before);
      expect(
        screen.getByRole("heading", { name: "Private drawer task" }),
      ).toBeTruthy();
      expect(
        (screen.getByLabelText(en.reminders.instant) as HTMLInputElement).value,
      ).toBe("2027-11-07T01:30-04:00");
    }
  },
);

it.each(["replacement", "sign-out/sign-in", "A/B/A"])(
  "clears a task selected inside the drawer on %s without a page owner",
  async (transition) => {
    render(
      <QueryClientProvider client={query}>
        <I18nextProvider i18n={testI18n()}>
          <Caller />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Private drawer task/ }),
    );
    await screen.findByRole("heading", { name: "Private drawer task" });
    auth.user = { id: "real-auth-b" };
    vi.stubGlobal("fetch", scriptedServer({}).fetch);
    await act(async () => {
      if (transition === "sign-out/sign-in") {
        for (const f of [...auth.listeners]) f("SIGNED_OUT", null);
        auth.user = { id: "real-auth-a" };
      } else if (transition === "A/B/A") {
        for (const f of [...auth.listeners])
          f("SIGNED_IN", { user: { id: "real-auth-b" } });
        auth.user = { id: "real-auth-a" };
      }
      for (const f of [...auth.listeners])
        f("SIGNED_IN", { user: { id: auth.user.id } });
    });
    await waitFor(() =>
      expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
        auth.user.id,
      ),
    );
    await waitFor(() => expect(query.isFetching()).toBe(0));
    if (transition === "replacement")
      expect(query.getQueryData(["tasks", "en", "real-auth-b"])).toEqual([]);
    if (transition === "replacement")
      expect(
        query.getQueryData<{ tasks: unknown[] }>([
          TASK_PROGRESS_ROOT,
          "real-auth-b",
        ])?.tasks,
      ).toEqual([]);
    expect(
      screen.queryByRole("heading", { name: "Private drawer task" }),
    ).toBeNull();
  },
);

it("closes the Checklist task view when its account changes", async () => {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <ChecklistPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: en.taskActions.progressAria.replace(
        "{{title}}",
        "Private drawer task",
      ),
    }),
  );
  await screen.findByRole("heading", { name: "Private drawer task" });
  auth.user = { id: "real-auth-b" };
  vi.stubGlobal("fetch", scriptedServer({}).fetch);
  await act(async () => {
    for (const f of [...auth.listeners])
      f("SIGNED_IN", { user: { id: auth.user.id } });
  });
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      "real-auth-b",
    ),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("removes the old profile while the replacement account profile is pending", async () => {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(["current-user"])?.id).toBe(
      "real-auth-a",
    ),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  let resolveProfile!: (value: {
    id: string;
    onboarding: null;
    isPremium: boolean;
  }) => void;
  auth.profile = new Promise((resolve) => {
    resolveProfile = resolve;
  });
  auth.user = { id: "real-auth-b" };
  vi.stubGlobal("fetch", scriptedServer({}).fetch);
  await act(async () => {
    for (const f of [...auth.listeners])
      f("SIGNED_IN", { user: { id: auth.user.id } });
  });
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      "real-auth-b",
    ),
  );
  expect(query.getQueryData(["current-user"])).toBeUndefined();
  await act(async () =>
    resolveProfile({ id: "real-auth-b", onboarding: null, isPremium: false }),
  );
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(["current-user"])?.id).toBe(
      "real-auth-b",
    ),
  );
});

it("keeps the initial page input and focus when the first session read finishes", async () => {
  noteAccount("older-account");
  noteAccount("real-auth-a");
  let resolveSession!: (value: {
    data: { session: { user: { id: string } } };
  }) => void;
  const sessionReply = new Promise<{
    data: { session: { user: { id: string } } };
  }>((resolve) => {
    resolveSession = resolve;
  });
  auth.reply = () => sessionReply;
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  const input = screen.getByRole("textbox");
  input.focus();
  expect(document.activeElement).toBe(input);
  await act(async () =>
    resolveSession({ data: { session: { user: { id: "real-auth-a" } } } }),
  );
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      "real-auth-a",
    ),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  expect(screen.getByRole("textbox")).toBe(input);
  expect(document.activeElement).toBe(input);
});

it("does not display an earlier profile returned after account replacement", async () => {
  render(
    <QueryClientProvider client={query}>
      <I18nextProvider i18n={testI18n()}>
        <div data-testid="companion-page">
          <CompanionPage />
        </div>
        <ProfileReadback />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      "real-auth-a",
    ),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  auth.user = { id: "real-auth-b" };
  vi.stubGlobal("fetch", scriptedServer({}).fetch);
  await act(async () => {
    for (const f of [...auth.listeners])
      f("SIGNED_IN", { user: { id: auth.user.id } });
  });
  await waitFor(() =>
    expect(query.getQueryData<{ id: string }>(AUTH_USER_KEY)?.id).toBe(
      "real-auth-b",
    ),
  );
  await waitFor(() => expect(query.isFetching()).toBe(0));
  await act(async () => {
    query.setQueryData(["current-user"], {
      id: "real-auth-a",
      onboarding: {
        firstName: "Earlier private name",
        goals: [],
        learningInterests: [],
      },
    });
  });
  await waitFor(() =>
    expect(screen.getByTestId("profile-readback").textContent).toBe(
      "Earlier private name",
    ),
  );
  expect(
    within(screen.getByTestId("companion-page")).queryByText(
      /Earlier private name/,
    ),
  ).toBeNull();
  expect(ownAccountWork().accountId).toBe("real-auth-b");
});

function ProfileReadback() {
  return <AccountProfileReadback key={useAccountGeneration()} />;
}
function AccountProfileReadback() {
  const user = useCurrentUser().data;
  return (
    <output data-testid="profile-readback">
      {user?.onboarding?.firstName}
    </output>
  );
}

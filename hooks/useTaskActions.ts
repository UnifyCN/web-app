"use client";
import type { ReminderRead } from "@/lib/companionActions/reminders";
import type { ActionProfile, ProfileProposal } from "@/lib/companionActions/profile";
import { PROFILE_PROPOSAL_ROOT } from "@/lib/companionActions/queryKeys";
import { CURRENT_USER_KEY } from "@/lib/profileQueryKeys";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountScope } from "@/hooks/useAccountScope";
import { useAccountId } from "@/hooks/useAccountId";
import {
  assertOwned,
  ownAccountWork,
  stillOwned,
  type AccountOwner,
} from "@/lib/accountSession";
import { TASKS_KEY } from "@/hooks/useChecklist";
import { LEARNING_PROGRESS_KEY, MODULES_KEY } from "@/hooks/useLearn";
import { trackCompanionActionResult } from "@/lib/analytics";
import {
  buildTaskActionResultProperties,
  type TaskActionSurface,
} from "@/lib/companionActions/analytics";
import {
  createTaskActionClient,
  type ReadResult,
  type TaskActionClient,
  type Transport,
} from "@/lib/companionActions/client";
import type {
  DetailProposal,
  SavedDetail,
  StepProposal,
  TaskProgress,
  TaskStep,
} from "@/lib/companionActions/contract";
import {
  CONVERSATION_ACTIONS_ROOT,
  CONVERSATION_PLANS_ROOT,
  DETAIL_PROPOSAL_ROOT,
  PLANS_ROOT,
  PLAN_PROPOSAL_ROOT,
  STEP_PROPOSAL_ROOT,
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
  conversationActionsKey,
  detailProposalKey,
  stepProposalKey,
  taskProgressKey,
  taskProposalKey,
} from "@/lib/companionActions/queryKeys";
import type { TaskProposal } from "@/lib/companionActions/contract";
import {
  taskActionStoreFor,
  type TaskActionPhase,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";

export { TASK_PROGRESS_ROOT, taskProgressKey };

/**
 * The proxy sends the session in the cookie, so a transport belongs to one
 * account (#361): once another account signs in, it sends nothing, and the
 * request rejects like an unanswered one, so the write stays unresolved for
 * its own account.
 */
const transportFor =
  (owner: AccountOwner): Transport =>
  async (body) => {
    assertOwned(owner);
    const res = await fetch("/api/companion/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    assertOwned(owner);
    return { status: res.status, body: parsed };
  };

/** The task action client of `owner`'s account. */
function clientFor(owner: AccountOwner): TaskActionClient {
  return createTaskActionClient({
    transport: transportFor(owner),
    platform: "web",
    appVersion: "web",
  });
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function onlineSnapshot(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// The server and first browser render use the same value. React then reads
// the browser's actual connection state.
function serverOnlineSnapshot(): boolean {
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    onlineSnapshot,
    serverOnlineSnapshot,
  );
}

export type TaskProgressStatus =
  | "loading"
  | "ready"
  | "unavailable"
  | "offline"
  | "signed_out";

export interface TaskProgressView {
  profile?: ActionProfile | null;
  status: TaskProgressStatus;
  reminders?: ReminderRead;
  /** Saved progress by task_ref. A content-backed task never written has no entry. */
  byRef: ReadonlyMap<string, TaskProgress>;
  /** #366: live steps by task_ref, in order. */
  stepsByRef: ReadonlyMap<string, readonly TaskStep[]>;
  /** #370: the account's live saved details, oldest first. */
  details: readonly SavedDetail[];
  /** True when the shown progress may be out of date (offline or the last read failed). */
  stale: boolean;
  /** Writes are allowed only with a fresh read and a connection. */
  canWrite: boolean;
  refetch: () => void;
}

class ReadFailed extends Error {}

/** Saved task progress of the signed-in account, from the shared action service. */
export function useTaskProgress(): TaskProgressView {
  // Also records the account as the owner of new work (lib/accountSession.ts).
  const accountId = useAccountId();
  const authPending = accountId === undefined;
  const userId = accountId ?? null;
  const online = useOnline();

  useAccountScope(userId, !authPending);

  const query = useQuery({
    queryKey: taskProgressKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Exclude<ReadResult, { kind: "unknown" }>> => {
      // The read is made only as the account its entry belongs to.
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await clientFor(owner).read();
      // An unreachable service keeps the last good data on screen, marked stale.
      if (result.kind === "unknown") throw new ReadFailed("unreachable");
      return result;
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    // While the last read failed, keep checking so a reconnect re-reads current progress.
    refetchInterval: (q) =>
      q.state.status === "error" ||
      (q.state.data?.kind === "ok" &&
        q.state.data.reminders?.items.some((r) => r.status === "pending"))
        ? 5_000
        : false,
  });

  const result = query.data;
  const byRef = useMemo(() => {
    const map = new Map<string, TaskProgress>();
    if (result?.kind === "ok")
      for (const t of result.tasks) map.set(t.taskRef, t);
    return map;
  }, [result]);
  const stepsByRef = useMemo(() => {
    const map = new Map<string, TaskStep[]>();
    if (result?.kind === "ok")
      for (const step of result.steps) {
        const list = map.get(step.taskRef) ?? [];
        list.push(step);
        map.set(step.taskRef, list);
      }
    return map;
  }, [result]);

  const details = useMemo(
    () => (result?.kind === "ok" ? result.details : []),
    [result],
  );

  let status: TaskProgressStatus;
  if ((!authPending && !userId) || result?.kind === "unauthorized")
    status = "signed_out";
  else if (result?.kind === "unavailable" || result?.kind === "refused")
    status = "unavailable";
  else if (result?.kind === "ok") status = "ready";
  else if (!online || query.isError) status = "offline";
  else status = "loading";

  const stale = !online || query.isError;
  const refetch = query.refetch;
  return {
    status,
    profile: result?.kind === "ok" ? result.profile : null,
    byRef,
    stepsByRef,
    details,
    reminders: result?.kind === "ok" ? result.reminders : undefined,
    stale,
    // A refetch after a save may still carry the old revision: wait for it.
    canWrite: status === "ready" && !stale && !query.isFetching,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

/** The account's action store, wired to this page's surface for analytics. */
export function useTaskActionStore(
  surface: TaskActionSurface,
): TaskActionStore | null {
  const userId = useAccountId() ?? null;
  const { epoch } = ownAccountWork();
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!userId) return null;
    return taskActionStoreFor(userId, {
      sessionEpoch: epoch,
      // Its requests are made only while this account is signed in.
      client: clientFor({ accountId: userId, epoch }),
      newOperationId: () => crypto.randomUUID(),
      onChanged: () => {
        if (!stillOwned({ accountId: userId, epoch })) return;
        // Profile changes affect Learn content in every language. An older
        // pending read must finish without replacing the new profile's result.
        for (const queryKey of [CURRENT_USER_KEY, MODULES_KEY, LEARNING_PROGRESS_KEY]) {
          void queryClient.cancelQueries({ queryKey }).then(() => {
            if (!stillOwned({ accountId: userId, epoch })) return;
            return queryClient.invalidateQueries({ queryKey });
          });
        }
        void queryClient.invalidateQueries({ queryKey: [PROFILE_PROPOSAL_ROOT, userId] });
        void queryClient.invalidateQueries({
          queryKey: taskProgressKey(userId),
        });
        void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
        // #363: drafts and command results shown in conversations.
        void queryClient.invalidateQueries({
          queryKey: [TASK_PROPOSAL_ROOT, userId],
        });
        void queryClient.invalidateQueries({
          queryKey: [CONVERSATION_ACTIONS_ROOT, userId],
        });
        // Plans join current shared progress and must refresh after a task save.
        for (const root of [
          PLANS_ROOT,
          PLAN_PROPOSAL_ROOT,
          CONVERSATION_PLANS_ROOT,
        ]) {
          void queryClient.invalidateQueries({ queryKey: [root, userId] });
        }
        // #366: suggested-step drafts.
        void queryClient.invalidateQueries({
          queryKey: [STEP_PROPOSAL_ROOT, userId],
        });
        // #370: suggested-detail drafts.
        void queryClient.invalidateQueries({
          queryKey: [DETAIL_PROPOSAL_ROOT, userId],
        });
      },
      onResult: (event) => {
        const props = buildTaskActionResultProperties(event, surface);
        if (props) trackCompanionActionResult(props);
      },
    });
  }, [userId, epoch, queryClient, surface]);
}

/**
 * The action client of the signed-in account (#363 proposal requests) and the owner
 * it is bound to: its requests are made only as that account and session, and a
 * caller checks the same owner before it uses a result.
 */
export function useTaskActionClient(): {
  client: TaskActionClient;
  owner: AccountOwner;
} | null {
  const userId = useAccountId() ?? null;
  const { epoch } = ownAccountWork();
  return useMemo(() => {
    if (!userId) return null;
    const owner = { accountId: userId, epoch };
    return { client: clientFor(owner), owner };
  }, [userId, epoch]);
}

export function useProfileProposal(proposalId: string | null) {
  const accountId = useAccountId() ?? null;
  const { epoch } = ownAccountWork();
  return useQuery({
    queryKey: [PROFILE_PROPOSAL_ROOT, accountId, epoch, proposalId],
    enabled: Boolean(accountId && proposalId),
    queryFn: async (): Promise<ProfileProposal> => {
      const owner = { accountId, epoch };
      assertOwned(owner);
      const result = await clientFor(owner).profileProposal!(proposalId!);
      assertOwned(owner);
      if (result.kind === "ok" || result.kind === "changed") return result.proposal;
      throw new ReadFailed(result.kind);
    }, staleTime: 0, retry: false,
  });
}

/** A client bound to `owner`, for work started by a send (#363). */
export const taskActionClientFor = clientFor;
/** The account-bound transport, for the plan client (#364). */
export const companionActionsTransportFor = transportFor;

/** One task draft, read from the action service. */
export function useTaskProposal(proposalId: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: taskProposalKey(userId, proposalId),
    enabled: Boolean(userId && proposalId),
    queryFn: async (): Promise<TaskProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await clientFor(owner).proposal(proposalId as string);
      if (result.kind === "ok" || result.kind === "changed")
        return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
  });
}

/** #366: one suggested-steps draft, read from the action service. */
export function useStepProposal(proposalId: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: stepProposalKey(userId, proposalId),
    enabled: Boolean(userId && proposalId),
    queryFn: async (): Promise<StepProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await clientFor(owner).stepProposal(proposalId as string);
      if (result.kind === "ok" || result.kind === "changed")
        return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
  });
}

/** #370: one suggested-detail draft, read from the action service. */
export function useDetailProposal(proposalId: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: detailProposalKey(userId, proposalId),
    enabled: Boolean(userId && proposalId),
    queryFn: async (): Promise<DetailProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await clientFor(owner).detailProposal(
        proposalId as string,
      );
      if (result.kind === "ok" || result.kind === "changed")
        return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
  });
}

/** The live steps of one task, in order (#366). */
export function stepsFor(
  taskRef: string,
  view: TaskProgressView,
): readonly TaskStep[] {
  return view.stepsByRef.get(taskRef) ?? [];
}

/** Unsaved text kept in the action store (#366), so close, reopen and updates keep it. */
export function useTaskActionDraft(
  store: TaskActionStore | null,
  key: string,
): string | undefined {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.draft(key),
    () => undefined,
  );
}

/** The drafts and command results of one conversation, for its cards. */
export function useConversationActions(conversationId: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: conversationActionsKey(userId, conversationId),
    enabled: Boolean(userId && conversationId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await clientFor(owner).conversationActions(
        conversationId as string,
      );
      if (result.kind !== "ok") throw new ReadFailed(result.kind);
      return result;
    },
    staleTime: 0,
    refetchOnReconnect: true,
  });
}

const IDLE: TaskActionPhase = { phase: "idle" };
export function useTaskActionPhase(
  store: TaskActionStore | null,
  taskRef: string | null,
): TaskActionPhase {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => (store && taskRef ? store.get(taskRef) : IDLE),
    () => IDLE,
  );
}
const noopSubscribe = () => () => {};

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountScope } from "@/hooks/useAccountScope";
import { useAuthUser } from "@/hooks/useAuthUser";
import { TASKS_KEY } from "@/hooks/useChecklist";
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
import type { TaskProgress } from "@/lib/companionActions/contract";
import {
  TASK_PROGRESS_ROOT,
  taskProgressKey,
} from "@/lib/companionActions/queryKeys";
import {
  taskActionStoreFor,
  type TaskActionPhase,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";

export { TASK_PROGRESS_ROOT, taskProgressKey };

const fetchTransport: Transport = async (body) => {
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
  return { status: res.status, body: parsed };
};

let defaultClient: TaskActionClient | null = null;
function activeClient(): TaskActionClient {
  defaultClient ??= createTaskActionClient({
    transport: fetchTransport,
    platform: "web",
    appVersion: "web",
  });
  return defaultClient;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export type TaskProgressStatus =
  "loading" | "ready" | "unavailable" | "offline" | "signed_out";

export interface TaskProgressView {
  status: TaskProgressStatus;
  /** Saved progress by task_ref. A content-backed task never written has no entry. */
  byRef: ReadonlyMap<string, TaskProgress>;
  /** True when the shown progress may be out of date (offline or the last read failed). */
  stale: boolean;
  /** Writes are allowed only with a fresh read and a connection. */
  canWrite: boolean;
  refetch: () => void;
}

class ReadFailed extends Error {}

/** Saved task progress of the signed-in account, from the shared action service. */
export function useTaskProgress(): TaskProgressView {
  const { data: user, isPending: authPending } = useAuthUser();
  const userId = user?.id ?? null;
  const online = useOnline();

  useAccountScope(userId, !authPending);

  const query = useQuery({
    queryKey: taskProgressKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Exclude<ReadResult, { kind: "unknown" }>> => {
      const result = await activeClient().read();
      // An unreachable service keeps the last good data on screen, marked stale.
      if (result.kind === "unknown") throw new ReadFailed("unreachable");
      return result;
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    // While the last read failed, keep checking so a reconnect re-reads current progress.
    refetchInterval: (q) => (q.state.status === "error" ? 5_000 : false),
  });

  const result = query.data;
  const byRef = useMemo(() => {
    const map = new Map<string, TaskProgress>();
    if (result?.kind === "ok")
      for (const t of result.tasks) map.set(t.taskRef, t);
    return map;
  }, [result]);

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
    byRef,
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
  const { data: user } = useAuthUser();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!userId) return null;
    return taskActionStoreFor(userId, {
      client: activeClient(),
      newOperationId: () => crypto.randomUUID(),
      onChanged: () => {
        void queryClient.invalidateQueries({
          queryKey: taskProgressKey(userId),
        });
        void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      },
      onResult: (event) => {
        const props = buildTaskActionResultProperties(event, surface);
        if (props) trackCompanionActionResult(props);
      },
    });
  }, [userId, queryClient, surface]);
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

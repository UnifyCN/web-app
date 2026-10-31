"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountId } from "@/hooks/useAccountId";
import { TASKS_KEY } from "@/hooks/useChecklist";
import { companionActionsTransportFor, useOnline } from "@/hooks/useTaskActions";
import { ownAccountWork, type AccountOwner } from "@/lib/accountSession";
import { trackCompanionActionResult } from "@/lib/analytics";
import {
  buildPlanResultProperties,
  type TaskActionSurface,
} from "@/lib/companionActions/analytics";
import { createPlanClient, type PlanClient } from "@/lib/companionActions/planClient";
import type { PlanProposal, PlanView } from "@/lib/companionActions/planContract";
import {
  planStoreFor,
  type PlanPhase,
  type PlanStore,
} from "@/lib/companionActions/planStore";
import {
  CONVERSATION_PLANS_ROOT,
  PLAN_PROPOSAL_ROOT,
  PLANS_ROOT,
  TASK_PROGRESS_ROOT,
  conversationPlansKey,
  planProposalKey,
  plansKey,
} from "@/lib/companionActions/queryKeys";

class ReadFailed extends Error {}

/** The plan client of `owner`'s account: requests are made only as that account and session. */
export function planClientFor(owner: AccountOwner): PlanClient {
  return createPlanClient({
    transport: companionActionsTransportFor(owner),
    platform: "web",
    appVersion: "web",
  });
}

export type PlansStatus = "loading" | "ready" | "failed" | "unavailable" | "signed_out";

/**
 * The persistent plan entry's data (#364): saved plans (newest first) and open drafts.
 * Loading and a failed read are their own states: neither reads as "no plan".
 * Other accounts' entries are removed by useAccountScope.
 */
export function usePlans(): {
  status: PlansStatus;
  plans: PlanView[];
  drafts: PlanProposal[];
} {
  const accountId = useAccountId();
  const userId = accountId ?? null;
  const online = useOnline();
  const query = useQuery({
    queryKey: plansKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await planClientFor(owner).plans();
      if (result.kind === "unknown") throw new ReadFailed("unreachable");
      return result;
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.status === "error" ? 5_000 : false),
  });
  const data = query.data;
  let status: PlansStatus;
  if ((accountId !== undefined && !userId) || data?.kind === "unauthorized")
    status = "signed_out";
  else if (data?.kind === "unavailable" || data?.kind === "refused")
    status = "unavailable";
  else if (data?.kind === "ok") status = "ready";
  else if (!online || query.isError) status = "failed";
  else status = "loading";
  return {
    status,
    plans: data?.kind === "ok" ? data.plans : [],
    drafts: data?.kind === "ok" ? data.drafts : [],
  };
}

/** One plan draft, read as the signed-in account. */
export function usePlanProposal(id: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: planProposalKey(userId, id),
    enabled: Boolean(userId && id),
    queryFn: async (): Promise<PlanProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await planClientFor(owner).proposal(id as string);
      if (result.kind === "ok" || result.kind === "changed") return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
    refetchOnReconnect: true,
  });
}

/** The plan drafts a conversation produced, for its cards. */
export function useConversationPlans(conversationId: string | null) {
  const userId = useAccountId() ?? null;
  return useQuery({
    queryKey: conversationPlansKey(userId, conversationId),
    enabled: Boolean(userId && conversationId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed("account changed");
      const result = await planClientFor(owner).conversationPlans(conversationId as string);
      if (result.kind !== "ok") throw new ReadFailed(result.kind);
      return result.proposals;
    },
    staleTime: 0,
    refetchOnReconnect: true,
  });
}

/** The plan client of the signed-in account and the owner it is bound to. */
export function usePlanClient(): { client: PlanClient; owner: AccountOwner } | null {
  const userId = useAccountId() ?? null;
  const { epoch } = ownAccountWork();
  return useMemo(() => {
    if (!userId) return null;
    const owner = { accountId: userId, epoch };
    return { client: planClientFor(owner), owner };
  }, [userId, epoch]);
}

/** The account's plan store, wired to this page's surface for analytics. */
export function usePlanStore(surface: TaskActionSurface): PlanStore | null {
  const userId = useAccountId() ?? null;
  const { epoch } = ownAccountWork();
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!userId) return null;
    return planStoreFor(userId, {
      client: planClientFor({ accountId: userId, epoch }),
      newOperationId: () => crypto.randomUUID(),
      onChanged: () => {
        for (const root of [PLANS_ROOT, PLAN_PROPOSAL_ROOT, CONVERSATION_PLANS_ROOT, TASK_PROGRESS_ROOT]) {
          void queryClient.invalidateQueries({ queryKey: [root, userId] });
        }
        // Added or removed tasks are Checklist rows too.
        void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      },
      onResult: (event) => {
        const props = buildPlanResultProperties(event, surface);
        if (props) trackCompanionActionResult(props);
      },
    });
  }, [userId, epoch, queryClient, surface]);
}

const IDLE: PlanPhase = { phase: "idle" };
const noopSubscribe = () => () => {};

export function usePlanPhase(store: PlanStore | null, key: string | null): PlanPhase {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => (store && key ? store.get(key) : IDLE),
    () => IDLE,
  );
}

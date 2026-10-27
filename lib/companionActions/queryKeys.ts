/**
 * Root of every task-progress query (mobile-app#361). Each key carries the
 * account id. Kept apart from the hooks so Checklist mutations can refresh task
 * progress without an import cycle.
 */
export const TASK_PROGRESS_ROOT = "companion-task-actions" as const;
export const taskProgressKey = (userId: string | null) =>
  [TASK_PROGRESS_ROOT, userId] as const;

/** A task draft (#363), per account. */
export const TASK_PROPOSAL_ROOT = "companion-task-proposal" as const;
export const taskProposalKey = (
  userId: string | null,
  proposalId: string | null,
) => [TASK_PROPOSAL_ROOT, userId, proposalId] as const;

/** The drafts and command results of one conversation (#363), per account. */
export const CONVERSATION_ACTIONS_ROOT =
  "companion-conversation-actions" as const;
export const conversationActionsKey = (
  userId: string | null,
  conversationId: string | null,
) => [CONVERSATION_ACTIONS_ROOT, userId, conversationId] as const;

/** Saved plans and open plan drafts of one account (#364). */
export const PLANS_ROOT = "companion-plans" as const;
export const plansKey = (userId: string | null) => [PLANS_ROOT, userId] as const;
/** One plan draft, per account. */
export const PLAN_PROPOSAL_ROOT = "companion-plan-proposal" as const;
export const planProposalKey = (userId: string | null, id: string | null) =>
  [PLAN_PROPOSAL_ROOT, userId, id] as const;
/** The plan drafts of one conversation, per account. */
export const CONVERSATION_PLANS_ROOT = "companion-conversation-plans" as const;
export const conversationPlansKey = (
  userId: string | null,
  conversationId: string | null,
) => [CONVERSATION_PLANS_ROOT, userId, conversationId] as const;

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

/** A suggested-steps draft (#366), per account. */
export const STEP_PROPOSAL_ROOT = "companion-step-proposal" as const;
export const stepProposalKey = (
  userId: string | null,
  proposalId: string | null,
) => [STEP_PROPOSAL_ROOT, userId, proposalId] as const;

/** The drafts and command results of one conversation (#363), per account. */
export const CONVERSATION_ACTIONS_ROOT =
  "companion-conversation-actions" as const;
export const conversationActionsKey = (
  userId: string | null,
  conversationId: string | null,
) => [CONVERSATION_ACTIONS_ROOT, userId, conversationId] as const;

// Typed registry of the changes the answer model may suggest (mobile-app#363).
//
// A suggestion is data for the user to review, never a write: rag-query does not call
// the action service, prepare a proposal or build authorization evidence. The client
// asks the action service (companion-actions `prepare`) for a server-owned draft, and
// only the user's approval of that draft can apply it. Each entry fixes how the model
// writes the suggestion, how it is validated, and the typed field the client receives.
// A later domain (for example job search) adds an entry here and a matching operation
// in the action service registry; it gains no other permission.

export interface TaskCreateProposal {
  type: 'task.create_custom';
  version: 1;
  title: string;
}

export type ActionProposal = TaskCreateProposal;

export interface ProposalCapabilitySpec<P extends ActionProposal> {
  type: P['type'];
  version: 1;
  /** Suggest only. The user reviews and approves a server-owned draft. */
  classification: 'propose';
  /** The line tag the model writes, alone on its line: "[TAG]: value". */
  tag: string;
  /** The value as written by the model, or null when it is not exactly one plain value. */
  parse(value: string): P | null;
}

const TITLE_MIN = 3;
const TITLE_MAX = 120;
// Plain text only: no markup, code, brackets, links or control characters.
// deno-lint-ignore no-control-regex
const NOT_PLAIN = /[<>{}[\]`\u0000-\u001f\u007f]|https?:\/\/|www\./i;

const taskCreate: ProposalCapabilitySpec<TaskCreateProposal> = {
  type: 'task.create_custom',
  version: 1,
  classification: 'propose',
  tag: 'TASK',
  parse(value) {
    const title = value.trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
    if (title.length < TITLE_MIN || title.length > TITLE_MAX || NOT_PLAIN.test(title)) return null;
    return { type: 'task.create_custom', version: 1, title };
  },
};

export const PROPOSAL_CAPABILITIES = { 'task.create_custom': taskCreate } as const;

export const TASK_PROPOSAL_INSTRUCTION = `
TASK SUGGESTION:
You cannot add or change tasks. When the user asks for help with one concrete settlement step that is not already in their Checklist above, you may suggest ONE new Checklist task for them to review. Write it on its own line before any [SUGGESTIONS] line, as:
[TASK]: <short task title in plain text, at most 80 characters, in the language of your answer>
The app shows it as a draft that only the user can approve. Never say that a task was added or saved. Do not suggest a task that the Checklist already has. Write no [TASK] line in any other case.`;

/**
 * Removes every "[TASK]: ..." line from the answer and returns the suggestion when the
 * answer has exactly one valid one. Two or more, or an invalid value, give none.
 */
export function extractActionProposal(answer: string): { answer: string; proposal: ActionProposal | null } {
  const spec = PROPOSAL_CAPABILITIES['task.create_custom'];
  const line = new RegExp(`^[ \\t*_\`~]*\\[${spec.tag}\\]:[ \\t]*(.*)$`, 'gim');
  const values: string[] = [];
  const stripped = answer.replace(line, (_m, value: string) => {
    values.push(value);
    return '';
  });
  if (values.length === 0) return { answer, proposal: null };
  const cleaned = stripped.replace(/\n{3,}/g, '\n\n').trim();
  return { answer: cleaned, proposal: values.length === 1 ? spec.parse(values[0]) : null };
}

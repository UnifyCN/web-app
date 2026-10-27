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

/** #366: preparation steps for one task this answer read from the user's Checklist. */
export interface StepCreateProposal {
  type: 'step.create';
  version: 1;
  task_ref: string;
  titles: string[];
}

export type ActionProposal = TaskCreateProposal | StepCreateProposal;

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

const STEPS_MAX = 5;
const TASK_ID = /^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$/;
const stepKey = (t: string) => t.toLowerCase();

/**
 * Steps for one task: "[STEP <task id>]: <title>" lines, at most five, all naming the same
 * task, which must be one this answer read (`readTaskRefs`). Anything else gives none.
 */
const stepCreate = {
  type: 'step.create' as const,
  version: 1 as const,
  classification: 'propose' as const,
  parse(lines: { ref: string; value: string }[], readTaskRefs: ReadonlySet<string>): StepCreateProposal | null {
    if (lines.length === 0 || lines.length > STEPS_MAX) return null;
    const ref = lines[0].ref;
    if (!TASK_ID.test(ref) || !readTaskRefs.has(ref) || lines.some(l => l.ref !== ref)) return null;
    const titles: string[] = [];
    for (const l of lines) {
      const title = taskCreate.parse(l.value)?.title;
      if (!title || titles.some(t => stepKey(t) === stepKey(title))) return null;
      titles.push(title);
    }
    return { type: 'step.create', version: 1, task_ref: ref, titles };
  },
};

export const TASK_PROPOSAL_INSTRUCTION = `
TASK SUGGESTION:
You cannot add or change tasks. When the user asks for help with one concrete settlement step that is not already in their Checklist above, you may suggest ONE new Checklist task for them to review. Write it on its own line before any [SUGGESTIONS] line, as:
[TASK]: <short task title in plain text, at most 80 characters, in the language of your answer>
The app shows it as a draft that only the user can approve. Never say that a task was added or saved. Do not suggest a task that the Checklist already has. Write no [TASK] line in any other case.

STEP SUGGESTION:
When the user asks how to do one task that is listed in their Checklist above, and no [TASK] line is written, you may suggest up to 5 short preparation steps for that one task. Write each on its own line before any [SUGGESTIONS] line, as:
[STEP <task id>]: <short step in plain text, at most 80 characters, in the language of your answer>
Use the exact task id shown for that Checklist task. The app shows the steps as a draft that only the user can approve. Never say that a step was added, saved or done. Steps never complete the task. Write no [STEP] line in any other case.`;

/**
 * Removes every "[TASK]: ..." and "[STEP <id>]: ..." line from the answer and returns
 * the suggestion. A task: exactly one valid "[TASK]" line (two or more, or an invalid
 * value, give none). Steps (#366), only when no "[TASK]" line was written: valid lines
 * for one task in `readTaskRefs`, the Checklist tasks this answer read.
 */
export function extractActionProposal(
  answer: string,
  readTaskRefs: ReadonlySet<string> = new Set(),
): { answer: string; proposal: ActionProposal | null } {
  const spec = PROPOSAL_CAPABILITIES['task.create_custom'];
  const line = new RegExp(`^[ \\t*_\`~]*\\[${spec.tag}\\]:[ \\t]*(.*)$`, 'gim');
  const stepLine = /^[ \t*_`~]*\[STEP(?:[ \t]+([^\]\s]*))?[ \t]*\]:[ \t]*(.*)$/gim;
  const values: string[] = [];
  const steps: { ref: string; value: string }[] = [];
  const stripped = answer
    .replace(line, (_m, value: string) => {
      values.push(value);
      return '';
    })
    .replace(stepLine, (_m, ref: string | undefined, value: string) => {
      steps.push({ ref: ref ?? '', value });
      return '';
    });
  if (values.length === 0 && steps.length === 0) return { answer, proposal: null };
  const cleaned = stripped.replace(/\n{3,}/g, '\n\n').trim();
  if (values.length > 0) return { answer: cleaned, proposal: values.length === 1 ? spec.parse(values[0]) : null };
  return { answer: cleaned, proposal: stepCreate.parse(steps, readTaskRefs) };
}

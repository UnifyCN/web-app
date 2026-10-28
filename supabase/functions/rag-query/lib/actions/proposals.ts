// Typed registry of the changes the answer model may suggest (mobile-app#363 new task,
// #365 edit of a listed task).
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

/**
 * One change to one Checklist task the answer was shown (#365). `waiting` sets Waiting
 * with that reason. Title, description and priority only for a custom task: a published
 * task's are shared content.
 */
export interface TaskEditProposal {
  type: 'task.edit';
  version: 1;
  task_ref: string;
  field: 'state' | 'waiting' | 'title' | 'description' | 'priority';
  value: string;
}

export type ActionProposal = TaskCreateProposal | StepCreateProposal | TaskEditProposal;

export interface ProposalCapabilitySpec<P extends ActionProposal> {
  type: P['type'];
  version: 1;
  /** Suggest only. The user reviews and approves a server-owned draft. */
  classification: 'propose';
  /** The line tag the model writes, alone on its line: "[TAG]: value". */
  tag: string;
  /**
   * The value as written by the model, or null when it is not exactly one plain value.
   * `shownTasks`: the Checklist task ids this answer was shown; nothing else is a target.
   */
  parse(value: string, shownTasks?: ReadonlySet<string>): P | null;
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

const STATES = ['not_started', 'in_progress', 'waiting', 'completed'];
const PRIORITIES = ['Do now', 'Do soon', 'Explore and connect', 'Optional / later'];
const EDIT_FIELDS: TaskEditProposal['field'][] = ['state', 'waiting', 'title', 'description', 'priority'];
const TASK_REF = /^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$/;
const plain = (value: string, max: number) => {
  const text = value.trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
  return text && text.length <= max && !NOT_PLAIN.test(text) ? text : null;
};

const taskEdit: ProposalCapabilitySpec<TaskEditProposal> = {
  type: 'task.edit',
  version: 1,
  classification: 'propose',
  tag: 'EDIT',
  parse(value, shownTasks) {
    const parts = value.split('|').map(part => part.trim());
    if (parts.length !== 3) return null;
    const [task_ref, field, raw] = parts;
    if (!TASK_REF.test(task_ref) || !shownTasks?.has(task_ref)) return null;
    if (!(EDIT_FIELDS as string[]).includes(field)) return null;
    const edit = (v: string | null): TaskEditProposal | null =>
      v === null ? null : { type: 'task.edit', version: 1, task_ref, field: field as TaskEditProposal['field'], value: v };
    if (field === 'state') return edit(STATES.includes(raw) ? raw : null);
    if (field === 'waiting') return edit(plain(raw, 200));
    // Shared published content is never edited for one account.
    if (!task_ref.startsWith('custom:')) return null;
    if (field === 'priority') return edit(PRIORITIES.includes(raw) ? raw : null);
    if (field === 'title') {
      const title = plain(raw, TITLE_MAX);
      return edit(title && title.length >= TITLE_MIN ? title : null);
    }
    return edit(plain(raw, 300));
  },
};

export const PROPOSAL_CAPABILITIES = { 'task.create_custom': taskCreate, 'task.edit': taskEdit } as const;

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
Use the exact task id shown for that Checklist task. The app shows the steps as a draft that only the user can approve. Never say that a step was added, saved or done. Steps never complete the task. Write no [STEP] line in any other case.

TASK CHANGE SUGGESTION:
When what the user says clearly changes one Checklist task listed above, you may instead suggest ONE change to it for them to review, on its own line before any [SUGGESTIONS] line, as:
[EDIT]: <task id from the list> | <field> | <value>
Fields: state (value: not_started, in_progress, waiting or completed), waiting (value: what the task is waiting for, in plain text), and only for a task whose id starts with custom: also title, description (plain text) or priority (value: Do now, Do soon, Explore and connect or Optional / later). Suggest completed only when the user says the whole task is done; finished preparation is not completion. The app shows the change as a draft that only the user can approve. Never say that it was changed or saved. Write at most one [TASK] or [EDIT] line in an answer, and no [STEP] line with it.`;

/**
 * Removes every "[TASK]: ...", "[EDIT]: ..." and "[STEP <id>]: ..." line from the answer
 * and returns the suggestion. A task or an edit (#365): exactly one valid "[TASK]" or
 * "[EDIT]" line (two or more of them, or an invalid value, give none); an edit names a
 * task in `readTaskRefs`. Steps (#366), only when no "[TASK]" or "[EDIT]" line was
 * written: valid lines for one task in `readTaskRefs`, the Checklist tasks this answer read.
 */
export function extractActionProposal(
  answer: string,
  readTaskRefs: ReadonlySet<string> = new Set(),
): { answer: string; proposal: ActionProposal | null } {
  const spec = PROPOSAL_CAPABILITIES['task.create_custom'];
  const edit = PROPOSAL_CAPABILITIES['task.edit'];
  const line = new RegExp(`^[ \\t*_\`~]*\\[(${spec.tag}|${edit.tag})\\]:[ \\t]*(.*)$`, 'gim');
  const stepLine = /^[ \t*_`~]*\[STEP(?:[ \t]+([^\]\s]*))?[ \t]*\]:[ \t]*(.*)$/gim;
  const values: { tag: string; value: string }[] = [];
  const steps: { ref: string; value: string }[] = [];
  const stripped = answer
    .replace(line, (_m, tag: string, value: string) => {
      values.push({ tag: tag.toUpperCase(), value });
      return '';
    })
    .replace(stepLine, (_m, ref: string | undefined, value: string) => {
      steps.push({ ref: ref ?? '', value });
      return '';
    });
  if (values.length === 0 && steps.length === 0) return { answer, proposal: null };
  const cleaned = stripped.replace(/\n{3,}/g, '\n\n').trim();
  if (values.length > 0) {
    if (values.length !== 1) return { answer: cleaned, proposal: null };
    const [{ tag, value }] = values;
    return { answer: cleaned, proposal: tag === edit.tag ? edit.parse(value, readTaskRefs) : spec.parse(value) };
  }
  return { answer: cleaned, proposal: stepCreate.parse(steps, readTaskRefs) };
}

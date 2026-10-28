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

import { profileFactOf } from '../context/profileFacts.ts';

export interface TaskCreateProposal {
  type: 'task.create_custom';
  version: 1;
  title: string;
}

/** A reused Checklist task (by the key the model was shown) or a missing task to add. */
export type PlanProposalItem =
  | { kind: 'existing'; task_ref: string; label: string }
  | { kind: 'new'; title: string; candidates?: string[] };

/** A settlement plan for review (mobile-app#364). Never a write. */
export interface PlanProposal {
  type: 'plan';
  version: 1;
  goal: string;
  items: PlanProposalItem[];
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

/** #370: one personal detail the user mentioned, for them to approve saving. */
export interface DetailCreateProposal {
  type: 'detail.create';
  version: 1;
  text: string;
}

export type ActionProposal =
  | TaskCreateProposal
  | PlanProposal
  | StepCreateProposal
  | TaskEditProposal
  | DetailCreateProposal;

/** A Checklist task this answer actually read for this account (the plan may reuse only these). */
export interface ReadChecklistTask {
  id: string;
  title: string | null;
}

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

const PLAN_GOAL_MAX = 120;
const PLAN_ITEMS_MAX = 12;
const PLAN_NEW_MAX = 5;
const PLAN_KEY = /^(sanity:[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$/;
const titleKey = (t: string) => t.trim().replace(/\s+/gu, ' ').toLowerCase();
const plainValue = (value: string, max: number): string | null => {
  const v = value.trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
  return v.length >= TITLE_MIN && v.length <= max && !NOT_PLAIN.test(v) ? v : null;
};

export const PLAN_PROPOSAL_INSTRUCTION = `
PLAN SUGGESTION:
When the user asks for help planning several settlement steps (for example their first week), you may suggest a plan for them to review instead of a single task. Write it at the end, before any [SUGGESTIONS] line, one item per line:
[PLAN]: <short plan name in plain text, in the language of your answer>
[PLAN_TASK]: <the exact task key of a Checklist task listed above, for example sanity:abc or custom:12>
[PLAN_NEW]: <short title of a missing task in plain text, in the language of your answer>
Use [PLAN_TASK] for every listed Checklist task the plan reuses, in the order to do them, and [PLAN_NEW] only for tasks the Checklist does not have (at most 5). Never invent a task key. The app shows the plan as a draft that only the user can approve; never say that a plan or task was saved. When you write a plan, write no [TASK] or [EDIT] line.`;

/**
 * The plan lines of an answer, validated against the Checklist tasks this answer read.
 * Anything not exactly valid drops the whole plan: a partial plan could misstate what
 * the model suggested.
 */
function parsePlan(lines: Array<{ tag: string; value: string }>, read: ReadChecklistTask[]): PlanProposal | null {
  const goals = lines.filter(l => l.tag === 'PLAN');
  if (goals.length !== 1) return null;
  const goal = plainValue(goals[0].value, PLAN_GOAL_MAX);
  if (!goal) return null;
  const byKey = new Map(read.map(t => [t.id, t]));
  const items: PlanProposalItem[] = [];
  const seen = new Set<string>();
  let added = 0;
  for (const line of lines) {
    if (line.tag === 'PLAN_TASK') {
      const key = line.value.trim();
      const task = PLAN_KEY.test(key) ? byKey.get(key) : undefined;
      if (!task || seen.has(key)) return null;
      seen.add(key);
      items.push({ kind: 'existing', task_ref: key, label: task.title ?? '' });
    } else if (line.tag === 'PLAN_NEW') {
      const title = plainValue(line.value, TITLE_MAX);
      if (!title || seen.has(`new:${titleKey(title)}`)) return null;
      seen.add(`new:${titleKey(title)}`);
      added++;
      // A listed content task with the same title is offered as a possible match for
      // review, never merged. (Custom-task matches are found by the action service.)
      const candidates = read
        .filter(t => t.id.startsWith('sanity:') && t.title && titleKey(t.title) === titleKey(title) && !seen.has(t.id))
        .map(t => t.id)
        .slice(0, 3);
      items.push({ kind: 'new', title, ...(candidates.length ? { candidates } : {}) });
    }
  }
  if (items.length === 0 || items.length > PLAN_ITEMS_MAX || added > PLAN_NEW_MAX) return null;
  // Labels are display text from the Checklist read; drop an empty one rather than invent it.
  return {
    type: 'plan',
    version: 1,
    goal,
    items: items.map(i => (i.kind === 'existing' && !i.label ? { kind: 'existing', task_ref: i.task_ref } as PlanProposalItem : i)),
  };
}

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

// #370: "[REMEMBER]: <detail>". Plain text only; never a profile fact (the profile owns
// province, city, arrival date and status), which the action service would refuse too.
const DETAIL_MIN = 3;
const DETAIL_MAX = 200;
const detailCreate = {
  type: 'detail.create' as const,
  version: 1 as const,
  classification: 'propose' as const,
  tag: 'REMEMBER',
  parse(value: string): DetailCreateProposal | null {
    const text = value.trim().replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
    if (text.length < DETAIL_MIN || text.length > DETAIL_MAX || NOT_PLAIN.test(text)) return null;
    if (profileFactOf(text)) return null;
    return { type: 'detail.create', version: 1, text };
  },
};

export const DETAIL_PROPOSAL_INSTRUCTION = `
DETAIL SUGGESTION:
You cannot save personal details. When the user's own message states a lasting personal detail that would help in later conversations (for example when they can attend appointments, an accessibility need, or a preferred language for appointments), and no [TASK], [EDIT] or [STEP] line is written, you may suggest saving ONE detail for them to review. Never suggest their province, city, arrival date or immigration status: the profile owns those. Do not suggest a detail already listed under SAVED PERSONAL DETAILS. Write it on its own line before any [SUGGESTIONS] line, as:
[REMEMBER]: <the detail in plain text, at most 200 characters, in the language of your answer, written as the user would say it, for example "I can attend appointments on Fridays">
The app asks the user whether to save it; only the user can approve it. Never say that a detail was saved or remembered. Write no [REMEMBER] line in any other case.`;

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
 * Removes every "[TASK]: ...", "[EDIT]: ...", plan, "[STEP <id>]: ..." and "[REMEMBER]: ..."
 * line from the answer. Returns a plan when the answer has plan lines and exactly one
 * valid plan (checked against `read`, the Checklist tasks this answer read for the
 * account). Else a task or an edit (#365): exactly one valid "[TASK]" or "[EDIT]" line
 * (two or more of them, or an invalid value, give none); an edit names a task in
 * `readTaskRefs`. Steps (#366), only when none of those was written: valid lines for one
 * task in `readTaskRefs`, the Checklist tasks this answer read. Else a detail (#370):
 * exactly one valid "[REMEMBER]" line.
 */
export function extractActionProposal(
  answer: string,
  read: ReadChecklistTask[] = [],
  readTaskRefs: ReadonlySet<string> = new Set(),
): { answer: string; proposal: ActionProposal | null } {
  const spec = PROPOSAL_CAPABILITIES['task.create_custom'];
  const edit = PROPOSAL_CAPABILITIES['task.edit'];
  const line = new RegExp(`^[ \\t*_\`~]*\\[(${spec.tag}|${edit.tag}|PLAN|PLAN_TASK|PLAN_NEW)\\]:[ \\t]*(.*)$`, 'gim');
  const stepLine = /^[ \t*_`~]*\[STEP(?:[ \t]+([^\]\s]*))?[ \t]*\]:[ \t]*(.*)$/gim;
  const values: { tag: string; value: string }[] = [];
  const planLines: Array<{ tag: string; value: string }> = [];
  const steps: { ref: string; value: string }[] = [];
  const details: string[] = [];
  const detailLine = new RegExp(`^[ \\t*_\`~]*\\[${detailCreate.tag}\\]:[ \\t]*(.*)$`, 'gim');
  const stripped = answer
    .replace(line, (_m, tag: string, value: string) => {
      const t = tag.toUpperCase();
      if (t === spec.tag || t === edit.tag) values.push({ tag: t, value });
      else planLines.push({ tag: t, value });
      return '';
    })
    .replace(stepLine, (_m, ref: string | undefined, value: string) => {
      steps.push({ ref: ref ?? '', value });
      return '';
    })
    .replace(detailLine, (_m, value: string) => {
      details.push(value);
      return '';
    });
  if (values.length === 0 && planLines.length === 0 && steps.length === 0 && details.length === 0) return { answer, proposal: null };
  const cleaned = stripped.replace(/\n{3,}/g, '\n\n').trim();
  if (planLines.length > 0) {
    return { answer: cleaned, proposal: parsePlan(planLines, read) };
  }
  if (values.length > 0) {
    if (values.length !== 1) return { answer: cleaned, proposal: null };
    const [{ tag, value }] = values;
    return { answer: cleaned, proposal: tag === edit.tag ? edit.parse(value, readTaskRefs) : spec.parse(value) };
  }
  if (steps.length > 0) return { answer: cleaned, proposal: stepCreate.parse(steps, readTaskRefs) };
  // #370: exactly one detail line, only when no task, edit or step was suggested.
  return { answer: cleaned, proposal: details.length === 1 ? detailCreate.parse(details[0]) : null };
}

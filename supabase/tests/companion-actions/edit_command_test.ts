// Clear edit commands (mobile-app#365) through the public request boundary. A clear
// command in the user's own saved message names one live task by its title and one
// change; it authorizes exactly that change, once. An unclear target or meaning gets a
// question and writes nothing. Each test names the observation that would prove the
// behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, conversationActions, conversationWith, existingCustomTask, interpret, messageIn, newAccount, ready, setProfile,
  setState, sql, status, taskOf, testOpts, undo,
} from './support.ts';

await ready();

const command = (message_id: number) => ({ kind: 'direct_command', message_id });
type Account = Awaited<ReturnType<typeof newAccount>>;

async function row(who: Account, id: number) {
  const r = await who.client.from('custom_checklist_tasks')
    .select('title, description, priority, completed, progress_state, waiting_reason, revision').eq('id', id).single();
  if (r.error) throw r.error;
  return r.data;
}

/** Interprets and applies one command message; returns both replies. */
async function run(who: Account, conversationRow: number, text: string) {
  const message_id = await messageIn(who, conversationRow, 'user', text);
  const i = await interpret(who, message_id);
  if (i.status !== 200 || i.json.command.kind !== 'edit') return { i, a: null, message_id };
  const a = await apply(who, [i.json.command.operation], { authorization: command(message_id) });
  return { i, a, message_id };
}

Deno.test({
  name: 'a clear rename command changes exactly the task it names, once',
  ...testOpts,
  fn: async () => {
    // Wrong if: interpreting writes, the command resolves to another task or title, a
    // different operation is accepted under the command, or one message writes twice.
    const a = await newAccount('ana');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const other = await existingCustomTask(a, 'Open a bank account');
    const { message_id } = await conversationWith(a, 'user', 'Rename task "Get a phone plan" to "Get a prepaid phone plan"');
    const i = await interpret(a, message_id);
    assertEquals(i.status, 200, JSON.stringify(i.json));
    assertEquals(i.json.command, {
      kind: 'edit',
      operation: { type: 'task.edit_details', task_ref: ref, expected_revision: 1, title: 'Get a prepaid phone plan' },
      target: { task_ref: ref, title: 'Get a phone plan' },
      before: { title: 'Get a phone plan' },
    });
    assertEquals((await row(a, id)).title, 'Get a phone plan', 'interpreting wrote');
    const wrong = [
      { type: 'task.edit_details', task_ref: ref, expected_revision: 1, title: 'Something else' },
      { type: 'task.edit_details', task_ref: other.ref, expected_revision: 1, title: 'Get a prepaid phone plan' },
      { type: 'task.edit_details', task_ref: ref, expected_revision: 1, title: 'Get a prepaid phone plan', priority: 'Do now' },
      setState(ref, 'completed', 1),
    ];
    for (const op of wrong) {
      const r = await apply(a, [op], { authorization: command(message_id) });
      assertEquals(r.status, 403, `${JSON.stringify(op)} -> ${JSON.stringify(r.json)}`);
    }
    const ok = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.changes, [{ field: 'title', before: 'Get a phone plan', after: 'Get a prepaid phone plan' }]);
    const again = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals([again.status, again.json.error], [409, 'command_already_used']);
    assertEquals([(await row(a, id)).title, (await row(a, other.id)).title], ['Get a prepaid phone plan', 'Open a bank account']);
  },
});

// The documented example of each command in each supported language
// (DOCS/companion-actions/365-task-edits.md). Each must resolve to exactly this change.
const EXAMPLES: Record<string, { rename: string; description: string; priority: string; progress: string; waiting: string; done: string }> = {
  en: {
    rename: 'Rename task "Phone" to "Phone plan"',
    description: 'Set description of task "Phone plan" to "Compare two carriers"',
    priority: 'Set priority of task "Phone plan" to Do now',
    progress: 'Mark task "Phone plan" as in progress',
    waiting: 'Mark task "Phone plan" as waiting: SIM card in the mail',
    done: 'Mark task "Phone plan" as completed',
  },
  'fr-CA': {
    rename: 'Renomme la tâche « Phone » en « Phone plan »',
    description: 'Change la description de la tâche « Phone plan » en « Compare two carriers »',
    priority: 'Mets la priorité de la tâche « Phone plan » à À faire maintenant',
    progress: 'Marque la tâche « Phone plan » comme en cours',
    waiting: 'Marque la tâche « Phone plan » comme en attente : SIM card in the mail',
    done: 'Marque la tâche « Phone plan » comme terminée',
  },
  es: {
    rename: 'Cambia el nombre de la tarea "Phone" a "Phone plan"',
    description: 'Cambia la descripción de la tarea "Phone plan" a "Compare two carriers"',
    priority: 'Pon la prioridad de la tarea "Phone plan" en Hazlo ahora',
    progress: 'Marca la tarea "Phone plan" como en curso',
    waiting: 'Marca la tarea "Phone plan" como en espera: SIM card in the mail',
    done: 'Marca la tarea "Phone plan" como completada',
  },
  vi: {
    rename: 'Đổi tên việc "Phone" thành "Phone plan"',
    description: 'Đổi mô tả việc "Phone plan" thành "Compare two carriers"',
    priority: 'Đặt mức ưu tiên của việc "Phone plan" là Làm ngay',
    progress: 'Đánh dấu việc "Phone plan" là đang làm',
    waiting: 'Đánh dấu việc "Phone plan" là đang chờ: SIM card in the mail',
    done: 'Đánh dấu việc "Phone plan" là đã xong',
  },
  hi: {
    rename: 'कार्य "Phone" का नाम बदलकर "Phone plan" करें',
    description: 'कार्य "Phone plan" का विवरण बदलकर "Compare two carriers" करें',
    priority: 'कार्य "Phone plan" की प्राथमिकता अभी करें करें',
    progress: 'कार्य "Phone plan" को जारी है चिह्नित करें',
    waiting: 'कार्य "Phone plan" को इंतज़ार में चिह्नित करें: SIM card in the mail',
    done: 'कार्य "Phone plan" को पूरा हुआ चिह्नित करें',
  },
  pa: {
    rename: 'ਕੰਮ "Phone" ਦਾ ਨਾਮ ਬਦਲ ਕੇ "Phone plan" ਕਰੋ',
    description: 'ਕੰਮ "Phone plan" ਦਾ ਵੇਰਵਾ ਬਦਲ ਕੇ "Compare two carriers" ਕਰੋ',
    priority: 'ਕੰਮ "Phone plan" ਦੀ ਤਰਜੀਹ ਹੁਣੇ ਕਰੋ ਕਰੋ',
    progress: 'ਕੰਮ "Phone plan" ਨੂੰ ਚੱਲ ਰਿਹਾ ਹੈ ਮਾਰਕ ਕਰੋ',
    waiting: 'ਕੰਮ "Phone plan" ਨੂੰ ਉਡੀਕ ਵਿੱਚ ਮਾਰਕ ਕਰੋ: SIM card in the mail',
    done: 'ਕੰਮ "Phone plan" ਨੂੰ ਪੂਰਾ ਹੋਇਆ ਮਾਰਕ ਕਰੋ',
  },
  ar: {
    rename: 'غيّر اسم المهمة "Phone" إلى "Phone plan"',
    description: 'غيّر وصف المهمة "Phone plan" إلى "Compare two carriers"',
    priority: 'اجعل أولوية المهمة "Phone plan" افعل الآن',
    progress: 'اجعل حالة المهمة "Phone plan" قيد التنفيذ',
    waiting: 'اجعل حالة المهمة "Phone plan" في الانتظار: SIM card in the mail',
    done: 'اجعل حالة المهمة "Phone plan" مكتملة',
  },
};

Deno.test({
  name: 'the documented command examples in every supported language make exactly their change',
  ...testOpts,
  fn: async () => {
    // Wrong if: any example is not understood, resolves to another field or value, or
    // changes anything besides what it names.
    for (const [lang, ex] of Object.entries(EXAMPLES)) {
      const a = await newAccount(`cmd-${lang}`);
      const { id } = await existingCustomTask(a, 'Phone');
      const { conversationRow } = await conversationWith(a, 'user', 'hello');
      const steps: [keyof typeof ex, Record<string, unknown>][] = [
        ['rename', { title: 'Phone plan', description: '', priority: 'Do soon', completed: false, progress_state: null }],
        ['description', { title: 'Phone plan', description: 'Compare two carriers', priority: 'Do soon' }],
        ['priority', { priority: 'Do now', progress_state: null }],
        ['progress', { completed: false, progress_state: 'in_progress', waiting_reason: null }],
        ['waiting', { progress_state: 'waiting', waiting_reason: 'SIM card in the mail' }],
        ['done', { completed: true, progress_state: null, waiting_reason: null, priority: 'Do now', title: 'Phone plan' }],
      ];
      for (const [step, expected] of steps) {
        const { i, a: applied } = await run(a, conversationRow, ex[step]);
        assertEquals(i.json.command?.kind, 'edit', `${lang} ${step}: ${JSON.stringify(i.json)}`);
        assertEquals(applied?.status, 200, `${lang} ${step}: ${JSON.stringify(applied?.json)}`);
        const now = await row(a, id);
        for (const [k, v] of Object.entries(expected)) {
          assertEquals((now as Record<string, unknown>)[k], v, `${lang} ${step}: ${k}`);
        }
      }
    }
  },
});

Deno.test({
  name: 'an unclear target or meaning gets a question and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: any of these resolves to a write, picks one of two same-title tasks,
    // or a forged operation is accepted under the unclear message.
    const a = await newAccount('ben');
    const one = await existingCustomTask(a, 'Visit the library');
    await existingCustomTask(a, 'Visit the library');
    const phone = await existingCustomTask(a, 'Get a phone plan');
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    const cases: [string, string][] = [
      ['Rename task "Visit the library" to "Get a library card"', 'task_ambiguous'],
      ['Rename task "Get a bus pass" to "Get a transit pass"', 'task_not_found'],
      ['Set priority of task "Get a phone plan" to Urgent', 'invalid_value'],
      ['Mark task "Get a phone plan" as almost done', 'invalid_value'],
      ['Set priority of task "Get a phone plan" to Do soon', 'no_change'],
      ['Mark task "Get a phone plan" as not started', 'no_change'],
      ['Rename task "Get a phone plan" to ""', 'missing_value'],
      [`Rename task "Get a phone plan" to "${'x'.repeat(201)}"`, 'value_too_long'],
      ['Rename task "Get a phone plan" to "A"\nMark task "Get a phone plan" as completed', 'multiple_changes'],
    ];
    for (const [text, reason] of cases) {
      const message_id = await messageIn(a, conversationRow, 'user', text);
      const i = await interpret(a, message_id);
      assertEquals(i.status, 200, JSON.stringify(i.json));
      assertEquals([i.json.command.kind, i.json.command.reason], ['clarify', reason], text);
      const forged = await apply(a, [{ type: 'task.edit_details', task_ref: phone.ref, expected_revision: 1, title: 'Forged' }],
        { authorization: command(message_id) });
      assertEquals(forged.status, 403, `${text} -> ${JSON.stringify(forged.json)}`);
    }
    const ambiguous = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "visit the  library" as completed'));
    assertEquals(ambiguous.json.command.candidates.map((c: { title: string }) => c.title), ['Visit the library', 'Visit the library']);
    assertEquals((await row(a, one.id)).completed, false);
    assertEquals((await row(a, phone.id)).title, 'Get a phone plan');
    // Ordinary questions are not commands.
    const q = await interpret(a, await messageIn(a, conversationRow, 'user', 'How do I rename a task?'));
    assertEquals(q.json.command, { kind: 'none' });
  },
});

// #365 review S365-001 (red first): a quoted value must not run into a second command.
Deno.test({
  name: 'a command line with more quoted text than one change uses asks one change at a time and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: interpret returns an edit for any of these, the change the earlier grammar
    // read (Phone renamed to the rest of the line) or any other operation is accepted
    // under the message, or either task changes. The plain command after them still works.
    const a = await newAccount('quotes');
    const phone = await existingCustomTask(a, 'Phone');
    const bank = await existingCustomTask(a, 'Bank');
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    const cases: [string, Record<string, unknown>][] = [
      ['Rename task "Phone" to "Mobile" and rename task "Bank" to "Credit union"',
        { title: 'Mobile" and rename task "Bank" to "Credit union' }],
      ['Set description of task "Phone" to "Compare carriers" and rename task "Bank" to "Credit union"',
        { description: 'Compare carriers" and rename task "Bank" to "Credit union' }],
      ['Renomme la tâche « Phone » en « Mobile » et renomme la tâche « Bank » en « Credit union »',
        { title: 'Mobile » et renomme la tâche « Bank » en « Credit union' }],
      ['Rename task "Phone "Rogers"" to "Mobile"', { title: 'Mobile' }],
    ];
    for (const [text, forged] of cases) {
      const message_id = await messageIn(a, conversationRow, 'user', text);
      const i = await interpret(a, message_id);
      assertEquals(i.status, 200, JSON.stringify(i.json));
      assertEquals([i.json.command.kind, i.json.command.reason], ['clarify', 'multiple_changes'], text);
      for (const op of [
        { type: 'task.edit_details', task_ref: phone.ref, expected_revision: 1, ...forged },
        { type: 'task.edit_details', task_ref: phone.ref, expected_revision: 1, title: 'Mobile' },
      ]) {
        const r = await apply(a, [op], { authorization: command(message_id) });
        assertEquals(r.status, 403, `${text} -> ${JSON.stringify(op)} -> ${JSON.stringify(r.json)}`);
      }
    }
    // A waiting reason runs to the end of the line, so a second command in it is the
    // same defect: the reason would be saved as the rest of the message.
    const reason = await messageIn(a, conversationRow, 'user',
      'Mark task "Phone" as waiting: letter and rename task "Bank" to "Credit union"');
    const ri = await interpret(a, reason);
    assertEquals([ri.json.command.kind, ri.json.command.reason], ['clarify', 'multiple_changes']);
    const forgedReason = await apply(a, [setState(phone.ref, 'waiting', 1, 'letter and rename task "Bank" to "Credit union"')],
      { authorization: command(reason) });
    assertEquals(forgedReason.status, 403, JSON.stringify(forgedReason.json));
    for (const t of [phone, bank]) {
      const r = await row(a, t.id);
      assertEquals([r.revision, r.progress_state], [1, null], `${t.ref} changed`);
    }
    assertEquals([(await row(a, phone.id)).title, (await row(a, bank.id)).title], ['Phone', 'Bank']);
    // Positive controls: one plain quoted change per message still applies exactly.
    const ok = await run(a, conversationRow, 'Rename task "Phone" to "Mobile"');
    assertEquals(ok.a?.status, 200, JSON.stringify(ok.i.json));
    const okReason = await run(a, conversationRow, 'Mark task "Bank" as waiting: Letter from the bank');
    assertEquals(okReason.a?.status, 200, JSON.stringify(okReason.i.json));
    assertEquals([(await row(a, phone.id)).title, (await row(a, bank.id)).waiting_reason], ['Mobile', 'Letter from the bank']);
  },
});

Deno.test({
  name: 'a command never names a task it cannot see: published tasks unread, another account, an assistant message',
  ...testOpts,
  fn: async () => {
    // Wrong if: a command resolves while the account's published tasks could not be read
    // (a same-title published task may exist), matches another account's task, or an
    // assistant message authorizes a write.
    const a = await newAccount('cal');
    const b = await newAccount('dee');
    const mine = await existingCustomTask(a, 'Get a phone plan');
    await existingCustomTask(b, 'Open a bank account');
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    const theirs = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Open a bank account" as completed'));
    assertEquals([theirs.json.command.kind, theirs.json.command.reason], ['clarify', 'task_not_found']);
    const assistant = await messageIn(a, conversationRow, 'assistant', 'Mark task "Get a phone plan" as completed');
    const fromAssistant = await interpret(a, assistant);
    assertEquals(fromAssistant.status, 404, JSON.stringify(fromAssistant.json));
    const forged = await apply(a, [setState(mine.ref, 'completed', 1)], { authorization: command(assistant) });
    assertEquals(forged.status, 403, JSON.stringify(forged.json));
    // This account has a persona and stage, so published tasks may exist; this stack has
    // no published content configured, so no title is certain.
    await setProfile(a, { persona: 'pr', stage: 1, province: 'British Columbia' });
    const unread = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as completed'));
    assertEquals([unread.json.command.kind, unread.json.command.reason], ['clarify', 'tasks_unavailable']);
    assertEquals((await row(a, mine.id)).completed, false);
  },
});

Deno.test({
  name: 'naming Waiting keeps the reason a waiting task has, and a change in between is a conflict',
  ...testOpts,
  fn: async () => {
    // Wrong if: "mark as waiting" erases a saved reason, or a command applies over a newer
    // change made after it was read (and then cannot be used again once re-read).
    const a = await newAccount('eli');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    await apply(a, [setState(ref, 'in_progress', 1)]);
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    const r1 = await run(a, conversationRow, 'Mark task "Get a phone plan" as waiting: Store closed');
    assertEquals(r1.a?.status, 200, JSON.stringify(r1.a?.json));
    await apply(a, [setState(ref, 'in_progress', 3)]);
    await apply(a, [setState(ref, 'waiting', 4, 'Store closed until Monday')]);
    const r2 = await run(a, conversationRow, 'Set priority of task "Get a phone plan" to Do now');
    assertEquals(r2.a?.status, 200);
    const t = await taskOf(a, ref);
    assertEquals([t.state, t.waiting_reason], ['waiting', 'Store closed until Monday']);
    const keep = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as waiting'));
    assertEquals(keep.json.command.reason, 'no_change', 'naming Waiting would change the saved reason');

    const message_id = await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as completed');
    const i = await interpret(a, message_id);
    await a.client.from('custom_checklist_tasks').update({ description: 'Bring ID' }).eq('id', id);
    const late = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals([late.status, late.json.error], [409, 'revision_conflict'], JSON.stringify(late.json));
    assertEquals((await row(a, id)).completed, false);
    const reread = await interpret(a, message_id);
    const ok = await apply(a, [reread.json.command.operation], { authorization: command(message_id) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals((await row(a, id)).completed, true);
  },
});

// #365 review S365-002 (red first): a reason change is a saved change the receipt names.
Deno.test({
  name: 'a waiting reason change names both reasons in its receipt, kept after a later edit and through lookup, replay and Undo',
  ...testOpts,
  fn: async () => {
    // Wrong if: a receipt that changed the reason does not name the reason before and
    // after, a later change, Undo, the conversation read, lookup or replay shows other
    // reasons than the ones saved, or a receipt saved without them gains invented ones.
    const a = await newAccount('reasons');
    const { ref } = await existingCustomTask(a, 'Phone');
    const { conversation_id, conversationRow } = await conversationWith(a, 'user', 'hello');
    const reasons = (r: Record<string, unknown>) => [r.before_waiting_reason, r.after_waiting_reason];
    const friday = await run(a, conversationRow, 'Mark task "Phone" as waiting: Appointment on Friday');
    assertEquals(friday.a?.status, 200, JSON.stringify(friday.a?.json));
    assertEquals(reasons(friday.a!.json.receipt), [null, 'Appointment on Friday']);
    const monday = await run(a, conversationRow, 'Mark task "Phone" as waiting: Appointment on Monday');
    assertEquals(monday.a?.status, 200, JSON.stringify(monday.a?.json));
    const saved = monday.a!.json;
    assertEquals([saved.receipt.before_state, saved.receipt.after_state], ['waiting', 'waiting']);
    assertEquals(reasons(saved.receipt), ['Appointment on Friday', 'Appointment on Monday']);
    // Replay and lookup return the recorded reasons.
    const replay = await apply(a, [monday.i.json.command.operation],
      { operation_id: saved.operation_id, authorization: command(monday.message_id) });
    assertEquals([replay.json.replayed, ...reasons(replay.json.receipt)], [true, 'Appointment on Friday', 'Appointment on Monday']);
    assertEquals(reasons((await status(a, saved.operation_id)).json.receipt), ['Appointment on Friday', 'Appointment on Monday']);
    // Undo restores Friday and its receipt says so.
    const undone = await undo(a, saved.operation_id);
    assertEquals(undone.status, 200, JSON.stringify(undone.json));
    assertEquals(reasons(undone.json.receipt), ['Appointment on Monday', 'Appointment on Friday']);
    assertEquals((await taskOf(a, ref)).waiting_reason, 'Appointment on Friday');
    // A later change: the earlier receipts keep their reasons and become history.
    await apply(a, [setState(ref, 'in_progress', undone.json.receipt.after_revision)]);
    const c = await conversationActions(a, conversation_id);
    const byMessage = new Map(c.json.commands.map((x: { message_id: number; receipt: Record<string, unknown> }) =>
      [x.message_id, x.receipt]));
    const historical = byMessage.get(monday.message_id) as Record<string, unknown>;
    assertEquals([historical.current, ...reasons(historical)], [false, 'Appointment on Friday', 'Appointment on Monday']);
    assertEquals(reasons(byMessage.get(friday.message_id) as Record<string, unknown>), [null, 'Appointment on Friday']);
    // A receipt saved before reasons were recorded keeps no reason fields at all.
    await sql`update public.companion_action_receipts
      set outcome = jsonb_set(outcome, '{results,0}', (outcome->'results'->0) - 'before_waiting_reason' - 'after_waiting_reason')
      where operation_id = ${friday.a!.json.operation_id}::uuid`;
    const legacy = (await status(a, friday.a!.json.operation_id)).json.receipt;
    assertEquals(['before_waiting_reason' in legacy, 'after_waiting_reason' in legacy], [false, false]);
    assertEquals([legacy.before_state, legacy.after_state], ['not_started', 'waiting']);
  },
});

// Written after the command path existed (regression of the lost-reply rule, not red-first).
Deno.test({
  name: 'a retry of a committed rename command replays its result instead of refusing or writing again',
  ...testOpts,
  fn: async () => {
    // Wrong if: the retry (same operation id, reply lost after commit) is refused because
    // the message no longer resolves (the task was renamed), or writes a second time.
    const a = await newAccount('fin');
    const { id } = await existingCustomTask(a, 'Get a phone plan');
    const { message_id } = await conversationWith(a, 'user', 'Rename task "Get a phone plan" to "Phone plan"');
    const i = await interpret(a, message_id);
    const operation_id = crypto.randomUUID();
    const first = await apply(a, [i.json.command.operation], { operation_id, authorization: command(message_id) });
    assertEquals(first.status, 200, JSON.stringify(first.json));
    const retry = await apply(a, [i.json.command.operation], { operation_id, authorization: command(message_id) });
    assertEquals([retry.status, retry.json.replayed, retry.json.receipt.operation_id], [200, true, operation_id]);
    const r = await row(a, id);
    assertEquals([r.title, r.revision], ['Phone plan', 2]);
  },
});

// Written after the grammar (a check of the label tables against both locale files).
Deno.test({
  name: 'every priority label the mobile or web Checklist shows, in every language, names that priority',
  ...testOpts,
  fn: async () => {
    // Wrong if: a label a user can read on either platform is not understood, or maps
    // to another priority. The labels are read from both apps' locale files.
    const CANON: Record<string, string> = { doNow: 'Do now', doSoon: 'Do soon', exploreAndConnect: 'Explore and connect', optionalLater: 'Optional / later' };
    const WEB: Record<string, string> = { priorityDoNow: 'Do now', priorityDoSoon: 'Do soon', priorityExploreConnect: 'Explore and connect', priorityOptionalLater: 'Optional / later' };
    const mobileRoot = Deno.env.get('ACTIONS_MOBILE_LOCALES');
    const webRoot = new URL('../../../lib/i18n/locales/', import.meta.url);
    const a = await newAccount('labels');
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    await existingCustomTask(a, 'Phone');
    const TEMPLATE: Record<string, (label: string) => string> = {
      en: l => `Set priority of task "Phone" to ${l}`,
      'fr-CA': l => `Mets la priorité de la tâche « Phone » à ${l}`,
      es: l => `Pon la prioridad de la tarea "Phone" en ${l}`,
      vi: l => `Đặt mức ưu tiên của việc "Phone" là ${l}`,
      hi: l => `कार्य "Phone" की प्राथमिकता ${l} करें`,
      pa: l => `ਕੰਮ "Phone" ਦੀ ਤਰਜੀਹ ${l} ਕਰੋ`,
      ar: l => `اجعل أولوية المهمة "Phone" ${l}`,
    };
    for (const lang of Object.keys(TEMPLATE)) {
      const labels: [string, string][] = [];
      const web = JSON.parse(await Deno.readTextFile(new URL(`${lang}/translation.json`, webRoot))).checklist.createItem;
      for (const [k, v] of Object.entries(WEB)) labels.push([web[k], v]);
      if (mobileRoot) {
        const mobile = JSON.parse(await Deno.readTextFile(`${mobileRoot}/${lang}/translation.json`)).checklist.priority;
        for (const [k, v] of Object.entries(CANON)) labels.push([mobile[k], v]);
      }
      for (const [label, priority] of labels) {
        const i = await interpret(a, await messageIn(a, conversationRow, 'user', TEMPLATE[lang](label)));
        const expected = priority === 'Do soon' ? ['clarify', 'no_change'] : ['edit', priority];
        const got = i.json.command.kind === 'edit'
          ? ['edit', i.json.command.operation.priority]
          : [i.json.command.kind, i.json.command.reason];
        assertEquals(got, expected, `${lang} "${label}"`);
      }
    }
  },
});

// Written after the code: binds the database's single use of a command message, which
// the handler's own check and the revision check otherwise shadow over HTTP.
Deno.test({
  name: 'the database refuses a second write under one command message even at the current revision',
  ...testOpts,
  fn: async () => {
    // Wrong if: a second operation under a used message writes when it names the
    // task's current revision (a caller that bypasses the handler's check).
    const { sql } = await import('./support.ts');
    const a = await newAccount('gil');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const { message_id } = await conversationWith(a, 'user', 'Mark task "Get a phone plan" as in progress');
    const call = (operation_id: string, revision: number) => sql`select public.companion_apply_actions(
      ${a.id}::uuid, ${operation_id}::uuid, 1,
      ${sql.json({ kind: 'direct_command', message_id })}::jsonb,
      ${sql.json([setState(ref, 'in_progress', revision)])}::jsonb) as r`;
    await call(crypto.randomUUID(), 1);
    let error = '';
    try {
      await call(crypto.randomUUID(), 2);
    } catch (e) {
      error = (e as { message?: string }).message ?? String(e);
    }
    assertEquals(error, 'command_already_used');
    assertEquals((await row(a, id)).revision, 2);
  },
});

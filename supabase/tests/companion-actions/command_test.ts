// Direct create commands (mobile-app#363) through the public request boundary. A clear
// command in the user's own saved message authorizes exactly the change it resolves
// to, once. Anything unclear asks a question and writes nothing. Each test names the
// observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, checklistTitles, conversationWith, createTask, existingCustomTask, interpret, messageIn, newAccount,
  ready, sql, testOpts, uuid, waitForBlocked,
} from './support.ts';

await ready();

const command = (message_id: number) => ({ kind: 'direct_command', message_id });

Deno.test({
  name: 'a clear command adds exactly the task it names, once, however often it is sent',
  ...testOpts,
  fn: async () => {
    // Wrong if: the resolved title differs from the message, a different title or
    // priority is accepted under the command, or one message adds two tasks.
    const a = await newAccount('ana');
    const { message_id } = await conversationWith(a, 'user', 'Add a task: Set up phone service');
    const i = await interpret(a, message_id);
    assertEquals(i.status, 200, JSON.stringify(i.json));
    assertEquals(i.json.command, {
      kind: 'create',
      operation: { type: 'task.create_custom', title: 'Set up phone service', priority: 'Do soon' },
      same_title_tasks: [],
    });
    assertEquals(await checklistTitles(a), [], 'interpreting wrote a task');

    for (const wrong of [createTask('Set up internet service'), createTask('Set up phone service', 'Do now')]) {
      const r = await apply(a, [wrong], { authorization: command(message_id) });
      assertEquals(r.status, 403, `${JSON.stringify(wrong)} -> ${JSON.stringify(r.json)}`);
    }
    const ok = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals([ok.json.receipt.operation_type, ok.json.receipt.title], ['task.create_custom', 'Set up phone service']);
    const again = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals([again.status, again.json.error], [409, 'command_already_used']);
    assertEquals(await checklistTitles(a), ['Set up phone service']);
  },
});

Deno.test({
  name: 'two operations racing on one command message, released together from a held use, add one task',
  ...testOpts,
  fn: async () => {
    // Wrong if: both operation ids write.
    const a = await newAccount('ben');
    const { message_id } = await conversationWith(a, 'user', 'Create task: Buy a transit pass');
    const op = createTask('Buy a transit pass');
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    let markReady!: () => void;
    const lockReady = new Promise<void>(r => (markReady = r));
    // A separate connection holds the message's use without committing, then gives it up.
    let holdFailed: unknown = null;
    const holder = sql.begin(async t => {
      await t`insert into companion_command_uses (user_id, message_id, operation_id) values (${a.id}, ${message_id}, ${uuid()})`;
      markReady();
      await held;
      throw new Error('roll back the held use');
    }).catch(e => {
      if (!(e instanceof Error && e.message === 'roll back the held use')) holdFailed = e;
      markReady();
    });
    await lockReady;
    // A hold that could not be taken is a failed precondition, not a result.
    assertEquals(holdFailed, null, `could not hold the command use: ${holdFailed}`);
    const first = apply(a, [op], { authorization: command(message_id) });
    const second = apply(a, [op], { authorization: command(message_id) });
    assertEquals(await waitForBlocked(2, '%companion_apply_actions%'), 2, 'both must wait on the held use');
    release();
    await holder;
    const results = await Promise.all([first, second]);
    assertEquals(results.map(r => r.status).sort(), [200, 409], JSON.stringify(results.map(r => r.json)));
    assertEquals(await checklistTitles(a), ['Buy a transit pass']);
  },
});

Deno.test({
  name: 'unclear requests are answered with a question and authorize nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: any of these writes a task or reads as a clear command.
    const a = await newAccount('cy');
    const cases: Array<[string, unknown]> = [
      ['Add a task', { kind: 'clarify', reason: 'missing_title' }],
      ['Add task:   ', { kind: 'clarify', reason: 'missing_title' }],
      ['Add task: Get a SIN\nAdd task: Open a bank account', { kind: 'clarify', reason: 'multiple' }],
      [`Add task: ${'x'.repeat(201)}`, { kind: 'clarify', reason: 'too_long' }],
      ['Can you help me with a phone plan?', { kind: 'none' }],
      ['I should probably add a task about phones', { kind: 'none' }],
    ];
    for (const [text, expected] of cases) {
      const { message_id } = await conversationWith(a, 'user', text);
      const i = await interpret(a, message_id);
      assertEquals([i.status, i.json.command], [200, expected], text);
      const r = await apply(a, [createTask('Get a phone plan')], { authorization: command(message_id) });
      assertEquals(r.status, 403, `${text} -> ${JSON.stringify(r.json)}`);
    }
    assertEquals(await checklistTitles(a), []);
  },
});

Deno.test({
  name: 'a command naming a task that already exists asks which is meant and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: a second task with the same title is added without review.
    const a = await newAccount('dee');
    const existing = await existingCustomTask(a, 'Set up phone service');
    const { message_id } = await conversationWith(a, 'user', 'add a task: set up phone service');
    const i = await interpret(a, message_id);
    assertEquals(i.json.command.kind, 'create');
    assertEquals(i.json.command.same_title_tasks.map((t: any) => t.task_ref), [existing.ref]);
    const r = await apply(a, [i.json.command.operation], { authorization: command(message_id) });
    assertEquals([r.status, r.json.error], [409, 'needs_clarification']);
    assertEquals(await checklistTitles(a), ['Set up phone service']);
  },
});

Deno.test({
  name: 'only the caller\'s own user message is command evidence',
  ...testOpts,
  fn: async () => {
    // Wrong if: the assistant's text, another account's message or an unknown id authorizes a write.
    const a = await newAccount('eve');
    const b = await newAccount('fay');
    const op = createTask('Set up phone service');
    const assistant = await conversationWith(a, 'assistant', 'Add a task: Set up phone service');
    const theirs = await conversationWith(b, 'user', 'Add a task: Set up phone service');
    const mine = await conversationWith(a, 'user', 'Hello');
    const pasted = await messageIn(a, mine.conversationRow, 'user', 'Add a task: Set up phone service');

    assertEquals((await interpret(a, assistant.message_id)).status, 404);
    assertEquals((await interpret(a, theirs.message_id)).status, 404);
    for (const evidence of [
      command(assistant.message_id), command(theirs.message_id), command(2_000_000_000),
      { kind: 'direct_command', message_id: pasted, approved: true },
      { kind: 'direct_command', message_id: String(pasted) },
      { kind: 'direct_command' },
    ]) {
      const r = await apply(a, [op], { authorization: evidence });
      assertEquals(r.status, 403, `${JSON.stringify(evidence)} -> ${JSON.stringify(r.json)}`);
    }
    assertEquals(await checklistTitles(a), []);
    assertEquals(await checklistTitles(b), []);
    // The user's own command still works afterwards.
    assertEquals((await apply(a, [op], { authorization: command(pasted) })).status, 200);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });

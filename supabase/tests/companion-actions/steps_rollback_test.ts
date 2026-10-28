// Rollback and re-application of the #366 step migration, through the public boundary.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  API_URL, apply, approved, existingCustomTask, migrate366, newAccount, openGate, prepare, read, ready, setState, sql,
  startContentStub, status, stepCreate, stepDone, stepsOf, taskOf, testOpts, undo, waitForSchemaCache,
} from './support.ts';

await ready();
startContentStub();

Deno.test({
  name: 'the #366 rollback waits for the step RPC to leave the cache while plan setup accepts installed steps',
  ...testOpts,
  fn: async () => {
    // Wrong if rollback finishes while its last schema response still lists the step RPC.
    const originalFetch = globalThis.fetch;
    const base = ['/companion_feature_gate', '/rpc/companion_apply_actions',
      '/rpc/companion_prepare_proposal', '/rpc/companion_plan_prepare'];
    const response = (steps: boolean) => Response.json({ paths: Object.fromEntries(
      [...base, ...(steps ? ['/rpc/companion_read_steps'] : [])].map(path => [path, {}]),
    ) });
    let rollback = false;
    let freshCacheRead = false;
    let reads = 0;
    globalThis.fetch = (input, init) => {
      if (String(input) !== `${API_URL}/rest/v1/`) return originalFetch(input, init);
      if (!rollback) return Promise.resolve(response(true));
      reads++;
      freshCacheRead = reads > 1;
      return Promise.resolve(response(!freshCacheRead));
    };
    try {
      // The general plan setup wait must still accept a schema with installed steps.
      await waitForSchemaCache('up364', 500);
      rollback = true;
      await migrate366('down');
      assertEquals(freshCacheRead, true, 'rollback accepted the cache that still lists the step RPC');
    } finally {
      globalThis.fetch = originalFetch;
      await migrate366('up');
      await openGate();
    }
  },
});

Deno.test({
  name: 'rolling back #366 keeps every saved step and the #363 actions; re-applying restores step receipts and re-reviews drafts',
  ...testOpts,
  fn: async () => {
    // Wrong if: the rollback deletes or changes a step, breaks the task read or task
    // controls, lets a step operation through the #363 registry, or the re-application
    // loses a step receipt, its Undo, or lets an approval captured before the rollback apply.
    const a = await newAccount('steps-rollback');
    const task = await existingCustomTask(a, 'Open a bank account');
    const add = await apply(a, [stepCreate(task.ref, ['Choose a bank'])]);
    const s = add.json.receipt.steps[0];
    const done = await apply(a, [stepDone(s.step_id, true, s.after_revision)]);
    assertEquals(done.status, 200, JSON.stringify(done.json));
    const draft = (await prepare(a, stepCreate(task.ref, ['Bring two IDs']))).json.proposal;
    const [before] = await sql`select title, completed, revision, removed_at from companion_task_steps where id = ${s.step_id}`;

    await migrate366('down');
    await openGate();
    const r = await read(a);
    assertEquals(r.status, 200, JSON.stringify(r.json));
    assertEquals(r.json.steps, undefined);
    const t = r.json.tasks.find((x: { task_ref: string }) => x.task_ref === task.ref);
    assertEquals(t.last_receipt, null, 'a #363 read showed a step receipt');
    const refused = await apply(a, [stepCreate(task.ref, ['While rolled back'])]);
    assertEquals(refused.status, 422, JSON.stringify(refused.json));
    const state = await apply(a, [setState(task.ref, 'in_progress', t.revision)]);
    assertEquals(state.status, 200, JSON.stringify(state.json));
    const [during] = await sql`select title, completed, revision, removed_at from companion_task_steps where id = ${s.step_id}`;
    assertEquals(during, before);

    await migrate366('up');
    await openGate();
    assertEquals((await stepsOf(a, task.ref)).map(x => [x.title, x.done]), [['Choose a bank', true]]);
    const looked = await status(a, done.json.operation_id);
    assertEquals([looked.json.status, looked.json.receipt.operation_type], ['applied', 'step.set_done']);
    const u = await undo(a, done.json.operation_id);
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals((await stepsOf(a, task.ref))[0].done, false);
    // The parent's newer state change while rolled back is still its last receipt.
    assertEquals((await taskOf(a, task.ref)).last_receipt.operation_id, state.json.operation_id);

    const old = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(old.status, 403, 'an approval captured before the rollback applied');
    const restored = await sql`select revision, review_reason from companion_proposals where id = ${draft.proposal_id}`;
    assertEquals([restored[0].revision, restored[0].review_reason], [2, 'restored']);
    const ok = await apply(a, draft.operations, { authorization: approved({ ...draft, proposal_revision: 2 }) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals((await stepsOf(a, task.ref)).map(x => x.title), ['Choose a bank', 'Bring two IDs']);
  },
});

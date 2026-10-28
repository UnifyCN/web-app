// #366 F1: a step write and a legacy client's change of the same content-backed parent.
//
// A content-backed task (`sanity:<id>`) may have no progress row yet. Older clients
// complete or dismiss it with an INSERT ... ON CONFLICT upsert, or change an existing
// row with a plain UPDATE (the released request shapes below). A step write must be
// ordered with those writes: either the step commits first (it then stays as history of
// the completed/removed task) or the parent change commits first (the step write is
// refused). The falsifier: the parent change is committed and publicly read with no
// step, and a step write is saved afterwards.
//
// The tests hold the parent's step lock (the key the action service uses for this
// parent) and, to stop the step write after its parent check, a SHARE lock on the step
// table. Requests run concurrently through the public endpoint and PostgREST with the
// user's JWT; pg_stat_activity shows where each one waits. A legacy write that waits
// behind the step is started without being awaited, so a correct ordering cannot hang
// the test.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, apply, migrate366, newAccount, openGate, read, ready, sql, startContentStub, stepCreate, stepDone,
  testOpts,
} from './support.ts';

await ready();
startContentStub();

const SIN = 'sin-number';
const REF = `sanity:${SIN}`;

type Mode = 'completion' | 'dismissal';
// Reply order is not commit order (PostgREST answers in fewer hops than the edge function),
// so ordering is shown by where each request waits, never by which reply arrives first.
type Settled = { status: number; error: unknown };

// Released mobile/web request shapes (services/checklist/setChecklistItemCompletion.ts,
// setChecklistItemDismissed.ts; web services/checklist.ts).
function legacyUpsert(who: Account, mode: Mode, sanityId = SIN): Promise<Settled> {
  const row: Record<string, unknown> = mode === 'completion'
    ? { user_id: who.id, task_id: null, sanity_checklist_id: sanityId, completed: true, completed_at: new Date().toISOString() }
    : { user_id: who.id, sanity_checklist_id: sanityId, dismissed_at: new Date().toISOString() };
  return Promise.resolve(who.client.from('user_tasks').upsert(row, { onConflict: 'user_id,sanity_checklist_id' }))
    .then(r => ({ status: r.status, error: r.error }));
}
// services/checklist/updateTaskCompletion.ts: a plain UPDATE of an existing row.
function legacyUpdateCompleted(who: Account, userTaskId: number): Promise<Settled> {
  return Promise.resolve(who.client.from('user_tasks').update({ completed: true, completed_at: new Date().toISOString() })
    .eq('user_task_id', userTaskId)).then(r => ({ status: r.status, error: r.error }));
}

/** Runs `statement` in a transaction on its own connection and keeps it open until release(). */
function hold(statement: (t: any) => Promise<unknown>) {
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  let acquired!: () => void;
  const ready = new Promise<void>(r => (acquired = r));
  const tx = sql.begin(async t => { await statement(t); acquired(); await held; });
  return { ready, release: async () => { release(); await tx; } };
}
const holdParentLock = (userId: string, ref = REF) =>
  hold(t => t`select pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${ref}::text, 366))`);
const holdStepTable = () => hold(t => t`lock table public.companion_task_steps in share mode`);

/** The lock waits of other backends whose query matches `pattern` (`advisory`, `relation`, ...). */
async function waitsOf(pattern: string): Promise<string[]> {
  const rows = await sql`select wait_event from pg_stat_activity
    where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query ilike ${pattern}`;
  return rows.map(r => r.wait_event as string);
}
const APPLY = '%companion_apply_actions%';
const LEGACY = '%"user_tasks"%';

/** Waits until `pattern` waits on `event` (`*`: any lock), or until `settled` resolves first. Bounded. */
async function blockedOrSettled(pattern: string, event: string, settled?: Promise<unknown>, ms = 5000) {
  let done = false;
  settled?.then(() => (done = true));
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const waits = await waitsOf(pattern);
    if (event === '*' ? waits.length > 0 : waits.includes(event)) return 'blocked' as const;
    if (done) return 'settled' as const;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`neither waiting on ${event} nor settled: ${pattern}`);
}

function parentOf(json: any, ref = REF) {
  return json.tasks.find((t: { task_ref: string }) => t.task_ref === ref);
}
const changed = (mode: Mode, parent: any) =>
  parent !== undefined && (mode === 'completion' ? parent.state === 'completed' : parent.removed === true);

for (const mode of ['completion', 'dismissal'] as Mode[]) {
  Deno.test({
    name: `absent progress row: a legacy ${mode} and a held step add are ordered; the parent change never precedes a saved step`,
    ...testOpts,
    fn: async () => {
      const who = await newAccount(`race-add-${mode}`);
      const before = await read(who);
      assertEquals(before.status, 200);
      assertEquals(before.json.steps, []);
      assertEquals(parentOf(before.json), undefined, 'the account starts without a progress row');

      const parentLock = holdParentLock(who.id);
      await parentLock.ready;
      const stepTable = holdStepTable();
      await stepTable.ready;
      let releasedParent = false, releasedTable = false;
      try {
        const step = apply(who, [stepCreate(REF, [`held ${mode} step`])]);
        assertEquals(await blockedOrSettled(APPLY, 'advisory', step), 'blocked', 'the step add reaches the parent lock');
        const legacy = legacyUpsert(who, mode);
        const legacyFirst = await blockedOrSettled(LEGACY, 'advisory', legacy);
        const mid1 = await read(who);
        assertEquals(mid1.status, 200);

        // The step add takes the parent lock first; its insert then waits on the table lock.
        await parentLock.release(); releasedParent = true;
        assertEquals(await blockedOrSettled(APPLY, 'relation', step), 'blocked', 'the step add passed its parent check');
        const legacyWhileStepHeld = (await waitsOf(LEGACY));
        const mid2 = await read(who);
        assertEquals(mid2.status, 200);
        await stepTable.release(); releasedTable = true;

        const [s, l] = await Promise.all([step, legacy]);
        const after = await read(who);
        const parent = parentOf(after.json);
        console.log(JSON.stringify({ mode, legacyFirst, legacyWhileStepHeld, mid1: mid1.json, mid2: mid2.json,
          step: { status: s.status, json: s.json }, legacy: l, after: after.json }));

        // Falsifier (review F1): the parent change committed and read with no step, then a step saved.
        for (const mid of [mid1, mid2]) {
          if (changed(mode, parentOf(mid.json)) && mid.json.steps.length === 0) {
            assertEquals(s.status, 422, `a step was saved after the ${mode} was committed and publicly read without it`);
          }
        }
        // Both writes finish: the legacy write is not lost or deadlocked.
        assertEquals(l.error, null);
        assertEquals(l.status, 201);
        assert(changed(mode, parent), `the ${mode} is saved`);
        assertEquals(parent.revision, 1, 'the step add did not change the parent revision');
        // The legacy write waited behind the step that already held the parent: the step is history.
        assertEquals(legacyFirst, 'blocked', 'the legacy write waits for the parent lock');
        assertEquals(legacyWhileStepHeld, ['advisory'], 'the legacy write still waits while the step add holds the parent');
        for (const mid of [mid1, mid2]) {
          assert(!changed(mode, parentOf(mid.json)), 'no parent change is visible before the step commits');
          assertEquals(mid.json.steps, []);
        }
        assertEquals(s.status, 200);
        assertEquals([s.json.receipt.before_state, s.json.receipt.after_state], ['not_started', 'not_started']);
        assertEquals(after.json.steps.map((x: any) => [x.title, x.done]), [[`held ${mode} step`, false]]);
      } finally {
        if (!releasedParent) await parentLock.release();
        if (!releasedTable) await stepTable.release();
      }
    },
  });

  Deno.test({
    name: `absent progress row: a legacy ${mode} queued before the step add commits first and the step add is refused`,
    ...testOpts,
    fn: async () => {
      const who = await newAccount(`race-legacy-first-${mode}`);
      const parentLock = holdParentLock(who.id);
      await parentLock.ready;
      let released = false;
      try {
        const legacy = legacyUpsert(who, mode);
        const legacyState = await blockedOrSettled(LEGACY, 'advisory', legacy);
        const step = apply(who, [stepCreate(REF, ['after the parent change'])]);
        const stepState = await blockedOrSettled(APPLY, 'advisory', step);
        const mid = await read(who);
        await parentLock.release(); released = true;
        const [l, s] = await Promise.all([legacy, step]);
        const after = await read(who);
        console.log(JSON.stringify({ mode, legacyState, stepState, mid: mid.json, legacy: l, step: s, after: after.json }));
        assertEquals([l.status, l.error], [201, null]);
        assertEquals([s.status, s.json.reason], [422, mode === 'completion' ? 'task_completed' : 'task_removed']);
        assert(changed(mode, parentOf(after.json)));
        assertEquals(after.json.steps, []);
      } finally {
        if (!released) await parentLock.release();
      }
    },
  });
}

for (const mode of ['completion', 'dismissal'] as Mode[]) {
  Deno.test({
    name: `absent progress row: a legacy ${mode} sent after the step add passed its parent check waits for that step`,
    ...testOpts,
    fn: async () => {
      // Wrong if: the legacy write commits while the step add is between its parent check
      // and its insert, and the step is still saved.
      const who = await newAccount(`race-late-${mode}`);
      const stepTable = holdStepTable();
      await stepTable.ready;
      let released = false;
      try {
        const step = apply(who, [stepCreate(REF, [`late ${mode} step`])]);
        assertEquals(await blockedOrSettled(APPLY, 'relation', step), 'blocked', 'the step add passed its parent check');
        const legacy = legacyUpsert(who, mode);
        const legacyState = await blockedOrSettled(LEGACY, 'advisory', legacy);
        const mid = await read(who);
        await stepTable.release(); released = true;
        const [s, l] = await Promise.all([step, legacy]);
        const after = await read(who);
        console.log(JSON.stringify({ mode, legacyState, mid: mid.json, step: { status: s.status, json: s.json }, legacy: l,
          after: after.json }));
        if (changed(mode, parentOf(mid.json)) && mid.json.steps.length === 0) {
          assertEquals(s.status, 422, `a step was saved after the ${mode} was committed and publicly read without it`);
        }
        assertEquals([l.status, l.error], [201, null]);
        assertEquals(legacyState, 'blocked', 'the legacy write waits for the step add');
        assertEquals(s.status, 200);
        assert(changed(mode, parentOf(after.json)));
        assertEquals(after.json.steps.map((x: any) => x.title), [`late ${mode} step`]);
      } finally {
        if (!released) await stepTable.release();
      }
    },
  });
}

Deno.test({
  name: 'absent progress row: a held step check and a legacy completion are ordered; no step changes after a completion is read',
  ...testOpts,
  fn: async () => {
    const who = await newAccount('race-check');
    const added = await apply(who, [stepCreate(REF, ['check me'])]);
    assertEquals(added.status, 200);
    const stepId = added.json.receipt.steps[0].step_id;
    assertEquals(parentOf((await read(who)).json), undefined, 'still no progress row');

    const parentLock = holdParentLock(who.id);
    await parentLock.ready;
    const stepTable = holdStepTable();
    await stepTable.ready;
    let releasedParent = false, releasedTable = false;
    try {
      // The check takes its step row, then the parent; it waits on whichever lock it meets first.
      const check = apply(who, [stepDone(stepId, true, 1)]);
      const checkState = (await blockedOrSettled(APPLY, 'advisory', check, 1500).catch(() => 'not advisory'));
      const legacy = legacyUpsert(who, 'completion');
      const legacyFirst = await blockedOrSettled(LEGACY, 'advisory', legacy);
      const mid1 = await read(who);
      await parentLock.release(); releasedParent = true;
      assertEquals(await blockedOrSettled(APPLY, 'relation', check), 'blocked', 'the check passed its parent check');
      const legacyWhileCheckHeld = await waitsOf(LEGACY);
      const mid2 = await read(who);
      await stepTable.release(); releasedTable = true;
      const [c, l] = await Promise.all([check, legacy]);
      const after = await read(who);
      console.log(JSON.stringify({ checkState, legacyFirst, legacyWhileCheckHeld, mid1: mid1.json, mid2: mid2.json, check: c, legacy: l, after: after.json }));

      for (const mid of [mid1, mid2]) {
        if (changed('completion', parentOf(mid.json))) {
          assertEquals(mid.json.steps.map((x: any) => x.done), [false]);
          assertEquals(c.status, 422, 'a step was checked after the completion was committed and publicly read');
        }
      }
      assertEquals([l.status, l.error], [201, null]);
      assertEquals(legacyFirst, 'blocked', 'the legacy completion waits for the parent lock');
      assertEquals(c.status, 200);
      assertEquals(legacyWhileCheckHeld, ['advisory'], 'the legacy completion still waits while the check holds the parent');
      assertEquals(parentOf(after.json).state, 'completed');
      assertEquals(after.json.steps.map((x: any) => x.done), [true]);
    } finally {
      if (!releasedParent) await parentLock.release();
      if (!releasedTable) await stepTable.release();
    }
  },
});

Deno.test({
  name: 'existing progress row: legacy upsert and plain UPDATE completions are ordered with a held step add',
  ...testOpts,
  fn: async () => {
    for (const shape of ['upsert', 'update'] as const) {
      const who = await newAccount(`race-existing-${shape}`);
      const seeded = await who.client.from('user_tasks')
        .insert({ user_id: who.id, task_id: null, sanity_checklist_id: SIN, completed: false })
        .select('user_task_id').single();
      assertEquals(seeded.error, null);
      const parentLock = holdParentLock(who.id);
      await parentLock.ready;
      const stepTable = holdStepTable();
      await stepTable.ready;
      let released = false, releasedTable = false;
      try {
        const step = apply(who, [stepCreate(REF, [`existing ${shape}`])]);
        await blockedOrSettled(APPLY, '*', step);
        const legacy = shape === 'upsert' ? legacyUpsert(who, 'completion')
          : legacyUpdateCompleted(who, seeded.data!.user_task_id);
        const legacyState = await blockedOrSettled(LEGACY, '*', legacy);
        const mid = await read(who);
        await parentLock.release(); released = true;
        // Either the step add now waits on the table lock after its parent check, or it was refused.
        const stepState = await blockedOrSettled(APPLY, 'relation', step);
        const legacyWhileStepHeld = await waitsOf(LEGACY);
        await stepTable.release(); releasedTable = true;
        const [s, l] = await Promise.all([step, legacy]);
        const after = await read(who);
        console.log(JSON.stringify({ shape, legacyState, stepState, legacyWhileStepHeld, mid: mid.json,
          step: { status: s.status, reason: s.json.reason }, legacy: l, after: after.json }));
        assert([200, 201, 204].includes(l.status), `legacy ${shape} finished: ${l.status}`);
        assertEquals(l.error, null);
        assertEquals(parentOf(after.json).state, 'completed');
        if (changed('completion', parentOf(mid.json))) {
          // The completion was committed and read first: the step add must be refused.
          assertEquals([s.status, s.json.reason], [422, 'task_completed']);
          assertEquals(after.json.steps, []);
        } else {
          // The step add held the parent first, and the completion still waited on it: the step is history.
          assertEquals(stepState, 'blocked');
          assert(legacyWhileStepHeld.length === 1, 'the legacy completion waits behind the step add');
          assertEquals(s.status, 200);
          assertEquals(after.json.steps.length, 1);
        }
      } finally {
        if (!released) await parentLock.release();
        if (!releasedTable) await stepTable.release();
      }
    }
  },
});

Deno.test({
  name: 'independent parents and accounts are not serialized behind a held parent',
  ...testOpts,
  fn: async () => {
    const who = await newAccount('race-independent-a');
    const other = await newAccount('race-independent-b');
    const parentLock = holdParentLock(who.id);
    await parentLock.ready;
    try {
      // Each write targets a parent no other write here changes, so every one must save.
      const results = await Promise.race([
        Promise.all([
          apply(other, [stepCreate(REF, ['other account step'])])
            .then(async s => [s.status, (await legacyUpsert(other, 'completion')).status]),
          apply(who, [stepCreate('sanity:bank-account', ['other task step'])]).then(s => s.status),
          legacyUpsert(who, 'dismissal', 'phone-plan').then(l => l.status),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('blocked behind an unrelated parent')), 5000)),
      ]);
      assertEquals(results, [[200, 201], 200, 201]);
    } finally {
      await parentLock.release();
    }
    // The held parent itself was untouched.
    assertEquals(parentOf((await read(who)).json), undefined);
  },
});

Deno.test({
  name: 'simultaneous unheld step adds and legacy completions on fresh parents end in a legal state without errors',
  ...testOpts,
  fn: async () => {
    const accounts = await Promise.all(Array.from({ length: 8 }, (_, i) => newAccount(`race-burst-${i}`)));
    const outcomes = await Promise.all(accounts.map(async who => {
      const [s, l] = await Promise.all([apply(who, [stepCreate(REF, ['burst step'])]), legacyUpsert(who, 'completion')]);
      const after = await read(who);
      return { s: s.status, reason: s.json.reason, l: l.status, steps: after.json.steps.length, state: parentOf(after.json)?.state };
    }));
    console.log(JSON.stringify(outcomes));
    for (const o of outcomes) {
      assertEquals([o.l, o.state], [201, 'completed']);
      if (o.s === 200) assertEquals(o.steps, 1);
      else assertEquals([o.s, o.reason, o.steps], [422, 'task_completed', 0]);
    }
  },
});

Deno.test({
  name: 'rolling back #366 leaves legacy writes free of the parent lock; re-applying orders them again',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the rollback an older client's completion still waits for (or fails
    // on) step machinery, or after re-application a legacy completion is no longer ordered.
    const who = await newAccount('race-rollback');
    await migrate366('down');
    await openGate();
    try {
      const parentLock = holdParentLock(who.id);
      await parentLock.ready;
      try {
        const legacy = legacyUpsert(who, 'completion');
        assertEquals(await blockedOrSettled(LEGACY, 'advisory', legacy), 'settled', 'rolled back: no step lock');
        assertEquals((await legacy).status, 201);
      } finally {
        await parentLock.release();
      }
    } finally {
      await migrate366('up');
      await openGate();
    }
    const parentLock = holdParentLock(who.id);
    await parentLock.ready;
    let released = false;
    try {
      const dismissal = legacyUpsert(who, 'dismissal');
      assertEquals(await blockedOrSettled(LEGACY, 'advisory', dismissal), 'blocked', 're-applied: ordered again');
      await parentLock.release(); released = true;
      // The row exists now, so the upsert takes its update path (PostgREST answers 200).
      assertEquals([(await dismissal).status, (await dismissal).error], [200, null]);
    } finally {
      if (!released) await parentLock.release();
    }
    const parent = parentOf((await read(who)).json);
    assertEquals([parent.state, parent.removed, parent.revision], ['completed', true, 2]);
  },
});

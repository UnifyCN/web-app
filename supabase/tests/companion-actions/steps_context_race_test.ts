// #366 F3: an approved step proposal and a relevant step change of the same task.
//
// The relevant context of a step proposal is the parent's live steps that have one of the
// suggested titles. A change of that set after review needs a new review, also when it
// commits while the approval is already in flight. The falsifier: a relevant change is
// committed and publicly read while the approval has not finished, and the approval then
// saves its steps without a new review.
//
// Each case holds the parent's step lock from a separate connection, sends the change and
// the approval through the public endpoint with the user's JWT, and reads pg_stat_activity
// to see where each request waits. A second holder queued behind the change keeps the
// approval blocked after the change commits, so a complete public read can show the
// committed change before the approval goes on. Reply arrival order is never used as
// commit order. Waits stay well below the action service's 3 s lock timeout; a 503
// (operation_in_flight) fails the case as incomplete, never as a result.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, apply, approved, confirmedRemoval, existingCustomTask, migrate366, newAccount, openGate, prepare,
  type Reply, ready, sql, startContentStub, stepCreate, stepDone, stepRemove, stepsOf, stepUpdate, testOpts, undo, uuid,
} from './support.ts';

await ready();
startContentStub();

const SANITY_REF = 'sanity:sin-number';
const TITLE = 'Bring two IDs';
const APPLY = '%companion_apply_actions%';
const UNDO = '%companion_undo_action%';
const MIDDLE = '%context_race_middle%';

/** Runs `statement` in a transaction on its own connection and keeps it open until release(). */
function hold(statement: (t: typeof sql) => Promise<unknown>) {
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  let acquired!: () => void;
  const ready = new Promise<void>(r => (acquired = r));
  const tx = sql.begin(async t => { await statement(t as unknown as typeof sql); acquired(); await held; });
  return { ready, release: async () => { release(); await tx; } };
}
const holdParentLock = (userId: string, ref: string) =>
  hold(t => t`select pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${ref}::text, 366))`);
const holdMiddle = (userId: string, ref: string) =>
  hold(t => t`select pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${ref}::text, 366)) /* context_race_middle */`);

/** Lock waits of other backends whose query matches `pattern`. */
async function waitsOf(pattern: string): Promise<string[]> {
  const rows = await sql`select wait_event from pg_stat_activity
    where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query ilike ${pattern}`;
  return rows.map(r => r.wait_event as string);
}

/** Waits until at least `n` requests matching `pattern` wait on a lock, or `settled` resolves first. Bounded. */
async function blockedOrSettled(pattern: string, n: number, settled: Promise<unknown>, ms = 2000) {
  let done = false;
  settled.then(() => (done = true), () => (done = true));
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if ((await waitsOf(pattern)).length >= n) return 'blocked' as const;
    if (done) return 'settled' as const;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(`neither ${n} lock waits nor settled: ${pattern}`);
}

/** Tracks whether a request has answered yet. */
function track(p: Promise<Reply>) {
  const t = { done: false, reply: p };
  p.then(() => (t.done = true), () => (t.done = true));
  return t;
}

function noTimeout(label: string, r: Reply) {
  assert(r.status !== 503, `INCOMPLETE: ${label} hit the lock timeout (${JSON.stringify(r.json)})`);
}

/** Ids of the live steps that have the suggested title: the relevant context. */
type StepRef = { step_id: string };
const matching = (steps: { title: string; step_id: string }[]) => steps.filter(s => s.title === TITLE).map(s => s.step_id as string).sort();

async function addStep(who: Account, ref: string, title: string) {
  const r = await apply(who, [stepCreate(ref, [title])]);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  return { operation_id: r.json.receipt.operation_id as string, ...r.json.receipt.steps[0] } as
    { operation_id: string; step_id: string; after_revision: number };
}

async function parentFor(who: Account, parent: 'sanity' | 'custom') {
  return parent === 'sanity' ? SANITY_REF : (await existingCustomTask(who, 'Open a bank account')).ref;
}

/** What a change's setup saved: the step it acts on, or the receipt it undoes. */
type Ctx = Saved | string | undefined;
type Saved = Awaited<ReturnType<typeof addStep>>;
const saved = (ctx: Ctx) => ctx as Saved;

interface Change {
  label: string;
  parent: 'sanity' | 'custom';
  pattern: string;
  /** Saved before the proposal is prepared. */
  setup?: (who: Account, ref: string) => Promise<Ctx>;
  run: (who: Account, ref: string, ctx: Ctx) => Promise<Reply>;
}

// Every kind of step change that adds or removes a live step with the suggested title.
const RELEVANT: Change[] = [
  { label: 'a direct add of the same title (content-backed task)', parent: 'sanity', pattern: APPLY,
    run: (who, ref) => apply(who, [stepCreate(ref, [TITLE])]) },
  { label: 'a direct add of the same title (custom task)', parent: 'custom', pattern: APPLY,
    run: (who, ref) => apply(who, [stepCreate(ref, [TITLE])]) },
  { label: 'a rename of another step to the same title (custom task)', parent: 'custom', pattern: APPLY,
    setup: (who, ref) => addStep(who, ref, 'Call the bank'),
    run: (who, _ref, s) => apply(who, [stepUpdate(saved(s).step_id, TITLE, saved(s).after_revision)]) },
  { label: 'a rename of another step to the same title (content-backed task)', parent: 'sanity', pattern: APPLY,
    setup: (who, ref) => addStep(who, ref, 'Call the bank'),
    run: (who, _ref, s) => apply(who, [stepUpdate(saved(s).step_id, TITLE, saved(s).after_revision)]) },
  { label: 'a rename of the matching step to another title (custom task)', parent: 'custom', pattern: APPLY,
    setup: (who, ref) => addStep(who, ref, TITLE),
    run: (who, _ref, s) => apply(who, [stepUpdate(saved(s).step_id, 'Bring one ID', saved(s).after_revision)]) },
  { label: 'a confirmed removal of the matching step (content-backed task)', parent: 'sanity', pattern: APPLY,
    setup: (who, ref) => addStep(who, ref, TITLE),
    run: (who, _ref, s) => apply(who, [stepRemove(saved(s).step_id, saved(s).after_revision)], { authorization: confirmedRemoval }) },
  { label: 'an Undo that restores a removed matching step (custom task)', parent: 'custom', pattern: UNDO,
    setup: async (who, ref) => {
      const s = await addStep(who, ref, TITLE);
      const removed = await apply(who, [stepRemove(s.step_id, s.after_revision)], { authorization: confirmedRemoval });
      assertEquals(removed.status, 200, JSON.stringify(removed.json));
      return removed.json.receipt.operation_id;
    },
    run: (who, _ref, receipt) => undo(who, receipt as string) },
  { label: 'a confirmed Undo of the added matching step (content-backed task)', parent: 'sanity', pattern: UNDO,
    setup: (who, ref) => addStep(who, ref, TITLE),
    run: (who, _ref, s) => undo(who, saved(s).operation_id, { authorization: confirmedRemoval }) },
];

interface Outcome {
  reviewed: string[];
  changeWaited: 'blocked' | 'settled';
  mid: string[];
  approvalOpenAtMid: boolean;
  change: Reply;
  approval: Reply;
  final: string[];
  proposal: { proposal_revision: number };
}

/**
 * `change-first`: the change reaches the parent lock first, a second holder queues
 * behind it, then the approval. Releasing the first holder commits the change; a complete
 * public read follows while the approval is still blocked; then the approval goes on.
 * `approval-first`: the approval reaches the parent lock first, then the change.
 */
async function race(who: Account, ref: string, change: Change, order: 'change-first' | 'approval-first'): Promise<Outcome> {
  const ctx = change.setup ? await change.setup(who, ref) : undefined;
  const p = await prepare(who, stepCreate(ref, [TITLE]));
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const proposal = p.json.proposal;
  const reviewed = matching(await stepsOf(who, ref));
  assertEquals(proposal.context.existing_steps.map((s: StepRef) => s.step_id).sort(), reviewed, 'the draft shows the matching steps');
  const approve = () => apply(who, proposal.operations, { authorization: approved(proposal) });
  // The change and the approval are both apply requests when the change is not an Undo.
  const sameShape = change.pattern === APPLY ? 1 : 0;

  const first = holdParentLock(who.id, ref);
  await first.ready;
  let middle: ReturnType<typeof holdMiddle> | undefined;
  let firstReleased = false, middleReleased = false;
  try {
    let c: ReturnType<typeof track>, a: ReturnType<typeof track>, changeWaited: 'blocked' | 'settled';
    let mid: string[], approvalOpenAtMid: boolean;
    if (order === 'change-first') {
      c = track(change.run(who, ref, ctx));
      changeWaited = await blockedOrSettled(change.pattern, 1, c.reply);
      if (changeWaited === 'blocked') {
        middle = holdMiddle(who.id, ref);
        assertEquals(await blockedOrSettled(MIDDLE, 1, middle.ready), 'blocked', 'the second holder queues behind the change');
      }
      a = track(approve());
      assertEquals(await blockedOrSettled(APPLY, 1 + (changeWaited === 'blocked' ? sameShape : 0), a.reply), 'blocked',
        'the approval waits on the parent');
      await first.release(); firstReleased = true;
      const cr = await c.reply;
      noTimeout('change', cr);
      if (middle) await middle.ready;
      mid = matching(await stepsOf(who, ref));
      approvalOpenAtMid = !a.done && (await waitsOf(APPLY)).length >= 1;
      if (middle) { await middle.release(); middleReleased = true; }
    } else {
      a = track(approve());
      assertEquals(await blockedOrSettled(APPLY, 1, a.reply), 'blocked', 'the approval waits on the parent');
      c = track(change.run(who, ref, ctx));
      changeWaited = await blockedOrSettled(change.pattern, 1 + sameShape, c.reply);
      mid = matching(await stepsOf(who, ref));
      approvalOpenAtMid = !a.done && (await waitsOf(APPLY)).length >= 1;
      await first.release(); firstReleased = true;
    }
    const [cr, ar] = await Promise.all([c.reply, a.reply]);
    noTimeout('change', cr);
    noTimeout('approval', ar);
    const final = matching(await stepsOf(who, ref));
    const out = { reviewed, changeWaited, mid, approvalOpenAtMid, change: cr, approval: ar, final, proposal };
    console.log(JSON.stringify({ case: change.label, order, reviewed, changeWaited, mid, approvalOpenAtMid,
      change: { status: cr.status, error: cr.json.error, reason: cr.json.reason },
      approval: { status: ar.status, error: ar.json.error, revision: ar.json.proposal?.proposal_revision }, final }));
    return out;
  } finally {
    if (!firstReleased) await first.release();
    if (middle && !middleReleased) await middle.release();
  }
}

/** The falsifier, for any lock design: a relevant change read while the approval was open forbids a save without review. */
function assertNoStaleApproval(o: Outcome) {
  if (o.approvalOpenAtMid && JSON.stringify(o.mid) !== JSON.stringify(o.reviewed)) {
    assertEquals([o.approval.status, o.approval.json.error], [409, 'needs_review'],
      'the approval saved after a relevant change was committed and publicly read without a new review');
    assertEquals(o.final, o.mid, 'no step was saved by the stale approval');
  }
}

Deno.test({
  name: 'F3 serial control: a matching step saved before the approval needs a new review',
  ...testOpts,
  fn: async () => {
    const who = await newAccount('context-serial');
    const p = await prepare(who, stepCreate(SANITY_REF, [TITLE]));
    assertEquals(p.status, 200);
    assertEquals((await apply(who, [stepCreate(SANITY_REF, [TITLE])])).status, 200);
    const approval = await apply(who, p.json.proposal.operations, { authorization: approved(p.json.proposal) });
    assertEquals([approval.status, approval.json.error, (await stepsOf(who, SANITY_REF)).length], [409, 'needs_review', 1]);
  },
});

for (const change of RELEVANT) {
  Deno.test({
    name: `F3 relevant change committed while an approval waits needs a new review: ${change.label}`,
    ...testOpts,
    fn: async () => {
      const who = await newAccount('context-change-first');
      const ref = await parentFor(who, change.parent);
      const o = await race(who, ref, change, 'change-first');
      assertNoStaleApproval(o);
      // The change takes the parent lock, so it commits before the approval reads its context.
      assertEquals(o.changeWaited, 'blocked', 'the change is ordered by the parent lock');
      assertEquals(o.change.status, 200, JSON.stringify(o.change.json));
      assert(o.approvalOpenAtMid, 'the approval was still waiting at the intermediate read');
      assert(JSON.stringify(o.mid) !== JSON.stringify(o.reviewed), 'the intermediate read shows the relevant change');
      assertEquals([o.approval.status, o.approval.json.error], [409, 'needs_review'], JSON.stringify(o.approval.json));
      assertEquals(o.approval.json.proposal.proposal_revision, o.proposal.proposal_revision + 1);
      assertEquals(o.approval.json.proposal.context.existing_steps.map((s: StepRef) => s.step_id).sort(), o.mid,
        'the refreshed draft shows the current matching steps');
      assertEquals(o.final, o.mid);
    },
  });

  Deno.test({
    name: `F3 relevant change sent after the approval holds the parent waits for it: ${change.label}`,
    ...testOpts,
    fn: async () => {
      const who = await newAccount('context-approval-first');
      const ref = await parentFor(who, change.parent);
      const o = await race(who, ref, change, 'approval-first');
      assertNoStaleApproval(o);
      // Legal order: the approval reads its context and saves before the change commits.
      assertEquals(o.changeWaited, 'blocked', 'the change waits for the approval');
      assertEquals(o.mid, o.reviewed, 'nothing relevant is visible before the approval commits');
      assertEquals(o.approval.status, 200, JSON.stringify(o.approval.json));
      assertEquals(o.change.status, 200, JSON.stringify(o.change.json));
      const added = o.approval.json.receipt.steps.map((s: StepRef) => s.step_id);
      assert(o.final.includes(added[0]), 'the approved step is saved');
    },
  });
}

// The approval is stopped after it has read its context and inserted its steps: an
// uncommitted receipt row with the approval's operation id (a separate connection) makes
// its receipt insert wait, then is rolled back. The approval holds the parent lock there.
for (const change of [RELEVANT[0], RELEVANT[2], RELEVANT[6]]) {
  Deno.test({
    name: `F3 a relevant change cannot commit between the approval's context read and its save: ${change.label}`,
    ...testOpts,
    fn: async () => {
      // Wrong if: the change commits and is publicly read while the approval, past its
      // context read, has not saved yet, and the approval then saves without review.
      const who = await newAccount('context-late-window');
      const ref = await parentFor(who, change.parent);
      const ctx = change.setup ? await change.setup(who, ref) : undefined;
      const proposal = (await prepare(who, stepCreate(ref, [TITLE]))).json.proposal;
      const reviewed = matching(await stepsOf(who, ref));
      const operation_id = uuid();
      let rollback!: () => void;
      const rolledBack = new Promise<void>(r => (rollback = r));
      let inserted!: () => void;
      const blockerReady = new Promise<void>(r => (inserted = r));
      const blocker = sql.begin(async t => {
        await t`insert into public.companion_action_receipts
          (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
          values (${who.id}, ${operation_id}, 'test blocker', 1, '{}', '{}')`;
        inserted();
        await rolledBack;
        throw new Error('rollback');
      }).catch(() => undefined);
      await blockerReady;
      let released = false;
      try {
        const a = track(apply(who, proposal.operations, { authorization: approved(proposal), operation_id }));
        assertEquals(await blockedOrSettled(APPLY, 1, a.reply), 'blocked');
        assertEquals(await waitsOf(APPLY), ['transactionid'], 'the approval waits at its receipt, past its context read');
        const c = track(change.run(who, ref, ctx));
        const changeWaited = await blockedOrSettled(change.pattern, change.pattern === APPLY ? 2 : 1, c.reply);
        const mid = matching(await stepsOf(who, ref));
        const approvalOpenAtMid = !a.done;
        rollback(); released = true;
        await blocker;
        const [cr, ar] = await Promise.all([c.reply, a.reply]);
        noTimeout('change', cr);
        noTimeout('approval', ar);
        const final = matching(await stepsOf(who, ref));
        console.log(JSON.stringify({ case: change.label, order: 'late-window', reviewed, changeWaited, mid, approvalOpenAtMid,
          change: { status: cr.status, error: cr.json.error }, approval: { status: ar.status, error: ar.json.error }, final }));
        assertNoStaleApproval({ reviewed, changeWaited, mid, approvalOpenAtMid, change: cr, approval: ar, final, proposal });
        assertEquals(changeWaited, 'blocked', 'the change waits for the approval that holds the parent');
        assertEquals(mid, reviewed);
        assertEquals([ar.status, cr.status], [200, 200], JSON.stringify([ar.json, cr.json]));
      } finally {
        if (!released) { rollback(); await blocker; }
      }
    },
  });
}

Deno.test({
  name: 'F3 unrelated changes while an approval waits do not force a new review',
  ...testOpts,
  fn: async () => {
    // Wrong if: a step change that does not touch the suggested title, or the same title under
    // another task or account, makes the approval answer needs_review.
    const unrelated: Change[] = [
      { label: 'another title on the same task', parent: 'custom', pattern: APPLY,
        run: (who, ref) => apply(who, [stepCreate(ref, ['Ask about newcomer fees'])]) },
      { label: 'checking the matching step', parent: 'sanity', pattern: APPLY,
        setup: (who, ref) => addStep(who, ref, TITLE),
        run: (who, _ref, s) => apply(who, [stepDone(saved(s).step_id, true, saved(s).after_revision)]) },
    ];
    for (const change of unrelated) {
      for (const order of ['change-first', 'approval-first'] as const) {
        const who = await newAccount('context-unrelated');
        const ref = await parentFor(who, change.parent);
        const o = await race(who, ref, change, order);
        assertEquals([o.change.status, o.approval.status], [200, 200], `${change.label} ${order}: ${JSON.stringify(o.approval.json)}`);
        assertEquals(o.final.length, o.reviewed.length + 1, 'the approved step is saved');
      }
    }

    // The same title under another task of the account, and under the same task of another
    // account, is not ordered behind this parent and does not change this draft.
    const who = await newAccount('context-unrelated-parent');
    const other = await newAccount('context-unrelated-account');
    const ownOther = (await existingCustomTask(who, 'Get a phone plan')).ref;
    const p = (await prepare(who, stepCreate(SANITY_REF, [TITLE]))).json.proposal;
    const first = holdParentLock(who.id, SANITY_REF);
    await first.ready;
    let released = false;
    try {
      const a = track(apply(who, p.operations, { authorization: approved(p) }));
      assertEquals(await blockedOrSettled(APPLY, 1, a.reply), 'blocked');
      const results = await Promise.race([
        Promise.all([apply(who, [stepCreate(ownOther, [TITLE])]), apply(other, [stepCreate(SANITY_REF, [TITLE])])]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('blocked behind an unrelated parent')), 2000)),
      ]);
      assertEquals(results.map(r => r.status), [200, 200]);
      await first.release(); released = true;
      const ar = await a.reply;
      noTimeout('approval', ar);
      assertEquals(ar.status, 200, JSON.stringify(ar.json));
    } finally {
      if (!released) await first.release();
    }
    assertEquals((await stepsOf(who, SANITY_REF)).map(s => s.title), [TITLE]);
    assertEquals((await stepsOf(who, ownOther)).map(s => s.title), [TITLE]);
    assertEquals((await stepsOf(other, SANITY_REF)).map(s => s.title), [TITLE]);
  },
});

Deno.test({
  name: 'F3 competing approvals of one draft and their replays: no stale save, one new review, then one save',
  ...testOpts,
  fn: async () => {
    // Wrong if: either of two approvals of the same reviewed revision saves after a matching
    // step committed and was read; a retry of a refused approval writes; or the approval of
    // the refreshed revision saves twice.
    const who = await newAccount('context-competing');
    const p = (await prepare(who, stepCreate(SANITY_REF, [TITLE]))).json.proposal;
    const first = holdParentLock(who.id, SANITY_REF);
    await first.ready;
    let middle: ReturnType<typeof holdMiddle> | undefined;
    let firstReleased = false, middleReleased = false;
    const op1 = uuid(), op2 = uuid();
    let a1: ReturnType<typeof track>, a2: ReturnType<typeof track>, mid: string[], openAtMid: boolean;
    try {
      const c = track(apply(who, [stepCreate(SANITY_REF, [TITLE])]));
      assertEquals(await blockedOrSettled(APPLY, 1, c.reply), 'blocked');
      middle = holdMiddle(who.id, SANITY_REF);
      assertEquals(await blockedOrSettled(MIDDLE, 1, middle.ready), 'blocked');
      a1 = track(apply(who, p.operations, { authorization: approved(p), operation_id: op1 }));
      assertEquals(await blockedOrSettled(APPLY, 2, a1.reply), 'blocked');
      a2 = track(apply(who, p.operations, { authorization: approved(p), operation_id: op2 }));
      assertEquals(await blockedOrSettled(APPLY, 3, a2.reply), 'blocked');
      await first.release(); firstReleased = true;
      assertEquals((await c.reply).status, 200);
      await middle.ready;
      mid = matching(await stepsOf(who, SANITY_REF));
      openAtMid = !a1.done && !a2.done;
      await middle.release(); middleReleased = true;
    } finally {
      if (!firstReleased) await first.release();
      if (middle && !middleReleased) await middle.release();
    }
    const [r1, r2] = await Promise.all([a1.reply, a2.reply]);
    noTimeout('approval 1', r1);
    noTimeout('approval 2', r2);
    const final = matching(await stepsOf(who, SANITY_REF));
    console.log(JSON.stringify({ mid, openAtMid, r1: [r1.status, r1.json.error, r1.json.reason], r2: [r2.status, r2.json.error, r2.json.reason], final }));
    assertEquals(mid.length, 1);
    assert(openAtMid, 'both approvals were still waiting at the intermediate read');
    assertEquals([r1.status, r2.status].filter(s => s === 200), [], 'no approval saved after the matching step was read');
    assertEquals(final, mid);
    const review = [r1, r2].find(r => r.json.error === 'needs_review');
    assert(review, 'one approval answers needs_review with the refreshed draft');
    assertEquals([r1, r2].filter(r => r.json.error === 'needs_review').length, 1);
    assertEquals([r1, r2].find(r => r !== review)!.status, 403, 'the other approval names a stale revision');

    // A retry of a refused approval (same operation id and payload) writes nothing.
    const retry = await apply(who, p.operations, { authorization: approved(p), operation_id: op1 });
    assert([403, 409].includes(retry.status), JSON.stringify(retry.json));
    assertEquals(matching(await stepsOf(who, SANITY_REF)), mid);

    // After a new review the refreshed revision saves once; its replay returns the same receipt.
    const fresh = review.json.proposal;
    const op3 = uuid();
    const [s1, s2] = await Promise.all([
      apply(who, fresh.operations, { authorization: approved(fresh), operation_id: op3 }),
      apply(who, fresh.operations, { authorization: approved(fresh), operation_id: op3 }),
    ]);
    assertEquals([s1.status, s2.status], [200, 200], JSON.stringify([s1.json, s2.json]));
    assertEquals(s1.json.receipt.steps[0].step_id, s2.json.receipt.steps[0].step_id);
    const replay = await apply(who, fresh.operations, { authorization: approved(fresh), operation_id: op3 });
    assertEquals([replay.status, replay.json.receipt.steps[0].step_id], [200, s1.json.receipt.steps[0].step_id]);
    assertEquals(matching(await stepsOf(who, SANITY_REF)).length, 2, 'a reviewed second step of the same title is legal');
  },
});

Deno.test({
  name: 'F3 rolling back and re-applying #366 keeps the approval context check ordered',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the rollback script and re-application the approval again reads its
    // context before it waits for the parent.
    await migrate366('down');
    await openGate();
    await migrate366('up');
    await openGate();
    const who = await newAccount('context-reapply');
    const o = await race(who, SANITY_REF, RELEVANT[0], 'change-first');
    assertNoStaleApproval(o);
    assertEquals([o.approval.status, o.approval.json.error, o.final.length], [409, 'needs_review', 1]);
  },
});

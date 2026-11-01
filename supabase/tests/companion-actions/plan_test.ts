// Settlement plans (mobile-app#364) through the public request boundary, against a real
// local Postgres + GoTrue + PostgREST + edge runtime. Fixture: a fictional newcomer
// arriving in Vancouver next week who already has a SIN task and a bank-account task
// and asks Companion to plan the first week. The fixture is validation data, not
// advice or an audience rule. Each test names the observation that would prove the
// behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { draftFor, draftItems, GOAL, PHONE, vancouverArrival } from './planSupport.ts';
import {
  type Account, call, conversationWith, customRows, existingCustomTask, existingItem, existingSanityTask,
  newItem, planApply, planCancel, planPrepare, planProposal, planRevise, plansOf, read, ready, setProfile, setState, sql, testOpts, uuid,
} from './support.ts';

await ready();

Deno.test({
  name: 'the reference plan reuses SIN and bank tasks, proposes one phone task, and approval adds exactly that one',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing writes a task or a plan, the draft does not tell existing from
    // new or miscounts the change, approval adds zero or two tasks or touches the reused
    // tasks' progress, or the saved plan copies progress instead of referring to tasks.
    const { a, sin, bank } = await vancouverArrival('ana');
    const { conversation_id, message_id } = await conversationWith(a, 'user', 'I arrive in Vancouver next week. Help me plan my first week.');
    const before = (await read(a)).json.tasks;

    const draft = await draftFor(a, sin, bank, { source: { conversation_id, message_id } });
    assertEquals([draft.status, draft.kind, draft.proposal_revision], ['draft', 'plan', 1]);
    assertEquals(draft.goal, GOAL);
    assertEquals(draft.items.map((i: { kind: string }) => i.kind), ['existing', 'existing', 'new']);
    assertEquals(draft.items[2].title, PHONE);
    assertEquals(draft.items[2].include, true);
    assertEquals(draft.change_count, 1);
    assertEquals(draft.context.profile, { city: 'Vancouver', province: 'British Columbia', arrival_date: '2026-11-02T00:00:00+00:00' });
    assertEquals(draft.source, { conversation_id, message_id });
    assertEquals(await customRows(a.id), [], 'preparing wrote a task');
    assertEquals((await plansOf(a)).json.plans, [], 'preparing saved a plan');

    const w = await planApply(a, draft);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals([w.json.status, w.json.replayed], ['applied', false]);
    const outcomes = w.json.receipt.results.map((r: { outcome: string }) => r.outcome);
    assertEquals(outcomes, ['reused', 'reused', 'created']);
    const created = w.json.receipt.results[2];
    assertEquals(created.title, PHONE);
    assert(/^custom:[1-9][0-9]*$/.test(created.task_ref), created.task_ref);
    assertEquals((await customRows(a.id)).map(r => r.title), [PHONE]);

    // The reused tasks' progress rows are untouched (same revision, same state).
    const after = (await read(a)).json.tasks;
    for (const ref of [sin, bank]) {
      const b = before.find((t: { task_ref: string }) => t.task_ref === ref);
      const n = after.find((t: { task_ref: string }) => t.task_ref === ref);
      assertEquals([n.revision, n.state], [b.revision, b.state]);
    }

    // The saved plan holds ordered references and reads progress from the tasks.
    const plans = (await plansOf(a, 'web')).json.plans;
    assertEquals(plans.length, 1);
    assertEquals(plans[0].goal, GOAL);
    assertEquals(plans[0].items.map((i: { task_ref: string }) => i.task_ref), [sin, bank, created.task_ref]);
    assertEquals(plans[0].items.map((i: { state: string }) => i.state), ['not_started', 'not_started', 'not_started']);
    assertEquals(plans[0].receipt.operation_id, w.json.operation_id);
    const [{ cols }] = await sql`select array_agg(column_name::text order by column_name) cols from information_schema.columns
      where table_schema = 'public' and table_name = 'companion_plan_tasks'`;
    assert(!cols.some((c: string) => /state|completed|progress|waiting/.test(c)), `plan rows copy progress: ${cols}`);

    const later = await planProposal(a, draft.plan_proposal_id);
    assertEquals([later.json.plan_proposal.status, later.json.plan_proposal.receipt.operation_id], ['applied', w.json.operation_id]);
  },
});

Deno.test({
  name: 'excluding the addition is a new revision: the old approval is refused and the plan saves with existing tasks only',
  ...testOpts,
  fn: async () => {
    // Wrong if: the edit keeps the old revision approvable, the excluded task is saved,
    // the change count still says one, or an edit changes a reused task's progress.
    const { a, sin, bank } = await vancouverArrival('ben');
    const v1 = await draftFor(a, sin, bank);
    const revBefore = (await read(a)).json.tasks.map((t: { revision: number }) => t.revision);

    const edited = draftItems(v1.items).map(i => i.kind === 'new' ? { ...i, include: false } : i);
    const r = await planRevise(a, v1.plan_proposal_id, 1, edited);
    assertEquals(r.status, 200, JSON.stringify(r.json));
    const v2 = r.json.plan_proposal;
    assertEquals([v2.proposal_revision, v2.review_reason, v2.change_count], [2, 'edited', 0]);
    assertEquals(v2.items[2], { kind: 'new', key: 'n1', title: PHONE, priority: 'Do soon', include: false });
    assertEquals((await read(a)).json.tasks.map((t: { revision: number }) => t.revision), revBefore);

    // The approval of revision 1 no longer authorizes anything.
    const old = await planApply(a, v1);
    assertEquals(old.status, 403, JSON.stringify(old.json));
    // An edit naming the old revision changes nothing and returns the current draft.
    const stale = await planRevise(a, v1.plan_proposal_id, 1, draftItems(v1.items));
    assertEquals([stale.status, stale.json.error, stale.json.plan_proposal?.proposal_revision], [409, 'proposal_changed', 2]);

    const w = await planApply(a, v2);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals(w.json.receipt.results.map((x: { outcome: string }) => x.outcome), ['reused', 'reused']);
    assertEquals(await customRows(a.id), [], 'an excluded addition was saved');
    assertEquals((await plansOf(a)).json.plans[0].items.map((i: { task_ref: string }) => i.task_ref), [sin, bank]);
  },
});

Deno.test({
  name: 'edits may reorder, drop a reference or re-include, but cannot introduce a task the preparation did not name',
  ...testOpts,
  fn: async () => {
    // Wrong if: a client edit adds an arbitrary task reference or a new title, or a
    // reordered and re-included draft does not save in the reviewed order.
    const { a, sin, bank } = await vancouverArrival('cy');
    const other = await existingSanityTask(a, 'health-card');
    const v1 = await draftFor(a, sin, bank);
    const items = draftItems(v1.items);
    const foreign = await planRevise(a, v1.plan_proposal_id, 1, [...items, { kind: 'existing', task_ref: other }]);
    assertEquals([foreign.status, foreign.json.reason], [422, 'item_not_in_draft'], JSON.stringify(foreign.json));
    const invented = await planRevise(a, v1.plan_proposal_id, 1, [...items, { kind: 'new', key: 'n9', include: true }]);
    assertEquals([invented.status, invented.json.reason], [422, 'item_not_in_draft'], JSON.stringify(invented.json));

    const out = await planRevise(a, v1.plan_proposal_id, 1, [items[2], items[1]].map(i => i.kind === 'new' ? { ...i, include: false } : i));
    const back = await planRevise(a, v1.plan_proposal_id, 2, [items[2], items[1]]);
    assertEquals([out.status, back.status], [200, 200], JSON.stringify([out.json, back.json]));
    const v3 = back.json.plan_proposal;
    assertEquals([v3.proposal_revision, v3.change_count], [3, 1]);
    const w = await planApply(a, v3);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    const created = w.json.receipt.results[0].task_ref;
    assertEquals((await plansOf(a)).json.plans[0].items.map((i: { task_ref: string }) => i.task_ref), [created, bank]);
  },
});

Deno.test({
  name: 'Not now cancels only the displayed draft revision; a cancelled draft cannot be approved',
  ...testOpts,
  fn: async () => {
    // Wrong if: cancel writes a task or plan, an old revision cancels a newer draft, or a
    // cancelled draft is approvable or disappears instead of reading as cancelled.
    const { a, sin, bank } = await vancouverArrival('dee');
    const v1 = await draftFor(a, sin, bank);
    await planRevise(a, v1.plan_proposal_id, 1, draftItems(v1.items).reverse());
    const staleCancel = await planCancel(a, v1.plan_proposal_id, 1);
    assertEquals([staleCancel.status, staleCancel.json.error], [409, 'proposal_changed']);
    const c = await planCancel(a, v1.plan_proposal_id, 2);
    assertEquals([c.status, c.json.plan_proposal?.status], [200, 'cancelled'], JSON.stringify(c.json));
    const cur = (await planProposal(a, v1.plan_proposal_id)).json.plan_proposal;
    assertEquals((await planApply(a, cur)).status, 403);
    assertEquals(await customRows(a.id), []);
    assertEquals((await plansOf(a)).json, { contract_version: 1, plans: [], drafts: [] });
  },
});

Deno.test({
  name: 'a custom task with the same title is an uncertain match: approval waits until the user picks reuse or add',
  ...testOpts,
  fn: async () => {
    // Wrong if: similar text silently merges into the existing task, a second same-title
    // task is added without the user choosing it, or "use existing" adds a task anyway.
    const { a, sin, bank } = await vancouverArrival('eve');
    const mine = await existingCustomTask(a, 'set up  Phone service');
    const v1 = await draftFor(a, sin, bank);
    assertEquals(v1.items[2].kind, 'new', 'similar text was merged at preparation');
    assertEquals(v1.context.matches, { n1: [{ task_ref: mine.ref, title: 'set up  Phone service' }] });
    assertEquals(v1.unresolved, ['n1']);
    const refused = await planApply(a, v1);
    assertEquals([refused.status, refused.json.reason], [422, 'match_unresolved'], JSON.stringify(refused.json));
    assertEquals((await customRows(a.id)).length, 1);

    // "Use the existing task": the addition is replaced by a reference to it.
    const items = draftItems(v1.items);
    const reuse = await planRevise(a, v1.plan_proposal_id, 1, [items[0], items[1], { kind: 'existing', task_ref: mine.ref }]);
    assertEquals(reuse.status, 200, JSON.stringify(reuse.json));
    assertEquals([reuse.json.plan_proposal.change_count, reuse.json.plan_proposal.unresolved], [0, []]);
    const w = await planApply(a, reuse.json.plan_proposal);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals((await customRows(a.id)).length, 1, 'reusing added a task');
    assertEquals((await plansOf(a)).json.plans[0].items.map((i: { task_ref: string }) => i.task_ref), [sin, bank, mine.ref]);

    // "Add it as a new task": an explicit choice, then exactly one more task.
    const { a: b, sin: s2, bank: b2 } = await vancouverArrival('eve2');
    await existingCustomTask(b, PHONE);
    const d = await draftFor(b, s2, b2);
    const confirm = await planRevise(b, d.plan_proposal_id, 1,
      draftItems(d.items).map(i => i.kind === 'new' ? { ...i, confirm_new: true } : i));
    assertEquals(confirm.json.plan_proposal.unresolved, [], JSON.stringify(confirm.json));
    assertEquals((await planApply(b, confirm.json.plan_proposal)).status, 200);
    assertEquals((await customRows(b.id)).map(r => r.title), [PHONE, PHONE]);
  },
});

Deno.test({
  name: 'content tasks are reused by published identity only; a named content match is offered, never merged',
  ...testOpts,
  fn: async () => {
    // Wrong if: a draft or unpublished id or a zero-padded custom id is accepted, or an
    // addition with a named content candidate is approvable before the user chooses.
    const { a, sin, bank } = await vancouverArrival('fay');
    for (const ref of ['sanity:drafts.sin-number', 'custom:007', 'sanity:']) {
      const bad = await planPrepare(a, GOAL, [existingItem(ref), newItem(PHONE)]);
      assertEquals([bad.status, bad.json.reason], [422, 'invalid_task_ref'], ref);
    }
    const d = await draftFor(a, sin, bank, {});
    assertEquals(d.unresolved, []);
    const withCandidate = await planPrepare(a, GOAL, [existingItem(sin), newItem('Open a bank account', { candidates: [bank] })]);
    assertEquals(withCandidate.status, 200, JSON.stringify(withCandidate.json));
    assertEquals(withCandidate.json.plan_proposal.unresolved, ['n1']);
    assertEquals((await planApply(a, withCandidate.json.plan_proposal)).status, 422);
  },
});

Deno.test({
  name: 'a relevant change since review asks for a new review; an unrelated progress change does not',
  ...testOpts,
  fn: async () => {
    // Wrong if: an old approval applies after a reused task was removed, the profile
    // changed or a same-title task appeared; or a state change on a reused task (which
    // approval does not write) forces a new review.
    const { a, sin, bank } = await vancouverArrival('gus');
    const d = await draftFor(a, sin, bank);
    const t = (await read(a)).json.tasks.find((x: { task_ref: string }) => x.task_ref === sin);
    const st = await call(a, { contract_version: 1, client: { platform: 'web' }, action: 'apply', operation_id: uuid(),
      authorization: { kind: 'ui_control' }, operations: [setState(sin, 'in_progress', t.revision)] });
    assertEquals(st.status, 200, JSON.stringify(st.json));
    const ok1 = await planApply(a, d);
    assertEquals(ok1.status, 200, JSON.stringify(ok1.json));
    assertEquals(ok1.json.plan.items[0].state, 'in_progress');

    const cases: Array<[string, (x: Account, s: string, b: string) => Promise<void>, string]> = [
      ['reused task removed', async (x, _s, b) => {
        const r = await x.client.from('user_tasks').update({ dismissed_at: new Date().toISOString() })
          .eq('user_id', x.id).eq('sanity_checklist_id', b.slice(7));
        if (r.error) throw r.error;
      }, 'existing'],
      ['profile city changed', async x => { await setProfile(x, { city: 'Surrey' }); }, 'profile'],
      ['same-title task appeared', async x => { await existingCustomTask(x, PHONE); }, 'matches'],
    ];
    for (const [label, change, field] of cases) {
      const { a: x, sin: s, bank: b } = await vancouverArrival('gus-' + field);
      const draft = await draftFor(x, s, b);
      await change(x, s, b);
      const w = await planApply(x, draft);
      assertEquals([w.status, w.json.error], [409, 'needs_review'], label + ' ' + JSON.stringify(w.json));
      const next = w.json.plan_proposal;
      assertEquals([next.proposal_revision, next.review_reason, next.status], [2, 'context_changed', 'draft'], label);
      assert(JSON.stringify(next.previous_context[field]) !== JSON.stringify(next.context[field]), label);
      assertEquals((await plansOf(x)).json.plans, [], label + ': a plan was saved');
      assertEquals((await customRows(x.id)).filter(r => r.title === PHONE).length, field === 'matches' ? 1 : 0, label);
      if (field === 'existing') {
        // The removed task stays visible as unavailable; the refreshed draft cannot save
        // a reference to it until the user drops it from the draft.
        assertEquals(next.tasks.find((t: { task_ref: string }) => t.task_ref === b).removed, true);
        const again = await planApply(x, next);
        assertEquals([again.status, again.json.reason], [422, 'task_removed'], JSON.stringify(again.json));
        const dropped = await planRevise(x, next.plan_proposal_id, 2, draftItems(next.items).filter(i => i.task_ref !== b));
        assertEquals(dropped.status, 200, JSON.stringify(dropped.json));
        const saved = await planApply(x, dropped.json.plan_proposal);
        assertEquals(saved.status, 200, JSON.stringify(saved.json));
        assertEquals(saved.json.plan.items.map((i: { task_ref: string }) => i.task_ref).includes(b), false);
      }
    }
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });

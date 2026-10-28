// Rollback and re-application of the #367 task removal migration, through the public
// request boundary. Operator order: the #367 rollback runs first (before #365's). Direct
// SQL is used only for the migration scripts and the function sources no public path
// exposes. Each test names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, confirmedApproval, existingCustomTask, migrate, migrate367, MIGRATION_364, MIGRATION_365, MIGRATION_366, newAccount, openGate,
  pendingReminder, prepare, proposalOf, ready, reminderRow, setState, sql, taskOf, taskRemove, testOpts, undo,
  approved,
} from './support.ts';

await ready();

const SHARED = [
  'companion_validate_operations', 'companion_check_authorization', 'companion_apply_one', 'companion_receipt_summary',
  'companion_undo_action', 'companion_prepare_proposal', 'companion_recheck_proposal', 'companion_conversation_actions',
  'companion_plan_apply',
];

/** #365 (applied just before #367) replaced six of them; the other two are still #366's. */
const REPLACED_365 = new Set([
  'companion_validate_operations', 'companion_check_authorization', 'companion_apply_one', 'companion_receipt_summary',
  'companion_undo_action', 'companion_conversation_actions',
]);

/**
 * The function bodies current before #367: the #365 migration's, the #364 migration's for
 * the plan writer (#367 adds its plan-reference lock), else the #366 migration's.
 */
async function bodiesBefore367(): Promise<Record<string, string>> {
  const text364 = await Deno.readTextFile(MIGRATION_364);
  const text365 = await Deno.readTextFile(MIGRATION_365);
  const text366 = await Deno.readTextFile(MIGRATION_366);
  const out: Record<string, string> = {};
  for (const name of SHARED) {
    const text = name === 'companion_plan_apply' ? text364 : REPLACED_365.has(name) ? text365 : text366;
    const start = text.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
    const open = text.indexOf('$$', start) + 2;
    const close = text.indexOf('$$;', open);
    out[name] = text.slice(open, close);
  }
  return out;
}

async function liveBodies(): Promise<Record<string, string>> {
  const rows = await sql`select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace
    and proname = any(${SHARED})`;
  return Object.fromEntries(rows.map(r => [r.proname as string, r.prosrc as string]));
}

async function removedOnce(label: string) {
  const a = await newAccount(label);
  const { ref } = await existingCustomTask(a, 'Get a phone plan');
  const other = await existingCustomTask(a, 'Buy a transit pass');
  const reminder = await pendingReminder(a.id, ref);
  const p = (await prepare(a, taskRemove(ref, 1))).json.proposal;
  const w = await apply(a, p.operations, { authorization: confirmedApproval(p) });
  assertEquals(w.status, 200, JSON.stringify(w.json));
  const open = (await prepare(a, taskRemove(other.ref, 1))).json.proposal;
  return { a, ref, other, reminder, removal: w.json.operation_id as string, open };
}

Deno.test({
  name: 'rolling back #367 alone keeps removed tasks removed and restores the earlier (#365, #366) functions; re-applying restores receipts and reviews',
  ...testOpts,
  fn: async () => {
    // Wrong if: the rollback changes a task, restarts a reminder or leaves a #367 body in
    // place; a #366 read fails on a receipt it does not understand; after re-application
    // the removal cannot be undone, or an approval captured before the rollback removes.
    const { a, ref, other, reminder, removal, open } = await removedOnce('rb');
    await migrate367('down');
    try {
      assertEquals(await liveBodies(), await bodiesBefore367());
      const [helpers] = await sql`select to_regprocedure('public.companion_plan_items_lock(uuid,jsonb)') is null
        and to_regprocedure('public.companion_plan_ref_key(uuid,text)') is null as gone`;
      assertEquals(helpers.gone, true, 'the plan-reference lock helpers outlived the rollback');
      assertEquals((await taskOf(a, ref)).removed, true);
      assertEquals((await taskOf(a, ref)).last_receipt, null);
      assertEquals(await reminderRow(reminder), { status: 'cancelled', cancelled_reason: 'task_removed' });
      const refused = await prepare(a, taskRemove(other.ref, 1));
      assertEquals([refused.status, refused.json.reason], [422, 'unsupported_operation']);
      assertEquals((await undo(a, removal)).status, 404);
      // Other task controls keep working.
      assertEquals((await apply(a, [setState(other.ref, 'in_progress', 1)])).status, 200);
    } finally {
      await migrate367('up');
    }
    const restored = await proposalOf(a, open.proposal_id);
    assertEquals([restored.json.proposal.proposal_revision, restored.json.proposal.review_reason], [2, 'restored']);
    const old = await apply(a, open.operations, { authorization: confirmedApproval(open) });
    assertEquals(old.status, 403);
    // The draft still names revision 1 of a task now at revision 2: a new review is needed.
    const recheck = await apply(a, restored.json.proposal.operations, { authorization: confirmedApproval(restored.json.proposal) });
    assertEquals([recheck.status, recheck.json.error], [409, 'needs_review']);
    const u = await undo(a, removal);
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals((await taskOf(a, ref)).removed, false);
    assertEquals((await reminderRow(reminder)).status, 'cancelled');
  },
});

Deno.test({
  name: 'after a full rollback and re-application a removed custom task is still removed and its Undo is a reviewed restore',
  ...testOpts,
  fn: async () => {
    // Wrong if: the full cycle loses the removed task or its receipt, brings it back by
    // itself, restarts its reminder, or lets the pre-rollback revision restore it unreviewed.
    const { a, ref, reminder, removal } = await removedOnce('full');
    await migrate('down');
    await migrate('up');
    await openGate();
    const t = await taskOf(a, ref);
    assertEquals(t.removed, true);
    assertEquals(await reminderRow(reminder), { status: 'cancelled', cancelled_reason: 'task_removed' });
    const u = await undo(a, removal);
    assertEquals([u.status, u.json.reason], [409, 'changed'], JSON.stringify(u.json));
    assertEquals(u.json.proposal.operations, [{ type: 'task.restore', task_ref: ref, expected_revision: t.revision }]);
    const ok = await apply(a, u.json.proposal.operations, { authorization: approved(u.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals((await taskOf(a, ref)).removed, false);
    assertEquals((await reminderRow(reminder)).status, 'cancelled');
  },
});

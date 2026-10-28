#!/usr/bin/env python3 -I
"""Breaks one mechanism at a time and runs the test that must catch it (mobile-app#361, #363, #365).

Each mutation edits a temporary copy of a migration, a rollback script or the edge
function, never the source. #363 replaces six #361 action functions and #365 replaces
eight #363 ones (same signatures), so a mutation of a mechanism edits the latest
migration that defines it, where the running code is. #367 (applied after #365) keeps
six of the #365 bodies verbatim and adds removal lines: a #365 anchor that the #367
migration also contains in one of those six functions is edited in both copies, so the
running code is the mutated one. The run must fail with an assertion error. A pass
is SURVIVED (the test does not bind the mechanism). A failure without an assertion
error (crash, stack failure, timeout) is UNRESOLVED. Exit 0 only when every line is RED.

Usage: ./mutation_check.py [name ...]     (about 1 minute per mutation)
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MIGRATION = os.path.join(ROOT, 'migrations', '20261025235536_companion_task_actions.sql')
ROLLBACK = os.path.join(ROOT, 'rollbacks', '20261025235536_companion_task_actions.down.sql')
MIGRATION_363 = os.path.join(ROOT, 'migrations', '20261026165156_companion_task_create.sql')
ROLLBACK_363 = os.path.join(ROOT, 'rollbacks', '20261026165156_companion_task_create.down.sql')
MIGRATION_365 = os.path.join(ROOT, 'migrations', '20261028001530_companion_task_edit.sql')
ROLLBACK_365 = os.path.join(ROOT, 'rollbacks', '20261028001530_companion_task_edit.down.sql')
MIGRATION_367 = os.path.join(ROOT, 'migrations', '20261028025026_companion_task_remove.sql')
# The #365 bodies that #367 keeps verbatim (with added removal lines).
SHARED_365_367 = ('companion_validate_operations', 'companion_check_authorization', 'companion_apply_one',
                  'companion_receipt_summary', 'companion_undo_action', 'companion_conversation_actions')
SQL_TARGETS = {
    'up365': (MIGRATION_365, 'ACTIONS_MIGRATION_365_FILE'),
    'down365': (ROLLBACK_365, 'ACTIONS_ROLLBACK_365_FILE'),
    'up': (MIGRATION, 'ACTIONS_MIGRATION_FILE'),
    'down': (ROLLBACK, 'ACTIONS_ROLLBACK_FILE'),
    'up363': (MIGRATION_363, 'ACTIONS_MIGRATION_363_FILE'),
    'down363': (ROLLBACK_363, 'ACTIONS_ROLLBACK_363_FILE'),
}
FUNCTIONS = os.path.join(ROOT, 'functions')

# name, target, find, replace, test file, test-name fragment
MUTATIONS = [
    ('undo_forgets_reason', 'up365',
     "'inverse', public.companion_set_state_op(v_ref, v_before_state, v_before_reason, v_after))\n",
     "'inverse', public.companion_set_state_op(v_ref, v_before_state, null, v_after))\n",
     'undo_test.ts', 'exact earlier state'),
    ('undo_ignores_newer_edit', 'up365',
     "      v_conflict := true;\n", "      v_conflict := false;\n",
     'undo_test.ts', 'older receipt cannot reverse'),
    ('receipt_always_current', 'up365',
     "    'current', u.operation_id is null\n               and public.companion_task_revision(p_receipt.user_id, p_receipt.task_ref) = (r->>'after_revision')::bigint,",
     "    'current', true,",
     'undo_test.ts', 'legacy Checklist write after a receipt'),
    ('approval_hash_unchecked', 'up365',
     "       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'\n     returning p.id, p.undo_of",
     "       and p.status = 'draft'\n     returning p.id, p.undo_of",
     'boundary_test.ts', 'forged or model-made approval'),
    ('no_operation_lock', 'up',
     "  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user, p_op));",
     "  perform 1;",
     'boundary_test.ts', 'result lookup'),
    ('custom_revision_unchecked', 'up365',
     "    if v_ct.removed_at is not null then\n      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));\n    end if;\n    if v_before <> v_expected then",
     "    if v_ct.removed_at is not null then\n      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));\n    end if;\n    if false then",
     'boundary_test.ts', 'stale revision'),
    ('completion_keeps_reminders', 'up',
     "    perform public.companion_cancel_reminders(new.user_id, 'sanity:' || new.sanity_checklist_id, 'task_completed');",
     "    null;",
     'undo_test.ts', 'Undo of completion'),
    ('registry_accepts_any_type', 'up365',
     "    if v_type is null or v_type not in ('task.set_state', 'task.create_custom', 'task.remove_created', 'task.edit_details') then",
     "    if v_type is null then",
     'boundary_test.ts', 'invalid payloads'),
    ('rollback_keeps_pending', 'down',
     "update public.companion_task_reminders\n   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now()\n where status = 'pending';",
     "select 1;",
     'rollback_test.ts', 'full rollback stops every pending reminder'),
    ('handler_spends_quota', 'handler',
     "    if (!caller) return finish(json({ error: 'unauthorized' }, 401), 'unauthorized');",
     "    if (!caller) return finish(json({ error: 'unauthorized' }, 401), 'unauthorized');\n    await admin.rpc('check_and_increment_chatbot_usage', { p_user_id: caller.userId });",
     'boundary_test.ts', 'AI limit'),
    # #363 task creation.
    ('create_context_unchecked', 'up363',
     "  if v_prop.context is not null and v_now = v_prop.context then",
     "  if true then",
     'create_test.ts', 'relevant profile change'),
    # Over HTTP the handler's own check (#365), the same-title check (creates) and the
    # revision check (edits) shadow the database's single use; a direct call binds it.
    ('command_reusable', 'up365',
     "      perform public.companion_fail('CA412', 'command_already_used');",
     "      null;",
     'edit_command_test.ts', 'second write under one command message'),
    ('command_duplicate_title_unchecked', 'up365',
     "    if v_creates and jsonb_array_length(public.companion_same_title_tasks(p_user, p_ops->0->>'title')) > 0 then\n      perform public.companion_fail('CA413'",
     "    if false then\n      perform public.companion_fail('CA413'",
     'command_test.ts', 'already exists'),
    ('undo_removal_unconfirmed', 'up365',
     "  if v_removes and (jsonb_typeof(p_authorization->'removal_confirmed') is distinct from 'boolean'",
     "  if false and (jsonb_typeof(p_authorization->'removal_confirmed') is distinct from 'boolean'",
     'create_test.ts', 'only after confirmation'),
    ('removal_of_any_task', 'up365',
     "         and r.outcome->'results'->0->>'type' = 'task.create_custom'\n         and r.task_ref = p_ops->0->>'task_ref') then",
     "         and r.outcome->'results'->0->>'type' = 'task.create_custom') then",
     'create_test.ts', 'cannot remove any other task'),
    ('proposal_cross_account', 'up363',
     "  select * into v_prop from public.companion_proposals where id = p_proposal_id and user_id = p_user_id;\n  if not found then\n    perform public.companion_fail('CA404', 'proposal_not_found');",
     "  select * into v_prop from public.companion_proposals where id = p_proposal_id;\n  if not found then\n    perform public.companion_fail('CA404', 'proposal_not_found');",
     'create_test.ts', 'another account cannot'),
    ('down_keeps_create_inverse', 'down363',
     "update public.companion_action_receipts r set inverse = null",
     "update public.companion_action_receipts r set inverse = inverse",
     'create_rollback_test.ts', 'rolling back only'),
    ('restored_draft_keeps_approval', 'up363',
     "      revision = case when p.status = 'draft' and a.row_data->>'kind' = 'task_create' then p.revision + 1",
     "      revision = case when false then p.revision + 1",
     'create_rollback_test.ts', 'full rollback'),
    ('handler_command_unchecked', 'handler',
     "          allowed = op.type === 'task.create_custom' && op.title === resolved.title && op.priority === 'Do soon';",
     "          allowed = op.type === 'task.create_custom';",
     'command_test.ts', 'clear command adds exactly'),
    # #365 task edits.
    ('edit_unrelated_needs_new_approval', 'up365',
     "    return jsonb_build_object('ops', jsonb_build_array(v_rebased));",
     "    return null;",
     'edit_test.ts', 'another field of the same task'),
    ('edit_stale_approval_applies', 'up365',
     "  if public.companion_edit_relevant(v_op, v_now) = public.companion_edit_relevant(v_op, v_prop.context->'task') then",
     "  if true then",
     'edit_test.ts', 'field a proposal changes'),
    ('edit_undo_as_state_change', 'up365',
     "    elsif v_inv->>'type' = 'task.edit_details' then\n      v_ops := v_ops || jsonb_build_array(v_inv || jsonb_build_object('expected_revision', v_rev));\n",
     "",
     'edit_undo_test.ts', 'exactly the earlier values'),
    ('down_keeps_edit_inverse', 'down365',
     "update public.companion_action_receipts r set inverse = null",
     "update public.companion_action_receipts r set inverse = inverse",
     'edit_rollback_test.ts', 'rolling back only'),
    ('restored_edit_draft_keeps_approval', 'up365',
     "                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int + 1,",
     "                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int,",
     'edit_rollback_test.ts', 'rolling back only'),
    ('handler_names_task_from_partial_list', 'handler',
     "    if (!list || !list.complete) return { kind: 'clarify', reason: 'tasks_unavailable' };",
     "    if (!list) return { kind: 'clarify', reason: 'tasks_unavailable' };",
     'edit_command_test.ts', 'cannot see'),
    ('handler_edits_shared_content', 'handler',
     "    if (change.field !== 'state' && target.task_ref.startsWith('sanity:')) {",
     "    if (false) {",
     'edit_published_test.ts', 'shared title'),
    ('handler_drafts_any_published_id', 'handler',
     "        const target = list.tasks.find(t => t.task_ref === request.draft.task_ref);",
     "        const target = list.tasks.find(t => t.task_ref === request.draft.task_ref) ??\n          { task_ref: request.draft.task_ref, title: 'Any task' };",
     'edit_published_test.ts', 'prepared only for a task'),
    ('commands_mobile_labels_only', 'companion-actions/commands.ts',
     "    'explorer et créer des liens': 'Explore and connect', 'explorer et se connecter': 'Explore and connect',",
     "    'explorer et créer des liens': 'Explore and connect',",
     'edit_command_test.ts', 'priority label'),
    ('commands_quotes_unchecked', 'companion-actions/commands.ts',
     "    if ((line.match(QUOTE_MARK) ?? []).length !== quotes) return { kind: 'clarify', reason: 'multiple_changes' };\n",
     "",
     'edit_command_test.ts', 'more quoted text'),
    ('handler_trusts_body_owner', 'handler',
     "    const parsed = parseAction(body as Record<string, unknown>);",
     "    const claimed = (body as Record<string, unknown>).user_id;\n    const userIdOverride = typeof claimed === 'string' ? claimed : null;\n    const parsed = parseAction(body as Record<string, unknown>);",
     'boundary_test.ts', 'wrong account'),
]
# The owner mutation must also route the claimed id into the RPCs.
EXTRA = {
    'handler_trusts_body_owner': [("p_user_id: userId,\n        p_operation_id: request.operation_id,\n        p_contract_version: version,\n        p_authorization: request.authorization,\n        p_operations",
                                   "p_user_id: userIdOverride ?? userId,\n        p_operation_id: request.operation_id,\n        p_contract_version: version,\n        p_authorization: request.authorization,\n        p_operations")],
}


def mutate(text, find, replace, name):
    if text.count(find) != 1:
        raise SystemExit(f'{name}: anchor found {text.count(find)} times, expected 1')
    return text.replace(find, replace)


def run_one(m, tmp):
    name, target, find, replace, test_file, fragment = m
    env = dict(os.environ)
    if target in SQL_TARGETS:
        src, var = SQL_TARGETS[target]
        out = os.path.join(tmp, f'{name}.sql')
        with open(src) as f:
            text = mutate(f.read(), find, replace, name)
        with open(out, 'w') as f:
            f.write(text)
        env[var] = out
        if target == 'up365':
            with open(MIGRATION_367) as f:
                later = f.read()
            if later.count(find) > 1:
                raise SystemExit(f'{name}: anchor found {later.count(find)} times in #367, expected 0 or 1')
            at = later.find(find)
            start = later.rfind('create or replace function public.', 0, at) if at >= 0 else -1
            inside = start >= 0 and later[start:at].count('$$') == 1 and any(
                later.startswith(f'create or replace function public.{fn}(', start) for fn in SHARED_365_367)
            if inside:
                out367 = os.path.join(tmp, f'{name}.367.sql')
                with open(out367, 'w') as f:
                    f.write(later.replace(find, replace))
                env['ACTIONS_MIGRATION_367_FILE'] = out367
    else:
        dst = os.path.join(tmp, name, 'functions')
        shutil.copytree(FUNCTIONS, dst)
        # 'handler' is companion-actions/handler.ts; otherwise a path under functions/.
        handler = os.path.join(dst, 'companion-actions', 'handler.ts') if target == 'handler' \
            else os.path.join(dst, target)
        with open(handler) as f:
            text = mutate(f.read(), find, replace, name)
        for a, b in EXTRA.get(name, []):
            text = mutate(text, a, b, name)
        with open(handler, 'w') as f:
            f.write(text)
        env['ACTIONS_FUNCTIONS_SRC'] = dst
    env['ACTIONS_FILTER'] = f'/{fragment}|cleanup/'
    try:
        proc = subprocess.run([os.path.join(HERE, 'run.sh'), test_file], cwd=HERE, env=env,
                              capture_output=True, text=True, timeout=600, start_new_session=True)
    except subprocess.TimeoutExpired:
        return 'UNRESOLVED (timeout)'
    output = proc.stdout + proc.stderr
    if proc.returncode == 0:
        return 'SURVIVED'
    if 'AssertionError' in output:
        return 'RED'
    return 'UNRESOLVED (' + (output.strip().splitlines() or ['no output'])[-1][:120] + ')'


def main():
    wanted = set(sys.argv[1:])
    selected = [m for m in MUTATIONS if not wanted or m[0] in wanted]
    results = []
    with tempfile.TemporaryDirectory(prefix='actions361-mutations-') as tmp:
        for m in selected:
            verdict = run_one(m, tmp)
            results.append((m[0], verdict))
            print(f'{m[0]:<32} {m[4]:<18} {verdict}', flush=True)
    # Leave the stack on the real function source.
    subprocess.run([os.path.join(HERE, 'run.sh'), 'actions_test.ts'], cwd=HERE, capture_output=True, text=True)
    red = sum(1 for _, v in results if v == 'RED')
    print(f'{red} of {len(results)} RED')
    return 0 if red == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())

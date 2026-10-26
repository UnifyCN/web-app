#!/usr/bin/env python3 -I
"""Breaks one mechanism at a time and runs the test that must catch it (mobile-app#361).

Each mutation edits a temporary copy of the migration, the rollback script or the
edge function, never the source. The run must fail with an assertion error. A pass
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
FUNCTIONS = os.path.join(ROOT, 'functions')

# name, target, find, replace, test file, test-name fragment
MUTATIONS = [
    ('undo_forgets_reason', 'up',
     "'inverse', public.companion_set_state_op(v_ref, v_before_state, v_before_reason, v_after));",
     "'inverse', public.companion_set_state_op(v_ref, v_before_state, null, v_after));",
     'undo_test.ts', 'exact earlier state'),
    ('undo_ignores_newer_edit', 'up',
     "      v_conflict := true;\n", "      v_conflict := false;\n",
     'undo_test.ts', 'older receipt cannot reverse'),
    ('receipt_always_current', 'up',
     "    'current', u.operation_id is null\n               and public.companion_task_revision(p_receipt.user_id, p_receipt.task_ref) = (r->>'after_revision')::bigint,",
     "    'current', true,",
     'undo_test.ts', 'legacy Checklist write after a receipt'),
    ('approval_hash_unchecked', 'up',
     "       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'\n     returning p.id, p.undo_of",
     "       and p.status = 'draft'\n     returning p.id, p.undo_of",
     'boundary_test.ts', 'forged or model-made approval'),
    ('no_operation_lock', 'up',
     "  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user, p_op));",
     "  perform 1;",
     'boundary_test.ts', 'result lookup'),
    ('custom_revision_unchecked', 'up',
     "    if v_ct.removed_at is not null then\n      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));\n    end if;\n    if v_before <> v_expected then",
     "    if v_ct.removed_at is not null then\n      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));\n    end if;\n    if false then",
     'boundary_test.ts', 'stale revision'),
    ('completion_keeps_reminders', 'up',
     "    perform public.companion_cancel_reminders(new.user_id, 'sanity:' || new.sanity_checklist_id, 'task_completed');",
     "    null;",
     'undo_test.ts', 'Undo of completion'),
    ('registry_accepts_any_type', 'up',
     "    if v_type is null or v_type <> 'task.set_state' then",
     "    if v_type is null then",
     'boundary_test.ts', 'invalid payloads'),
    ('rollback_keeps_pending', 'down',
     "update public.companion_task_reminders\n   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now()\n where status = 'pending';",
     "select 1;",
     'rollback_test.ts', 'full rollback stops every pending reminder'),
    ('handler_spends_quota', 'handler',
     "    if (!userId) return finish(json({ error: 'unauthorized' }, 401), 'unauthorized');",
     "    if (!userId) return finish(json({ error: 'unauthorized' }, 401), 'unauthorized');\n    await admin.rpc('check_and_increment_chatbot_usage', { p_user_id: userId });",
     'boundary_test.ts', 'AI limit'),
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
    if target in ('up', 'down'):
        src = MIGRATION if target == 'up' else ROLLBACK
        out = os.path.join(tmp, f'{name}.sql')
        with open(src) as f:
            text = mutate(f.read(), find, replace, name)
        with open(out, 'w') as f:
            f.write(text)
        env['ACTIONS_MIGRATION_FILE' if target == 'up' else 'ACTIONS_ROLLBACK_FILE'] = out
    else:
        dst = os.path.join(tmp, name, 'functions')
        shutil.copytree(FUNCTIONS, dst)
        handler = os.path.join(dst, 'companion-actions', 'handler.ts')
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

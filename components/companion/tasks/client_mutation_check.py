#!/usr/bin/env python3
"""Mutation check for the web task-action client tests (mobile-app#361).

Each mutation breaks one rule in production code, runs the mounted tests, and
expects a named test to fail by assertion. The file is restored after every
run. A mutation that leaves every test green, or that fails by a crash instead
of an assertion, fails this check.

Usage (from the repo root): python3 components/companion/tasks/client_mutation_check.py
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
TESTS = ['components/companion/tasks/TaskActions.test.tsx',
         'app/api/companion/actions/route.test.ts']

MUTATIONS = [
    ('retry gets a new operation id', 'lib/companionActions/taskActionStore.ts',
     'return this.run(taskRef, p.write);',
     'return this.run(taskRef, { ...p.write, operationId: this.deps.newOperationId() });',
     'not applied retries the same operation'),
    ('a lost response is retried instead of looked up', 'lib/companionActions/taskActionStore.ts',
     '        report("unknown");\n        await this.lookup(taskRef, write);',
     '        report("unknown");\n        this.set(taskRef, { phase: "not_applied", write });',
     'a lost response is looked up'),
    ('pending allows a new write', 'lib/companionActions/taskActionStore.ts',
     '  "pending",\n  "lookup_failed",', '  "lookup_failed",',
     'pending and failed lookups stay unresolved'),
    ('Undo names the newest receipt, not its own', 'components/companion/tasks/TaskStatePanel.tsx',
     'void store.undo(taskRef, receipt.operationId)',
     'void store.undo(taskRef, progress.lastReceipt?.operationId ?? receipt.operationId)',
     'its Undo stays tied to it'),
    ('a saved receipt keeps claiming to be current', 'components/companion/tasks/TaskStatePanel.tsx',
     '            phase.receipt.current &&\n            progress.revision === phase.receipt.afterRevision,',
     '            phase.receipt.current,',
     'becomes historical'),
    ('approving the compensating change uses ui_control', 'lib/companionActions/taskActionStore.ts',
     '        kind: "approved_proposal",\n        proposal_id: p.proposal.proposalId,\n        proposal_revision: p.proposal.proposalRevision,',
     '        kind: "ui_control",',
     'offers a reviewed change'),
    ('offline still allows writes', 'hooks/useTaskActions.ts',
     'canWrite: status === "ready" && !stale && !query.isFetching,',
     'canWrite: (status === "ready" || status === "offline") && !query.isFetching,',
     'offline'),
    ('sign-out keeps the previous store', 'hooks/useTaskActions.ts',
     '    clearTaskActionStores(userId);\n', '',
     'sign-out clears'),
    ('telemetry copies the task reference', 'lib/companionActions/analytics.ts',
     '    entry_surface: surface === "companion" ? "companion" : "checklist",',
     '    entry_surface: surface === "companion" ? "companion" : "checklist",\n    ...({ task_ref: "sanity:sin" } as {}),',
     'allowlisted'),
    ('opening the drawer remounts the conversation', 'app/(main)/companion/page.tsx',
     '      <ChatPanel\n', '      <ChatPanel\n        key={String(tasksOpen)}\n',
     'keeps the typed message'),
    ('the proxy collapses function errors to 500', 'app/api/companion/actions/route.ts',
     'return NextResponse.json(upstream, { status: ctx.status, headers });',
     'return NextResponse.json(upstream, { status: 500, headers });',
     'passes conflict detail'),
    ('the proxy forwards signed-out requests', 'app/api/companion/actions/route.ts',
     '  if (!user) {', '  if (false) {',
     'refuses a signed-out request'),
]

def run_tests():
    out = subprocess.run(['npx', 'vitest', 'run', *TESTS], cwd=ROOT,
                         capture_output=True, text=True, timeout=600)
    text = re.sub(r'\x1b\[[0-9;]*m', '', out.stdout + out.stderr)
    failed = sorted(set(m.strip() for m in re.findall(r'^\s*× (.+?)(?: \d+ms)?$', text, re.M)))
    crashed = 'Failed to load' in text or 'Error: Cannot find' in text or 'SyntaxError' in text
    return failed, crashed

def main():
    ok = True
    failed, crashed = run_tests()
    if failed or crashed:
        print('baseline is not green; fix that first', failed); return 1
    for name, rel, old, new, expect in MUTATIONS:
        path = ROOT / rel
        src = path.read_text()
        if src.count(old) != 1:
            print(f'UNRESOLVED {name}: anchor not found once in {rel}'); ok = False; continue
        path.write_text(src.replace(old, new, 1))
        try:
            failed, crashed = run_tests()
        finally:
            path.write_text(src)
        bound = bool(failed) and not crashed and any(expect in f for f in failed)
        print(f"{'RED' if bound else 'NOT BOUND'} {name}: {len(failed)} failed{' (crash)' if crashed else ''}"
              + (f' e.g. {failed[0]}' if failed else ''))
        ok = ok and bound
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())

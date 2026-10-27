# Companion task actions: endpoint tests (mobile-app#361)

Tests for `supabase/functions/companion-actions` and the migration
`supabase/migrations/20261025235536_companion_task_actions.sql`, which this repo
mirrors byte for byte from the mobile repo (the migration authority). This repo is
the deploy authority for the function.

They run against a disposable local Supabase stack (`project_id = unify-actions-363`,
ports 60671-60674) that starts from a copy of the hosted schema
(`supabase/migrations/20260101000000_hosted_baseline.sql`) and applies the
production migration and rollback script itself. Every assertion goes through the
public HTTP boundary with real JWTs of synthetic accounts, or through the legacy
PostgREST calls of released clients. `run.sh` refuses any non-127.0.0.1 URL.

```
./run.sh                    # every *_test.ts, database reset before each file
./run.sh undo_test.ts       # one file
ACTIONS_KEEP=1 ./run.sh     # start and reset only; prints the ACTIONS_* env
python3 -I mutation_check.py   # breaks one mechanism at a time; each must fail by assertion
```

Needs docker, the Supabase CLI and deno. No hosted project is contacted.

#366 task steps: `steps_test.ts` and `steps_rollback_test.ts` also apply
`20261027183644_companion_task_steps.sql`. A new step under a content-backed task needs
its published Checklist document; the edge function reads it from
`COMPANION_CONTENT_QUERY_URL`, which `run.sh` points at the tests' stand-in
(`support.ts` `contentStub`) on `ACTIONS_CONTENT_PORT` (default 60675; the edge runtime
reaches it as `host.docker.internal`). The secret is set when the stack starts, so set
the port before `supabase start`. `scripts/verify-companion-task-steps.mjs` is the
real-browser check of the web step controls against this stack (same port).

Results, test order and proof limits: mobile repo `DOCS/companion-actions/361-task-actions.md`.

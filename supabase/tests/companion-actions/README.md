# Companion task actions: endpoint tests (mobile-app#361)

Tests for `supabase/functions/companion-actions` and the migrations
`supabase/migrations/20261025235536_companion_task_actions.sql` (#361),
`20261026165156_companion_task_create.sql` (#363) and
`20261028001530_companion_task_edit.sql` (#365), which this repo mirrors byte for
byte from the mobile repo (the migration authority). This repo is the deploy
authority for the function. `edit_published_test.ts` runs the same handler in
process against the same stack, with a controlled published-content fixture (the
local edge runtime cannot reach published content).

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

Results, test order and proof limits: mobile repo `DOCS/companion-actions/361-task-actions.md`.

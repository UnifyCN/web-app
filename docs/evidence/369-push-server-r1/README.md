# Companion 369 server stage

This candidate implements the server/schema stage only. Independent review, the MOBILE client stage, native proof, hosted qualification, provider enablement, and ticket acceptance remain pending.

The authoritative evidence and fixed handoff are in the assigned MOBILE primary:

- `/Users/savargupta/.t3/worktrees/Unify/t3-56bad9ac/DOCS/companion-actions/evidence/369-push-server-r1/HANDOFF.md`
- The same directory contains `README.md`, `summary.json`, `implementation-pins.json`, and the ignored terminal `final-pins.json`.

WEB continues branch `fix/reminder-standards-368-r1-root` from `623179cee615057de2c20c8c6216e192891dab4b`. No branch switch, disposable-probe merge, push, PR/watch action, integration, hosted operation, real push/model call, or native operation occurred.

Fixed contract: `supabase/functions/companion-actions/PUSH_CONTRACT.md`. Client types: `lib/companionActions/pushContract.ts`, mirrored exactly in MOBILE. Worker and enablement conditions: `supabase/workers/companion-push/README.md`.

MOBILE generated migration `20261030181040_companion_reminder_push.sql`. This repository mirrors that migration and rollback exactly. All 18 relevant SQL mirrors match. Enrollment and dispatch are disabled by default. The migration creates no send Cron or worker login/grants. In-app schedules and existing social/learn behavior remain separate.

Final local results: 58 selected new tests pass in each of two consecutive complete runs. Their 307 input entries match. Each run has 29 loopback fixture sends, ten lifecycle race observations, three enrollment race observations, and five deadline observations. Counts overlap. Four isolated faults fail at their intended assertions. The restored original-source control passes.

The existing backend final per-file result set has 254 passes across all 38 files. Two missing-locale-asset setup failures retain their failed logs and corrected rechecks. Edge tests pass 277 tests. WEB tests pass 776 tests with 13 existing skips. WEB build, types, i18n, changed-file lint, Edge types, and new-service frozen types pass. The six older service-test type errors and 12 full-lint errors remain mapped baseline limits.

Only the owned local project was removed. All seven allocated ports are free. Protected containers, mount sets, volumes, and seven nondefault network IDs match. `strict_network_ids_unchanged=false` because Docker recreated its default bridge during the recorded Resource Saver startup interval. Root/review must assess that narrow exception. Impeccable remains 3.9.1.

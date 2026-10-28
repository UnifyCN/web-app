# Every unfinished retry review stays reachable (SPEC review r2 R2-SPEC-1)

The full record (red/green logs, deliberate faults, gates, privilege correction and
limits) is in the mobile repo: `DOCS/companion-actions/evidence/364-multiple-reviews-r2/README.md`,
with the contract in `DOCS/companion-actions/364-plan.md`.

Web changes: the mirrored migration (byte-identical to mobile, sha256 `7fc13153…`; only
`companion_plan_view` changed: it returns `reviews`, every open or approved retry review
oldest first, and keeps the earlier `review` field unchanged); the new boundary file
`supabase/tests/companion-actions/plan_multiple_reviews_test.ts`; the client contract
(`reviews`, fallback to `review` only when absent), one review section per review keyed by
its id inside the shared `Reveal`, named headings when more than one is open
(`plans.retryReviewNamed` in all seven locales), the entry summary; one mounted case in
`PlanLocalStack.test.tsx` (needs `ACTIONS_DB_CONTAINER`) and the typed fixture in
`PlanPanelMotion.test.tsx`. Edge function source unchanged.

Web gates on this candidate: `vitest run` 633 passed + 8 skipped; mounted local-stack and
motion files 12 passed with the owned stack; `tsc --noEmit`, changed-file eslint and i18n
parity exit 0; `npm run build` exit 0 once; edge `deno check` 0 and `deno test` 267
passed. Backend boundary on the owned stack: 15 files, 104 passed.

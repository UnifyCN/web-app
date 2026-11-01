# Retry after a context change asks for a new reviewed approval (SPEC review r1 F3)

The full record (red/green logs, deliberate faults, gates and limits) is in the mobile
repo: `DOCS/companion-actions/evidence/364-retry-review-r1/README.md`, with the contract
in `DOCS/companion-actions/364-plan.md`.

Web changes: the mirrored migration and rollback (byte-identical to mobile), the new
boundary file `supabase/tests/companion-actions/plan_retry_review_test.ts` and two
helpers in `planSupport.ts`, the client contract, receipt text, saved-plan review block
(shared `Reveal`), entry summary, six `plans.*` keys in all seven locales, one mounted
case in `PlanLocalStack.test.tsx` (needs `ACTIONS_DB_CONTAINER`) and typed fixture
fields in `PlanPanelMotion.test.tsx`. The edge function source is unchanged.

Web gates on this candidate: `vitest run` 633 passed + 7 skipped; mounted local-stack and
motion files 11 passed with the owned stack; `tsc --noEmit`, changed-file eslint and
i18n parity exit 0; `npm run build` exit 0 once in this checkout. Backend boundary on the
owned stack: 14 files, 99 passed.

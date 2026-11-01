# Web profile composition corrections

This candidate corrects R371-MC-SPEC-01 and R371-MC-SPEC-02. It needs fresh independent review. It gives no ticket, native, hosted, integration, or release acceptance.

- Base: `ca8f099a1f0541cb67ef6c9128faf829c5546ed7`, tree `ee3e040bbb2bac3a594b566992510f58121e9f92`.
- Root: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-profile371-main-corrections`.
- Branch: `fix/companion-profile-main-corrections-371`.
- Prior SPEC report: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-d05d79ce/DOCS/companion-actions/evidence/review-371-web-main-composition-r1-SPEC/report.md`.
- Prior STANDARDS report: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-91dbcc7b/DOCS/companion-actions/evidence/review-371-web-main-composition-r1-STANDARDS/report.md`.

## Corrections

R371-MC-SPEC-01: `services/profile.ts` now conditions a stage-cache update on the captured account ID, raw arrival date, and stored stage. It uses `is(..., null)` for null values. The date and stage must still match when the database evaluates the update. An old read cannot replace the stage restored by an intervening null-date Undo. An unchanged row can still receive a current stage cache. The profile action, Undo, stage calculation, and legacy stage-0 rules do not change.

R371-MC-SPEC-02: `hooks/useTaskActions.ts` now cancels the current profile, module, and learning-summary query roots before invalidation. Module and summary prefixes cover every cached language and module detail. The continuation checks the same account and session epoch after cancellation. A token refresh keeps the work. Account replacement stops it. The same callback runs after a profile save or Undo.

The additional current-profile cancellation fixes another pending-read case in the same callback. On the unchanged code, an initial profile read could remain pending after the confirmed save. The new mounted test fails on that code and passes when cancellation permits a fresh profile read. This is an extra regression case found during the correction, not a finding attributed to the prior reviewer.

## Tests and controls

The falsifiers are a restored null-date stage-0 profile changing track, an old stage cache overwriting a changed row, or a saved province leaving current Learn content on the old province. Tests also check stale pending responses, Undo, language caches, null predicates, account replacement, and same-account refresh.

Two new permanent files contain 14 distinct cases:

- `services/profile.stageCache.test.ts`: seven public-reader cases. The installed Supabase SDK constructs the actual PostgREST URLs and body. A local in-process fetch models row predicate matching. This proves the request filters and client behavior. It does not run Postgres, Auth, or RLS.
- `hooks/profileLearnRefresh.test.tsx`: seven mounted cases. They use the real Learn services, hooks, query cache, action store, action client, and receipt parser. Supabase, CMS, Auth, and action transport data are scripted. They do not run a full browser page or real service.

Both permanent files ran against unchanged production code before the fixes. Each had six assertion failures and one passing control. Both now pass seven of seven. After the first green stage run, the predicate fixture was corrected so SQL null cannot match an equality string. The final fixture was rerun with the exact base profile source: six assertion failures and one passing control again. Original defect assertions did not change.

Eight deliberate faults were tested separately: remove the date guard; remove the stage guard; use equality for null; omit module refresh; omit summary refresh; omit profile refresh; omit cancellation; omit the ownership check after cancellation. Every fault causes an assertion failure. Each run restores the exact fixed production bytes. The results and restored hashes are in `fault-results.json` in the archive.

## Retained reviewer reproductions

The original two reproduction files, adapted only at absolute source import paths, fail twice on the base. The three stage cases pass on the correction without other edits.

The original Learn case still failed on its immediate captured DOM string after the fix. The timing observation records that the actual query cache already contains Ontario, while React still displays the previous notification's BC value. Waiting for the notification changes the DOM to Ontario with one action write and before the test's manual-invalidation control. The failure is preserved.

One `waitFor` assertion was added before that snapshot in the temporary Learn reproduction. The existing final assertion and positive control remain. This adapted case fails on the exact base hook and passes on the corrected hook. The final retained run passes all four reviewer cases. `reviewer-learn-notification-wait.diff` records the added wait. This is not claimed as an unchanged reviewer copy. Both temporary executable reproduction files were removed from the application tree before the final gates. Their bytes remain in the archive.

## Final gates

| Check | Result |
| --- | --- |
| New permanent cases plus retained Checklist composition | 35 passed; exit 0 |
| Full Web suite | 839 passed, 13 skipped, 78 files; exit 0 |
| Normal TypeScript | exit 0 |
| Changed production/test-file ESLint | 0 errors, 0 warnings; exit 0 |
| Translation parity | exit 0; 2697 EN keys |
| Production build | exit 0 with external outbound connections denied |
| Full ESLint | exit 1; the same 12 errors and 8 warnings in five base-identical files |

Counts overlap and must not be added. The complete command records and logs are in `raw-evidence.tar.gz`. The manifest lists each included member's size and SHA-256. Failed and diagnostic records remain.

The build uses the existing reviewed local-font sandbox profile. Its fresh control refuses an external connection with EPERM and returns local HTTP 200 with the exact 21-byte control body. The owned control server is stopped. No proxy or Node preload environment was present. No configuration or build flag in the application changed.

Dependency versions match the lock: Supabase JS 2.105.4, TanStack Query 5.100.10, Vitest 3.2.7, and TypeScript 5.9.3. The independent dependency copy has no shared writable directory. The manifest and lock remain unchanged.

The Supabase changelog and current filter documentation were checked. These client filters need no schema, table-exposure, privilege, or dependency change. The public markdown fetch first failed in the web tool because of its content type. The direct markdown fetch succeeded. References: [changelog](https://supabase.com/changelog), [filter chaining](https://supabase.com/docs/reference/javascript/using-filters), and [null filters](https://supabase.com/docs/reference/javascript/is).

## Proof and cleanup limits

The action service, SQL, migration identities, shared adapters, Checklist resolution, stage/province helpers, locale files, and Learn query-key definitions are unchanged from the base. Earlier Edge and real-service evidence remains supplied. Those suites were not repeated. No new hosted CMS, database, privilege, provider, delivery, browser, native, or screen-reader qualification is claimed.

All owned check processes ended. The network-control server is stopped. The independent ignored node_modules, .next output, local test cache, and external evidence directory remain. No Docker resource was used. Old candidates, integration roots, prior reports, and raw failures remain unchanged. Impeccable remains 3.9.1. The Mobile CI correction and its pending review are separate inputs and were not changed here.

HANDOFF: COMPANION_PROFILE_371_MAIN_CORRECTIONS_R2_REVIEW_READY

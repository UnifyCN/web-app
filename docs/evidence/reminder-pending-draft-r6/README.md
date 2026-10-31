# Pending Auth input correction

HANDOFF: COMPANION_368_PENDING_DRAFT_R6_READY_FOR_REVIEW

Base: `f898e160fce913910e362003aff1aecb79569695`, tree `d2fe898eea1ede2f90d21391578dd5866583d2c3`.

R6 SPEC closed R368-SPEC-5 and reported P2 R368-SPEC-6. The enabled Companion field discarded text while the first Auth read was pending. The same account could then be confirmed, with the field still empty. The prior code also allowed pending lesson sends and treated a failed first read as sign-out.

## Change and failure conditions

New pending text has separate storage. It belongs to the captured account and epoch. The first account confirmation can retain this text only in that epoch. An old account's stored draft stays hidden while Auth is unknown. A real account change or session reset clears private text. A token refresh keeps it. Each draft writer also checks its captured epoch.

The field stays editable while Auth is unknown. Send and starter controls stay disabled. Both submit handlers check ownership before they clear text or start work. A failed unresolved read remains unknown. It cannot start a Checklist read under a null account key. Confirmed sign-out remains distinct.

These results would disprove the correction: lost new text after a same-account confirmation, read failure or route return; text retained after account replacement or either batched reset; an enabled pending send; a pending create/model call; old account text shown while unresolved; or a null-account Checklist read after the failed Auth read.

Nine production files changed. `ChatInput` gains an optional send-only disable flag. Existing textarea disabling is unchanged. Starter controls use their existing disabled cursor and opacity treatment. No copy, palette, motion, locale, service, SQL, migration, dependency or configuration changed.

## Test order

The exact R6 reviewer source is saved as `reviewer-original.test.tsx.txt`. Its temporary executable copy was byte-identical. On unchanged base code it gave five passes and one assertion failure. After the initial storage correction all six passed. The executable copy was removed before the full suite.

The permanent caller file is `components/companion/tasks/ComposerPendingSession.test.tsx`. Initial storage code preceded this file. Further cases were added before the related initial-event, failed-read, Checklist, send and starter corrections. Intermediate failures are retained. The completed twelve cases were also run on the unchanged base: three controls passed and nine cases failed at assertions. Do not call all twelve strictly test-first.

The first case starts with an unknown account at epoch zero. The remaining cases cover both callers, first confirmation, read failure and retry, navigation, explicit clear, hidden old drafts, account replacement, both batched reset orders, refresh, disabled starters and one ready send. Existing assertions were not changed.

Eleven deliberate faults each failed at an assertion. `fault-results.json` records the result of every run and the restored source hashes. This does not establish independent sensitivity to every individual guard. For example, the captured-writer check also has source and type evidence.

## Final results

| Check | Result | Limit |
| --- | --- | --- |
| Exact reviewer copy | 6 pass | Scripted SDK and services |
| Selected caller and regression run | 69 pass | Includes the six reviewer cases |
| Full web suite | 772 pass, 13 skip, 72 files, exit 0 | Counts overlap the selected run |
| Types, i18n, changed-file lint | Exit 0 | Normal TypeScript, incremental output disabled |
| Next build | Exit 0 | Local build |
| Full lint | Exit 1, 12 errors | Same three baseline files, distribution 7/1/4 |
| Chromium, actual hooks and callers | 23 pass | Scripted SDK/services and route replacement |
| Chromium on unchanged base | 2 pass, 1 assertion failure | Pending text becomes empty |
| Preservation audit | 190 pass | 163 service inputs, 21 mirrors, 3 lint files, 3 source/integration states |

Storage and caller tests prove text retention, visible reset and send gating for the listed event orders. They pass through a scripted SDK. They do not prove the real SDK's event order or internal token selection.

The Chromium driver uses the actual Companion and Checklist pages, Auth hooks, account store, composer store and CSS. Keyboard entry, Enter, focus, ready Send, reset and failed-read recovery are exercised. It replaces only the SDK, data services, action endpoint and analytics boundary. It makes no provider call. Route replacement is a fixture operation, not Next routing. This is client rendering, not a new hydration or Next cold-load test. Existing permanent hydration controls remain in the full suite.

The first browser setup failed because a fixture export was missing. Its log and the original driver are retained. A throwing export was then added to the fixture. Do not count that setup failure as a product failure. Final browser output records no page error. Both browser runs close their owned resources.

Service files and mirrors match the prior executed inventory. This permits reuse of that bounded local service evidence. It adds no fresh service, Cron, RLS, hosted, native, VoiceOver, model or delivery proof. The mobile candidate and both integration branches stay unchanged. No ticket, native criterion, integration or release is accepted by this record.

## Reproduction and records

From an owned runtime made from this commit, install the exact lockfile. Run the permanent file with Vitest. Run `node docs/evidence/reminder-pending-draft-r6/verify-browser.mjs` with port 3472 free. `PENDING_BROWSER_PORT` and `PENDING_BROWSER_OUT` can redirect its port and output. Do not run the mutation driver beside another check. It temporarily replaces the listed source files and restores their bytes in `finally`.

`compressed-records.json` identifies each compressed record by original path, byte count and SHA-256. Decompression recovers the complete record. Zero-byte logs remain valid successful outputs. `source-audit.json` records every preservation comparison. This report gives local correction evidence only. Independent reviews are still required.

# Returned Auth error correction

HANDOFF: COMPANION_368_RETURNED_AUTH_R7_READY_FOR_REVIEWS

Base: `aeb1ba96df61d36fe2c15eb3f75ed09d34276adb`, tree `ac4f0860caeab7a08c581c77eb3f48a79728e993`.

The R7 SPEC review found P2 R368-SPEC-7. The SDK can resolve `getSession()` with a null session and an Auth error. `getSessionUser` ignored that error. Both editors then treated the reply as sign-out and discarded pending text, input identity and focus. This predates the base. The prior rejected-promise correction did not cover it.

The production change adds two lines in `services/auth.ts`. It reads the returned error and throws it before it returns a user or null. The existing query error path keeps first-read ownership unresolved. A successful null session still confirms sign-out. No hook, UI, account store, locale, SQL, migration, endpoint, dependency or configuration changes in this delta.

The direct consumers are the Auth query and the moderation blocked-account query helper. The latter already handles rejected reads through its query. Its prefetch caller catches rejection. The new rendered tests exercise the Auth consumer. They do not directly test the moderation failure path.

## Failure conditions and test order

Lost text, changed ownership, a replaced input, lost focus, or a null-account Checklist read after a failed session read would disprove the fix. Retained text after a successful sign-out would also fail it.

The exact reviewer source is retained. Only its observer directory changed in executable copies. Both original text assertions failed on the unchanged base. Both pass after the correction. Separate repeated RED and GREEN observer directories retain the owner, epoch, query state, visible text, input identity and focus.

Four permanent rendered cases were added before the production edit. Two cover a returned `AuthRetryableFetchError` and same-account recovery, one per editor. Two are successful-sign-out controls. The unchanged base gives fourteen passes and two assertion failures. The corrected file gives sixteen passes. The previous twelve case bodies are byte-identical. Their SDK fixture types now permit null sessions and errors. Do not call the two sign-out controls failing tests first; they passed before and after.

`PREPARATION.md`, `FINAL_PREPARATION.json` and the unprefixed commands describe the historical archive preparation while R7 Standards ran. `candidate-*` records describe fresh checks after application in the canonical web worktree. The prepared production and test bytes match the applied bytes.

## Results

| Check | Result | Proof limit |
| --- | --- | --- |
| Retained reviewer returned-error cases | 2 pass | Scripted SDK and services |
| Complete selected archive run | 75 pass in 8 files | Includes both reviewer copies and the permanent cases |
| Canonical full suite | 776 pass, 13 skip, 72 files, exit 0 | Counts overlap the selected run |
| Canonical types, i18n and changed-file lint | Exit 0 | Normal TypeScript, incremental output disabled |
| Canonical Next build | Exit 0 | Local build |
| Canonical full lint | Exit 1, 12 errors | Same baseline files and 7/1/4 distribution |
| Canonical Chromium | 28 pass, no page errors | Actual pages/hooks/CSS with scripted SDK/services |
| Chromium with base Auth source | 21 pass, 1 assertion failure | Returned-error text and owner preservation fail |
| Preservation audit | 190 pass | 163 server inputs, 21 mirrors, 3 lint files, 3 source/integration states |

The test and browser checks prove the listed visible state transitions. They pass through scripted Auth, data services, action responses and route replacement. The browser check is client rendering, not Next routing or new hydration proof. The prior hydration controls remain in the full suite. The installed SDK source establishes the returned-error shape, not its real event order or token behavior.

The preparation has two disclosed record issues. Its first selected command matched only four files and passed 44 cases. The complete replacement matched eight files and passed 75. The first root RED observer files were overwritten by GREEN. RED logs and result JSON survive. The original review evidence is unchanged. A repeated pair now preserves RED and GREEN observers separately. Neither issue is counted as a product result beyond the recorded assertions.

The first passing browser driver waited for the expected error status. The final driver waits for request settlement. This lets the unchanged success state reach the text/owner assertion. Both driver versions remain. This wait change adds no product change.

R7 Standards passed the prior candidate with one P3 fixture-duplication advisory. Defer fixture extraction to a separate common-fixture change. This correction keeps the previous twelve case bodies unchanged and adds no test boundary below the rendered caller layer.

No fresh server, Cron, RLS, native, hosted, model or delivery result is claimed. Server inputs and mirrors retain the supplied local service proof. The mobile candidate and both integration branches stay unchanged. No ticket, criterion 8, integration or release acceptance follows.

## Records and cleanup

The candidate archive comparison covers 1,389 base inputs. Of these, 1,387 remain exact. Only the Auth service and the existing caller test differ. `prepared-audit.json` records both source hashes and unchanged case bodies. `candidate-source-audit.json` records the independent server/mirror and integration comparisons. Compressed records retain their original byte counts and SHA-256 in `compressed-records.json`.

Executable reviewer copies were removed before normal gates. Browser processes and the owned listener are closed. The stopped preparation runtime and build cache remain in the root-owned preparation directory. Canonical dependencies remain installed. No service stack, native resource or unrelated process was used.

To repeat the browser check in an owned runtime, install the exact lockfile and run `node docs/evidence/reminder-returned-auth-r7/verify-browser.mjs`. Check that port 3478 is free first. Set `PENDING_BROWSER_PORT` and `PENDING_BROWSER_OUT` to use owned paths. Preserve the canonical source and prior evidence during review.

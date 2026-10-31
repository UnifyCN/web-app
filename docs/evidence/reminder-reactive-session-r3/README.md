R368-SPEC-3 is corrected. The candidate needs independent review. No ticket or native acceptance is granted.

The existing account epoch now has a React subscription. Owner checks still change synchronously. A queued microtask notifies React after any current render. Batched events still contribute both epoch changes. Account-owned store, client and generation consumers observe the change even when the final Auth query data is equal. Same-account token refresh keeps the epoch.

The real Auth callback publishes the event user before those consumers render. It cancels an older Auth query before that publication, then requests a fresh session read. This prevents stale query data from replacing the current event owner. The actual auth provider and its internal ordering remain unproved; all Auth events and stored-session replies here are scripted.

The callback also runs the existing Companion/Checklist private-cache policy at an actual account transition. It does not depend on a React render of the intermediate signed-out state. The cleanup covers task/plan/composer stores and the eleven existing private query scopes. Public cached content remains. The existing useAccountScope hook uses the same extracted function for its kept-account path. Checklist's unchanged tasks key moved to a pure constant module to avoid a hook import cycle. No request, server authorization, SQL, migration, locale, palette, motion or dependency changed.

Falsifiers: a reminder date after either reset, a lost token-refresh draft, cached private work after reset, stale Auth data or an old reply replacing B, a missed account-generation change, a changed service input, or a mismatched mirror.

Test order:

- The two real-drawer reset cases failed at assertions before the first code fix. The token-refresh control passed. The retained reviewer text remains exact at SHA-256 5256acffc697fc8dd499be6137e91ac7646c32f2e2cbf10b6512daa67f55a770.
- After the epoch subscription, all three drawer cases passed. Two new real-composer reset cases then failed at assertions before the common cleanup was extracted and called from Auth. Its token-refresh control passed.
- The five further generation, delayed-reply, query-scope and held-read controls were written after their code. The final eleven cases ran on the unchanged 5575275 product files: eight assertion failures, three controls passed. The new helper files were present but unused by that base. Original source bytes were restored exactly.
- The permanent tests now also reopen the reminder after reset and require an empty date. The exact unchanged three-case reviewer copy passes too. The selected run has fourteen passes, including the same three scenarios twice. It is not fourteen unique scenarios. The executable copy was verified and removed before the full suite.
- Four deliberate faults each failed at assertions: no reactive epoch notification, no private-cache cleanup, cleanup on token refresh, or no publication of the event user. Sources were restored byte for byte. The product bytes match the final sources. The permanent test gained the reopen assertion and a driver sequencing correction after these mutation runs.

Disclosed setup records:
- The first new typed permanent copy used unknown for fetch input. Normal TypeScript rejected it. The harness now uses RequestInfo | URL. No product type failure was hidden.
- The first delayed-session control typed B's text before the actual caller had rendered B. An added precondition confirmed failure before the old reply was released. The final case uses an actual Auth parent and waits for its B identity before typing. Both the precondition and final retention assertion remain.
- The first complete base run had seven assertion failures and one five-second timeout. Its driver awaited the held old reply before reaching the release step. That is not assertion RED. The final driver emits the event without awaiting that held request. The final base run has eight assertion failures and no timeout. The first failed record remains under final-cases-on-base-first.log.
- Patch-context and wrong-cwd read errors are in the root tool history. They made no product change. All failed test/type runs remain in this evidence folder.

Final web results: 745 tests pass, 13 skipped, 70 files. Normal TypeScript, locale parity, changed-file lint and build pass. Full lint remains failed with twelve prior errors in the same three unchanged files. The actual page-component Chromium context script passes 50 checks. It replaces data hooks and does not prove the real Auth provider, Next.js SSR, SDK ordering, screen-reader use or hosted behavior. No page error captured by that script is not a full clean-console claim.

The mobile source now combines the independently approved native correction 50db7fb1 with the approved mobile reminder/session correction cd90fbd5. Its source merge is3191fc770e4112f01bbfe8beaff2fb930c3fd13e. The merge had no conflicts. The combined mobile main suite passes 1532 tests with 24 skipped; DST 13 passes; test:ci exits naturally with code 0. Types, locale parity, changed-file lint and both exports pass. The mobile composition record is in DOCS/companion-actions/evidence/368-native-composition-r3. No fresh native run occurred on that composition.

All 163 prior executed service inputs and all 21 mobile/web mirrors retain their exact hashes. Sixteen of those pairs are SQL. Prior runtime/Cron/race/rollback/mutation results remain supplied proof. No service or container ran here. The prior reminder presentation source and approval remain unchanged.

Cleanup: the exact temporary review test is removed. Browser port 3411 is free after the script. All owned jobs ended naturally. Ignored dependency/build caches remain. No hosted app action, deploy, PR change, push, integration update or acceptance occurred. All logs are compressed losslessly with byte count and SHA-256 records.

COMPANION_REMINDER_368_REACTIVE_SESSION_CORRECTION_R3_DONE

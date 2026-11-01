R368-SPEC-5 is corrected in an owned runtime. The canonical candidate stays at 1a588554 until the separate R5 Standards review finishes. No ticket, native criterion, integration or release is accepted.

The account-generation hook still calls useAccountId. That call retains the existing external-store and Auth subscriptions. It now returns the synchronous owner epoch for keys. The later React server-snapshot update does not change this value when ownership is unchanged. Real account changes and both batched resets still change the key. No production caller, request, service, migration, SQL, locale, style or dependency changes.

The runtime is a lossless archive of web1a588554 with its own dependencies installed from that commit's lockfile. The initial 1,255 source files match canonical hashes. Only hooks/useAccountId.ts and components/companion/tasks/TaskSelectionAccountSession.test.tsx differ afterward. The source manifest and prepared-correction.patch identify both changes. The canonical root was not used as a test runtime or modified.

Falsifiers: replaced input/button or lost focus during hydration without an owner change; a private task or view after an actual owner change; a lost refresh draft; missed batched epochs; an old hook that passes its failure control; or any unexpected source delta.

Proof order:

- The exact reviewer's two-case reproduction ran first on unchanged 1a588554. Zero epoch passes. Nonzero epoch fails at input identity. Only its observer path changed, as reproduction-copy.json records.
- After the fix, the selected run passes 66 cases, including the exact reproduction and retained page, drawer, ownership, request and lesson controls. These counts overlap later runs.
- Six permanent hydration cases were added after the fix to the existing actual-caller fixture. They cover epoch zero, a nonzero existing epoch, epoch changes between server rendering and hydration, pending Auth, the Checklist button and lesson chat input. All six require the same DOM node and focus after reads settle. Together with the old nine cases, the file passes15.
- Restoring the original hook causes six assertion failures in28 selected cases. A constant zero key causes six account-isolation/generation failures. Removing the subscription call causes nine assertion failures. All fault source bytes were restored exactly. No timeout or setup error is counted as a mutation failure.
- The first exact reproduction's shared observer filenames were overwritten by the green run. Its RED JSON still contains the original failure. The original review evidence remains unchanged. The later original-hook fault repeats and preserves both observer records under unique prefixed names. This is not a claim that the first observer bytes were retained.

Final own-runtime checks: 760 web passes,13 skips,71files; build, normal TypeScript, changed-file lint and translation parity exit0 naturally. The existing component browser harness passes50 with no recorded page errors. It substitutes data hooks and does not prove real Auth or Next.js cold loading. The full-lint12-error baseline at1a588554 remains supplied; full lint was not repeated for this two-file correction. No existing assertion was changed.

Mounted and hydration subsystem: real pages, Auth, cache, generation logic, panels, renderToString and hydrateRoot run against scripted SDK/services/endpoint replies. They prove the listed React states, DOM identities and focus. They do not prove real provider order, hosted access, Next.js navigation or native behavior. No draft-loss claim comes from the pre-hydration node assertion.

Service and native subsystem: unchanged source passed through no new service, Cron, race, rollback or native execution. Prior proofs remain separate. Native criterion8 and tickets367/370/368 remain unaccepted.

Cleanup: npm/Vitest/build/browser processes exited naturally. The browser listener is stopped. Runtime, dependencies and generated build caches remain in the owned internal directory for continuation. Canonical source and the other review are preserved. There was no Docker, native, provider, hosted, push, PR, issue or integration action.

Next action: after the existing R5 Standards result arrives, read its final result and hold that finished task. Check the canonical web pin and cleanliness. Apply these two source files and preserve this evidence in a new committed candidate. Run the necessary candidate checks and request fresh independent review.

COMPANION_REMINDER_368_HYDRATION_CORRECTION_R5_RUNTIME_DONE

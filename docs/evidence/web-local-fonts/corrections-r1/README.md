# Root corrections of font review r1 S1 and S2

The original CJS inspector has three `no-require-imports` errors. The exact file produces all three errors with exit 1 before the edit. See `lint-red.log.gz`. The current inspector uses ES imports in `inspect-fonts.mjs`. Its focused lint exits 0. No lint rule or ignore changed.

The command `node docs/evidence/web-local-fonts/tools/inspect-fonts.mjs app/fonts` runs from the web root. Its output for all 18 tracked fonts is byte-identical to the original inspector output. See `metadata-before.json.gz` and `metadata-after.json.gz`. Both have SHA-256 `e13caeac3b361b446de015ac3983b4b0c97b5e1287fc0873d41e56d582ae0efb`.

The final full command `npm run lint -- --format json` exits 1 with 12 errors. The distribution is 7, 1, and 4 across `companion-context-362/context_rls_test.ts`, `companion-actions/rollback_test.ts`, and `companion-actions/support.ts`. These three files are byte-equal to accepted base `02377a33`. This correction adds zero lint errors. Full repository lint still fails. The evidence README now distinguishes the old focused check from the final original commit's 15 errors. Old raw logs remain unchanged.

All seven Inter binary copyright strings report 2016. The pinned official `OFL-Inter.txt` reports 2020. The evidence now records this difference. All 18 font binaries and four official licenses remain unchanged.

The initial unit run with missing `fonts.css` ran zero tests during setup. It does not establish assertion-level red or strict TDD. The original implementer's historical skill-availability statement remains a reported observation. Current availability does not prove historical exposure. The independent r1 blocked baseline build remains prior build-boundary evidence.

The root ran `npm test`: 635 tests in 53 files passed, exit 0. The normal `npm run build` exited 0. App code, fonts, licenses, CSS, preloads, layout, config, lockfile, and browser verifier code equal the reviewed `1c704c1f` bytes. The r1 blocked builds, browser comparisons, and delivery checks remain prior independent evidence. They were not repeated in this correction. No new behavior test was added for the mechanical import and record changes. The real linter and the identical runtime output check the affected boundary.

Logs are exact gzip payloads. `manifest.json` records the raw byte lengths and hashes. `checks.json.gz` records the lint distribution and metadata observations. No stack, server, browser, deployment, hosted or paid provider operation occurred. No mobile, package, CI, instruction, integration, or PR change occurred. Commands exited naturally. Fresh independent review is required. This is not acceptance.

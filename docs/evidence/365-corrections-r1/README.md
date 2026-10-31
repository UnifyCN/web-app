# #365 corrections r1 evidence pointer

The report, raw logs, browser results and proof limits for review findings S365-001
(a second command run on in one line) and S365-002 (a waiting reason change named in its
receipt) are kept in the mobile repo (migration authority):
`DOCS/companion-actions/evidence/365-corrections-r1/README.md`.

Web-side parts: `supabase/functions/companion-actions/commands.ts` (one change per line),
the mirrored migration `20261028001530_companion_task_edit.sql` (receipt reasons),
`supabase/tests/companion-actions/edit_command_test.ts` (two service regressions),
`mutation_check.py` (`commands_quotes_unchecked`), `lib/companionActions/contract.ts`,
`components/companion/tasks/editText.ts`, `ReceiptBlock.tsx`, `TaskActionCards.tsx`,
the test harness and `TaskEdit.test.tsx`, `lib/companionActions/receiptReasons.test.ts`.

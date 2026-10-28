# #365 evidence pointer

Decisions, the clear-command examples in every supported language, how to run, and the
evidence (red/green runs, mutation checks, client and real-stack tests, the real-app
browser check, gates and limits) are kept in the mobile repo (migration authority):
`DOCS/companion-actions/365-task-edits.md` and `DOCS/companion-actions/evidence/365/`.

Web-side parts of #365: `supabase/functions/companion-actions` (`commands.ts`,
`contract.ts`, `handler.ts`, `targets.ts`, `index.ts`), `supabase/functions/rag-query`
(`lib/actions/proposals.ts`, `lib/context/appContext.ts`, `index.ts`), the mirrored
migration and rollback `20261028001530_companion_task_edit*`, the endpoint tests
`supabase/tests/companion-actions/edit_*_test.ts`, and the drawer client
(`components/companion/tasks/TaskEditProposalPanel.tsx`, `editText.ts`,
`TaskEdit.test.tsx` and the shared task components).

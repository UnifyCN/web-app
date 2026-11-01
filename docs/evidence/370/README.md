# #370 saved personal details: evidence pointer

The implementation record, test order, deliberate faults, gate results and compressed logs
(with sizes and hashes) live in the mobile repo (the migration authority):

- `DOCS/companion-actions/370-personal-details.md`
- `DOCS/companion-actions/evidence/370/README.md` and `SHA256SUMS`

Web-side artifacts of this ticket: the companion-actions registry entries, handler and
remember grammar (`supabase/functions/companion-actions/`), the shared profile-fact check
(`supabase/functions/rag-query/lib/context/profileFacts.ts`), the rag-query saved-details read
and `[REMEMBER]` suggestion, the mirrored migration and rollback
(`supabase/migrations/20261028004902_companion_saved_details.sql`,
`supabase/rollbacks/20261028004902_companion_saved_details.down.sql`, byte-identical to the
mobile files), the backend tests (`supabase/tests/companion-actions/details_test.ts`,
`details_rollback_test.ts`), the drawer components and mounted tests
(`components/companion/tasks/SavedDetails*.tsx`) and the real-browser check
(`scripts/verify-companion-saved-details.mjs`, `npm run test:companion-saved-details`).

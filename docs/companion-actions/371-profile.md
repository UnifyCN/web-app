# Companion profile changes #371

This candidate adds province and arrival-date changes through the existing authenticated action service. It extends the existing profile owner and the direction B overlay drawer. It does not create a second saved fact store.

The implementation report and bounded evidence are in the assigned mobile candidate:

- `/Users/savargupta/.t3/worktrees/Unify/t3-06529381/DOCS/companion-actions/371-profile.md`
- `/Users/savargupta/.t3/worktrees/Unify/t3-06529381/DOCS/companion-actions/evidence/371-profile-r1/`

The mobile branch is `t3/profile-371-companion-implementation`. This web branch is `fix/profile-changes-371-r1`. The report records the source pins and separate proof limits. The final handoff records both final candidate heads and trees.

The shared migration is `20261031055422_companion_profile_changes.sql`. Its mobile mirror and paired rollback must remain byte-identical. The local service project is `unify-profile-371-r1`. All real-service tests use its explicit DB and REST container names. Provider and CMS transports use synthetic fixtures. The actual Next.js page and cookie proxy were checked in a headless browser.

Native acceptance remains incomplete. Bundles, mounted tests and browser checks do not grant device, hosted, ticket or release acceptance. Independent review and integration remain with the root agent. This candidate is not pushed.

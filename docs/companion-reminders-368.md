# Ticket 368 reminder candidate

Status: HOLD for service verification. No ticket or release is accepted.

The primary implementation record and complete local evidence are in the assigned mobile worktree:

/Users/savargupta/.t3/worktrees/Unify/t3-abe3435e/DOCS/companion-actions/368-reminders.md

/Users/savargupta/.t3/worktrees/Unify/t3-abe3435e/DOCS/companion-actions/evidence/368-reminders-r1/report.md

The web candidate preserves base 914e4f54b08deaa9cf48e25aa86041720e6296db and the accepted removed-receipt correction. It adds the shared action service, mirrored migration/rollback, reminder client contract, drawer controls, account checks, translations, service tests and rendered checks. The handoff records source commits and trees for both candidates.

The owned local Docker stack failed before a GREEN assertion. The new service assertions, live mounted clients and browser flow against real persistence remain open. The headless reminder script defaults to a scripted service. Its optional REMINDER_BROWSER_MODE=live path checks the exact owned stack, creates synthetic accounts, uses real authenticated actions and actual Cron due reads, records persisted readbacks, and removes those accounts. The live path remains unexecuted. Run either path with an explicit REMINDER_BROWSER_OUT directory from this worktree. The live path also requires ACTIONS_API_URL, ACTIONS_ANON_KEY, ACTIONS_SERVICE_ROLE_KEY and the exact ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER values from the owned stack.

No push, PR/issue change, integration update, hosted action, skill upgrade, child agent or live provider call occurred.

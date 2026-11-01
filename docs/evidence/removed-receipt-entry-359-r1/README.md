# Removed task receipt entry

A reloaded removal card for an already removed task must let the user inspect its current task receipt. View task now uses the read-only onViewTask callback. It never restarts the old removal proposal. The existing panel still owns fresh reads, eligible receipt-specific Undo and revision checks. No server, schema, contract, new copy, locale, styling or dependency change.

The rendered-card test failed before the correction at the missing View task control and passes after it. It proves navigation and callback separation, not server authorization or native restore. Full web tests pass711 with13 skips. Build, types and changed-file lint pass. Full lint's12 earlier errors remain outside this change. No old assertion changed.

The paired mobile evidence is /Users/savargupta/.t3/worktrees/Unify/t3-64fec96b/DOCS/companion-actions/evidence/removed-receipt-entry-359-r1/. It contains both red/green results and full gate records. Native restoration of the original retained task remains pending. iOS/native criterion8 and ticket acceptance remain open. Nothing was pushed or integrated by this correction.
